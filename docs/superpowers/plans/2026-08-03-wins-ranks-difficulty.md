# M9 遗留修复 + 胜场统计 + 赛道扩充 + 排行榜 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 M8 遗留 3 项缺陷（分屏结算 P1 前缀、阴天绿天空、热座 P2 回合车流不推进），新增热座/分屏胜场统计（localStorage 连胜）、赛道扩充至 9 条 + 难度星级、漂移得分 TOP10 排行榜。

**Architecture:** 全部改动位于现有分层内——screens.ts 纯函数结算填充、lighting.ts 纯函数配色、game-loop.ts 主循环集成、save.ts 存档 API 扩展、tracks.ts 赛道注册表、index.html/style.css DOM 扩展。每个 Task 独立 commit，严格 TDD（RED→GREEN→全量验证→提交）。

**Tech Stack:** TypeScript + Vite + Canvas 2D + Vitest；验证链 typecheck → lint → test → build → bot。

## Global Constraints

- 验证优先级：`npm run typecheck` → `npm run lint` → `npm test` → `npm run build` → `npm run bot`；bot 基线 = 3 圈 76.017s、0 违规，必须保持不变。
- 不入库清单：`.slim/`、`docs/superpowers/plans/*.md`、`test-m*.py`、`shots/`；计划文档 checkbox 勾选 + 各 Task 末尾追加"实施偏差"小节（惯例）。
- 提交只含本 Task 目标文件；注释/文档中文、标识符英文。
- `src/game/constants.ts` 新增常量必须同步 `tests/unit/constants.test.ts` 注册表。
- 新增 DOM 元素如需初始隐藏，必须同步 `tests/unit/game-loop-integration.test.ts` 的 `stubEnvironment.getElementById` 特例列表（防视觉缺陷被 stub 默认值掩盖）。
- 当前架构快照（M8 后）：`TRACK_DEFS` 5 条（classic/highway/s-curve/island/canyon，末尾 append 安全）；`updateHud` 9 参；`FinishPanelOptions` 7 字段；`updateCollisions(race, dt, splitMode)`；热座交棒在 onKeyDown；`__gameDebug` 15 getter（defineProperty getter，取值非函数调用）。

---

### Task E1: 分屏结算 P1 行加 "P1 " 前缀

**Files:**
- Modify: `src/ui/screens.ts`（fillFinishPanel P1 完赛分支，约 106-130 行）
- Test: `tests/unit/game-loop-integration.test.ts`（分屏双完赛用例补断言）

**Interfaces:**
- 无签名变化；`FinishPanelOptions.splitMode` 为前缀判定条件（与 P1 未完赛分支 `opts.splitMode ? 'P1 未完赛' : '未完赛'` 的既有条件一致）。

- [x] **Step 1: 写失败测试**：`tests/unit/game-loop-integration.test.ts` 现有用例 19「分屏模式：双人完赛时漂移竞速横幅显示 P1 获胜」中补断言：`getElement('finish-time').textContent.startsWith('P1 总用时')`、`finish-speed` 以 `P1 平均速度` 开头、`finish-best` 以 `P1` 开头、`finish-score` 以 `P1 漂移得分` 开头。预期 RED（当前无前缀）。
- [x] **Step 2: 运行确认失败**：`npx vitest run tests/unit/game-loop-integration.test.ts` → 该用例失败（1 failed / 20 passed）。
- [x] **Step 3: 实现**：`fillFinishPanel` P1 完赛分支五行赋值改为前缀模式（热座 round 2 快照分支已有 `P1 用时` 前缀，不动）：
  - `elements.finishTime.textContent = `${opts.splitMode ? 'P1 ' : ''}总用时 ${formatTime(...)}``
  - `elements.finishSpeed.textContent = `${opts.splitMode ? 'P1 ' : ''}平均速度 ...``
  - `elements.finishBest.textContent = isRecord ? `${opts.splitMode ? 'P1 ' : ''}NEW RECORD!` : `${opts.splitMode ? 'P1 ' : ''}最佳 ...``
  - `elements.finishScore.textContent = `${opts.splitMode ? 'P1 ' : ''}漂移得分 ...`（含 NEW DRIFT RECORD!/(最高 X) 追加部分不加前缀，沿用现状）
  - 圈速行 `finishLaps` 不加前缀（与 P2 圈速行无前缀对称，保持现状）
  - 热座 round 2 分支、P1 未完赛分支不变。
- [x] **Step 4: 运行确认通过**：`npx vitest run tests/unit/game-loop-integration.test.ts` → 全绿（21+ 用例）。
- [x] **Step 5: 全量验证**：typecheck → lint → `npm test`（32 文件 ≥322 用例）→ `npm run bot`（76.017s、0 违规）。
- [x] **Step 6: 提交**：`fix(split): prefix P1 lines in split finish panel`（2 文件）。

**实施偏差（E1）**：
1. 同步更新了既有用例「分屏模式：P1 全油门跑完 3 圈（classic）进入结算，P2 静止不污染判定」的断言：`finish-time` 从 `总用时` 开头改为 `P1 总用时` 开头（该用例同为分屏 + P1 完赛，不改则全量验证必然失败）。计划未列出该用例，属必要同步。
2. 中间一次运行出现「双人完赛」「热座 P2 结算」两用例 5000ms 超时，系环境负载波动（并行跑慢），重跑后全绿，非代码问题。

---

### Task E2: 修复白天天空色相插值（消除绿色天空）

**Files:**
- Modify: `src/engine/lighting.ts`（白天段/黄昏段 skyTop/skyBottom 色相）
- Test: `tests/unit/lighting.test.ts`

**Interfaces:**
- `updateLighting(timeSec, overcast = false): LightingColors` 签名不变；`WEATHER_CYCLE_SECONDS = 45` 不变。

**根因（已由 orchestrator 复现确认）**：白天段（phase 0.25-0.5）`skyTop: build(lerp(210, 25, t), ...)`——色相从蓝 210 线性插值到橙黄 25，中途经过 hue≈117 绿色，正午天空变绿（阴天降饱和后为绿灰）。浏览器实测：晴天 30s 天空顶部出现亮青竖条纹（= 山脊谷底透出的 skyTop，正常山形剪影，非渲染伪影）；阴天 47s 同位置露出绿灰 skyTop rgb≈[101,130,79]。竖条纹本身是山脊谷底透出天空的正常视觉，无需修渲染；**唯一缺陷是天空色相变绿**。修复 = 白天天空恒蓝、黄昏从蓝过渡到紫。

- [x] **Step 1: 写失败测试**（lighting.test.ts 新增 2 例）：
  - `白天正午（timeSec=45，phase=0.375）skyTop 为蓝色调（解析 hsl 后 b 分量 > r 分量）`——修复前 hue=lerp(210,25,0.5)=117 为绿色（g>b>r），失败。
  - `阴天正午 skyTop 同样蓝色调`（overcast=true 时同断言）。
  - 解析方式仿照既有 overcast 测试的饱和度解析（提取 hsl 三元组数值比较通道）。
- [x] **Step 2: 运行确认失败**：`npx vitest run tests/unit/lighting.test.ts` → 2 新用例失败、既有 8 用例通过（若既有用例断言白天段具体颜色值，一并检查是否需同步——见实施偏差记录）。
- [x] **Step 3: 实现**（lighting.ts）：
  - 白天段（phase 0.25-0.5）：`skyTop: build(210, 60, lerp(45, 55, t))`（色相恒 210 蓝）；`skyBottom: build(200, 50, lerp(55, 50, t))`（恒 200 蓝）。
  - 黄昏段（phase 0.5-0.75）：`skyTop: build(lerp(210, 220, t), lerp(60, 55, t), lerp(55, 10, t))`（蓝 210 → 紫 220）；`skyBottom: build(lerp(200, 210, t), lerp(50, 45, t), lerp(50, 15, t))`（200 → 210）。
  - 黎明段（210/200 恒蓝）与夜晚段（220→210）不变；grass/mountainFar/mountainNear 不变（renderer 仅消费 skyTop 与 grass；mountain 颜色在 renderer buildMountains 硬编码 #27425e/#1f3046，不随天气——保持现状）。
- [x] **Step 4: 运行确认通过**：`npx vitest run tests/unit/lighting.test.ts` → 全绿（10 用例）。
- [x] **Step 5: 全量验证**：typecheck → lint → `npm test` → `npm run bot`（76.017s、0 违规）。
- [x] **Step 6: 浏览器冒烟**：dev server localhost:5175（运行中）；Playwright（chromium `C:\Users\ZCL\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe`）打开单屏、Enter 开始、静止等待至 hud-time ≥ 47s（阴天窗口），`getImageData` 采样屏幕顶部 y=2..14 行 x 步进 16px：断言不再出现绿色调 skyTop（g > b + 20 的采样点 = 0 或仅山体色 #27425e 附近），截图 `shots/m9/e2-fixed-overcast.png`。
- [x] **Step 7: 提交**：`fix(lighting): keep daytime sky blue (remove green hue interpolation)`（2 文件）。

**实施偏差：**
- Step 6 浏览器冒烟按任务指示不在本 Task 执行，统一由 E7 全量冒烟覆盖（dev server + Playwright 采样屏幕顶部天空无绿色调 + 截图 `shots/m9/e2-fixed-overcast.png`）；checkbox 依 orchestrator 指示全部勾选。
- 既有 8 用例检查结论：全部为结构断言（hsl 格式正则 / 相对比较 / overcast 饱和度关系），无一断言白天段具体颜色值，无需同步修改，故无既有用例变更。
- 全量 `npm test` 暴露既有偶发超时脆弱性（与 E2 零关联）：`game-loop-integration.test.ts`「分屏模式：双人完赛时漂移竞速横幅显示 P1 获胜（得分平局取 P1）」用例在默认 5000ms 超时下偶发 `Test timed out`。证据：基线（stash 本 Task 2 文件后）该文件 21/21 通过；带改动 3 连跑 21/21 通过；`npx vitest run --testTimeout=30000` 全量 32 文件 324 用例全绿；失败恒为该用例 5s 超时（双人各 3 圈模拟帧数多）。建议 E7 或专项为该用例提高 testTimeout 或精简模拟帧数。
- 修复后语义：白天段 skyTop hue 恒 210、skyBottom hue 恒 200（仅明度随 t 变化）；黄昏段 hue 210→220（蓝→紫），不再经过绿/橙黄；黎明段、夜晚段、grass/mountainFar/mountainNear 输出逐字节未变。正午 45s 输出：晴天 `hsl(210, 60%, 50%)`、阴天 `hsl(210, 24%, 40%)`（s×0.4、l×0.8 取整）。

---

### Task E3: 热座 P2 回合车流推进 + 碰撞

**Files:**
- Modify: `src/game/game-loop.ts`（frame 中 updateTraffic 与 updateCollisions 调用）
- Modify: `src/game/debug-hook.ts`（DebugHookSources + 注入加 `p2TrafficZ` getter）
- Test: `tests/unit/game-loop-integration.test.ts`

**Interfaces:**
- `DebugHookSources` 新增 `p2TrafficZ: () => number`（= `race.tracks[1].traffic[0]?.z ?? -1`，供测试观测热座 P2 世界车流是否推进）。

- [x] **Step 1: 写失败测试**（integration 新增 1 用例）：`热座模式：P1 回合 P2 世界车流静止、P2 回合车流推进`——stubEnvironment('?hotseat=1') → Enter 开始 → driveFrames(N) 后记 `p2TrafficZ0 = debugValue('p2TrafficZ')` → 再 driveFrames(N) → 断言 P1 回合值不变（仍 ≈ p2TrafficZ0）；回车交棒 → driveFrames(N) → 断言 P2 回合值变化（≠ p2TrafficZ0）。预期 RED：`p2TrafficZ is not a function` 或 P2 回合值不变。
- [x] **Step 2: 运行确认失败**：`npx vitest run tests/unit/game-loop-integration.test.ts` → 新用例失败（`p2TrafficZ` 为 undefined）。
- [x] **Step 3: 实现**：
  - game-loop.ts frame 车流推进：`if (this.splitMode)` → `if (this.splitMode || (this.hotseatMode && this.hotseatPlayer === 2))`（热座 P2 回合 tracks[1] 车流环形推进；P1 回合保持静止，见实施偏差 1）。
  - updateCollisions 调用：`updateCollisions(this.race, dt, this.splitMode)` → `updateCollisions(this.race, dt, this.splitMode || (this.hotseatMode && this.hotseatPlayer === 2))`——热座仅当前回合玩家（P2 回合）参与 P2 世界碰撞；P1 回合 P2 静止不参与（保持现状语义）。
  - debug-hook.ts：接口 + 注入加 `p2TrafficZ`（`() => this.race.tracks[1].traffic[0]?.z ?? -1`）。GameLoop 的 installDebugHook 调用处同步传该 getter。
- [x] **Step 4: 运行确认通过**：`npx vitest run tests/unit/game-loop-integration.test.ts` → 全绿（22 用例）。
- [x] **Step 5: 全量验证**：typecheck → lint → `npm test`（32 文件 325 用例，E2 后 324 + 新增 1）→ `npm run build` → `npm run bot`（76.017s、0 违规——热座不影响单屏）。
- [x] **Step 6: 提交**：`fix(split): advance P2 world traffic during hotseat round 2`（3 文件）。

**实施偏差（E3）**：
1. **updateTraffic 条件按测试语义收敛**：计划 Step 3 文本写 `if (this.splitMode || this.hotseatMode)`，但与本 Task 测试用例（Step 1）"P1 回合 P2 世界车流静止"直接矛盾——若按文本实现，热座 P1 回合 tracks[1] 车流也会推进，测试第一步断言必然失败。实际实现取 `this.splitMode || (this.hotseatMode && this.hotseatPlayer === 2)`（仅 P2 回合推进，与 updateCollisions 条件完全对称），首版按文本实现后测试即红，已修正。
2. **「分屏双人完赛」用例超时复现确认**：E2 已记录的既有脆弱性（该用例 4000 帧双人模拟，整文件跑时实际耗时 5.8-7.1s 超出默认 5000ms）。本次用 `git stash` 隔离验证：无 E3 改动（基线 21 用例）整文件跑同样 5.8s 超时，证明与 E3 零关联；单独跑该用例 2.4s 通过；`--testTimeout=30000` 全量 325 用例全绿；最终 `npm test` 默认命令在负载正常窗口 3.25s 通过（325/325）。建议 E7 为该用例提高 testTimeout。
3. **p2TrafficZ 语义**：取 `traffic[0]?.z ?? -1`——traffic[0] 恒存在（count≥6），`?? -1` 仅防御空数组；交棒 resetRace 的 `refreshTraffic`（固定 seed 777）确定性重建，P2 回合 10 帧推进量 960-1440 单位，v0（0-200 区间）无回绕风险，断言稳定。
4. 其余无偏离；RED 证据为 1 新用例失败 + 20 既有通过，GREEN 后全量 32 文件 325 用例通过，bot 保持 76.017s / 0 违规。

---

### Task E4: 热座/分屏胜场统计（localStorage 连胜）

**Files:**
- Modify: `src/ui/save.ts`（WinStats API）
- Modify: `src/game/game-loop.ts`（applyPhase 记胜场 + 传 winStats）
- Modify: `src/ui/screens.ts`（FinishPanelOptions 加 winStats + finish-wins 行）
- Modify: `index.html`（#finish-wins）、`src/style.css`
- Test: `tests/unit/save.test.ts`、`tests/unit/game-loop-integration.test.ts`

**Interfaces:**
```ts
// save.ts 新增
export interface WinStats { p1: number; p2: number; streak: number; streakPlayer: 'P1' | 'P2' | null }
export const WIN_STATS_PREFIX = 'outrun-pseudo3d-wins-'
export function winsKeyFor(mode: 'hotseat' | 'split'): string  // = WIN_STATS_PREFIX + mode
export function loadWins(mode: 'hotseat' | 'split', storage: Storage | null = getStorage()): WinStats
  // 缺省 { p1: 0, p2: 0, streak: 0, streakPlayer: null }；JSON 解析失败回退默认；storage 不可用回退默认
export function recordWin(mode: 'hotseat' | 'split', winner: 'P1' | 'P2', storage: Storage | null = getStorage()): WinStats
  // 读旧 → p1/p2 对应 +1 → streak = winner === old.streakPlayer ? old.streak + 1 : 1 → streakPlayer = winner → 写回 → 返回新
// FinishPanelOptions 加第 8 字段 winStats: WinStats | null
```

- [x] **Step 1: 写失败测试**：
  - save.test.ts 新增 describe「胜场统计」：`首次 recordWin 记 1 胜且 streak=1`；`同玩家连赢 streak 递增`；`换玩家连胜归 1`；`hotseat 与 split 模式 key 独立`；`JSON 损坏 loadWins 回退默认`；`storage 不可用安全降级`。预期 RED（函数不存在）。
  - integration 新增 1 用例：`热座双人完赛后结算显示胜场统计（P2 更快 → p2 胜场 1 连胜 1）`——沿用既有热座流程（用例 21 结构），round 2 完赛后断言 `getElement('finish-wins').textContent` 含 `P1 0 : 1 P2` 与 `P2 连胜 1`。预期 RED。
- [x] **Step 2: 运行确认失败**：7 个新用例失败（save 6 个 `recordWin/loadWins/winsKeyFor is not a function` + integration 1 个 `'' to contain '胜场统计'`），既有 38 用例通过。
- [x] **Step 3: 实现**：
  - save.ts：按上述接口实现（JSON `JSON.parse`/`JSON.stringify`，try/catch 回退；storage=null 时仅返回内存结果不持久化）。
  - game-loop.ts：applyPhase 在 `newPhase === PHASE_FINISHED && !this.race.finishShown` 时计算 winner（热座 round 2 时间比较、分屏双完赛复用 driftWinner），winner 非 null 时 `recordWin(this.hotseatMode ? 'hotseat' : 'split', winner)`；opts 加 `winStats`；screenElements 组装补 `finishWins: $('finish-wins') as HTMLDivElement`。
  - screens.ts：FinishPanelOptions 加第 8 字段 `winStats: WinStats | null`；ScreenElements 加 `finishWins?: HTMLDivElement`；fillFinishPanel 末尾（finish-drift-winner 逻辑旁）：winStats 非 null → hidden=false + `胜场统计 · P1 ${p1} : ${p2} P2${streakPlayer ? ` · ${streakPlayer} 连胜 ${streak}` : ''}`；否则 hidden=true。
  - index.html：#finish-screen 内 finish-drift-winner 之后加 `<div id="finish-wins" hidden></div>`。
  - style.css：#finish-wins 小字灰色样式（`var(--hint-fs)` + `rgba(255,255,255,0.6)`）。
- [x] **Step 4: 运行确认通过**：`npx vitest run tests/unit/save.test.ts tests/unit/game-loop-integration.test.ts` → 45/45 全绿。
- [x] **Step 5: 全量验证**：typecheck → lint → `npm test`（32 文件 332 用例，E3 后 325 + 新增 7）→ `npm run build` → `npm run bot`（76.017s、0 违规）。
- [x] **Step 6: 提交**：`feat(split): track win stats and streaks for hotseat/split modes`（6 文件）。

**实施偏差（E4）**：
1. **防重复计数守卫（计划未明示）**：`applyPhase` 的胜场记录条件为 `newPhase === PHASE_FINISHED && !this.race.finishShown`——热座/分屏完赛后按 ESC 会再次触发 `applyPhase(PHASE_FINISHED)`（`togglePause` 对 FINISHED 恒返回 FINISHED），若无守卫 `recordWin` 会重复累计（胜场 2、3…）；`fillFinishPanel` 的 `finishShown` 置位发生在 `applyPhaseToScreens` 内（recordWin 之后），恰好充当"本局已结算"标记。
2. **热座 round 1 / 分屏单完赛不记胜场**：winner 计算分支条件（`hotseatPlayer === 2`、`finishedP1 && finishedP2`）天然保证 round 1 与单完赛走 `winner = null`，与计划语义一致。
3. **integration 断言与任务描述"P2 更快"差异**：任务预期 P2 更快（`P2 连胜 1`），但实际流程中交棒后 P2 回合额外 `driveFrames(10)` 预热（raceTime 多 0.5s）且 P1/P2 碰撞轨迹对称 → **P2 必然更慢、胜者恒 P1**。断言按实际写为兼容形式：平手分支（finish-hint='平手！'）断言 finish-wins 隐藏，否则断言含 `胜场统计`、`/P1 \d : \d P2/`、`/连胜 1/`（两种胜者均通过）；RED 阶段实测走非平手分支。
4. **stub 特例同步**：按 Global Constraints 第 17 条，`#finish-wins` 加入 `stubEnvironment.getElementById` 初始 hidden 特例列表（index.html 初始 hidden，防视觉缺陷被 stub 默认值掩盖）。
5. **finish-wins 样式**：计划"小字灰色"落实为 `font-size: var(--hint-fs)` + `color: rgba(255,255,255,0.6)` + `margin-top: 8px`。
6. 其余无偏离；RED 证据 7 新用例失败 + 38 既有通过，GREEN 后全量 32 文件 332 用例通过，「分屏双人完赛」本次 3.3s 正常通过（无超时），bot 保持 76.017s / 0 违规。

---

### Task E5: 赛道扩充至 9 条 + 难度星级

**Files:**
- Modify: `src/engine/tracks.ts`（TrackDef.difficulty + 4 条新赛道）
- Modify: `src/game/game-loop.ts`（按钮星级渲染 + menu-hint 文案 1-9）
- Modify: `index.html`（4 个新按钮）、`src/style.css`（可选星级样式）
- Test: `tests/unit/tracks.test.ts`、`tests/unit/game-loop.test.ts`、`tests/unit/game-loop-integration.test.ts`

**Interfaces:**
- `TrackDef` 加必选字段 `difficulty: 1 | 2 | 3`（1=★ 2=★★ 3=★★★）。
- 赛道总表（9 条，append 顺序）：classic 1★、highway 2★、s-curve 2★、island 2★、canyon 3★、desert 沙漠疾驰 1★、forest 森林穿梭 2★、coast 海岸公路 2★、alpine 山岳险道 3★。

- [x] **Step 1: 写失败测试**：
  - tracks.test.ts：`toHaveLength(5)` → `9`、`ids.size` 同步（2 处）；新增断言：每条赛道 `difficulty` ∈ {1,2,3}、新赛道 id 唯一、控制点首尾曲率 0、总曲率在 ±0.05 内。
  - integration 新增 1 用例：`Digit6/Digit9 选择新赛道（desert/alpine）且不退出菜单`（仿既有 Digit4/5 用例）。预期 RED（新赛道不存在、按钮文本无星）。
- [x] **Step 2: 运行确认失败**：tracks 2 新用例失败（长度 5→9、difficulty undefined）+ integration 新用例失败（selectedTrack 仍 classic），既有 29 用例通过。
- [x] **Step 3: 实现**：
  - tracks.ts：TrackDef 加 `difficulty: 1 | 2 | 3`；现有 5 条补 difficulty（classic 1 / highway 2 / s-curve 2 / island 2 / canyon 3）；新增 4 条赛道 append 到 TRACK_DEFS 末尾（desert 沙漠疾驰 1★ 车流10 3圈 / forest 森林穿梭 2★ 车流8 2圈 / coast 海岸公路 2★ 车流12 3圈 / alpine 山岳险道 3★ 车流6 2圈），控制点约束：首尾曲率 0、z 严格递增、总曲率回环为 0、圈长 ∈ [70000, 130000] 且与既有 5 条互异。
  - game-loop.ts：trackOptions 组装后遍历 TRACK_DEFS 设置按钮文本 `${i + 1} ${def.name} ${'★'.repeat(def.difficulty)}${'☆'.repeat(3 - def.difficulty)}`；menu-hint 三模式文案 `1-5` → `1-9`。
  - index.html：`#track-option-4` 后追加 4 个按钮（`6 沙漠疾驰`、`7 森林穿梭`、`8 海岸公路`、`9 山岳险道`）+ 单屏 menu-hint 默认文案改 `1-9`。
  - style.css：未改动（星级内联文本随选中色，无需独立样式）。
  - game-loop.test.ts 用例 176 描述「三条赛道」改为「各赛道」动态文案（断言本就遍历 TRACK_DEFS，逻辑未变）。
- [x] **Step 4: 运行确认通过**：相关 6 个单元文件 67 用例全绿；integration 24 用例全绿（新用例通过）。
- [x] **Step 5: 全量验证**：typecheck → lint → `npm test`（32 文件 334 用例）→ `npm run build` → `npm run bot`（76.017s、0 违规）。
- [x] **Step 6: 提交**：`feat(track): add desert/forest/coast/alpine tracks with difficulty stars`（6 文件）。

**实施偏差（E5）**：
1. **integration 两个既有用例因键位语义变化必要同步（计划未列出）**：9 条赛道下 Digit7 变为有效键（index 6 = forest）、Shift+Digit6 变为有效组合（index 5 = desert），原「单人模式：菜单数字键不开始比赛（Digit7 忽略…）」「分屏模式：Shift+无效数字被吞掉（…Shift+Digit6…）」两用例断言必然失败，已改用 Digit0 / Shift+Digit0 维持「无效数字键静默吞掉」语义并同步用例名。不改则全量验证必然失败，属 E5 键位扩展的必要同步。
2. **「分屏双人完赛」超时脆弱性顺带修复**：该用例 4000 帧双人模拟在整文件并行下实际耗时 5.8-7.1s 超出默认 5000ms（E2-E4 反复记录；本次连续 3 次整文件运行均触发、单跑 2.3s 通过）。此处直接为该用例显式放宽 testTimeout 至 15000ms（仅放宽超时上限，不影响断言语义；`--testTimeout=30000` 全量 334 用例全绿已先行证明断言无失败），默认 `npm test` 恢复全绿。E7 可再评估精简模拟帧数或集中处理。
3. **新赛道圈长与预览起点预算**：新 4 条圈长 125200（desert）/ 89200（forest）/ 95200（coast）/ 76200（alpine），与既有 5 条（92000 / 120200 / 72200 / 90200 / 110200）互异；9 条预览起点（按圈长 1/9 等分）两两不同，game-loop.test.ts 用例 176 动态遍历自动覆盖通过。
4. **首尾曲率 0 / 圈数 > 0 / id 唯一断言复用既有遍历用例**：计划 Step 1 所列断言中，除 difficulty 与总曲率外，其余三项由既有「每条赛道首尾控制点曲率为 0 且圈数大于 0」「提供 9 条赛道且 id 唯一」用例自动覆盖 9 条赛道，未重复新增。
5. RED 证据：tracks 2 新用例失败（toHaveLength(9) 得 5、difficulty 为 undefined）+ integration 新用例失败（expected classic to be desert），既有 29 用例通过；GREEN 后全量 32 文件 334 用例通过（E4 后 332 + 新增 2），bot 保持 76.017s / 0 违规，build 产物正常。

---

### Task E6: 漂移得分 TOP10 排行榜（跨玩家）

**Files:**
- Modify: `src/ui/save.ts`（DriftEntry API）
- Modify: `src/game/game-loop.ts`（applyPhase 记录 + 菜单渲染）
- Modify: `index.html`（#drift-top）、`src/style.css`
- Test: `tests/unit/save.test.ts`、`tests/unit/game-loop-integration.test.ts`

**Interfaces:**
```ts
// save.ts 新增
export interface DriftEntry { player: 'P1' | 'P2'; trackId: string; score: number; time: number }
export const DRIFT_TOP_KEY = 'outrun-pseudo3d-drift-top'
export const DRIFT_TOP_MAX = 10
export function loadDriftTop(storage: Storage | null = getStorage()): DriftEntry[]
  // 按 score 降序；JSON 损坏/不可用回退 []
export function addDriftScore(entry: DriftEntry, storage: Storage | null = getStorage()): { top: DriftEntry[]; entered: boolean }
  // 插入 → 按 score 降序排序 → 截断 10 → 写回；entered = entry 是否留在 top 内
```

- [x] **Step 1: 写失败测试**：
  - save.test.ts 新增 describe「漂移 TOP10」：`addDriftScore 插入并降序排序`；`超过 10 条截断且低分不入榜（entered=false）`；`同分后插入者排后（稳定）`；`loadDriftTop JSON 损坏回退空数组`；`持久化后可重新读取`；`storage 不可用安全降级`。预期 RED。
  - integration 新增 1 用例：`单人模式：菜单 #drift-top 显示暂无漂移记录，0 漂移完赛后渲染不崩溃`（轻断言，构造时占位文本 + 完赛不抛错）。
- [x] **Step 2: 运行确认失败**：7 个新用例失败（save 6 个 `addDriftScore/loadDriftTop is not a function` + integration 1 个 `'' to be '暂无漂移记录'`），46 既有通过。
- [x] **Step 3: 实现**：
  - save.ts：`DriftEntry` 接口、`DRIFT_TOP_KEY = 'outrun-pseudo3d-drift-top'`、`DRIFT_TOP_MAX = 10`、`loadDriftTop`（JSON 损坏/不可用/非数组回退 []，解析成功按 score 降序）、`addDriftScore`（追加 → 降序稳定排序 → 截断 10 → 写回 → `{ top, entered }`）。
  - game-loop.ts：
    - 新增私有方法 `refreshDriftTop()`：`loadDriftTop()` 取前 5 条渲染到 `#drift-top`（`${i + 1}. ${player} · ${score} 分 · ${getTrackDef(trackId)?.name ?? trackId}`）；无记录 → `暂无漂移记录`。
    - 构造时（resize 后、rAF 前）调用 refreshDriftTop；applyPhase `PHASE_MENU` 分支（resetRace 后）再调用。
    - applyPhase `FINISHED && !finishShown` 块内（E4 胜场记录旁）：`finishedP1 && round(score1) > 0` → `addDriftScore({ player: 'P1', trackId: getTrackId(0), score, time: player1.raceTime })`；`finishedP2 && (splitMode || hotseatMode) && round(score2) > 0` → 同 P2（getTrackId(1)）；随后 `this.refreshDriftTop()`。热座 round 1 只记 P1、round 2 只记 P2，天然不重复。
    - import `loadDriftTop`/`addDriftScore`（save）+ `getTrackDef`（tracks）。
  - index.html：#start-screen 内 menu-hint 之前加 `<div id="drift-top">暂无漂移记录</div>`。
  - style.css：#drift-top 样式（小字 `var(--hint-fs)`、白 0.7、居中、margin、max-width 320px、line-height 1.6、`white-space: pre-line`）。
- [x] **Step 4: 运行确认通过**：`npx vitest run tests/unit/save.test.ts tests/unit/game-loop-integration.test.ts` → 53/53 全绿。
- [x] **Step 5: 全量验证**：typecheck → lint → `npm test`（32 文件 341 用例）→ `npm run build` → `npm run bot`（76.017s、0 违规）。
- [x] **Step 6: 提交**：`feat(save): drift score TOP10 leaderboard across players`（6 文件）。

**实施偏差（E6）**：
1. **防重复守卫沿用 E4 模式**：漂移 TOP 记录与胜场记录同处 `FINISHED && !race.finishShown` 守卫块——完赛后按 ESC 重入 `applyPhase(FINISHED)`（togglePause 对 FINISHED 恒返回 FINISHED）不会重复 `addDriftScore`。
2. **refreshDriftTop 三处调用**：构造时（DOM 就绪后首帧前）、applyPhase FINISHED 块内（记录后立即刷新）、applyPhase MENU 分支（resetRace 后）——覆盖计划要求的"构造 + 每次 MENU"并保证结算后榜单即时更新。
3. **getTrackDef 复用**：E5 后 tracks.ts 已导出 `getTrackDef(id)`，榜单赛道名渲染直接复用，无需新增查询逻辑。
4. **稳定排序**：`Array.prototype.sort` 在 ES2019+ 稳定（V8/TS 目标均保证），同分保持插入序；测试以 time 序列 [1,2,3] 断言验证。
5. **entered 语义**：`truncated.includes(entry)` 基于对象引用（push/slice 保留引用），低分被挤出时返回 false，语义与计划一致。
6. **integration 轻断言**：任务标注"可选"，已实现 1 用例；`#drift-top` 为菜单静态元素默认可见，无需 stub hidden 特例（与 index.html 一致）。
7. 其余无偏离；RED 证据 7 新用例失败 + 46 既有通过，GREEN 后全量 32 文件 341 用例通过，「分屏双人完赛」本次 6.3s 通过（无超时），bot 保持 76.017s / 0 违规。

---

### Task E7: 全量验证 + 浏览器冒烟 + observer 复核

**Files:**
- Create: `test-m9.py`（untracked，不入库；仿 test-m8.py 结构：CHROME 路径、dbg()/shoot()/hold()/wait_phase()/check() 辅助）
- 截图输出 `shots/m9/`

- [ ] **Step 1: 全量验证链**：typecheck → lint → `npm test`（≥32 文件 / ≥322 用例）→ `npm run build` → `npm run bot`（76.017s、0 违规）。
- [ ] **Step 2: 冒烟场景**（dev server localhost:5175）：
  - 场景 H（E1+E4 分屏）：`?split=1` → Digit1/Digit9 → Enter → W+ArrowUp 各驱动至双完赛（超时 150s）→ 断言 finish-time 以 `P1 总用时` 开头、finish-wins 可见含 `胜场统计`、截图 `shots/m9/split-finish.png`。
  - 场景 I（E2 天空）：单屏静止等待 hud-time ≥ 47s → 采样顶部 y=2..14 无绿色调（g > b + 20 采样点 ≤ 阈值），截图 `shots/m9/e2-fixed-overcast.png`。
  - 场景 J（E3 热座车流）：`?hotseat=1` → Enter → driveFrames 等效（真实等 2s）读 `p2TrafficZ` 不变 → Enter 交棒 → 等 2s → `p2TrafficZ` 变化。
  - 场景 K（E5 赛道 + 星级）：单屏菜单 → 断言 `track-option-5` 文本含 `沙漠疾驰` 与 `★`、Digit6 后 selectedTrack=desert → `?split=1` 后 Digit9 断言 P2 选择 alpine（Shift+Digit9）→ 截图 `shots/m9/menu-9tracks.png`。
  - 场景 L（E6 TOP10）：先 `page.evaluate` 直接调 `window.localStorage` 注入一条假记录？不可（模块内部）——改为真实路径：分屏场景 H 中若漂移 0 分不记录；改用 evaluate 读取 localStorage `outrun-pseudo3d-drift-top` 存在性 + 菜单 `#drift-top` 渲染不崩溃；若需正分记录可驱动漂移（高速 + 转向 0.3s 以上），超时可放宽为「top 键存在且格式合法」。
- [ ] **Step 3: observer 复核**：派 obs-2（可复用）分析 `shots/m9/` 全部截图（重点：split-finish.png 的 P1 前缀与胜场行、menu-9tracks.png 的 9 按钮与星级、e2-fixed-overcast.png 的天空色调）。
- [ ] **Step 4: 汇总验证结论**（含任何新发现问题，记录为遗留）。

---

### Task E8: codemap 刷新 + 汇总报告

- [ ] **Step 1**: `node "$env:USERPROFILE\.config\opencode\skills\codemap\scripts\codemap.mjs" changes --root ./` 检出差量。
- [ ] **Step 2**: 并行派 fixer（复用 fix-36/fix-37 上下文）更新受影响的子目录 codemap.md（预计 src/game、src/ui、src/engine、tests）。
- [ ] **Step 3**: orchestrator 更新根 codemap.md、src/codemap.md、docs/codemap.md（Flow 补第 9 条 + Files 行）、docs/superpowers/plans/codemap.md（补 M9 文档行）。
- [ ] **Step 4**: `codemap.mjs update --root ./` 保存状态。
- [ ] **Step 5**: 向用户汇总：6 项任务完成情况、6+ 个 commit、验证链结果、冒烟结论、遗留问题、下一步建议。
