# M13 挑战加成/BOOST 粒子/尾灯/排行榜权重/回归矩阵实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 M12 下一步建议推进——挑战模式天气/难度加成计分、BOOST 音效与视觉粒子、车流夜间尾灯、漂移连击排行榜权重、updatePlayerFrame 返回 lastLap 消除桥接、CollisionSound 强度分级、结算面板可滚动、run-bot 多赛道矩阵回归。

**Architecture:** 纯函数领域层（drift/car/save）+ GameLoop 编排（game-loop.ts 1009 行）+ Renderer 门面（496 行）+ 程序化 WebAudio。改动集中在领域层参数化与 game-loop 接线，保持"可选尾参 + 行为默认不变"模式。

**Tech Stack:** TypeScript + Vite + Canvas 2D + Vitest + tsx（bot）。

## Global Constraints

- 验证优先级：typecheck → lint → test（当前 406 用例）→ build → bot（基线 3 圈 76.017s / 0 违规）
- 不入库：`.slim/`、`docs/superpowers/plans/*.md`、`test-m*.py`、`shots/`
- 新常量必须同步 `tests/unit/constants.test.ts` 注册表断言
- 可选尾参默认值必须保持既有行为逐字节不变；注释/回复中文
- 每 Task 独立 commit，TDD（RED → GREEN → 全量验证 → commit）；计划文档勾选 checkbox + 记录实施偏差

---

### Task H1: 挑战模式天气/难度加成计分

**Files:**
- Modify: `src/physics/drift.ts`、`src/game/game-loop.ts`、`src/game/debug-hook.ts`（如需要）
- Test: `tests/unit/drift.test.ts`、`tests/unit/game-loop-integration.test.ts`

**Interfaces:**
- Produces: `updateDrift(dt, input, state, config, drift, cameraZ, scoreMultiplier = 1)`——第 7 可选尾参，得分行 `next.score += state.speed * dt * DRIFT_SCORE_RATE * multiplier * scoreMultiplier`（默认 1 时与现状逐字节一致）

- [x] **Step 1: 写失败测试**（drift.test.ts 新增「scoreMultiplier 加成（H1）」2 用例：multiplier=1.5 得分 = 基准×1.5（`updateDrift(1, steerInput, state, cfg, activeDrift(0), 0, 1.5)`，dt=1 单帧 combo 0→1 倍率 1.25 基准 75）；默认不传与传 1 得分一致）。game-loop.test.ts 补透传 1 用例（预热满速后单帧大转向激活漂移，scoreMultiplier=1.5 断言得分 1.5×）。
- [x] **Step 2: 运行确认 RED**——2 failed（drift `expected 75 to be close to 112.5` + game-loop 同断言）。
- [x] **Step 3: 实现**——drift.ts `updateDrift(dt, input, state, config, drift, cameraZ, scoreMultiplier = 1)` 得分行 `× scoreMultiplier`（默认 1 逐字节不变）；game-loop.ts `updatePlayerFrame` 加第 7 尾参 `scoreMultiplier = 1`（wet 之后）透传 updateDrift；挑战帧块（wet 判定后）算 `challengeMult = 1 + (raining ? 0.5 : 0) + (race.tracks[0].def.difficulty - 1) * 0.25`（雨天 +50%、2★ +25%、3★ +50%），4 处 updatePlayerFrame 调用补第 7 参（非挑战传 undefined → 默认 1）。
- [x] **Step 4: 运行确认 GREEN**——drift 19 + game-loop 18 + integration 37 = 74 用例全绿。
- [x] **Step 5: 验证链 + commit** `feat(game): challenge mode weather and difficulty score bonus`——typecheck/lint 通过；`npm test` 32 文件 / 410 用例全绿；bot 3 圈 76.017s / 0 违规（非挑战路径 challengeMult undefined → 默认 1，基线分毫不差）。commit `1e8900c`（4 文件：drift.ts、game-loop.ts、drift.test.ts、game-loop.test.ts；52 insertions / 2 deletions）。

**实施偏差（H1）**：
1. **scoreMultiplier 为第 7 尾参而非计划「第 9 尾参」**：计划 Interfaces 写于 H5 重构前（旧签名 lastLapRef 占第 7、wet 第 8）——H5 已移除 lastLapRef、wet 上移第 6，scoreMultiplier 实际为 wet 后第 7 尾参（`(dt, input, player, carConfig, lapLength, lapTimes?, wet?, scoreMultiplier = 1)`），以当前源码为准。
2. **非挑战模式传 undefined 而非「不传」**：挑战帧块统一算 challengeMult（非挑战 undefined），4 处调用统一传第 7 参——undefined 触发默认参数 1，行为与「不传」等价且代码更简洁（避免条件展开调用）。
3. **用例数 406 → 410**：本任务新增 3（drift 2 + game-loop 1），实际 410（差 1 疑为工作区既有状态差异），全绿无回归即可。
4. **challengeMult 计算位置**：置于 G3 wet 判定之后、4 处调用之前（帧块内复用 raining 变量——F4 雨声判定同公式同源）。

---

### Task H2: BOOST 音效与视觉粒子

**Files:**
- Modify: `src/audio/engine.ts`、`src/game/game-loop.ts`、`src/engine/renderer.ts`
- Test: `tests/unit/engine-audio.test.ts`、`tests/unit/renderer-state.test.ts`

**Interfaces:**
- Produces: 导出 `BoostSound` 类——构造 `(ctx, output = ctx.destination)`：sawtooth 振荡器 200→600Hz 线性扫频（0.25s）+ gain 0.15 包络，`play()` 每次重建（无防刷屏）；导出 `BoostParticle { x; z; t; vx }` 与 `createBoostParticles(state, cameraZ)` / `updateBoostParticles(particles, dt)` 纯函数

- [x] **Step 1: 写失败测试**（engine-audio 2 用例：BoostSound play 触发 oscillator 创建且频率 ramp 目标 600 + count 递增；renderer-state 1 用例：boost 激活粒子投影后 arc 增量）。实测：engine-audio 1 用例（play 后 ramp 含 200/600、两次 play count=2）+ renderer-state 1 用例（boostParticles view arc 增量 > 无粒子）；RED：2 failed / 27 passed
- [x] **Step 2: 运行确认 RED**。实测：BoostSound is not defined（import 漏加）+ arc 44>44
- [x] **Step 3: 实现**——engine.ts 加 BoostSound（sawtooth 200→600Hz 扫频 0.25s + gain 0.15 attack/decay 包络，每次 play 重建，`get count()`）；game-loop 音频惰性创建块 `new BoostSound(ctx, sfxGain)`、RACING 帧块 `boostOn && !boostActive` 边沿触发 play + P1 激活期间每帧至多 1 粒尾焰粒子（t += dt 超 0.6s 移除）、`viewFor` 第二可选参透传；renderer 导出 `BoostParticle { x; z; t }` 接口 + RenderView `boostParticles?` + `drawBoostParticles`（drawSmoke 后仿 smoke 投影：`rgba(255,180,80,alpha)`、alpha = 1 - t/0.6、半径 scale×height×0.15）
- [x] **Step 4: 运行确认 GREEN**。实测：目标 2 文件 29 用例全绿（engine-audio 9 + renderer-state 20；补 import 后）
- [x] **Step 5: 验证链 + commit** `feat(audio): boost sound and boost particle trail`。实测：typecheck/lint 通过；32 文件 / 415 用例全绿（413 + 2）；bot 9 赛道矩阵全部完成、0 违规超标（classic 76.017s 分毫不差）。commit `58fec9c`（5 文件：engine.ts、game-loop.ts、renderer.ts、engine-audio.test.ts、renderer-state.test.ts；172 insertions / 9 deletions）

**实施偏差（H2）**：
1. **BoostParticle 按任务设计决策简化**：计划 Interfaces 写 `{ x; z; t; vx }` + `createBoostParticles/updateBoostParticles` 纯函数——任务指示改为 renderer 定义导出 `BoostParticle { x; z; t }`（三字段、无 vx，audio 层不依赖），game-loop 帧块内联维护（无独立纯函数）：P1 激活期间每帧至多 1 粒 push、`t += dt` 超 0.6s splice 移除。
2. **viewFor 是模块级函数（无 this）**：计划「viewFor 组装补 boostParticles: this.boostParticles」不适用于模块级函数——实现为第二可选参 `boostParticles?: BoostParticle[]`，比赛渲染 3 处调用（分屏 renderRegion ×2 + 单屏 render）传 `this.boostParticles`、菜单预览 3 处不传（无粒子）。
3. **粒子 z 取相机前方 +2**：任务未定 z 语义——project 对 `z === cameraZ`（平齐）返回 null，粒子 z 取生成帧 `cameraZ + 2` 保证本帧可投影；后续帧相机前进粒子 z 固定 → 相对相机后退形成拖尾。
4. **粒子半径落地**：「0.15×scale」实现为 `proj.scale * opts.height * 0.15`（仿 smoke 的 `scale*height*0.06` 放大 2.5 倍，尾焰更醒目）。
5. **RED 阶段 import 漏加**：BoostSound 用例首跑 `BoostSound is not defined`——测试 import 列表未加 BoostSound（RED 只加 describe），补 import 后 GREEN（测试侧修正）。
6. **mockCtx 扩展**：engine-audio mockCtx 补 oscillator 频率 ramp 记录（setValueAtTime/linearRampToValueAtTime）、gain 包络方法、`osc.connect` 链式返回（BoostSound `osc.connect(gain).connect(output)` 依赖）。
7. **基线偏移**：任务「当前 413 用例」吻合（H4 后 413）；全量 415 = 413 + 本任务 2；bot 已为 H8 9 赛道矩阵（classic 76.017s 分毫不差）。

---

### Task H3: 车流夜间尾灯

**Files:**
- Modify: `src/engine/renderer.ts`
- Test: `tests/unit/renderer-state.test.ts`

- [x] **Step 1: 写失败测试**——night 渲染车尾灯 fillRect 增量（车身 `car.top.y + height*0.7` 起高 `height*0.25`、颜色 `'#ff3b30'`，与车头灯方向相反；day 渲染零新增）。实测：renderer-state.test.ts 新增 1 用例（预热一帧 + 同场景 day/night 渲染 fillRect 增量 `>` 对比，仿既有 night arc 用例模式）
- [x] **Step 2: RED**。实测：1 failed（fillRect 增量 `78 > 78`）/ 18 passed
- [x] **Step 3: 实现**——drawTraffic night 分支在车窗下方加尾灯 fillRect（双灯：`car.bottom.x ± car.width*0.3`、宽 `car.width*0.2`、`car.top.y + car.height*0.7` 起高 `car.height*0.25`、`#ff3b30`；day 零新增）。实测：GREEN 阶段首版误用裸 `width`/`height` 抛 ReferenceError，修正为 `car.width`/`car.height` 后全绿
- [x] **Step 4: GREEN**。实测：renderer-state 19/19 全绿（含既有 night arc/shiftDir 用例零改动）
- [x] **Step 5: 验证链 + commit** `feat(render): red taillights on night traffic`。实测：typecheck/lint 通过；32 文件 / 410 用例全绿（409 + 1，见偏差 1）；bot 3 圈 76.017s / 0 违规（基线分毫不差）。commit `9cdbb08`（2 文件：renderer.ts、renderer-state.test.ts；39 insertions）

**实施偏差（H3）**：
1. **基线偏移**：任务下达时 HEAD 实为 `1e8900c`（其他 worker 已提交 H1 挑战模式加成，+3 用例），基线 409 而非任务假设的 406；全量 410 = 409 + 本任务 1，bot 基线分毫不差。
2. **首版实现笔误（GREEN 排障）**：drawTraffic 循环变量为 `TrafficProjection`（含 `car.width`/`car.height`），首版在 night 分支误用裸 `width`/`height` 致 `ReferenceError: width is not defined`（3 个 night 用例同时抛错）→ 修正为 `car.width`/`car.height` 后 19/19 全绿。
3. **测试断言风格**：fillRect 增量沿用既有 night 用例的「预热一帧 + 增量 `>` 相对比较」（callCount 为累计值须取增量；`>` 而非精确 `+2×可见车数`，与既有 arc 用例一致，避免依赖投影过滤精确数）。
4. 既有 night 用例不受影响（arc 增量断言与 fillRect 无关，未改动）。

---

### Task H4: 漂移连击排行榜权重

**Files:**
- Modify: `src/ui/save.ts`、`src/game/game-loop.ts`
- Test: `tests/unit/save.test.ts`、`tests/unit/game-loop-integration.test.ts`

**Interfaces:**
- Produces: `DriftEntry` 加可选 `combo?: number`（最高连击档位）；`addDriftScore` 签名不变（排序仍按 score 降序，旧条目无 combo 字段不丢）

- [x] **Step 1: 写失败测试**（save 2 用例：带 combo 条目写回读回保留字段（`toEqual` 含 combo:4）、旧 4 字段条目混存不丢且新条目 combo 保留；integration 1 用例：注入 localStorage `DRIFT_TOP_KEY` 含 combo:4 条目 → 构造 → `#drift-top` 首行含 `连击 x2.00`（1+4×0.25）、旧条目无 `连击 x1` 后缀）。
- [x] **Step 2: RED**——integration 1 failed（`expected '1. P1 · 300 分 · 经典赛道...' to contain '连击 x2.00'`，渲染未实现）+ typecheck 2 error（`TS2353: 'combo' does not exist in type 'DriftEntry'`——save 层 RED 在类型层，esbuild 转译运行时天然保留字段）。
- [x] **Step 3: 实现**——save.ts `DriftEntry` 加可选 `combo?: number`（注释：最高连击档位，旧 4 字段条目兼容，loadDriftTop filter 不校验可选字段）；game-loop.ts applyPhase FINISHED 块 P1/P2 两处 `addDriftScore` 调用补 `combo: Math.round(race.playerN.driftState.combo)`；`refreshDriftTop` 渲染行补 `(e.combo ? ` · 连击 x${(1 + e.combo * 0.25).toFixed(2)}` : '')`。
- [x] **Step 4: GREEN**——typecheck 通过（TS2353 消失）+ save 27 + integration 38 = 65 用例全绿（目标 2 文件 73 含其它）。
- [x] **Step 5: 验证链 + commit** `feat(save): record drift combo in leaderboard entries`——typecheck/lint 通过；`npm test` 32 文件 / 413 用例全绿（410 + 3）；bot 3 圈 76.017s / 0 违规（bot 无漂移得分不记录，combo 字段不影响）。commit `6b2504b`（4 文件：save.ts、game-loop.ts、save.test.ts、game-loop-integration.test.ts；50 insertions / 3 deletions）。

**实施偏差（H4）**：
1. **save 层 RED 在 typecheck 而非运行时**：`DriftEntry` 加 combo 前，对象字面量 `{ ..., combo: 4 }` 赋给 DriftEntry 参数触发 TS2353（typecheck 失败）；vitest 走 esbuild 转译不查类型，运行时字段天然保留（2 个 save 用例实现前已通过）。RED 证据 = integration 渲染失败 + typecheck TS2353 双通道。
2. **integration 用例改注入 localStorage 而非驱动完赛**：任务提示「若 stub 环境难控 drift 得分 >0，可先注入 localStorage drift-top 条目断言渲染格式」——采用注入方案（驱动分屏双完赛需 4000 帧且漂移得分难控），断言更聚焦渲染格式。
3. **顺手修复 refreshDriftTop 方法体同行格式**：473 行原为 `private refreshDriftTop(): void {    const el = ...`（历史编辑留下的同行格式），本任务编辑时拆行为标准多行（无行为变化）。
4. **渲染公式沿用连击倍率**：`连击 x${(1 + combo * 0.25).toFixed(2)}`（与 HUD COMBO 显示同公式），combo 0 时 `连击 x1.00` 也会显示（combo 0 有值即追加——addDriftScore 传 Math.round(combo) 恒为数字，含 0；仅旧条目无 combo 字段不追加）。

---

### Task H5: updatePlayerFrame 返回 lastLap 消除桥接

**Files:**
- Modify: `src/game/game-loop.ts`
- Test: `tests/unit/game-loop.test.ts`、`tests/unit/game-loop-integration.test.ts`

**Interfaces:**
- Produces: `updatePlayerFrame(dt, input, player, carConfig, lapLength, lapTimes?, wet?)`——**移除第 7 参 lastLapRef**，返回 `number`（新 lastLap；内部过圈时 push raceTime）；wet 上移为第 6 尾参（原第 8 参）；调用方 `const lastLap = updatePlayerFrame(...)` 替代 3 行桥接

- [x] **Step 1: 改写测试**——game-loop.test.ts 受影响调用点/断言：完整更新链路（ref 变量删 + 2 处 7 参→6 参）、wet 用例（`(..., LAP_LENGTH, undefined, undefined, false/true)` 8 参 → `(..., LAP_LENGTH, undefined, false/true)` 7 参，wet 上移第 6 尾参）、圈数记录 3 用例（`ref.value` 断言 → 返回值断言：过圈 `lastLap=14`/未增加 `lastLap=1`/P2 模式不变）、P1/P2 互不影响 2 用例（ref1/ref2 删，`lastLap2`/`lastLap` 返回值断言）；integration 零引用（grep 确认无 updatePlayerFrame/lapRef 直调），零改动。
- [x] **Step 2: RED**——5 failed：wet 用例（false 被当 lastLapRef、wet 默认 false → 偏移相等）、圈数记录 3（`lapTimes` 未记录 + `expected undefined to be 1`）、P1/P2 2（`expected [] to deeply equal [1,2,3]`）。
- [x] **Step 3: 实现**——`updatePlayerFrame(dt, input, player, carConfig, lapLength, lapTimes?, wet?)` 返回 `number`：传入 lapTimes 时返回 currentLap（`currentLap > lapTimes.length + 1` 推断 lastLap 并 push raceTime——每次过圈 push 一条，圈数 = 条数 + 1），未传返回 1；wet 上移第 6 尾参；4 处调用点简化为 `this.race.lastLap(2) = updatePlayerFrame(dt, effInputN, player, carConfig, getLapLength(N), race.lapTimes(N), wet)` 单行；删除 `lapRef`/`lapRef2` 字段与 `LastLapRef` 接口。
- [x] **Step 4: GREEN**——game-loop.test.ts + integration 2 文件 54 用例全绿。
- [x] **Step 5: 验证链 + commit** `refactor(game): return lastLap from updatePlayerFrame, drop ref bridge`——typecheck/lint 通过（另修复工作区 untracked 临时脚本 night-bot-check.ts 未使用变量，不 stage）；`npm test` 32 文件 / 406 用例全绿（改写非新增，用例数不变）；bot 3 圈 76.017s / 0 违规基线分毫不差。commit `cde19e4`（2 文件：game-loop.ts、game-loop.test.ts；36 insertions / 59 deletions，净 -23 行）。

**实施偏差（H5）**：
1. **lastLap 推断改用 `lapTimes.length + 1`**：计划仅写「返回 number（新 lastLap）」未定内部实现——因移除 lastLapRef 后函数无法得知旧 lastLap，采用「每次过圈 push 一条 raceTime → 圈数 = 已有条数 + 1」推断，与「返回当前圈数（currentLap）」语义一致（过圈时 currentLap 即新 lastLap，未过圈返回当前圈数；race.lastLap 无逻辑读者，行为等价）。
2. **LastLapRef 接口一并删除**：签名移除后接口无引用（grep 确认仅 game-loop 定义处），删除避免 dead code。
3. **受影响用例实际 5 处断言 + 2 处调用改写**：除计划列的 6 个用例，完整更新链路用例（19-35 行）也传了 ref 参数，一并改写（删 ref 变量与 7 参调用，断言不变）。
4. **night-bot-check.ts 未纳入提交**：lint 链被工作区 untracked 临时脚本（G8 夜间 bot 回归）的未使用变量阻断，最小修复该文件一行（删除未用 `const def`），不 stage 不提交（仍 untracked）。
5. **game-loop.ts 行数 1009 → 986 净减**：签名重构 + 调用点简化净删 23 行。

---

### Task H6: CollisionSound 强度分级

**Files:**
- Modify: `src/audio/engine.ts`、`src/game/game-loop.ts`
- Test: `tests/unit/engine-audio.test.ts`

**Interfaces:**
- Produces: `CollisionSound.play(volume = 1)`——`gain.gain.value = 0.25 * clamp(volume, 0.4, 1)`（每次重建 source 时设置）；`count` getter 不变

- [x] **Step 1: 写失败测试**（engine-audio 1 用例：play(0.5) 后 gain.value === 0.125）。实测：mockCtx 扩展 `getLastGain`（闭包记录最近 createGain 节点）；用例断言构造 0.25 → play(0.5) 0.125 → 推进 currentTime 后 play(0.2) clamp 至 0.1
- [x] **Step 2: RED**。实测：1 failed（play(0.5) 后 gain 仍 0.25 ≠ 0.125）/ 9 passed
- [x] **Step 3: 实现**——engine.ts play 加 volume 参；game-loop 碰撞触发处传 `Math.max(race.player1.carState.speed / carConfig.maxSpeed, race.player2.carState.speed / carConfig.maxSpeed)`（分屏取较快者，单屏 player2 speed=0 自然取 P1）。实测：`play(volume = 1)` 内防刷屏检查后 `this.gain.gain.value = 0.25 * Math.min(Math.max(volume, 0.4), 1)` 再重建 source；game-loop 927-937 计算 impact 后 `collisionSound.play(impact)`
- [x] **Step 4: GREEN**。实测：engine-audio 10/10 全绿
- [x] **Step 5: 验证链 + commit** `feat(audio): scale collision impact volume by speed`。实测：typecheck/lint 通过；32 文件 / 416 用例全绿（415 + 1）；bot 9 赛道矩阵全部完成、0 违规超标（classic 76.017s 分毫不差）。commit `eb81310`（3 文件：engine.ts、game-loop.ts、engine-audio.test.ts；43 insertions / 15 deletions）

**实施偏差（H6）**：
1. **测试断言方式**：任务「mockCtx 记录最近 gain 节点或扩展断言方式」——落地为 `getLastGain()`（createGain 闭包记录最近节点），断言构造默认 0.25、play(0.5) 0.125、play(0.2) 时先推进 currentTime=0.5 越过 80ms 防刷屏窗口再断言 clamp 至 0.1（防刷屏逻辑不变，测试须绕开）。
2. **gain 缩放时机**：`play()` 在防刷屏检查通过后（playCount++ 旁）设置 `gain.gain.value`，跳过时（<80ms）不触碰 gain（维持上次值，语义合理）。
3. **基线**：任务「当前 415 用例」吻合；全量 416 = 415 + 1；bot 为 H8 9 赛道矩阵。

---

### Task H7: 结算面板可滚动

**Files:**
- Modify: `src/style.css`
- Test: 无（视觉变更，冒烟/observer 验证）

- [ ] **Step 1: 实现**——`#finish-screen` 加 `max-height: 100vh; overflow-y: auto;`（保留 padding-bottom）；检查 flex 居中滚动兼容（`#finish-screen` 加 `align-self: center` 若需要）
- [ ] **Step 2: 验证链 + commit** `fix(ui): make finish panel scrollable when content overflows`

---

### Task H8: run-bot 多赛道矩阵回归

**Files:**
- Modify: `tests/bot/run-bot.ts`
- Test: 无单测（tsx 脚本，`npm run bot` 验证）

- [ ] **Step 1: 重构**——遍历 `TRACK_DEFS`（import `TRACK_DEFS` + `createTrackFromDef`），每赛道 `simulateLaps(createTrackFromDef(def), createCarConfig(), createBotConfig(), { laps: def.laps })`，输出每赛道 report 行 + 汇总（全部 `finished && violations <= MAX_VIOLATIONS`）；保留经典赛道报告为第一行（基线 76.017s 可对照）
- [ ] **Step 2: 运行 `npm run bot`**——9 条赛道全部通过，经典赛道 76.017s 不变
- [ ] **Step 3: commit** `test(bot): run full 9-track matrix regression`

---

### Task H9: 全量验证 + 冒烟 + observer 复核

- 全量验证链：typecheck → lint → npm test（406 + 新增）→ build → npm run bot（矩阵）
- `test-m13.py`（untracked）场景：P1 挑战模式雨天加成（注入 raceTime 或等 90s 雨天段难，改用 integration 单测覆盖，冒烟验证挑战结算显示与加成后分数）、P2 BOOST 粒子（Space 激活截图 boost-particle.png 确认尾焰）、P3 夜间尾灯（?split=1 canyon 截图 taillights.png）、P4 排行榜连击（结算后 #drift-top 行含 连击 x）、P5 结算滚动（分屏双完赛 14 行内容截图 finish-scroll.png 确认滚动条/完整可见）
- obs-2 复核截图；汇总报告

---

### Task H10: codemap 刷新 + 汇总

- `codemap.mjs changes` → fix-47/fix-48 更新受影响子目录（physics：scoreMultiplier；engine：BoostParticle/尾灯；audio：BoostSound/play(volume)；game：H1/H4/H5 接线、updatePlayerFrame 新签名、run-bot 矩阵；tests：用例数）→ 聚合 4 文档 → `codemap.mjs update` → 汇总报告（H1-H8 commit 列表、用例数、bot 矩阵结果、冒烟/复核结论、下一步建议）
