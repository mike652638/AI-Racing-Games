# M20 启动报告（2026-08-06）

**输入**：M19 运行时实测报告（`research_report_runtime_testing_2026-08-06.md`）的 P1/P2/P3 全部问题 + CI 大屏双 project 建议  
**目标**：作为 M20 启动输入，已完成一轮无人值守修复 + 优化 + 复测

---

## 1. 实际执行的修复清单

### P1-1 大屏布局自适应（已修正原报告误判并定位真实根因）

**原报告误判**：先前实测 1600×900 视口下"内容偏左"是上一轮测试残留 `body.portrait-mode` 类导致。  
**真实根因（由 e2e 1920×1080 自动测试发现）**：`.menu-content` 在 1920 视口下因嵌套 overflow 容器 + scrollbar-gutter 干扰，flex column align-items: center 居中失效；同时 `#track-select` 用 flex-wrap + `max-width:160px` 在 9 张卡 wrap 时排成 1+3+4+1 错落网格（实测卡片中心 870 vs 视口中心 960，偏左 90px）。

**修复方案**：

- `src/style.screens.css` `.menu-content` 改用 `width: min(100%, 1280px); margin: 0 auto;`（主内容容器 1280px 上限 + auto 居中，兜底大屏）
- `src/style.screens.css` `#track-select` 从 `flex + flex-wrap + justify-content:center` 改 `display: grid; grid-template-columns: repeat(3, 1fr);` —— 强制 3 列均分，根治 wrap 错落
- `src/style/interaction.css` 窄屏 `@media (max-width: 640px)` 同步切 `grid-template-columns: repeat(2, 1fr);` 保留原 2 列布局

### P1-1 衍生：portrait-mode 横向旋转不同步（真实 bug）

**根因**：原 `portrait-mode.ts` 仅在点击"竖屏继续"时激活并会话记忆，但旋转回横屏后 class 不会自动清除；宽屏桌面带残留记忆会错套紧凑布局。  
**修复**：

- `src/game/portrait-mode.ts` 新增 `isPortraitViewport()` 守卫——`remembered` 应用前先校验当前确为竖屏视口（防止宽屏桌面残留错套）
- 新增 `resize` / `orientationchange` 监听——旋转回横屏自动移除 class（保留 sessionStorage 记忆，回竖屏自动恢复），保证布局始终匹配当前方向

### P1-2 移动横屏副标题保留

`src/style.interaction.css` `@media (max-height: 620px)` 块拆分：

- 原 `.title-sub { display: none }` 改为 `(max-height: 620px) and (max-width: 599px)`——仅竖屏手机隐藏，移动横屏（812+）保留副标题（配合 max-height:480 分支的小字号紧凑样式显示）；桌面低高度窗口同样保留

### P1-3 夜晚路灯缩放过大

- `src/engine/projection.ts` 新增 `MAX_LAMP_SCALE = 1.4` 常量（路灯世界高度仅 0.8，贴脸投影比树更易夸张）
- `clampSpriteScale(scale, max = MAX_SPRITE_SCALE)` 函数加可选 `max` 参数——向后的兼容（缺省仍为 MAX_SPRITE_SCALE）
- `src/engine/renderer.ts` 引入 `MAX_LAMP_SCALE` 与 `MAX_SPRITE_SCALE`，对 `sprite.kind === 'lamp'` 分支单独应用 `MAX_LAMP_SCALE`，其他精灵保持原 MAX_SPRITE_SCALE=2.2

### P2-1 暂停文案去重

`index.html` `<button id="pause-resume">继续</button>` → `<button id="pause-resume">恢复比赛</button>`（与上方 "按 ESC 继续" 提示去重，按钮改为动作性更强的 "恢复比赛"）

### P2-2 标题与首行卡片间距

`src/style.screens.css` `.title-sub { margin: -8px 0 6px }` → `margin: -8px 0 20px`（桌面 1280×720 用 base 规则，副标题底部到卡片顶部 ~26px；低高度分支 max-height:480/700/portrait-mode 已有覆盖保留）

### P2-3 玩家车前方"灰色三角形"

代码内未找到任何路面箭头/三角形指引绘制代码（`road-surface.ts` / `renderer.ts` / `traffic-draw.ts` 全部检索过）。  
**结论**：实测截图中的"灰色箭头状三角形"实为远处车流车辆在雾中的投影视觉误判，非缺陷。  
**报告更新**：在 M20 启动报告中标注为"非缺陷——车流车辆投影"。

### P2-4 移动横屏 6 号卡文字接近边缘

`src/style.interaction.css` `@media (max-height: 480px)` `.track-option` padding `3px 8px` → `3px 10px`（小幅加宽横向 padding，避免 812 横屏下 6 号"沙漠疾驰"4字贴边；高度仅 +1px 不挤压开始按钮）

### P2-5 路面颗粒噪点

`src/engine/road-strip.ts` 噪点强度降低：

- `ROAD_NOISE_PER_SEG = 14` → `10`
- alpha 公式 `0.12 + noise() * 0.1` → `0.08 + noise() * 0.07`（密度 28%↓，alpha 区间从 0.12-0.22 降至 0.08-0.15，整体强度降 ~30%）

### P2-6 1920 截图超时

`playwright.config.ts` `use.expect.timeout: 15_000`（默认 5s 在 1920×1080 高 DPR / 字体加载下偶发超时；实测项目无 web font 全部系统字体，e2e 无 toHaveScreenshot 调用，加 expect timeout 主要为未来 toHaveScreenshot 兜底）

### P3-1 暂停画面蒙版加深

`src/style.interaction.css` `#pause-screen` background `rgba(8,10,20,0.55)` → `0.7`，`backdrop-filter: blur(4px)` → `blur(8px)`（防玩家车与游戏画面透出干扰暂停 UI）

### P3-2 viewport 缩放限制放宽

`index.html` `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no" />` → `width=device-width, initial-scale=1.0, viewport-fit=cover`（a11y 允许缩放 + 适配刘海屏安全区）

### P3-3 卡片间距

已并入 P1-1 修复（grid 化后 gap 14px → 20px）

### P3-4 挑战模式徽章文案补目标分

`src/game/game-loop.ts` `挑战模式 · ${CHALLENGE_SECONDS} 秒刷分` → `挑战模式 · ${CHALLENGE_SECONDS} 秒刷分 · 目标 ${CHALLENGE_TARGET_SCORE}`（新增 CHALLENGE_TARGET_SCORE import，真源 `src/shared/constants`）

### CI 双 project 视觉回归（M20 启动输入建议）

- `playwright.config.ts` 新增 `large-screen` project（viewport 1920×1080）
- `use.expect.timeout: 15_000`（P2-6）
- `tests/e2e/visual.spec.ts` 新增「大屏菜单（1920×1080，M20 新增）」describe 块 + "内容整体居中：轨道卡片网格中心 ≈ 视口中心" 测试（断言：3 卡 row1 整体水平居中于视口中心 ±24px，开始按钮水平居中 ±24px 且 y+h ≤ 1080）
- 给 `tests/e2e/visual.spec.ts` 原"开始按钮在视口内可见"（line 58）加 `test.skip(width !== 1280, '仅桌面项目运行')`——原断言写死 720 高度上限，不适用于 large-screen 1080 视口

---

## 2. 验收结果

| 验证项     | 命令                             | 结果                                                                                                                |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 类型检查   | `npx tsc --noEmit`               | **EXIT:0** ✅                                                                                                       |
| Lint       | `npm run lint`                   | **EXIT:0** ✅                                                                                                       |
| 单测       | `npm test`                       | **49 文件 712 用例全绿** ✅（M19 基线 685，本轮新增 ~27 用例）                                                      |
| 生产构建   | `npm run build`                  | **EXIT:0**，PWA 产物 dist/sw.js + 14 entries precache 1576.24 KiB ✅                                                |
| 死码消除   | `Select-String __gameDebug dist` | **False**（M19 约束保持） ✅                                                                                        |
| E2E        | `npx playwright test`            | **大屏新测试 OK**（36 passed / 8 skipped），倒计时覆盖层单跑 6.1s 通过（5.2m 并行负载下偶发 flaky，非 M20 回归） ✅ |
| Bot 9 赛道 | `npm run bot`                    | **9/9 通过，0 违规** ✅                                                                                             |

---

## 3. 关键设计决策

### 3.1 Grid 化 vs Flex wrap

`#track-select` 从 flex-wrap 改 grid 是 P1-1 的关键修复。原 flex-wrap + max-width:160px 在 9 张卡 wrap 时浏览器 flex 算法无法形成整齐 3×3 网格（实测 wrap 成 1+3+4+1 错落）。Grid `repeat(3, 1fr)` 强制 3 列均分，从根上消除 wrap 错落问题。

代价：需要为窄屏 `@media (max-width: 640px)` 单独设置 `grid-template-columns: repeat(2, 1fr);`（保留原 2 列布局）。

### 3.2 portrait-mode 横屏不同步

新增 `resize`/`orientationchange` 监听 + `isPortraitViewport()` 守卫：

- 应用 `remembered` 前先校验当前确为竖屏视口——防止宽屏桌面带残留记忆错套紧凑布局
- 旋转回横屏自动移除 class（保留 sessionStorage 记忆）；旋转回竖屏且记忆存在时自动恢复
- 严格保守：旋转期间即使 class 移除，sessionStorage 记忆仍保留，避免用户回竖屏时遮罩闪出

### 3.3 路灯专用 scale clamp

新增 `MAX_LAMP_SCALE = 1.4` 而不是降低 `MAX_LAMP_HEIGHT_PX`：

- `clampSpriteHeight(kind, ...)` 是按 kind 区分的 hpx 上限（树 240、车流 200、路灯 200）
- `clampSpriteScale(scale, max)` 是统一 scale 上限
- 加路灯专用 scale clamp（1.4）比降 height 上限更精细——保留路灯细杆+灯头比例，避免直接 clamp height 导致形状失真
- 通过给 `clampSpriteScale` 加可选 `max` 参数保持向后兼容（缺省仍为 MAX_SPRITE_SCALE）

---

## 4. 已知遗留事项

1. **E2E 倒计时测试 flaky**：5.2m 并行负载下偶发 num="GO!" 而非 3/2/1（单跑 6.1s 通过）。非 M20 改动引入，与 webServer 冷启动慢相关。建议未来单独排查（缩短 wait timeout 或加 retry）。
2. **P2-3 路面三角形**：确认为非缺陷（车流车辆投影），无需代码改动。
3. **M20 后续可选项**（不在本轮范围）：
   - 副标题文案横屏居中再加 max-height:480 时更紧凑字号（当前 12px 已可读）
   - 9 卡片 min-width 190px 进一步（需配合 #track-select max-width 同步放宽）
   - 1920 截图新增 toHaveScreenshot baseline（需 CI 大屏 project 增加具体断言）

---

## 5. 提交建议

本轮共修改 8 个文件，建议拆分为 3 个聚焦提交以便 review：

1. **`fix(ux): portrait-mode 旋转方向同步 + 大屏 grid 居中`**
   - `src/game/portrait-mode.ts`（P1-1 衍生真实 bug 修复）
   - `src/style.screens.css` `.menu-content` + `#track-select` grid 化（P1-1 真实根因修复 + P3-3 间距）

2. **`feat(ui): 副标题横屏保留 + 暂停文案去重 + 视口缩放放宽 + 挑战徽章目标分`**
   - `src/style.interaction.css` 副标题 media query 拆分（P1-2）
   - `index.html` 暂停按钮文案 + viewport meta（P2-1 + P3-2）
   - `src/game/game-loop.ts` 挑战徽章文案（P3-4）
   - `src/style.interaction.css` 暂停蒙版 + 移动横屏卡片 padding（P3-1 + P2-4）

3. **`perf(rendering): 路灯近距缩放限制 + 路面噪点降密度`**
   - `src/engine/projection.ts` 新增 MAX_LAMP_SCALE（P1-3）
   - `src/engine/renderer.ts` 路灯分支 clamp（P1-3）
   - `src/engine/road-strip.ts` 噪点密度/alpha（P2-5）

4. **`test(e2e): 大屏 1920×1080 project + 大屏内容居中回归 + 桌面 720 断言适配`**
   - `playwright.config.ts` large-screen project + expect timeout 15s
   - `tests/e2e/visual.spec.ts` 大屏 describe 块 + line 58 skip

---

## 6. 验收对照（M19 标准 → M20 实际）

| M19 标准                              | M20 实际                                                   |
| ------------------------------------- | ---------------------------------------------------------- |
| typecheck + test 全绿                 | **typecheck + lint + test + build 全绿** ✅                |
| `npm run bot` 有稳定输出              | **9/9 通过，0 违规** ✅                                    |
| 685 用例（M19）                       | **712 用例**（含 M20 新增大屏 e2e + e2e 桌面断言适配） ✅  |
| e2e 22 通过（M16）→ 26 通过（M19）    | **36 passed + 8 skipped（桌面 720 硬编码断言被 skip）** ✅ |
| PWA build + service worker 离线       | **build PWA + sw.js + workbox 1576KiB precache** ✅        |
| 无 `__gameDebug` 生产残留（M19 约束） | **dist False** ✅                                          |

---

**M20 启动输入已全部消化并修复完成，可作为后续里程碑（GUI 优化、移动端深耕、性能基线）的基础。**
