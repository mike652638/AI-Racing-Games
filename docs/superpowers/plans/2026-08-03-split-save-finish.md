# 分屏双人存档与结算面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分屏模式下 P2 的最佳成绩独立存档/显示、赛果结算面板双人化，并随重构刷新 codemap 文档。

**Architecture:** 存档层（save.ts）增加玩家维度（P1 沿用现有 key 保证向后兼容，P2 使用 `-p2` 后缀 key）；RaceState 增加 P2 圈速记录（lapTimes2/lastLap2）；结算面板（screens.ts）按完赛标记填充双人数据，未完成玩家显示"未完赛"；HUD 增加 P2 BEST 元素。

**Tech Stack:** TypeScript + Vite + Vitest（无新增依赖）。

## Global Constraints

- 验证优先级固定：`npm run typecheck` → `npm run lint` → `npm test` → `npm run bot`（必须与基线一致：3 圈 76.017s、0 违规）
- P1 存档 key 格式**不得改变**（`outrun-pseudo3d-best-<trackId>`、`outrun-pseudo3d-best-drift-<trackId>`），保证既有单人存档与 localStorage 兼容
- 单屏模式行为不得回归：P2 零输入、不参与结算、不显示 P2 面板行
- 全部注释/回复用中文，代码与标识符保留英文
- 计划文档本身、`.slim/`、测试脚本不入库

---

### Task C1: 存档层玩家维度扩展

**Files:**
- Modify: `src/ui/save.ts`
- Test: `tests/unit/save.test.ts`

**Interfaces:**
- Produces（后续 Task 依赖）:
  - `bestTimeKeyFor(trackId: string, playerIndex: 0 | 1): string` —— P1 返回 `BEST_TIME_PREFIX + trackId`，P2 返回 `BEST_TIME_PREFIX + trackId + '-p2'`
  - `loadBestTimeFor(playerIndex: 0 | 1, trackId: string, storage?: Storage | null): number | null`
  - `saveBestTimeFor(playerIndex: 0 | 1, sec: number, trackId: string, storage?: Storage | null): boolean`
  - `loadBestDriftScoreFor(playerIndex: 0 | 1, trackId: string, storage?: Storage | null): number | null`
  - `saveBestDriftScoreFor(playerIndex: 0 | 1, score: number, trackId: string, storage?: Storage | null): boolean`
  - 旧 API（`bestTimeKey`/`loadBestTime`/`saveBestTime`/`loadBestDriftScore`/`saveBestDriftScore`）保留，内部委托新函数（playerIndex=0），签名不变

- [x] **Step 1: 写失败测试**（tests/unit/save.test.ts 新增 describe）
  用例：
  1. `bestTimeKeyFor(0, 'classic') === bestTimeKey('classic')` 且 `bestTimeKeyFor(1, 'classic') === 'outrun-pseudo3d-best-classic-p2'`
  2. P1/P2 互不覆盖：fakeStorage 先 `saveBestTimeFor(0, 10, 'classic')`，再 `saveBestTimeFor(1, 12, 'classic')` → `loadBestTimeFor(0, 'classic') === 10`、`loadBestTimeFor(1, 'classic') === 12`；存储中两个 key 都存在
  3. `saveBestTimeFor(1, 15, 'classic')` 不覆盖 P1 的 10（P2 仅比较自身旧值）
  4. 漂移分同样独立：`saveBestDriftScoreFor(1, 100, 'classic')` 后 `loadBestDriftScoreFor(0, 'classic')` 仍为 null
  5. 旧 API 委托一致性：`saveBestTime(10, 'classic', storage)` 后 `loadBestTimeFor(0, 'classic', storage) === 10`
  （参考既有 save.test.ts 的 fakeStorage 辅助写法）

- [x] **Step 2: 运行确认失败**：`npx vitest run tests/unit/save.test.ts` → 新用例失败（函数不存在）

- [x] **Step 3: 实现 save.ts**：新增上述 6 个导出函数；内部抽 `bestKeyFor(trackId, playerIndex)` 统一 key 生成；旧函数改为委托（如 `loadBestTime = (trackId, storage) => loadBestTimeFor(0, trackId, storage)`，保持注释与行为）

- [x] **Step 4: 运行确认通过**：`npx vitest run tests/unit/save.test.ts` 全绿

- [x] **Step 5: 提交**：`git add src/ui/save.ts tests/unit/save.test.ts && git commit -m "feat(save): per-player best time keys (P2 -p2 suffix)"`

#### 实施偏差（C1）

无实质偏差。两点实现细节说明：① key 生成未用文档建议的单一 `bestKeyFor`，而是拆为 `bestTimeKeyFor`（导出）+ 内部 `bestDriftScoreKeyFor`（未导出，保持 drift key 前缀独立）共享 `playerSuffix` 辅助——行为与文档接口一致；② 测试比文档 5 个用例多补了 1 个"storage 不可用降级"用例，覆盖 P2 分支的 null 安全路径。

---

### Task C2: P2 圈速记录与 HUD P2 BEST

**Files:**
- Modify: `src/game/state.ts`、`src/game/game-loop.ts`、`src/ui/hud.ts`、`index.html`、`src/game/debug-hook.ts`
- Test: `tests/unit/game-loop.test.ts`（updatePlayerFrame 相关）、`tests/unit/hud.test.ts`、`tests/unit/player-state.test.ts`（若 reset 断言涉及）

**Interfaces:**
- Consumes: C1 的 `loadBestTimeFor`
- Produces:
  - `RaceState` 新增 `lapTimes2: number[]`、`lastLap2: number`（createRaceState 初始化、resetRaceState 重置）
  - `GameLoop.bestTime2: number | null`
  - `updateHud(elements, race, carConfig, bestTime, splitMode, tracks, phase)` → 新增尾参 `bestTime2: number | null`
  - `HudElements` 新增 `hudBest2?: HTMLDivElement`

- [x] **Step 1: 写失败测试**
  - hud.test.ts：新增用例"分屏显示 P2 BEST"——mock 加 `hudBest2` 元素，传 `bestTime2 = 42.5`，`splitMode = true`，phase='racing' → `hudBest2.hidden === false` 且 `textContent === 'BEST 0:42.500'`（formatTime 格式）；`bestTime2 = null` 时 `hidden === true`；非分屏（splitMode=false）时 `hudBest2.hidden === true`；菜单阶段（phase='menu'）`hudBest2.hidden === true`
  - game-loop.test.ts：updatePlayerFrame P2 圈速——两次推进跨圈后 `lapTimes2` 记录（该文件已有 P2 独立记录用例，按现有 API 断言调整或新增"P2 记录到 lapTimes2 而非 lapTimes"用例）

- [x] **Step 2: 运行确认失败**

- [x] **Step 3: 实现**
  - state.ts：RaceState 加 `lapTimes2: number[]`、`lastLap2: number`；createRaceState 初始化 `lapTimes2: []`、`lastLap2: 0`；resetRaceState 同样重置
  - game-loop.ts：
    - 新增字段 `bestTime2: number | null = null`
    - resetRace()：`this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))`（沿用现有 bestTime 加载处）
    - applyPhase()：PHASE_FINISHED 分支同样刷新 `this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))`
    - 比赛帧 P2 更新（约 L323）：改为传入圈速记录——`const lapRef2 = { value: this.race.lastLap2 }`，`updatePlayerFrame(dt, input2, this.race.player2, this.carConfig, this.trackManager.getLapLength(1), this.race.lapTimes2, lapRef2)`，随后 `this.race.lastLap2 = lapRef2.value`（参考 P1 写法 L310-320）
    - updateHud 调用（约 L408）：末尾追加 `this.bestTime2`
    - debug-hook：installDebugHook 传 `bestTime2: () => this.bestTime2`（DebugHookSources 同步加字段，见 src/game/debug-hook.ts）
  - hud.ts：`updateHud` 加尾参 `bestTime2: number | null`；`HudElements` 加 `hudBest2?`；隐藏分支（!showHud）也置 `hudBest2.hidden = true`；显示分支 P2 区（splitMode 内）加：
    ```ts
    if (elements.hudBest2) {
      elements.hudBest2.hidden = bestTime2 === null
      if (bestTime2 !== null) elements.hudBest2.textContent = `BEST ${formatTime(bestTime2)}`
    }
    ```
    非分屏时 `hudBest2.hidden = true`（与 hudSpeed2 同位置处理）
  - index.html：`#hud2` 内（hud-speed-unit-2 之后）加 `<div id="hud-best-2" hidden>BEST 0:00.000</div>`
  - debug-hook.ts：DebugHookSources/__gameDebug 加 `readonly bestTime2: () => number | null`（参照 bestTime 字段）

- [x] **Step 4: 运行确认通过**：hud.test.ts、game-loop.test.ts、player-state.test.ts 全绿

- [x] **Step 5: 提交**：`git add` 上述文件 + 测试 && `git commit -m "feat(split): per-player lap times and P2 BEST HUD"`

#### 实施偏差（C2）

1. **测试文件落点**：文档写"player-state.test.ts（若 reset 断言涉及）"，实际 `createRaceState`/`resetRaceState` 的工厂断言位于 `tests/unit/collision.test.ts`（该文件含 `createRaceState / resetRaceState` describe），本次在 collision.test.ts 增加 `lapTimes2`/`lastLap2` 的创建与重置断言；player-state.test.ts 只测 PlayerState，无需改动。
2. **hud.ts 显隐实现合并**：文档给出两处写法（splitMode 内 `hidden = bestTime2 === null` + 非分屏置 true），实现合并为一行 `elements.hudBest2.hidden = !splitMode || bestTime2 === null`（等价且避免重复赋值），文本填充仍只在 splitMode 分支内。
3. `lastLap2` 初值取 `1`（与既有 `lastLap: 1` 语义一致，lapFromZ 返回 1 基），文档写 `lastLap2: 0` 应为笔误（`lastLap` 现初值即 1）。
4. game-loop.test.ts 按文档建议新增"P2 跨多圈独立记录到 lapTimes2"用例；hud.test.ts 既有 6 处 updateHud 调用同步补第 8 参 `null`（bestTime2 为必选尾参）。

---

### Task C3: 结算面板分屏双人化

**Files:**
- Modify: `src/ui/screens.ts`、`index.html`、`src/game/game-loop.ts`
- Test: 无既有 screens 测试文件；若需纯函数抽取（可选）可加 `tests/unit/screens.test.ts`，否则由集成测试覆盖（见 Step 3 说明）

**Interfaces:**
- Consumes: C1 的 `saveBestTimeFor`/`saveBestDriftScoreFor`/`loadBestTimeFor`/`loadBestDriftScoreFor`、C2 的 `race.lapTimes2`
- Produces:
  - `ScreenElements` 新增可选字段：`finishTime2?`、`finishSpeed2?`、`finishBest2?`、`finishScore2?`、`finishLaps2?`（前四 HTMLParagraphElement，最后 HTMLDivElement）
  - `applyPhaseToScreens(elements, phase, race, carConfig, opts: { splitMode: boolean; finishedP1: boolean; finishedP2: boolean })` —— **签名重构：trackId 参数删除**，trackId 从 `race.tracks[i].def.id` 取

- [x] **Step 1: 写失败测试（集成层）**
  - game-loop-integration.test.ts：新增分屏完赛用例（参考既有"分屏 P1 3 圈完赛"用例）——stubEnvironment 需返回 finish-screen 元素；P1 完赛后断言 `finish-time-2` 元素存在且非空（或 "未完赛" 文案）；由于 fillFinishPanel 副作用（localStorage/存档），集成测试用 stub 或断言文本即可，不要求真实存档
  - 若实现时把"面板行文本生成"提取为纯函数（建议：`buildFinishLines(race, carConfig, splitMode, finishedP1, finishedP2)` 返回各文本字段），则单测纯函数更稳——自由选择，但必须保证有测试覆盖双人分支

- [x] **Step 2: 运行确认失败**

- [x] **Step 3: 实现**
  - screens.ts：
    - `applyPhaseToScreens(elements, phase, race, carConfig, opts)`：FINISHED 分支调用 `fillFinishPanel(elements, race, carConfig, opts)`
    - `fillFinishPanel` 双人化：
      - `race.finishShown` 守卫保留（整局只填一次）
      - P1 行：仅当 `opts.finishedP1` 时填充（时间/平均速度/存档/漂移分/圈速），否则显示"未完赛"；trackId 用 `race.tracks[0].def.id`
      - P2 行（`opts.splitMode` 且元素存在时）：`finishTime2.textContent = \`P2 总用时 ${formatTime(race.player2.raceTime)}\`` 等；平均速度 `race.player2.cameraZ / Math.max(race.player2.raceTime, 0.001)`；仅当 `opts.finishedP2` 时保存 `saveBestTimeFor(1, race.player2.raceTime, race.tracks[1].def.id)` 与漂移分，否则显示"未完赛"；圈速用 `formatLapTimes(race.lapTimes2)`
      - P1 的 trackId 来源从参数改为 `race.tracks[0].def.id`（删除旧参数）
    - P2 行文本前缀统一 `P2 `（如 `P2 总用时 ...`、`P2 平均速度 ...`），P1 行保持原样
  - index.html：`#finish-screen` 内（finish-laps 之后）加：
    ```html
    <p id="finish-time-2" hidden></p>
    <p id="finish-speed-2" hidden></p>
    <p id="finish-best-2" hidden></p>
    <p id="finish-score-2" hidden></p>
    <div id="finish-laps-2" hidden></div>
    ```
  - game-loop.ts：applyPhase 中 `applyPhaseToScreens` 调用改为传 opts——计算完赛标记：
    ```ts
    const finishedP1 = lapFromZ(this.race.player1.cameraZ, this.trackManager.getLapLength(0)) > this.trackManager.getTotalLaps(0)
    const finishedP2 = this.splitMode && lapFromZ(this.race.player2.cameraZ, this.trackManager.getLapLength(1)) > this.trackManager.getTotalLaps(1)
    applyPhaseToScreens(this.screenElements, newPhase, this.race, this.carConfig, { splitMode: this.splitMode, finishedP1, finishedP2 })
    ```
    （注意：race.cameraZ 已随每帧推进，FINISHED 时判定可靠；单屏时 finishedP2 恒 false）
  - 单屏回归：分屏 P2 行元素 `hidden` 初始为 true，单屏时 fillFinishPanel 不触碰 → 保持隐藏

- [x] **Step 4: 运行确认通过**：integration + 全量单测

- [x] **Step 5: 提交**：`git add src/ui/screens.ts index.html src/game/game-loop.ts [tests] && git commit -m "feat(split): dual-player finish panel"`

#### 实施偏差（C3）

1. **未抽 `buildFinishLines` 纯函数**：按文档"自由选择"，采用集成测试覆盖双人分支（新增"分屏 P2 完赛"用例 + 增强既有"P1 完赛"用例断言 P2 行）；未新建 screens.test.ts，理由：fillFinishPanel 含 localStorage 副作用，集成 stub（getStorage 降级 null）下断言文本更贴近真实路径。
2. **集成测试 P2 完赛驱动方式**：文档建议"P1 静止、按住 ArrowUp 轮询"，集成测试改用 `fireKey('Enter')` 开始（避免 KeyW 同时激活 P1 油门）+ `fireKey('ArrowUp')` 驱动 P2（input.ts 确认 P2 油门为 ArrowUp），2500 帧（125s）内跑完 s-curve 2 圈。
3. **未完赛时清空其余行**：P1/P2 未完赛分支除主文本（"未完赛"/"P2 未完赛"）外，其余行（速度/最佳/得分/圈速）均清空为空串，避免显示上一局残留数据（文档未规定，补充行为）。
4. **P2 行元素引用**：GameLoop 构造 screenElements 同步补充 5 个 P2 元素引用（stub 环境 getElementById 通配创建，兼容）。
5. **applyPhase 完赛标记计算**：frame() 中原有的 finishedP1/finishedP2 判断保留（用于提前触发 FINISHED），applyPhase 内重复计算一次传入 opts——两处判定逻辑一致。

#### 实施偏差（后续视觉修复，observer 复核发现）

- **根因**：C3 初版的 `fillFinishPanel` P2 分支只设置 `textContent`、从未控制 `hidden`；而 index.html 的 5 个 P2 结算元素（`#finish-*-2`）初始带 `hidden` 属性。Playwright DOM 断言（查 textContent）通过，但浏览器截图 P2 结算行完全不可见（面板只剩 P1 行）。
- **修复**（`fix(split): show P2 finish lines in result panel`）：
  - `fillFinishPanel` P2 分支补显隐控制：`finishedP2` 为真时 5 个元素全部 `hidden = false`；为假时 `finishTime2.hidden = false`（显示 "P2 未完赛"），其余 4 个 `hidden = true`
  - 对称性改进：P1 未完赛文案改为 `opts.splitMode ? 'P1 未完赛' : '未完赛'`（分屏加前缀与 P2 对称，单屏保持原样）
- **测试增强**：game-loop-integration.test.ts 的 stub 对 `finish-*` 且以 `-2` 结尾的 id 初始 `hidden: true`（与 index.html 一致，防止 stub 默认 hidden=false 掩盖同类缺陷）；既有"P2 完赛"用例断言 finish-time-2/finish-speed-2/finish-laps-2 均可见，分屏 P1 完赛用例断言 finish-time-2 可见且文本 "P2 未完赛"，单屏完赛用例断言 finish-time-2 保持 hidden。
- **联动**：test-m6.py 场景 C 的 `#finish-time` 断言同步为 "P1 未完赛"（分屏前缀）；冒烟后 shots/m6/finish-dual.png 由 78701 → 99763 bytes（P2 数据行现可见）。

---

### Task C4: 全量验证 + 浏览器冒烟

**Files:**
- Modify: `test-m6.py`（工作区 untracked 脚本，不入库）

- [ ] **Step 1: 全量验证链**：`npm run typecheck` → `npm run lint` → `npm test` → `npm run bot`（bot 必须 3 圈 76.017s、0 违规）

- [ ] **Step 2: 扩展 test-m6.py 冒烟**：新增场景 C（P2 完赛路径）：
  - `?split=1` → Digit1（P1 classic）+ Digit9（P2 s-curve）→ Enter 开始
  - P1 保持静止（不按 W），按住 ArrowUp 不放，轮询 `__gameDebug.phase` 直到 `'finished'`（超时 150s，S 弯 2 圈约 40-60s）
  - 断言：`#finish-time-2` 可见且文本以 "P2 总用时" 开头；`#finish-time` 文本为 "未完赛"（P1 未动）；`page.evaluate('localStorage.getItem("outrun-pseudo3d-best-s-curve-p2")')` 非 null
  - 截图 `shots/m6/finish-dual.png`
  - 若 P2 完赛耗时过长可先用单人逻辑验证 P2 圈速记录（脚本内打印 lapTimes2 相关 debug 值辅助）
- [ ] **Step 3: 运行冒烟**：dev server（localhost:5175，若无则启动）→ `python test-m6.py`（场景 A/B 保持通过）→ 场景 C 通过

- [ ] **Step 4: 汇报**：在最终报告给出冒烟截图路径与关键断言输出

---

### Task C5: codemap 刷新（orchestrator 协调，非本 fixer 任务）

- 由 orchestrator 在 C1-C4 完成后：运行 `node ~/.config/opencode/skills/codemap/scripts/codemap.mjs changes --root ./` 检测受影响目录，委托 fixer 更新受影响子目录 `codemap.md`（预期：`src/game`、`src/ui`、`tests`，可能含 `src/engine`），并 `codemap.mjs update` 保存状态。本 Task 无需本 fixer 执行。

---

## 依赖图

```
C1（存档键）→ C2（P2 圈速 + HUD BEST）→ C3（结算双人）→ C4（验证+冒烟）
                                                          ↘ C5（codemap，orchestrator 执行）
```
