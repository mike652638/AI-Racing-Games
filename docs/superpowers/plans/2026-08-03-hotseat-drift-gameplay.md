# 热座双人 / 漂移竞速 / 游戏性扩展 Implementation Plan (M8)

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:subagent-driven-development（推荐）或 executing-plans 逐 Task 实现。步骤用 `- [ ]` checkbox 跟踪。每个 Task 独立 TDD + 独立 commit。

**Goal:** 三项扩展——① 单屏显示 P2 BEST 并支持热座轮流模式（双人先后跑同赛道比成绩）；② 分屏漂移得分竞速（结算面板按得分排名）；③ 新赛道（+2）、车流密度赛道级调参、天气循环。

**Architecture:** 复用 M6/M7 双玩家基础设施（双 PlayerState、玩家维度存档、TrackContext 双世界）。热座 = URL `?hotseat=1` 进入回合制：输入路由到当前玩家、回合间回车交棒、不新增 Phase 状态；漂移竞速 = 结算面板新增排名横幅（DriftState.score 已全链路可用）；游戏性扩展 = TrackDef 扩展字段（trafficCount）+ lighting 参数化（overcast）+ TRACK_DEFS append。

**Tech Stack:** TypeScript + Vite + Canvas 2D + Vitest（不变）。

## Global Constraints

- 验证优先级：`npm run typecheck` → `npm run lint` → `npm test` → `npm run build` → `npm run bot`；bot 基线必须保持 **3 圈 76.017s、0 违规**。
- **现有 API 只做加法**：所有新参数必须可选、默认行为与现状完全一致（`?split=1` 分屏、无参单屏）。
- **Phase 保持四态**（phase.test.ts / gamestate.test.ts 有四态精确断言，新增状态必破）。热座交棒直接在 GameLoop 层赋值 `race.phase = PHASE_RACING`，不走 nextPhase。
- 改 `src/game/constants.ts` 必须同步 `tests/unit/constants.test.ts` 注册表断言。
- 新赛道只能 **append 到 TRACK_DEFS 末尾**（track-manager.test.ts 断言索引语义 2=s-curve、1=highway）。
- 计划文档不入库（既有惯例）；每 Task 独立 commit（`.slim/`、`docs/superpowers/plans/`、`test-*.py`、`shots/` 不提交）。
- 代码注释与提交信息中文；提交信息按 Conventional Commits（英文）。

---

### Task D1: 单屏显示 P2 BEST

**Files:**
- Modify: `src/ui/hud.ts`（HudElements + updateHud）
- Modify: `index.html`（#hud 内新增元素）
- Modify: `src/game/game-loop.ts`（hudElements 组装）
- Test: `tests/unit/hud.test.ts`

**Interfaces:**
- Consumes: `updateHud(elements, race, carConfig, bestTime, splitMode, tracks, phase, bestTime2)` 现有签名；`HudElements` 现有字段。
- Produces: `HudElements.hudBestP2?: HTMLDivElement`；`updateHud` 内单屏 P2 BEST 显隐/文本逻辑（签名不变，8 参数）。

**背景事实**：GameLoop 构造/resetRace/applyPhase 三处已无条件调用 `loadBestTimeFor(1, getTrackId(1))`，`bestTime2` 数据已就绪；但 `#hud-best-2` 位于 `#hud2` 容器内，单屏时 `hud2Container.hidden = true` 导致 P2 BEST 不可见。

- [x] **Step 1: 写失败测试（hud.test.ts）**
   在 hud.test.ts 新增 describe '单屏 P2 BEST'：mock HudElements 增加 `hudBestP2`（带 hidden/textContent）；用例：① `splitMode=false, bestTime2=12.34` 时 `hudBestP2.hidden === false` 且 `textContent === 'P2 BEST 0:12.340'`；② `splitMode=false, bestTime2=null` 时 `hidden === true`；③ `splitMode=true` 时 `hudBestP2.hidden === true`（单屏专用元素分屏隐藏）。既有用例调用 updateHud 时 mock 无 hudBestP2 字段——`elements.hudBestP2` 需可选访问（`elements.hudBestP2 && ...` 或 `??`），确保既有用例零改动通过。
- [x] **Step 2: 运行确认 RED**：`npx vitest run tests/unit/hud.test.ts` → 新用例失败。
- [x] **Step 3: 实现**
  - `index.html`：`#hud` 内、`#hud-best` 之后新增 `<div id="hud-best-p2" hidden>P2 BEST 0:00.000</div>`。
  - `src/ui/hud.ts`：`HudElements` 加 `hudBestP2?: HTMLDivElement`；在 !showHud 隐藏分支一并隐藏；显示分支：`if (elements.hudBestP2) { elements.hudBestP2.hidden = splitMode || bestTime2 === null; if (!elements.hudBestP2.hidden) elements.hudBestP2.textContent = `P2 BEST ${formatTime(bestTime2)}` }`（bestTime2 非 null 时）。
  - `src/game/game-loop.ts`：构造 hudElements 组装处补 `hudBestP2: $('hud-best-p2') as HTMLDivElement | null`（元素存在性确认，若为 null 则 typecheck 用非空断言或判空——以既有组装风格为准）。
- [x] **Step 4: 运行确认 GREEN**：`npx vitest run tests/unit/hud.test.ts`。
- [x] **Step 5: 全量验证**：typecheck / lint / `npm test` / `npm run bot`（bot 基线 76.017s 0 违规）。
- [x] **Step 6: 提交**：`feat(hud): show P2 best time in single-player HUD`（git add 三个源文件 + 测试文件）。

**实施偏差**：
1. game-loop.ts 组装处采用既有风格的非空断言 `$('hud-best-p2') as HTMLDivElement`（与文件内全部元素一致），未用计划中 `as HTMLDivElement | null` 的备选写法。
2. 测试 mock：既有 `createMockHudElements` 未改动（保持无 hudBestP2 字段，以证明可选访问兼容）；新 describe 内用局部 `withP2Best()`（展开既有 mock 补 hudBestP2）构建。
3. 其余无偏离；RED 证据为 3 新用例失败 + 10 既有通过，GREEN 后全量 32 文件 303 用例通过，bot 保持 76.017s / 0 违规。

---

### Task D2: 热座轮流模式（?hotseat=1，双人先后跑同赛道比成绩）

**Files:**
- Modify: `src/game/game-loop.ts`（mode 解析、hotseatPlayer、输入路由、交棒、applyPhase、menu-hint、hudElements）
- Modify: `src/ui/screens.ts`（FinishPanelOptions 扩展 + fillFinishPanel 热座分支）
- Modify: `src/ui/hud.ts`（hudPlayerTag）
- Modify: `index.html`（#hud-player-tag、#finish-hint）
- Test: `tests/unit/game-loop-integration.test.ts`、`tests/unit/hud.test.ts`、`tests/unit/screens` 相关（若存在）

**Interfaces:**
- Consumes: `PHASE_*` 四态；`updatePlayerFrame(dt, input, player, carConfig, lapLength, lapTimes?, lastLapRef?)`；`resetRace()`；`applyPhase(newPhase)`；`saveBestTime`/`loadBestTimeFor`。
- Produces: GameLoop 字段 `hotseatMode: boolean`、`hotseatPlayer: 1 | 2`、`prevP1Time: number | null`；`FinishPanelOptions` 增加 `hotseatMode: boolean; hotseatRound: 1 | 2; prevP1Time: number | null`；`updateHud` 增加第 9 尾参 `hotseatPlayer: 1 | 2 | null`；`HudElements.hudPlayerTag?: HTMLDivElement`；index.html `#hud-player-tag`、`#finish-hint`。

**设计要点（必须先读 game-loop.ts 当前 455 行版再动手）**：
1. **mode 解析**（构造处，splitMode 解析旁）：`this.hotseatMode = params.has('hotseat') && !this.splitMode`（split 优先互斥）。
2. **输入路由**（帧循环 P1/P2 更新段）：热座时只更新当前玩家——`const active = this.hotseatPlayer === 1 ? race.player1 : race.player2`；用 input1（同一键盘）调 `updatePlayerFrame(dt, input1, active, ...)`；P2 回合圈速记录传 `race.lapTimes2`/`lapRef2`（即热座 P1 回合传 lapTimes/lastLap，P2 回合传 lapTimes2/lastLap2）；另一玩家不更新、不推进相机/计时。
3. **赛道选择**：热座菜单 P1 按 1-5 选赛道后，同步 `trackManager.selectTrack(1, index)` + `race.tracks[1] = trackManager.getContext(1)`（两玩家同一赛道）。
4. **完赛判定**（applyPhase 的 finishedP1/finishedP2）：热座 P1 回合 finishedP1 条件同单屏；finishedP2 改为 `(splitMode || hotseatMode) && lapFromZ(player2.cameraZ, getLapLength(1)) > getTotalLaps(1)`（热座 P2 回合触发；P1 回合 player2 静止不会误触）。
5. **交棒**（onKeyDown）：`if (phase === PHASE_FINISHED && this.hotseatMode && (code === 'Enter' || code === 'KeyR') && this.hotseatPlayer === 1)` → `this.prevP1Time = race.player1.raceTime`（若为 null 才存，防重复）→ `this.hotseatPlayer = 2` → `this.resetRace()`（重置两玩家/车流/重载 BEST；确认 resetRaceState 是否重置 finishShown，若保留则手动置 false，确保 P2 回合结算可再次填充）→ `race.phase = PHASE_RACING`（绕过 nextPhase，保持四态）→ 返回。热座 round 2（hotseatPlayer===2）完赛后走现有任意键回菜单逻辑不变。
6. **结算**（screens.ts fillFinishPanel）：`opts.hotseatMode` 时——round 1：P1 行正常（finishedP1=true）、P2 行不处理（splitMode=false 天然跳过）；`#finish-hint` 显示 `按回车，P2 开始`；round 2：P1 行显示 `P1 用时 ${formatTime(opts.prevP1Time)}`（finishedP1 传 false 时走"未完赛"分支会显示 'P1 未完赛'——需要新增分支：`if (opts.hotseatMode && opts.hotseatRound === 2)` 时 P1 行填 `P1 用时 …` 而非未完赛）、P2 行正常（finishedP2=true 全填）；`#finish-hint` 显示胜负：`prevP1Time < race.player2.raceTime ? 'P1 更快！' : (prevP1Time > race.player2.raceTime ? 'P2 更快！' : '平手！')`。round 2 的 P1 行不再写存档（防覆盖）、不显示 NEW RECORD。
7. **HUD**（hud.ts）：`updateHud` 第 9 尾参 `hotseatPlayer: 1 | 2 | null`；`hudPlayerTag`：null 或非热座时 `hidden = true`；1 时文本 `P1 驾驶中` + `classList.toggle('p1', true)/('p2', false)`；2 时 `P2 驾驶中` + p2 类（CSS `#hud-player-tag.p2 { color: #4ade80 }` 加在 style.css）；漂移指示读取：`const driftPlayer = hotseatPlayer === 2 ? race.player2 : race.player1`（driftIndicator/driftScoreValue 用 driftPlayer.driftState，热座 P2 回合显示 P2 漂移）。非热座行为完全不变。
8. **menu-hint**：构造处（splitMode 提示旁）：`hotseatMode` 时文本 `P1 先跑 · 完成按回车交棒 P2 · 1/2/3 选赛道`。
9. **index.html**：`#hud` 内加 `<div id="hud-player-tag" hidden></div>`（样式见 style.css 追加 `#hud-player-tag { font-weight: bold; margin-bottom: 4px }` 与 `.p1 { color: #fde047 } .p2 { color: #4ade80 }`）；`#finish-screen` 内加 `<div id="finish-hint" hidden></div>`。GameLoop 组装 screenElements 时补 `finishHint`。

**测试**（game-loop-integration.test.ts，stubEnvironment 需支持 `hotseat` search 参数——参考现有 split 参数实现）：
- 热座流程用例：构造 `?hotseat=1` → menu → Digit2 选赛道（player1/player2 同赛道）→ Enter 开始（phase=racing、hotseatPlayer=1）→ W 驱动 → 跑完 3 圈 → phase=finished → Enter → phase=racing 且 hotseatPlayer=2 且两玩家状态已重置 → ArrowUp 驱动 P2 → 完赛 → 断言 finish-time-2 填充、finish-hint 含 'P2 更快' 或 'P1 更快'（用可预测值：驱动帧数控制）。
- 单屏回归：非 hotseat 构造下 updateHud 第 9 参传 null，既有用例零改动（hud.test.ts 既有调用补第 9 参 null）。
- 热座输入路由用例：hotseatPlayer=1 时 P2 帧不推进（player2.cameraZ 不变）。

**验证**：RED（新用例失败）→ GREEN → 全量 typecheck/lint/test/bot → 提交 `feat(split): add hotseat mode with per-player runs on same track`。

- [x] **Step 1: 写失败测试**：hud.test.ts 全部既有调用补第 9 参 null + 新增 describe 'hud 热座玩家标签（hudPlayerTag）'（P2/P1 回合文本与 p2/p1 类、非热座 null 隐藏、菜单阶段隐藏）；game-loop-integration.test.ts stubEnvironment 改为接受 `search: string | boolean`（兼容旧布尔签名）并新增热座流程用例（Digit2 同赛道 → Enter → KeyW 3 圈 → Enter 交棒 → hotseatPlayer=2 且状态重置 → KeyW 跑 P2 → finish-hint 胜负）与热座输入路由用例（P1 回合 player2CameraZ 不变）。
- [x] **Step 2: 运行确认 RED**：6 个新用例失败（hud 4 + integration 2），26 个既有用例通过。
- [x] **Step 3: 实现**：game-loop.ts（hotseatMode 解析/menu-hint/hotseatPlayer/prevP1Time、hudElements+screenElements 补字段、输入路由按回合、applyPhase finishedP2 与 opts、交棒分支、菜单 Digit 热座赛道同步、updateHud 第 9 参）；screens.ts（FinishPanelOptions 热座字段 + round2 P1 行快照 + P2 行条件放宽 + finish-hint 胜负）；hud.ts（第 9 尾参 + hudPlayerTag + 漂移指示 driftPlayer）；index.html（#hud-player-tag、#finish-hint）；style.css（标签/胜负横幅样式）；debug-hook.ts（+hotseatPlayer/player2CameraZ 可观测字段）。
- [x] **Step 4: 运行确认 GREEN**：32 用例全通过。
- [x] **Step 5: 全量验证**：typecheck / lint / npm test（32 文件 309 用例，基线 303 + 新增 6）/ build / `npm run bot`（3 圈 76.017s、0 违规）。
- [x] **Step 6: 提交**：`feat(split): add hotseat mode with per-player runs on same track`。

**实施偏差**：
1. **resetRaceState 的 finishShown 行为**：确认 `state.ts` `resetRaceState` 显式重置 `finishShown = false`（第 65 行），交棒后无需手动置 false——计划"若保留则手动置 false"分支未触发；交棒代码仅加注释说明。
2. **keydown 分支位置**：交棒分支置于菜单 Digit 分支之后、engineSound 初始化之前（"任意键回菜单"的 nextPhase 之前）；条件含 `hotseatPlayer === 1`，round 2（hotseatPlayer===2）或非 Enter/KeyR 键时自然落到既有 FINISHED→MENU 逻辑，两分支无冲突。
3. **updateHud 第 9 参对既有用例的影响**：参数带默认值 `= null`，既有 8 参调用零行为变化；hud.test.ts 既有 13 处调用按任务要求显式补第 9 参 null，新增 4 用例覆盖 hudPlayerTag；game-loop.ts 唯一调用点传 `this.hotseatMode ? this.hotseatPlayer : null`。
4. **debug-hook.ts 扩展（计划 Files 未列出）**：为测试可观测性在 installDebugHook 接口加 `hotseatPlayer`/`player2CameraZ` 两个加法字段（供 integration 断言交棒与输入路由），非热座行为不变。
5. **测试文档"ArrowUp 驱动 P2"笔误**：热座 P2 回合按实现要点使用 `input1`（P1 键盘映射 WASD），测试以 KeyW 驱动 P2；计划测试描述的 ArrowUp 属 P2 映射，与"===2 用 input1"要点矛盾，以要点为准。
6. **fillFinishPanel P2 行条件放宽**：`splitMode` 改为 `splitMode || (hotseatMode && hotseatRound === 2)`——否则热座 round 2 的 P2 行不会填充（"round 2 P2 行正常全填"依赖此改动）；round 1 仍天然跳过。
7. **updateTraffic/updateCollisions 未改（已知限制）**：热座下仍按 splitMode 条件执行——tracks[1] 车流不推进、P2 回合无车流碰撞检测；计划未覆盖，保持最小改动与非热座行为完全一致。
8. **hudPlayerTag 样式用限定选择器**：`#hud-player-tag.p1/.p2`（而非裸 `.p1/.p2`）实现配色，避免影响未来元素；基础样式按计划加粗 + margin-bottom。
9. **stubEnvironment 签名兼容**：`search: string | boolean`，`true` 等价 `'?split=1'`，既有 5 处布尔调用零改动。

---

### Task D3: 分屏漂移得分竞速排名

**Files:**
- Modify: `src/game/game-loop.ts`（applyPhase 计算 driftWinner）
- Modify: `src/ui/screens.ts`（FinishPanelOptions + fillFinishPanel 横幅）
- Modify: `index.html`（#finish-drift-winner）
- Test: `tests/unit/game-loop-integration.test.ts`（或 screens 单测）

**Interfaces:**
- Consumes: `DriftState.score`（round 后比较）；`FinishPanelOptions { splitMode, finishedP1, finishedP2 }`。
- Produces: `FinishPanelOptions.driftWinner: 'P1' | 'P2' | null`；index.html `#finish-drift-winner`（`<div id="finish-drift-winner" hidden>`，位于 finish-laps 之后）；GameLoop screenElements 补 `finishDriftWinner`。

**实现要点**：
- game-loop.ts applyPhase：`const driftWinner = splitMode && finishedP1 && finishedP2 ? (Math.round(race.player1.driftState.score) >= Math.round(race.player2.driftState.score) ? 'P1' : 'P2') : null`，随 opts 传入 applyPhaseToScreens。
- screens.ts：FINISHED 分支 `if (opts.driftWinner && elements.finishDriftWinner) { elements.finishDriftWinner.hidden = false; elements.finishDriftWinner.textContent = `DRIFT 竞速 · ${opts.driftWinner} 获胜！`; elements.finishDriftWinner.classList.toggle('p1', opts.driftWinner === 'P1'); ... } else if (elements.finishDriftWinner) elements.finishDriftWinner.hidden = true`。
- style.css：`#finish-drift-winner.p1 { color: #fde047 } .p2 { color: #4ade80 }`（或复用现有类）。
- 测试：integration 分屏双完赛用例补断言（P1 漂移得分更高 → 'P1 获胜'；未双完赛 → hidden）。既有用例适配新 opts 字段（对象字面量补 `driftWinner: null`）。

**验证**：RED → GREEN → 全量 → 提交 `feat(split): show drift score winner in finish panel`。

- [x] **Task D3 完成**：RED（2 断言失败：未双完赛横幅未隐藏 + 双完赛横幅未填充）→ GREEN（integration 16 用例通过）→ 全量 32 文件 310 用例 + typecheck/lint/build 全绿 → bot 3 圈 76.017s 0 违规 → 提交 `ac198de`。

**实施偏差**：
1. **测试场景用零漂移平局验证 'P1 获胜'**：计划描述"P1 漂移得分更高"，但 stub 环境无 keyup 机制（input pressed 集合只增不减），持续转向输入必然出界减速，漂移得分不可控且无法稳定双完赛。改用双人零转向全油门（KeyW + ArrowUp）：两玩家速度轨迹同步、两世界车流同 seed 同步推进，双完赛必然同一帧触发；双方得分 0 >= 0 走 `>= ? 'P1' : 'P2'` 的 P1 分支，精确断言文本 `DRIFT 竞速 · P1 获胜！`。P2 获胜分支由实现逻辑直接保证（与计划实现一致）。
2. **stub 特例按既有模式扩展**：`getElementById` 初始 hidden 特例改为 `id.endsWith('-2') || id === 'finish-drift-winner'`，未扩及 finish-hint（既有行为不变，热座用例不受影响）。
3. **"既有用例 opts 字面量补 driftWinner: null"未发生**：集成测试不直接构造 FinishPanelOptions（无 screens 单测文件），唯一构造点在 game-loop.ts applyPhaseToScreens 调用处，已随实现补 `driftWinner` 字段（typecheck 全绿证明无遗漏）。
4. **用例计数 309 → 310**：新增 1 个双完赛用例；另一处为既有分屏用例补 1 条 hidden 断言（不增加用例数）。

---

### Task D4: 新赛道 ×2 与选择 UI 扩展（3 → 5 条）

**Files:**
- Modify: `src/engine/tracks.ts`（TRACK_DEFS append 2 条）
- Modify: `index.html`（+2 个 .track-option 按钮、menu-hint 默认文本）
- Modify: `src/game/game-loop.ts`（trackOptions 组装、数字键映射 1-5 + P2 Shift+1-5）
- Modify: `src/game/track-manager.ts`（若无硬编码索引则不动）
- Modify: `src/style.css`（若需要）
- Test: `tests/unit/game-loop.test.ts`（预览起点互不相同——新赛道可能破坏）、`tests/unit/game-loop-integration.test.ts`（Digit4/5）

**新赛道定义（append 到 TRACK_DEFS 末尾，参考现有控制点风格，CurveControlPoint = { z, curve }）**：
- `{ id: 'island', name: '环岛巡回', controlPoints: <12-14 点，混合节奏：长直道 + 中缓弯 + 连续小 S，z 范围 0-90000，曲线值参考 highway/s-curve 的幅度（±0.002~0.004），laps: 3 }`
- `{ id: 'canyon', name: '峡谷疾驰', controlPoints: <9-11 点，长直道 + 2 个明显大弯（curve 绝对值大），z 范围 0-110000，laps: 2 }`
- 控制点必须保证：起点附近（z 0-8000）有一段直道（预览与起跑正常）；各段曲线平滑（首尾不跳变）。**必须跑 `npm test` 验证 `game-loop.test.ts` '三条赛道真实圈长下预览起点互不相同' 用例**——该用例动态遍历 TRACK_DEFS 要求各赛道 `initialPreviewCameraZ` 起点两两不同；若新赛道与现有冲突（相同 lapLength 且 1/3 等分重合），微调控制点 z 总长直至不同。

**实现要点**：
- index.html：`#track-option-2` 后追加 `#track-option-3`（"4 环岛巡回"）、`#track-option-4`（"5 峡谷疾驰"）；`#menu-hint` 默认文本改 `按任意键开始 · 1-5 切换赛道`。
- game-loop.ts：trackOptions 组装从硬编码 3 个改为循环（`Array.from({length: TRACK_DEFS.length}, (_, i) => $(`track-option-${i}`))` 或显式 5 个）；onKeyDown 菜单 Digit 分支：`if (digit >= 1 && digit <= TRACK_DEFS.length)` → P1 `selectTrackFor(0, digit - 1)`；分屏 P2：改 `e.shiftKey && digit >= 1 && digit <= TRACK_DEFS.length` → `selectTrackFor(1, digit - 1)`（Shift+1-5；原 7/8/9 键位废弃）；menu-hint 分屏文本改 `P1: 1-5 选赛道 · P2: Shift+1-5 选赛道 · 按任意键开始`；热座文本同步 `1-5 选赛道`。
- keydown 分支注意：Shift 键本身在"其他键开始"分支——`e.shiftKey` 时若 digit 无效要吞掉（防止 Shift+6 触发开始）；菜单阶段所有带 Shift 的数字键若不在 1-5 范围则 return。
- 测试：integration 新增 Digit4 → 'island'、Shift+Digit5（分屏）→ 'canyon' 用例；track-manager.test.ts 若依赖 trackOptions 长度用 TRACK_DEFS.length 动态构建则零改动。

**验证**：RED（新用例）→ GREEN → 全量（重点盯 game-loop.test.ts 预览起点用例）→ 提交 `feat(track): add island and canyon tracks with 5-slot selection`。

- [x] **Task D4 完成**：RED（4 失败：Digit4/Digit5 新赛道、Shift+Digit3 两处）→ GREEN（目标 3 文件 39 用例通过）→ 全量 32 文件 313 用例 + typecheck/lint/build 全绿 → bot 3 圈 76.017s 0 违规 → 提交 `74c1c48`。

**实施偏差**：
1. **预览起点用例未失败（约束已满足）**：'三条赛道真实圈长下预览起点互不相同' 用例动态遍历 TRACK_DEFS，扩为 5 条后仍通过——新赛道圈长 90200/110200 与既有 92000/120200/72200 均不同，1/5 等分起点 54120/88160 与既有 0/24040/28880 两两不同。真正被破坏的是 'initialPreviewCameraZ 按圈长等分起点' 用例（硬编码 /3），改为动态 `TRACK_DEFS.length`（GREEN 阶段适配）。
2. **tracks.test.ts 两处 3 赛道硬编码断言（任务 Files 未列出）**：'提供 3 条赛道且 id 唯一' 与 '三条赛道控制点互不相同' 均硬编码 3，全量 test 时失败，适配为 5 / 动态 `TRACK_DEFS.length`。
3. **Shift 分支与既有分支协调**：分屏 P2 分支（`splitMode && e.shiftKey`）置于 P1 分支之前并无条件 return——既保证 Shift+1-5 只走 P2、Shift+无效数字被吞（不落"任意键开始"），又避免分屏 Shift+Digit2 误入 P1 分支；单屏/热座下 Shift 被忽略（数字键仍走 P1，热座无 Shift 需求，行为不变）。
4. **integration harness 扩展**：stubEnvironment 的 fireKey 加 shiftKey 尾参（默认 false），listener 回调类型同步扩展，既有调用零改动；既有分屏 P2 键位用例（Digit8/Digit9）随键位语义变更适配为 Shift+Digit2/Digit3（RED 阶段即失败，属预期）。
5. **island 总曲率微调**：初稿 -0.075，改为对称结构后 +0.015（更贴近"回环曲率≈0"约束，横向漂移约 3 单位）；canyon 严格 0。island 控制点 14 点、canyon 11 点，均满足 12-14 / 9-11 点数约束与 z 0-8000 起点直道约束。
6. **style.css 未改动**：#track-select 为 flex-wrap，5 按钮自动换行，布局不受影响。

---

### Task D5: 车流密度赛道级调参

**Files:**
- Modify: `src/game/constants.ts`（+TRAFFIC_DEFAULT_COUNT）
- Modify: `tests/unit/constants.test.ts`（注册表同步）
- Modify: `src/engine/tracks.ts`（TrackDef.trafficCount? + 各赛道赋值）
- Modify: `src/game/track-context.ts`（createTrackContext/refreshTraffic 读 def）
- Test: `tests/unit/traffic.test.ts`、`tests/unit/track-context.test.ts`

**Interfaces:**
- Consumes: `createTraffic(lapLength, seed = 777, count = 8)`；`refreshTraffic(ctx)`（签名不变，内部读 def）。
- Produces: `TRAFFIC_DEFAULT_COUNT = 8`（constants 导出）；`TrackDef.trafficCount?: number`。

**实现要点**：
- constants.ts 加 `export const TRAFFIC_DEFAULT_COUNT = 8`（注释：车流默认密度）；constants.test.ts 注册表补一行（参考现有 11 常量断言写法）。
- tracks.ts：`interface TrackDef { id; name; controlPoints; laps; trafficCount?: number }`；赋值：classic 不写（默认 8）、highway: 12、s-curve: 6、island: 10、canyon: 8（显式）。
- track-context.ts：`createTrackContext` 内车流改 `createTraffic(lapLength, 777, def.trafficCount ?? TRAFFIC_DEFAULT_COUNT)`；`refreshTraffic` 改 `ctx.traffic = createTraffic(ctx.lapLength, 777, ctx.def.trafficCount ?? TRAFFIC_DEFAULT_COUNT)`（注意 ctx.def 引用存在）。
- 测试：track-context.test.ts 补用例：highway context `traffic.length === 12`、s-curve `=== 6`、无字段赛道 `=== 8`；既有 refreshTraffic 用例断言 length 需同步（原默认 8——检查现有断言值）。traffic.test.ts 补 createTraffic count 自定义用例（若未覆盖）。
- 注意：车流数量变化影响 bot 跑圈？bot 单人用 createTraffic(lapLength) 默认 8（classic 无字段）——**bot 基线必须保持 76.017s 0 违规**，若 traffic 默认路径不变则无影响。

**验证**：RED → GREEN → 全量 + bot 基线 → 提交 `feat(track): per-track traffic density via TrackDef.trafficCount`。

- [x] **Task D5 完成**：RED（3 失败：TRAFFIC_DEFAULT_COUNT undefined、highway 8≠12、s-curve 8≠6）→ GREEN（目标 3 文件 25 用例通过）→ 全量 32 文件 318 用例 + typecheck/lint 全绿 → bot 3 圈 76.017s 0 违规 → 提交 `eebab06`。

**实施偏差**：
1. **traffic.test.ts 补充用例非 RED 目标**：createTraffic 原本已支持 count 参数，`count=3 → length===3` 用例在 RED 阶段即通过（回归加固），RED 证据全部来自 constants 注册表与 track-context 两条新密度断言。
2. **既有 refreshTraffic 用例零改动**：现有用例只断言"引用替换"（`ctx.traffic).not.toBe(old)`），无 length 硬编码断言，计划预判的"应零改动"成立，无需同步修改。
3. **constants 注释措辞微调**：`TRAFFIC_DEFAULT_COUNT` 注释补充"条/圈"单位与"赛道可通过 TrackDef.trafficCount 覆盖"说明（计划原文仅"车流默认密度"），其余实现与计划逐字一致。

---

### Task D6: 天气循环（晴/阴交替）

**Files:**
- Modify: `src/engine/lighting.ts`（updateLighting 加 overcast 参数）
- Modify: `src/game/game-loop.ts`（每帧计算 overcast 并传参——先 grep 确认 updateLighting 调用点）
- Test: `tests/unit/lighting.test.ts`

**Interfaces:**
- Consumes: `updateLighting(timeSec: number): LightingColors`（现有唯一导出）。
- Produces: `updateLighting(timeSec: number, overcast = false): LightingColors`（默认 false，非 overcast 输出与现状完全一致）。

**实现要点**：
- lighting.ts：签名加 `overcast = false`；内部 4 段 hsl 颜色生成后，`overcast` 时对每项颜色做降饱和/压暗：推荐实现——现内部若为 `hsl(h, s%, l%)` 字符串拼接，则在 overcast 时 `s *= 0.4`、`l *= 0.8`（四舍五入）；若内部用对象/中间值，改中间值。天空 `skyTop/skyBottom` 与 `mountainFar/mountainNear` 明显变灰，`grass` 略暗。**非 overcast 路径必须逐字节一致**（现有 lighting.test.ts 零改动通过）。
- 导出常量 `WEATHER_CYCLE_SECONDS = 45`（晴天 45s → 阴天 45s 交替；值放 lighting.ts 内部导出，不必须进 constants）。
- game-loop.ts：`updateLighting` 调用点（帧循环或 renderer 参数构造处）加 `const overcast = Math.floor(nowSec / WEATHER_CYCLE_SECONDS) % 2 === 1`（nowSec 用帧循环累计时间 `this.frameTime` 或现有时间参数——以调用点现有可用变量为准，避免新增状态）。
- 测试：lighting.test.ts 补 2 用例：① overcast=true 时返回颜色与同 timeSec 非 overcast 不同（字符串不同即可）；② 非 overcast 输出与既有用例一致（既有用例已覆盖，跑通即证明）。

- [x] **Task D6 完成**：RED（2 新用例失败：overcast 与 clear skyTop 相同、饱和度未降低）→ GREEN（lighting.test.ts 8 用例全通过）→ 全量 32 文件 320 用例 + typecheck/lint 全绿 → bot 3 圈 76.017s 0 违规 → 提交 `32f5b9e`。

**实施偏差**：
1. **updateLighting 调用点在 renderer 而非 game-loop**：grep 确认唯一调用点在 `src/engine/renderer.ts` `renderWithOpts`（第 229 行附近），game-loop.ts 只经 `render/renderRegion` 透传 `timeSec`（菜单阶段恒 0、racing 阶段为各玩家 raceTime），且 game-loop 无 `frameTime` 累计变量。按任务授权"renderer 内部取参数"方案：overcast 在 renderer 内以现有 `timeSec` 变量计算（`Math.floor(timeSec / WEATHER_CYCLE_SECONDS) % 2 === 1`），game-loop.ts 与 Renderer 公共 API 均零改动——因此目标文件清单变为 `src/engine/lighting.ts` + `src/engine/renderer.ts` + `tests/unit/lighting.test.ts`（原计划 Files 的 game-loop.ts 未改）。
2. **overcast 变换实现**：lighting.ts 内部 `updateLighting` 加 `const build = overcast ? overcastHsl : hsl`，4 段 16 处颜色调用统一切到 `build(...)`；`overcastHsl` 对 s×0.4、l×0.8 后 `Math.round`（h 不变）。非 overcast 时 `build === hsl`，输出与历史版本逐字节一致（既有 6 用例零改动通过证明）。
3. **天气循环时间基准**：racing 阶段 timeSec = `race.player1.raceTime`（单屏）/各玩家 raceTime（分屏）——45s 晴 → 45s 阴交替；菜单预览恒传 0 → 恒晴，与现状行为一致。
4. **测试第 2 条按饱和度假言实现**：计划第 ② 条（灰色系）为可选，落地为解析 skyTop 字符串的饱和度数值并断言 `over < clear`（60×0.4=24 < 60），比"非空且不同"更严格；第 ① 条（字符串不同）与第 ② 条均用 timeSec=30（日出段）。

---

### Task D7: 全量验证 + 浏览器冒烟（M8）

**执行者：orchestrator（本任务不派 fixer）**

- [ ] 全量验证链：typecheck / lint / `npm test` / build / `npm run bot`（基线 76.017s 0 违规）
- [ ] dev server 启动（既有方式，端口 5175）+ 编写 `test-m8.py`（Playwright，headless，chromium `C:\Users\ZCL\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe`）：
  - 场景 D（热座）：`?hotseat=1` → Digit2 → Enter → W 驱动至完赛（轮询 __gameDebug.phase）→ Enter 交棒 → phase=racing → ArrowUp 驱动 → 完赛 → 断言 finish-hint 文本（胜负）、结算行可见
  - 场景 E（新赛道）：单屏 Digit4/Digit5 → selectedTrack='island'/'canyon'、track-name 更新；分屏 Shift+Digit3 → selectedTrack2 更新
  - 场景 F（分屏漂移竞速）：`?split=1` → 双人完赛（或直接验证结算横幅元素存在且 hidden 状态正确）
  - 天气视觉采样：两时刻（差 ~45s）canvas 天空像素不同（或截图对比）
  - 截图至 `shots/m8/`
- [ ] observer（可复用 obs-2 / ses_03a92e3d5ffe03GLiCWmIDh3S9）复核关键截图（热座结算、新赛道菜单、天气变化）
- [ ] 提交冒烟脚本不入库（既有惯例）

### Task D8: codemap 刷新 + 汇总（orchestrator）

- [ ] `node "$env:USERPROFILE\.config\opencode\skills\codemap\scripts\codemap.mjs" changes --root ./` → 受影响子目录
- [ ] 派 fixer 更新 `src/game`、`src/ui`、`src/engine`、`tests` 的 codemap.md（若变更大）；根/`src`/`docs` 聚合与 `docs/superpowers/plans/codemap.md` 补本计划登记
- [ ] `codemap.mjs update --root ./` 保存状态
- [ ] 汇总报告（含遗留问题与下一步建议）
