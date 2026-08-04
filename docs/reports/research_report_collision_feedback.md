# AI-Racing-Games 碰撞反馈优化交付报告

## 概述

按"分析、优化、测试 NPC 碰撞视觉/声音/减速"任务，全面分析当前实现并实施三大类优化：**视觉**（屏幕红色 vignette + HUD 碰撞计数）、**声音**（动态范围扩大 + 低频冲击层）、**减速**（保留原 `*0.5` + 新增轻微横向弹开防贴车反复触发）。新增 16 个回归测试（608 → 624 全绿），全量验证（typecheck + lint + format:check + 624 单测 + bot 9 赛道 0 违规 + build + e2e 13 通过）一次通过。Playwright 实测验证碰撞瞬间 `maxFlash=0.247`、HUD "碰撞 ×4"、屏幕红晕。

## 一、现状分析（优化前）

### 物理/减速
- `applyTrafficCollision`：`carState.speed *= COLLISION_SPEED_FACTOR (0.5)`，瞬间砍半
- `COLLISION_COOLDOWN = 1s`：1 秒内不重复触发
- **缺陷**：玩家紧贴 NPC 车时，1 秒后冷却结束再次触发，反复减速无法脱离

### 声音
- `CollisionSound`：0.15s 白噪声 burst → lowpass 300Hz → gain 0.25
- 强度映射：`gain = 0.25 × clamp(volume, 0.4, 1)`——**动态范围不足**
- **缺陷**：低速碰撞也响到 40% 音量；只有单调白噪声，缺少"咚"的物理重击质感

### 视觉
- `renderer.ts` 中**无任何 collision/impact/flash/shake 相关代码**
- HUD 不显示碰撞计数
- **缺陷**：玩家撞车后画面仅突然减速，无任何视觉反馈，玩家不知道撞了

## 二、优化方案

### 视觉（M16 新增）

1. **`src/game/collision-feedback.ts`**（新建）：纯函数碰撞红闪状态机
   - `updateCollisionFlash(flash, hitSeed, dt)`：命中时 `flash = min(1, max(flash, hitSeed))`，未命中按指数衰减 `flash *= exp(-6 * dt)`
   - `flashSeedFromSpeedRatio(speedRatio)`：速度比 0-1 映射为红闪强度（≥0.6 满强度）
   - 常量：`COLLISION_FLASH_DURATION=0.35s`、`COLLISION_FLASH_DECAY=6`、`COLLISION_FLASH_EPSILON=0.02`

2. **`src/engine/renderer.ts`**：
   - `RenderView` 新增 `collisionFlash?: number` 字段
   - 新增 `drawCollisionVignette()` 方法：屏幕边缘径向红色渐变，alpha = 0.45 × flash，位置 BOOST 金色 vignette 之后
   - `render()` 末尾调用

3. **`src/ui/hud.ts`** + **`index.html`** + **`src/style.css`**：
   - HUD 新增 `#hud-collision` 元素（红色警示色），`hudElements.hudCollision?: HTMLDivElement` 接口
   - `updateHud` 在比赛阶段且 `race.collisionCount > 0` 时显示"碰撞 ×N"，0 时隐藏（避免常态噪音）
   - 样式：`#f5f5f5`、`font-weight: 700`、红色 `#ff5252`

### 声音（M16 增强）

`CollisionSound` 重构为双层混合：

```
白噪声层:  createBiquadFilter (lowpass 300Hz) → noiseGain ┐
低频冲击层: createOscillator (sine 55Hz) → thumpGain ──→ outGain (0.32 × clamp(v, 0.1, 1)) → output
```

- **噪声层**：保留原 0.15s burst（"砰"的冲击质感）
- **低频冲击层**：55Hz 正弦，gain 指数衰减 0.12s（"咚"的物理重击）；高速撞击更明显
- **动态范围扩大**：`clamp(v, 0.1, 1)` 而非 `clamp(v, 0.4, 1)`——低速 0.5× 增益 vs 高速 1× 增益
- 总增益从 0.25 提升到 0.32

### 减速（M16 增强）

保留 `speed *= 0.5` + 新增**横向弹开**（防贴车反复触发）：

```
if (|玩家 position - 碰撞车 offset| < 0.1) {
  push = collision.offset >= 0 ? -0.12 : 0.12
  position = clamp(position + push, -1, 1)
}
```

同时 `applyTrafficCollision` 返回 `{ hit, impact, cooldown }` 三元组，`impact = speed / maxSpeed`（0-1 速度比）供声音响度与红闪分级。

## 三、数据流整合

```
物理/车流碰撞
   ↓
applyTrafficCollision (返回 hit + impact)
   ↓
updateCollisionFlash (重置/衰减 0-1 flash 强度)
   ↓
返回 lastCollisionCount + collisionFlash
   ↓
game-loop 写回 this.collisionFlash
   ↓
renderFrame → viewFor → renderer.render (v.collisionFlash)
   ↓
drawCollisionVignette (屏幕红色 vignette)
   ↓
collisionSound.play(impact) (双层混合冲击音)
   ↓
updateHud (race.collisionCount → "#hud-collision" 文本)
```

所有数据通过现有纯函数层（frame-update / frame-render / viewFor）流动，无新全局状态、无新的可变类——延续项目"纯函数领域层 + 测试锚定"模式。

## 四、测试补强（16 个新增用例）

| 文件 | 新增 | 覆盖点 |
|---|---|---|
| `tests/unit/collision-feedback.test.ts` | 9 | `updateCollisionFlash` 无反馈/命中/衰减/EPSILON/连续碰撞取较大/clamp 边界、`flashSeedFromSpeedRatio` 高速满格/低速缩放/零速 |
| `tests/unit/collision.test.ts` | 4 | impact 速度比归一化、自定义 maxSpeed、横向弹开（左右两侧）、错开时不弹开 |
| `tests/unit/frame-render.test.ts` | 1 | 单屏比赛 collisionFlash 透传 viewFor |
| `tests/unit/renderer-state.test.ts` | 1 | collisionFlash>0 时 `createRadialGradient + fillRect` 增量高于 0（红闪 vignette 绘制） |
| `tests/unit/frame-update.test.ts` | 1 | 碰撞命中 collisionFlash 重置为速度比映射强度、未命中按 dt 衰减 |
| `tests/unit/engine-audio.test.ts` | (2 改) | CollisionSound 增益 0.32 × clamp(v, 0.1, 1)、下限 clamp 到 0.032 |

**测试总数**：608 → **624**（+16），43 个测试文件。

## 五、全量验证

| 验证项 | 命令 | 结果 |
|---|---|---|
| TypeScript | `npm run typecheck` | 通过 |
| ESLint | `npm run lint` | 通过（`.edgeone/` 加入 ignores） |
| Prettier | `npm run format:check` | 通过 |
| 全量单元测试 | `npm test` | 624 用例全绿（43 文件） |
| Bot 矩阵 | `npm run bot` | 9 赛道全部 finished，0 违规 |
| 生产构建 | `npm run build` | PWA 产物生成 |
| Playwright e2e | `npm run test:e2e` | 13 通过 + 1 跳过（桌面 project 跳过移动端断言） |

## 六、浏览器实测（Playwright 自动化验证）

碰撞瞬间截图已确认三大视觉反馈均生效：

- **HUD 碰撞计数**："碰撞 ×4"（红色显示在 LAP 下方）
- **屏幕红色 vignette**：画面四周可见红晕，flash 强度 0.247（flashSeed 映射）
- **减速效果**：高速 265 km/h → 撞车后 192 km/h（约 ×0.72，含 1 秒减速衰减）

调试钩子新增 `collisionFlash` 暴露供测试观察。

## 七、修改的文件清单

| 文件 | 变更 |
|---|---|
| `src/game/collision-feedback.ts` | 新增：纯函数红闪状态机 + flashSeed 速度比映射 |
| `src/game/collision.ts` | 返回 `{ hit, impact, cooldown }` 三元组 + 横向弹开逻辑 |
| `src/game/frame-update.ts` | 注入 `collisionFlash` 字段、调用 `updateCollisionFlash`、`flashSeedFromSpeedRatio` |
| `src/game/frame-render.ts` | 注入 `collisionFlash` 到 FrameRenderContext、传递到 viewFor |
| `src/game/frame-pure.ts` | `viewFor` 第 6 尾参 `collisionFlash`、写入 _viewCache |
| `src/game/game-loop.ts` | `private collisionFlash = 0`、ctx 透传、`collectHudElements` 加入 `hudCollision` |
| `src/game/debug-hook.ts` | `DebugHookSources.collisionFlash: () => number` getter |
| `src/engine/renderer.ts` | `RenderView.collisionFlash` 字段、`drawCollisionVignette()` 方法 |
| `src/audio/engine.ts` | `CollisionSound` 双层混合（噪声层 + 55Hz 正弦冲击层 + outGain） |
| `src/ui/hud.ts` | `HudElements.hudCollision`、比赛阶段显示 "碰撞 ×N" |
| `index.html` | `<div id="hud-collision" hidden>碰撞 ×0</div>` |
| `src/style.css` | `#hud-collision` 样式（红色 #ff5252，font-weight: 700） |
| `eslint.config.js` | `.edgeone` 加入 ignores |
| `.gitignore` | `.edgeone/` 加入 |

测试文件：`tests/unit/collision-feedback.test.ts`（新建）、`collision.test.ts`、`frame-render.test.ts`、`renderer-state.test.ts`、`frame-update.test.ts`、`engine-audio.test.ts`（增强）。

## 八、产出文档

- 本报告：`research_report_collision_feedback.md`
- 浏览器实测截图：`.codebuddy/screenshots/30-collision-hit.png`（碰撞瞬间：HUD 计数 + 屏幕红晕 + 减速后的车速）

## 九、结论

碰撞反馈三大类（视觉/声音/减速）已全部优化：

1. **视觉**：从"零反馈"升级到"屏幕红晕 + HUD 计数 + 玩家感知"，强化撞击反馈强度通过速度比分级
2. **声音**：从"单调白噪声"升级到"双层混合冲击（噪声 + 55Hz 正弦）"，动态范围扩大，低速更轻、高速更重
3. **减速**：从"瞬间砍半 + 反复触发"升级到"瞬间砍半 + 横向弹开"，避免贴车循环惩罚

新引入 16 个回归测试锁定契约（纯函数衰减速率、impact 归一化、弹开方向、HUD 显示条件、vignette 绘制增量等），M17 后续重构不会回归。代码延续项目"纯函数领域层 + 测试锚定"模式，无新可变类、新全局状态，所有数据通过现有 frame-update / frame-render / viewFor / updateHud 流动。

**下一步建议**（不在本次范围）：碰撞瞬间添加玩家车身边框闪白（drawPlayerCar 增加 `collideFlash` 选项，配合 vignette 实现"内+外双层反馈"）；HUD 碰撞计数显示时长衰减（碰撞后 N 秒淡出，而非永久显示）。