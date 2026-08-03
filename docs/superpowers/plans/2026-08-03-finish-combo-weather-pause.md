# M10 结算打磨/漂移连击/车流避让/雨天气/暂停菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 M9 遗留打磨（圈速行前缀、结算面板底部间距、热座横幅排版、DRIFT_SCORE_MAX clamp）与游戏性扩展（各赛道 BEST 汇总、漂移连击/倍率、车流避让 AI、雨天气、暂停菜单音量/重开）。

**Architecture:** 全部为增量扩展，遵守既有分层（engine/physics 纯函数领域层、game 编排、ui 表现、save 持久化）。新功能尽量走纯函数 + 可选参数，保持既有 API 向后兼容（除 P2 的 DriftState 新增必填字段需同步测试字面量）。

**Tech Stack:** TypeScript + Vite + Canvas 2D + Vitest（验证链 typecheck → lint → test → build → bot；bot 基线 3 圈 76.017s / 0 违规）。

## Global Constraints

- 全部注释/回复中文，代码/标识符保留英文。
- 每个 Task 独立 TDD（RED → GREEN）并独立 git commit；不入库清单：`.slim/`、`docs/superpowers/plans/*.md`、`test-m*.py`、`shots/`。
- `constants.ts` 改值必须同步 `tests/unit/constants.test.ts` 注册表断言（文件头注释约定）。
- `DriftState` 新增字段若为必填，需同步 `drift.test.ts` 的 5 处字面量构造（行 12、95、102、112、148）。
- `HudElements`/`ScreenElements` 新增字段必须为可选（`?`）并走 `if (elements.x)` 守卫，`hud.test.ts`/`game-loop-integration.test.ts` 既有用例零改动可过。
- `updateTraffic` 扩展签名必须用可选尾参（默认 undefined），`traffic.test.ts` 既有调用零改动。
- `updateLighting` 扩展必须用可选尾参（默认值保持 M9 行为），`lighting.test.ts` 既有 10 用例零改动。
- index.html 新增元素：暂停菜单（音量/重开）与 COMBO 显示元素初始状态遵循既有模式（hidden 默认）。

---

### Task P1: 结算面板打磨（圈速行前缀 + 热座横幅排版 + 底部间距）

**Files:**
- Modify: `src/ui/screens.ts`（fillFinishPanel 圈速行）
- Modify: `src/style.css`（finish-screen 底部间距、横幅间距）
- Test: `tests/unit/game-loop-integration.test.ts`（既有完赛用例补断言）

**Interfaces:**
- Consumes: `fillFinishPanel(elements, race, carConfig, opts)`（opts: FinishPanelOptions 8 字段）；既有 `formatLapTimes(race.lapTimes)` 输出 `LAP 1: ... LAP 2: ...`
- Produces: 无新导出；行为变化——分屏时 P1 圈速行文本前缀 `P1 `、P2 圈速行前缀 `P2 `；热座 round2 时 finish-wins 与 finish-hint 上下间距正常；`按 R 重新开始` 提示与底部不再贴边/重叠。

- [x] **Step 1: 写失败测试**

在 `tests/unit/game-loop-integration.test.ts` 既有用例「分屏模式：P1 全油门跑完 3 圈（classic）进入结算，P2 静止不污染判定」与「分屏模式：P2 全油门跑完 s-curve 2 圈进入结算」中补断言：
- P1 完赛用例：`finish-laps` 文本以 `P1 LAP` 开头（分屏前缀）
- P2 完赛用例：`finish-laps-2` 文本以 `P2 LAP` 开头
热座双完赛用例（「热座模式：P1 跑完 3 圈回车交棒 P2，P2 跑完后结算显示胜负」）补断言：finish-wins 与 finish-hint 均非 hidden（并存可见）。

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/game-loop-integration.test.ts`
Expected: 补的断言 FAIL（当前 P1/P2 圈速行均无前缀）。实测：2 failed（P1/P2 圈速行各一）/ 23 passed。

- [x] **Step 3: 实现**

`src/ui/screens.ts` fillFinishPanel：
- P1 完赛分支圈速行：`elements.finishLaps.textContent = (opts.splitMode ? 'P1 ' : '') + formatLapTimes(race.lapTimes).join('  ')`
- P2 分支圈速行（splitMode 或热座 round2）：`elements.finishLaps2.textContent = 'P2 ' + formatLapTimes(race.lapTimes2).join('  ')`（P2 行只在双人场景出现，恒加前缀）
- 热座 round2 P1 快照分支的圈速行原本清空（热座 P1 行只显示用时），保持不动。

`src/style.css`：
- `#finish-wins` 与 `#finish-hint`/`#finish-drift-winner` 之间加 `margin-top: 10px`（若两者并存不重叠）。
- `#finish-screen` 底部提示（`按 R 重新开始` 所在 p）加 `margin-bottom` 或 `#finish-screen { padding-bottom: 16px }` 修复底部贴边（此前 obs 观察到与分隔线底部重叠）。先读 style.css 现状再定选择器。

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/game-loop-integration.test.ts`
Expected: 全绿。实测：25 passed 全绿。

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run bot`
Expected: typecheck/lint 通过；npm test 341+（新增断言不改用例数）；bot 3 圈 76.017s 0 违规。实测：typecheck/lint 通过；32 文件 / 341 用例全绿；bot 3 圈 76.017s / 0 违规。

- [x] **Step 6: 提交**

```bash
git add src/ui/screens.ts src/style.css tests/unit/game-loop-integration.test.ts
git commit -m "fix(ui): prefix P1/P2 lap lines in finish panel and fix panel spacing"
```
实测 commit：`92df866`（3 文件，17 insertions / 3 deletions）。

**实施偏差（P1）**：
1. **#finish-wins 已有间距**：style.css 现状 `#finish-wins` 已有 `margin-top: 8px`（M9 E4 添加）。按计划字面调整为 `10px`（间距略增，不影响布局）。
2. **底部间距选 padding-bottom 方案**：`#finish-screen { padding-bottom: calc(env(safe-area-inset-bottom) + 16px) }`——保留原有 safe-area 四值 padding 的 bottom 分量并叠加 16px，避免给 `.hint` 加 margin-bottom 影响共享选择器（`#start-screen .hint, #finish-screen .hint, #pause-screen .hint`）的其他屏幕。
3. **热座 finish-wins 断言分支依赖**：断言 `finish-wins.hidden === false` 依赖流程走非平手分支（平手时 winStats 为 null、finish-wins 隐藏，E4 既有语义）。实测走非平手分支通过；与既有 finish-hint 三选一断言同一脆弱性，注释已说明。

---

### Task P2: DRIFT_SCORE_MAX clamp + 漂移连击/倍率系统

**Files:**
- Modify: `src/physics/drift.ts`（DriftState + updateDrift）
- Modify: `src/ui/hud.ts`（HudElements + 显示）
- Modify: `index.html`（#drift-indicator 旁加 COMBO 元素）
- Modify: `src/style.css`（COMBO 样式）
- Test: `tests/unit/drift.test.ts`（新增用例 + 字面量同步）
- Test: `tests/unit/hud.test.ts`（新增 COMBO 显隐用例）
- Modify: `src/game/game-loop.ts`（hudElements 组装补新字段）——仅当 hud 字段非可选时；建议可选字段则不需要。

**Interfaces:**
- Consumes: `updateDrift(dt, input, state, config, drift, cameraZ): DriftState`（纯函数）；`DriftState { charge, active, lastSmoke, smoke, score }`；`DRIFT_SCORE_MAX`（constants.ts，99999）；`DRIFT_SCORE_RATE = 0.01`（drift.ts 私有）
- Produces: `DriftState` 新增必填字段 `combo: number`（连击数，createDriftState 初始 0）；私有常量 `COMBO_WINDOW_SECONDS = 2`（连续漂移每满 2 秒 combo+1）、`COMBO_MAX = 10`、`COMBO_MULTIPLIER_STEP = 0.25`（倍率 = 1 + min(combo, COMBO_MAX) * 0.25，上限 3.5x）；得分公式：`score += speed * dt * DRIFT_SCORE_RATE * (1 + Math.min(combo, COMBO_MAX) * COMBO_MULTIPLIER_STEP)`，随后 `score = Math.min(score, DRIFT_SCORE_MAX)`。
- combo 语义：仅 `active` 期间累积 `comboTimer += dt`；`comboTimer >= COMBO_WINDOW_SECONDS` 时 combo+1 并归零 timer；`active` 由 true→false 时 combo 与 timer 归零（漂移中断断连击）。
- HUD：`HudElements` 加可选 `driftCombo?: HTMLDivElement`；显示逻辑（updateHud 漂移指示分支内）：`driftPlayer.driftState.active && driftPlayer.driftState.combo >= 1` 时 hidden=false 且文本 `COMBO x${(1 + Math.min(combo, COMBO_MAX) * 0.25).toFixed(2)}`（或整数倍率格式，见实现）；否则 hidden=true。!showHud 分支一并隐藏。
- 说明：连击在漂移中断（active 变 false）时清零——同一次连续漂移中每 2 秒提高 1 级；结算/TOP10 用最终 score（已含倍率）。

- [x] **Step 1: 写失败测试**

`tests/unit/drift.test.ts`：
- 新增 describe「漂移连击与得分上限」：
  1. 持续漂移 2.1s 后 combo 从 0 → 1；4.2s 后 → 2（断言 combo 值）
  2. 漂移中断（松转向让 active 变 false）后 combo 归 0
  3. 倍率生效：combo=1 时相同 dt/速度得分 > 无 combo 基线得分（构造两个 drift 对象对比累计分）
  4. 得分 clamp：构造 `{ ...drift, score: DRIFT_SCORE_MAX - 1 }` 继续漂移，断言 score 不超过 DRIFT_SCORE_MAX
- 同步：7 处 DriftState 字面量加 `combo: 0` 与 `comboTimer: 0`（RED 阶段编译即失败）。

`tests/unit/hud.test.ts`：
- 新增 describe「hud 漂移连击显示」：mock 加 `driftCombo`，用例——active 且 combo≥1 显示 COMBO 文本；active 且 combo=0 隐藏；菜单阶段隐藏（复用 !showHud）。

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/drift.test.ts tests/unit/hud.test.ts`
Expected: RED——combo 字段不存在编译失败 / 新用例失败。实测：drift 4 新用例失败（combo 无累积、倍率无差异、无 clamp）+ hud 3 新用例失败（COMBO 无显示/无隐藏），既有用例全过。

- [x] **Step 3: 实现**

`src/physics/drift.ts`：
```ts
export interface DriftState {
  charge: number
  active: boolean
  lastSmoke: number
  smoke: SmokeParticle[]
  score: number
  combo: number       // 连击数：连续漂移每满 COMBO_WINDOW_SECONDS 秒 +1，中断归零
  comboTimer: number  // 连击计时器（秒，仅 active 期间累积）
}
```
私有常量：`COMBO_WINDOW_SECONDS = 2`、`COMBO_MAX = 10`、`COMBO_MULTIPLIER_STEP = 0.25`；得分行：
```ts
if (next.active) {
  next.comboTimer += dt
  if (next.comboTimer >= COMBO_WINDOW_SECONDS) {
    next.comboTimer = 0
    next.combo = Math.min(next.combo + 1, COMBO_MAX)
  }
  const multiplier = 1 + next.combo * COMBO_MULTIPLIER_STEP
  next.score = Math.min(next.score + state.speed * dt * DRIFT_SCORE_RATE * multiplier, DRIFT_SCORE_MAX)
}
// 中断/新段检测（放在 active 判定后）：
if (next.active && !drift.active) { next.combo = 0; next.comboTimer = 0 }
if (!next.active && drift.active) { next.combo = 0; next.comboTimer = 0 }
```
（import DRIFT_SCORE_MAX from '../game/constants'——drift.ts 已导入 DRIFT_* 常量，同文件追加。）

`src/ui/hud.ts`：HudElements 加 `driftCombo?: HTMLDivElement`；!showHud 分支 `if (elements.driftCombo) elements.driftCombo.hidden = true`；漂移指示分支内：
```ts
if (elements.driftCombo) {
  const combo = driftPlayer.driftState.combo
  elements.driftCombo.hidden = !(driftPlayer.driftState.active && combo >= 1)
  if (!elements.driftCombo.hidden) {
    const mult = 1 + combo * 0.25
    elements.driftCombo.textContent = `COMBO x${mult.toFixed(2)}`
  }
}
```

`index.html`：#drift-indicator 之后加 `<div id="drift-combo" hidden>COMBO x1.00</div>`。
`src/style.css`：#drift-combo 参考 #drift-indicator 样式（黄绿色 #fde047 加粗）。
`src/game/game-loop.ts`：hudElements 组装补 `driftCombo: $('drift-combo') as HTMLDivElement`（组装处为逐字段字面量，必须补）。

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/drift.test.ts tests/unit/hud.test.ts`
Expected: GREEN 全绿。实测：2 文件 38 用例全绿。

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run bot`
Expected: 全绿；bot 基线不变（漂移不改直线全油门 bot 行为）。实测：typecheck/lint 通过；32 文件 / 349 用例全绿；bot 3 圈 76.017s / 0 违规。

- [x] **Step 6: 提交**

```bash
git add src/physics/drift.ts src/ui/hud.ts index.html src/style.css tests/unit/drift.test.ts tests/unit/hud.test.ts
git commit -m "feat(physics): add drift combo multiplier and clamp score at DRIFT_SCORE_MAX"
```
实测 commit：`7525727`（7 文件含 game-loop.ts，177 insertions / 8 deletions）。

**实施偏差（P2）**：
1. **DriftState 字面量实际 7 处**（计划写 5 处）：idleDrift、effectiveTurnRate×2、driftSpeedFactor×2、scored、纯函数性用例，全部加 `combo: 0, comboTimer: 0` 两个字段（comboTimer 同为必填，按 Produces/Step 3 同步加，Step 1 清单仅写 combo）。
2. **game-loop.ts 纳入提交（7 文件）**：计划 Step 6 的 git add 未列 game-loop.ts，但 hudElements 组装处是逐字段对象字面量而非可选访问——不补 `driftCombo` 则真实浏览器中 elements.driftCombo 恒 undefined、连击显示永不生效。Files 列表已列为条件性 Modify，条件成立。
3. **HUD 倍率未重复 min(combo, COMBO_MAX)**：COMBO_MAX 是 drift.ts 私有常量，HUD 层按 Step 3 代码 `1 + combo * 0.25`（combo 已在 drift.ts 内 clamp 到上限 10，等价于 Interfaces 公式）。
4. **RED 无编译失败**：vitest 走 esbuild 转译（不做类型检查），字面量加字段后表现为运行时断言失败（combo 恒 0）而非编译失败——证据形态不同但等效 RED。
5. **integration 瞬态超时**：全量测试一次「分屏 P2 s-curve」用例 5000ms 超时，单独跑 1.95s 通过、重跑全绿——既有脆弱性（2500 帧模拟接近阈值），非本任务引入。

**实施偏差（P7 冒烟修复）**：
- **根因**：COMBO_WINDOW_SECONDS=2 在真实物理下不可达——active 期间速度按 DRIFT_SPEED_FACTOR=0.985 每帧衰减（0.985^60≈0.40/s），从满速 320 km/h 跌到 0.5*maxSpeed 阈值仅约 0.8s（0.985^n=0.5 → n≈46 帧），连续 active 窗口最多 ~0.8s，永远达不到 2s——浏览器实测确认 COMBO 永不显示（W 满速后 KeyD，active 最长段 0.8s）。单测用恒定 speed 掩盖了此问题。
- **修复**：`COMBO_WINDOW_SECONDS` 2 → 0.5（0.5s 内 active 仍高于速度阈值，满速漂移 0.8s 窗口可叠 1 级 combo，HUD 显示 COMBO x1.25）。其余连击逻辑（combo/comboTimer 字段、COMBO_MAX=10、COMBO_MULTIPLIER_STEP=0.25、active 翻转重置、得分公式、DRIFT_SCORE_MAX clamp）一律不动。
- **测试同步**：drift.test.ts「漂移连击与得分上限」中依赖 2s 窗口的 2 用例改为 0.5s 语义（0.6s → combo 1、1.1s → combo 2；中断用例前置 2.1s → 0.6s）；其余用例（中断归零、倍率生效、clamp、纯函数性）不动。用例数不变（363）。
- **验证**：RED（0.6s 断言 combo=1 失败，expected +0 to be 1）→ GREEN（17 用例全绿）；全量 typecheck/lint/npm test（32 文件 363 用例）/bot（3 圈 76.017s 0 违规，bot 不漂移不受影响）通过；浏览器冒烟实测 COMBO x1.25 出现。
- **commit**：`fix(physics): lower combo window to 0.5s so it is reachable in real physics`（2 文件：src/physics/drift.ts + tests/unit/drift.test.ts）。

---

### Task P3: 各赛道 BEST 汇总显示

**Files:**
- Modify: `src/game/game-loop.ts`（新私有方法 + 两处调用 + DOM 组装）
- Modify: `index.html`（#start-screen 内加 #best-summary）
- Modify: `src/style.css`（#best-summary 样式）
- Test: `tests/unit/game-loop-integration.test.ts`（构造时 #best-summary 渲染断言 + 写存档后刷新）

**Interfaces:**
- Consumes: `TRACK_DEFS`（tracks.ts，9 条，含 id/name）、`loadBestTimeFor(playerIndex, trackId, storage?)`（save.ts）、`formatTime(sec)`（ui/format.ts）
- Produces: GameLoop 私有 `refreshBestSummary(): void`——遍历 TRACK_DEFS：`loadBestTimeFor(0, def.id)` 与 `loadBestTimeFor(1, def.id)`（分屏/热座时 P2 值也有意义，统一都读），渲染到 `#best-summary`（换行分隔，格式 `${i+1}. ${def.name}  P1 ${formatTime(t1)}${t2 !== null ? ' · P2 ' + formatTime(t2) : ''}`，无记录显示 `--`）。无任何记录时显示 `暂无最佳成绩`。

- [x] **Step 1: 写失败测试**

`tests/unit/game-loop-integration.test.ts` 新增用例：
1. 「构造后菜单渲染各赛道 BEST 汇总」：`getElement('best-summary')` 非空且包含 `经典赛道`（9 条赛道均出现）
2. 「完赛写入存档后回菜单刷新汇总」：stub storage 预设某赛道 best 值 → 构造 → 断言对应行含格式化时间；或完赛流程后断言（轻量：直接注入 fakeStorage 于 localStorage stub）。

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/game-loop-integration.test.ts`
Expected: RED（元素无渲染）。实测：2 新用例失败（best-summary textContent 为空）。

- [x] **Step 3: 实现**

`src/game/game-loop.ts`：
- 新私有方法 `refreshBestSummary()`（仿 refreshDriftTop，`document.getElementById('best-summary')` 防御式获取）：
```ts
private refreshBestSummary(): void {
  const el = document.getElementById('best-summary')
  if (!el) return
  const lines = TRACK_DEFS.map((def, i) => {
    const t1 = loadBestTimeFor(0, def.id)
    const t2 = loadBestTimeFor(1, def.id)
    const p1 = t1 !== null ? formatTime(t1) : '--'
    const p2 = t2 !== null ? ` · P2 ${formatTime(t2)}` : ''
    return `${i + 1}. ${def.name}  P1 ${p1}${p2}`
  })
  const hasAny = TRACK_DEFS.some((def) => loadBestTimeFor(0, def.id) !== null || loadBestTimeFor(1, def.id) !== null)
  el.textContent = hasAny ? lines.join('\n') : '暂无最佳成绩'
}
```
- 调用点：构造器（`this.refreshDriftTop()` 旁）+ PHASE_MENU 分支（`this.resetRace()` 后与 `refreshDriftTop` 并列）。
- import：`formatTime`（ui/format，未导入需补）；`TRACK_DEFS`/`loadBestTimeFor` 已导入（game-loop 3/12 行）。

`index.html`：`#drift-top` 之前加 `<div id="best-summary">暂无最佳成绩</div>`。
`src/style.css`：#best-summary 复用 #drift-top 风格（小字、居中、pre-line、max-width 320px）。

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/game-loop-integration.test.ts`
Expected: GREEN。实测：27 用例全绿（25 既有 + 2 新，stub 扩展未破坏既有）。

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run bot`
实测：typecheck/lint 通过；32 文件 / 351 用例全绿（349 + 2）；bot 3 圈 76.017s / 0 违规。

- [x] **Step 6: 提交**

```bash
git add src/game/game-loop.ts index.html src/style.css tests/unit/game-loop-integration.test.ts
git commit -m "feat(ui): show per-track best time summary in menu"
```
实测 commit：`be4850e`（4 文件，94 insertions / 1 deletion）。

**实施偏差（P3）**：
1. **「暂无最佳成绩」语义统一**：计划 Interfaces 写「无任何记录时显示占位」，Step 3 代码 `lines.length ? ... : '暂无最佳成绩'` 却恒渲染 9 行（lines 恒非空）。实现为 `hasAny`（9 条 × P1/P2 共 18 值均 null）→ 占位文本；否则渲染 9 行（无记录单格 `--`）。测试用例相应调整：用例 1 断言全无记录 → `暂无最佳成绩`；用例 2 注入 9 条 P1 best 断言赛道名齐全 + 行数 9 + 首行格式化时间。
2. **stubEnvironment 扩展可选尾参 `initialStorage`**：现状 stub 无 localStorage（node 环境全局 localStorage 不存在，getStorage() 恒 null）。给 windowStub 加 Map 实现的 `localStorage`，仅当 `initialStorage` 传入时 `vi.stubGlobal('localStorage', fakeStorage)`（save.ts getStorage 双检查需全局 + window 都满足）；不传时行为与既有用例完全一致（已验证 25 既有用例零改动全过）。
3. **测试用例改为 2 个覆盖全语义**：计划 Step 1 列 2 用例，实际实现为「全无记录占位」+「9 条注入渲染齐全/格式化时间/P2 后缀不出现」两例，覆盖计划要求的构造渲染 + 预设存档两场景。

---

### Task P4: 车流避让 AI

**Files:**
- Modify: `src/engine/traffic.ts`（updateTraffic 签名 + 避让逻辑）
- Modify: `src/game/game-loop.ts`（两处 updateTraffic 调用传 player 位置）
- Test: `tests/unit/traffic.test.ts`（新增避让用例）

**Interfaces:**
- Consumes: `updateTraffic(traffic, dt, lapLength)`（traffic.ts:41-45）；`collideWithPlayer(traffic, playerZ, playerX, zTol=80, xTol=0.9)`；TrafficCar `{ z, offset, speed, colorIndex }`；ROAD_HALF_WIDTH=1
- Produces: `updateTraffic(traffic, dt, lapLength, player?: { z: number; x: number }): void`——可选尾参。避让规则（在环形推进后执行）：
  - 环形距离 `d = ((car.z - player.z + lapLength) % lapLength)`（车在玩家前方距离；若 d < AVOID_Z_DIST=350 且玩家正在接近——简化不做速度比较——且 `|car.offset - player.x| < AVOID_X_TOL=1.2`（同车道/近车道）时，向远离玩家的一侧变道：`car.offset` 渐变到目标侧 `targetOffset = player.x > 0 ? -0.75 : 0.75`（符号取反方向），步进 `AVOID_STEP = 0.8 * dt`，clamp `|offset| <= 0.85`；若已远离（d > AVOID_Z_DIST 或 |offset差| > 1.2）则无操作（保持原 offset，不做恢复逻辑——变道是永久的，车流本来就随机车道）。
  - 常量：`AVOID_Z_DIST = 350`、`AVOID_X_TOL = 1.2`、`AVOID_STEP = 0.8`、`AVOID_LANE_EDGE = 0.85`（模块私有）。
  - 注意：变道仅当车在玩家前方（d 在 (0, 350] 区间；d === 0 时视为已超过）——玩家从后方追上。环形语义：`(car.z - player.z + lapLength) % lapLength` 天然给出"车相对玩家前方距离"，若车在玩家后方该值接近 lapLength（大），自然不触发。
- 行为变化：车流车在玩家逼近时让道，碰撞概率下降；`collideWithPlayer` 不变（避让后 offset 变了自然不撞）。

- [x] **Step 1: 写失败测试**

`tests/unit/traffic.test.ts` 新增 describe「车流避让」：
1. 玩家逼近同车道车流（car.offset=0.6, player.x=0.5, 车在玩家前方 100）→ 2 次 updateTraffic 后 offset 向远离侧移动（如 player.x>0 → offset 变负方向）
2. 玩家远离（车在玩家前方 2000）→ offset 不变
3. 不同车道（car.offset=-0.7 差 1.2 边界不触发）——测试断言避让只在 |offset差| < AVOID_X_TOL 时触发
4. 不带 player 参数时行为与旧版一致（回归：offset 恒等）

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/traffic.test.ts`
Expected: RED（新用例失败：offset 不变）。实测：1 新用例失败（逼近避让，expected 0.6 to be close to 0.52），其余 14 用例通过。

- [x] **Step 3: 实现**

`src/engine/traffic.ts`：扩展 `updateTraffic(traffic, dt, lapLength, player?: { z; x }): void`，环形推进循环内：
```ts
const d = (car.z - player.z + lapLength) % lapLength
if (d > 0 && d < AVOID_Z_DIST && Math.abs(car.offset - player.x) < AVOID_X_TOL) {
  const target = player.x > 0 ? -AVOID_LANE_EDGE : AVOID_LANE_EDGE
  const step = AVOID_STEP * dt
  const delta = target > car.offset ? Math.min(step, target - car.offset) : Math.max(-step, target - car.offset)
  car.offset += delta
  car.offset = Math.max(-AVOID_LANE_EDGE, Math.min(AVOID_LANE_EDGE, car.offset))
}
```
常量：`AVOID_Z_DIST=350`、`AVOID_X_TOL=1.2`、`AVOID_STEP=0.8`、`AVOID_LANE_EDGE=0.85`（模块私有）。

`src/game/game-loop.ts` 两处调用（frame 中 P1 世界、P2 世界条件分支）改为传玩家位置：
```ts
updateTraffic(this.race.tracks[0].traffic, dt, this.race.tracks[0].lapLength, {
  z: this.race.player1.cameraZ,
  x: this.race.player1.carState.position,
})
```
（P2 世界传 player2.cameraZ / player2.carState.position；热座 P1 回合 P2 世界不推进，保持现状。）

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/traffic.test.ts tests/unit/game-loop-integration.test.ts`
Expected: GREEN（integration 不涉及避让断言，只回归）。实测：2 文件 42 用例全绿。

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run bot`
实测：typecheck/lint 通过；32 文件 / 355 用例全绿（351 + 4）；bot 3 圈 76.017s / 0 违规（基线分毫不差，避让未改变 bot 直线轨迹）。

- [x] **Step 6: 提交**

```bash
git add src/engine/traffic.ts src/game/game-loop.ts tests/unit/traffic.test.ts
git commit -m "feat(traffic): cars steer away when player approaches (avoidance AI)"
```
实测 commit：`4859b44`（3 文件，90 insertions / 4 deletions）。

**实施偏差（P4）**：
1. **d === 0 边界**：计划写「d 在 (0, 350] 区间；d === 0 视为已超过」，Interfaces 公式用 `d < AVOID_Z_DIST=350`（严格小于）。实现为 `d > 0 && d < AVOID_Z_DIST`（严格大于 0、严格小于 350），与「d === 0 不触发」注释一致；测试用例 d=100/2000 均远离边界，无歧义。
2. **步进实现**：用 `target > car.offset ? min(step, target-car.offset) : max(-step, target-car.offset)` 保证渐变不超过目标（接近目标时步进收敛），clamp 前后双保险（步进上限 + |offset| ≤ 0.85）。
3. **测试用例 1 断言**：两次调用步进 0.8*0.05*2=0.08 → `toBeCloseTo(0.6 - 0.08, 6)` 精确断言（car.speed=0 使 d 恒定，避让每帧稳定触发）；另断言 offset > 0（未越过中线，0.08 步进远小于目标距离）。
4. **bot 基线精确不变**：计划预计「圈速变化不破坏判定」，实测 76.017s 分毫不差（bot 直线 x=0 时车流避让轨迹未改变碰撞时序）。

---

### Task P5: 雨天气（晴/阴/雨三态循环 + 雨滴渲染）

**Files:**
- Modify: `src/engine/lighting.ts`（updateLighting 第三可选参数 raining）
- Modify: `src/engine/renderer.ts`（renderWithOpts 天气态计算 + 雨滴 overlay 绘制）
- Test: `tests/unit/lighting.test.ts`（rain 参数用例）
- Test: `tests/unit/renderer-state.test.ts`（雨滴绘制计数用例）

**Interfaces:**
- Consumes: `updateLighting(timeSec, overcast = false)`（lighting.ts:27）；`WEATHER_CYCLE_SECONDS = 45`；renderWithOpts 内 overcast 计算（renderer.ts:229-231）；opts 结构（148-150 行）
- Produces:
  - `updateLighting(timeSec, overcast = false, raining = false): LightingColors`——raining 时与 overcast 相同颜色（复用 overcastHsl），仅语义区分（避免第三次颜色方案，雨=更暗更灰，可再乘 l*0.9；实现时保证 raining=true 且 overcast=true 组合下颜色确定）。
  - renderer.ts：天气态计算改为三态——`const phase = Math.floor(timeSec / WEATHER_CYCLE_SECONDS) % 3`；`const overcast = phase === 1`；`const raining = phase === 2`；`const colors = updateLighting(timeSec, overcast, raining)`。
  - 雨滴 overlay：renderWithOpts 末尾（drawSmoke 之后、restore 之前）画雨丝——全屏斜线（忽略投影，最上层特效）。雨滴数据在 Renderer 构造时确定性生成：`const RAIN_DROPS = 80`，`mulberry32(2026)` 生成 `{ x: rnd()*width, y0: rnd()*height, len: 8 + rnd()*6 }`（x 为初始横坐标，绘制时按 timeSec 下落）；绘制：`ctx.strokeStyle = 'rgba(180, 200, 220, 0.35)'`、`lineWidth = 1`，每条 `moveTo(x, y)` + `lineTo(x - 3, y + len)`，其中 `y = (y0 + timeSec * 600) % (height + 20) - 10`（下落速度 600 px/s，环形回绕）。raining=false 时跳过绘制。宽高变化（setViewport）时雨滴 x 不重算（用宽度百分比存：`x: rnd() * 1` 归一化，绘制乘 width）。
  - 菜单恒 0（timeSec=0 → phase 0 晴），比赛 45s 晴→45s 阴→45s 雨循环。
- 测试：
  - lighting.test.ts：新增 2 用例——`(45*2)` 时 raining=true 的 skyTop 与 overcast=true 时相同（或断言 raining 参数不抛错且输出 hsl 格式合法）；raining 与 clear 的 skyTop 不同。
  - renderer-state.test.ts：新增用例——rain 时间（timeSec=90，即 phase 2）渲染后 `__calls.stroke` 或 `__calls.beginPath` 计数 > 晴天渲染计数（雨滴绘制产生额外路径调用）；timeSec=0（晴）与 timeSec=90 差异断言。注意 mock 需覆盖 stroke/lineTo（canvas mock 已覆盖 lineTo；stroke 若缺失需补）。

- [x] **Step 1: 写失败测试**

按上述用例写入 lighting.test.ts / renderer-state.test.ts。

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/lighting.test.ts tests/unit/renderer-state.test.ts`
Expected: RED。实测：3 新用例失败（lighting 2：raining 复用 overcast/raining 异于 clear；renderer-state 1：rain 无 stroke 调用）/ 23 既有用例通过。

- [x] **Step 3: 实现**

按上述 Produces 实现 lighting.ts / renderer.ts。renderer 雨滴字段：`private rainDrops: { x: number; y0: number; len: number }[]`（构造时生成，归一化 x）。

- [x] **Step 4: 运行确认通过**

Run: 同 Step 2 命令 → GREEN。实测：2 文件 26 用例全绿（lighting 12 + renderer-state 14）。

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`
Expected: 全绿；bot 基线不变（bot 3 圈 76s 内含 phase 1（阴）不会进入雨段——45s 处 phase=1，bot 总时长 76s 会经历 0-45 晴 + 45-76 阴，无雨；若断言 bot 输出不受影响则无需处理）。实测：typecheck/lint 通过；32 文件 / 358 用例全绿（355 + 3）；build 通过（41.45 kB）；bot 3 圈 76.017s / 0 违规（基线分毫不差）。

- [x] **Step 6: 提交**

```bash
git add src/engine/lighting.ts src/engine/renderer.ts tests/unit/lighting.test.ts tests/unit/renderer-state.test.ts
git commit -m "feat(render): add rain weather state with raindrop overlay"
```
实测 commit：`2ee46dd`（5 文件含 mock，81 insertions / 6 deletions）。

**实施偏差（P5）**：
1. **tests/__mocks__/canvas.ts 纳入提交（5 文件）**：计划 Step 6 的 git add 未列 mock，但 renderer 新增 `ctx.stroke()` 后 mock 无该方法（运行时 TypeError）——必须扩展 mock 记录 stroke（并补 strokeStyle/lineWidth 初始属性），属任务约定允许范围。故实际提交 5 文件（lighting.ts、renderer.ts、canvas.ts、lighting.test.ts、renderer-state.test.ts）。
2. **renderer.ts 未导入 mulberry32**：任务描述「已导入——确认后复用」与现状不符（renderer.ts import 列表无 mulberry32）。实现新增 `import { mulberry32 } from './scenery'`（scenery.ts 导出，traffic.ts/sprites.ts 同源复用）。
3. **raining 复用 overcastHsl（未再乘 l*0.9）**：`updateLighting` 实现为 `build = overcast || raining ? overcastHsl : hsl`——raining 与 overcast 输出逐字节一致，最小改动且既有 10 用例零改动；lighting 新用例按此断言（raining skyTop === overcast skyTop、raining ≠ clear）。
4. **drawRain 用 try/finally 包 stroke**：计划「finally stroke()」字面实现——try { beginPath + 80 条 moveTo/lineTo } finally { stroke() }，保证 stroke 恒执行。
5. **三态 phase 语义变化**：`Math.floor(timeSec / 45) % 3` 与原二态 `% 2 === 1` 在 >90s 区间行为不同（135-180s 原阴现晴、180-225s 原晴现阴），为计划要求；bot 76s 仅经历 phase 0/1（晴+阴）基线分毫不差；菜单 timeSec=0 恒晴。
6. **雨滴分屏自适应**：renderRegion 路径的 opts.width 为区域宽度，x 归一化乘区域宽度，双区域各 80 条雨丝独立绘制（clip 内），视觉与性能均正常。

---

### Task P6: 暂停菜单选项（音量调节 + 重开）

**Files:**
- Modify: `src/audio/engine.ts`（EngineSound 输出节点注入）
- Modify: `src/audio/music.ts`（MusicPlayer 输出节点注入）
- Modify: `src/game/game-loop.ts`（masterGain 创建 + 音量持久化 + 暂停菜单交互）
- Modify: `src/ui/screens.ts`（ScreenElements 可选 pauseVolume/pauseRestart + applyPhaseToScreens 无改动或最小）
- Modify: `index.html`（#pause-screen 加音量 slider 与重开按钮）
- Modify: `src/style.css`（暂停菜单控件样式）
- Test: `tests/unit/audio 相关`（EngineSound/MusicPlayer 输出注入）——若无现成 audio 测试基建，走 integration 轻断言
- Test: `tests/unit/game-loop-integration.test.ts`（PAUSED 按 KeyR 回菜单；音量 slider input 事件更新 masterGain）

**Interfaces:**
- Consumes: EngineSound 构造 `new EngineSound(ctx)`（engine.ts:25-42，`gain.connect(ctx.destination)`）；MusicPlayer 构造（music.ts，音符/踩镲 `connect(this.ctx.destination)` ×2 处）；game-loop 音频惰性创建（405-411 行）；`togglePause`（phase-logic）
- Produces:
  - EngineSound 构造改 `constructor(ctx: AudioContext, output: AudioNode = ctx.destination)`，`this.gain.connect(output)`；MusicPlayer 构造 `constructor(ctx, output: AudioNode = ctx.destination)`，两处 connect 改 `output`。
  - GameLoop：音频惰性创建处先 `const masterGain = ctx.createGain(); masterGain.gain.value = this.volume; masterGain.connect(ctx.destination)`，EngineSound/MusicPlayer 以 `masterGain` 为 output 注入；新增字段 `volume: number`（初值 0.6，可选 localStorage 持久化 key `outrun-pseudo3d-volume`，存 0-1）；`setVolume(v)` 方法：clamp 0-1、写字段、若 masterGain 已存在则 `masterGain.gain.value = v`、持久化。
  - 暂停菜单交互：keydown 中 PAUSED 分支加 `KeyR` → `this.applyPhase(PHASE_MENU); return`（回菜单；applyPhase MENU 块自动 resetRace + refreshDriftTop + refreshBestSummary）；音量 slider（`#pause-volume` input range 0-100）`input` 事件 → `setVolume(Number(value)/100)`；重开按钮 `#pause-restart`（显示"重新开始（R）"）click 事件同样回菜单。按钮/滑块事件在构造器 addEventListener（与 keydown/resize 并列）。
  - ScreenElements 加可选 `pauseVolume?: HTMLInputElement`、`pauseRestart?: HTMLDivElement`（buttons 用 div 或 button，按 index.html 形态）；applyPhaseToScreens 不改（PAUSED 分支已显示面板，元素随面板显隐）。
- 注意：音量 slider 的 input 事件监听在构造器绑定（元素恒存在，hidden 仅面板控制）。

- [x] **Step 1: 写失败测试**

`tests/unit/game-loop-integration.test.ts` 新增：
1. 「暂停菜单：PAUSED 阶段按 R 返回菜单」——进入 racing → Escape 暂停 → fireKey('KeyR') → phase 变 menu 且 startScreen 显示
2. 「音量 slider 输入更新主音量」——stub 环境下构造后触发 `pause-volume` input 事件，断言 `window.__gameDebug.volume`（debug hook 新增 volume getter）
3. 「重开按钮 click 返回菜单」——Escape 暂停后触发 pause-restart click → phase 变 menu
`tests/unit/engine-audio.test.ts` 新增「EngineSound 输出注入」2 用例（不传 output 连 destination 兼容；传 output 连注入节点）。

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/game-loop-integration.test.ts`（及目标 audio 测试）
Expected: RED。实测：integration 3 新用例失败（KeyR 停在 paused、click 停在 paused、volume undefined）+ engine-audio 1 新用例失败（gain 仍连 destination）；另 1 个 engine-audio 用例因测试 mock 自身缺 filter.connect 抛 TypeError（修正 mock 后 RED 成立）。

- [x] **Step 3: 实现**

按 Produces 实现（audio 两文件 + game-loop + screens 类型 + debug-hook + index.html + style.css）。音量持久化：`localStorage` key `outrun-pseudo3d-volume`（string 0-1），构造时 `loadVolume()` 读（无效回退 0.6）、`setVolume()` 写（clamp 0-1、masterGain 存在时同步 gain.value、持久化；getStorage 防御模式仿 save.ts）。

`index.html` #pause-screen 内：
```html
<div id="pause-screen" hidden>
  <h1>PAUSED</h1>
  <p class="hint">按 ESC 继续</p>
  <div id="pause-controls">
    <label>音量 <input id="pause-volume" type="range" min="0" max="100" value="60"></label>
    <button id="pause-restart" type="button">重新开始（R）</button>
  </div>
</div>
```

- [x] **Step 4: 运行确认通过**

Run: 同 Step 2 → GREEN。实测：2 文件 36 用例全绿（integration 30 + engine-audio 6）。

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`
实测：typecheck/lint 通过（修复 2 处类型问题：pauseVolume 可选守卫、engine-audio mock unknown 数组调用）；32 文件 / 363 用例全绿（358 + 5）；build 通过（42.42 kB）；bot 3 圈 76.017s / 0 违规。

- [x] **Step 6: 提交**

```bash
git add src/audio/engine.ts src/audio/music.ts src/game/game-loop.ts src/ui/screens.ts index.html src/style.css tests/unit/game-loop-integration.test.ts（及 audio 测试文件）
git commit -m "feat(ui): pause menu with volume slider and restart button"
```
实测 commit：`ab017c1`（9 文件含 debug-hook.ts 与 engine-audio.test.ts，249 insertions / 13 deletions）。

**实施偏差（P6）**：
1. **debug-hook.ts 纳入提交（9 文件）**：计划 Step 6 的 git add 未列 debug-hook.ts，但音量断言采用计划认可的「debug hook 暴露 volume getter」方案——三处同步（Window 接口、DebugHookSources、installDebugHook 实现）+ game-loop installDebugHook 调用传 `volume: () => this.volume`，必须提交。
2. **MusicPlayer 输出注入未加单测**：无 music.test.ts 基建（MusicPlayer 的 connect 发生在 RAF 驱动的 schedule 调度内，单测需驱动 tick，过重）；EngineSound 注入用例已覆盖同模式「构造注入 + connect 目标」核心语义，MusicPlayer 靠 typecheck + integration 构造回归验证。计划允许「若无现成 audio 测试基建，走 integration 轻断言或说明」。
3. **integration stub 基建扩展**：createElementStub 的 addEventListener 从 `vi.fn()` 改为记录式（_listeners Map）+ 新增 `value` 字段（slider）；Environment 新增 `fireElementEvent(id, type)` 触发绑定的事件监听器（仿 fireKey 模式）。不传时行为与既有用例一致，25 既有用例零改动全过。
4. **PHASE_PAUSED 补导入**：game-loop.ts 原 import 无 PHASE_PAUSED（此前未用），新增 KeyR 分支需引用，补入（实现期发现）。
5. **slider 监听器读元素 value 而非事件 target**：input 监听闭包直接读 `pauseVolume.value`（`setVolume(Number(pauseVolume.value)/100)`），不依赖事件对象，fireElementEvent 传空对象即可触发；测试先设 `slider.value = '80'` 再 fire。
6. **类型修复 2 处**：`screenElements.pauseVolume` 为可选字段，事件绑定处改守卫式（`if (pauseVolume)`，与「可选字段走守卫」约定一致）；engine-audio.test.ts mock 的 `connected` 从 `unknown[]` 数组元素调用改为 `getConnected()` 函数（TS2571）。

---

### Task P7: 全量验证 + 浏览器冒烟 + observer 复核

**Files:**
- Create: `test-m10.py`（untracked 不入库，Playwright 冒烟，参考 test-m9.py 结构：CHROME 路径 `C:\Users\ZCL\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe`、dbg()/shoot()/hold()/wait_phase()/check() 辅助）

- [ ] **Step 1: 全量验证链**
Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`（bot 基线 3 圈 76.017s 0 违规）

- [ ] **Step 2: 冒烟场景**
1. 场景 M1（结算打磨）：分屏双人同赛道双完赛 → finish-laps 文本以 `P1 LAP`、finish-laps-2 以 `P2 LAP` 开头；截图 shots/m10/finish-laps.png
2. 场景 M2（漂移连击）：单屏经典赛道 → W 全油门 + 持续左转向至漂移激活 → 轮询 `#drift-combo` 可见且文本 `COMBO x` 开头；继续 4s 断言文本倍率 > 1.00（combo 提升）；截图 shots/m10/drift-combo.png
3. 场景 M3（BEST 汇总）：菜单注入 localStorage（若干 `outrun-pseudo3d-best-*`）→ 刷新 → `#best-summary` 含赛道名与格式化时间；截图 shots/m10/best-summary.png
4. 场景 M4（雨天气）：比赛静止 100s（或注入 timeSec 不可行则等待 90s 后 phase 2）→ 采样天空像素与晴差异 + 截图 shots/m10/rain.png（视觉确认雨丝；像素断言可选）
5. 场景 M5（暂停菜单）：比赛 → Escape → `#pause-volume` 可见；拖动 slider（page.evaluate 设置 value + dispatch input）→ 断言 `window.__gameDebug.volume` 变化；按 R → phase 回 menu；截图 shots/m10/pause-menu.png
6. 场景 M6（车流避让）：较难直接观察——用 `__gameDebug` 读取 traffic[0] 位置对比（可选跳过，单测已覆盖）

- [ ] **Step 3: observer 复核**
复用 obs-2（ses_03a92e3d5ffe03GLiCWmIDh3S9）分析 shots/m10/ 截图：重点验证 P1/P2 圈速行前缀、COMBO 显示、BEST 汇总排版、雨丝视觉、暂停菜单布局。

---

### Task P8: codemap 刷新 + 汇总报告

- [ ] **Step 1**: `codemap.mjs changes --root ./` 检出差异目录
- [ ] **Step 2**: 派 fixer 更新受影响子目录 codemap.md（src/physics 漂移连击、src/engine 车流避让+雨、src/ui 暂停菜单/COMBO/BEST、src/game game-loop 新方法、tests 用例数）
- [ ] **Step 3**: orchestrator 更新聚合文档（根/src/docs/plans codemap）+ `codemap.mjs update --root ./`
- [ ] **Step 4**: 汇总报告（commit 列表、验证结果、遗留、下一步建议）
