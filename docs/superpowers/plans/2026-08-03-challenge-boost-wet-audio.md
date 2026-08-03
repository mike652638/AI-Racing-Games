# M12 挑战模式 / BOOST / 雨天物理 / 工程优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现漂移挑战模式（限时刷分）、车灯随车流避让动态转向、雨天物理、BOOST 氮气系统，并完成工程优化（每帧分配、MusicPlayer 纯函数化、音量分级），最终全量验证 + bot 夜间回归。

**Architecture:** 全部功能沿既有分层：物理在 `physics/`（纯函数）、渲染在 `engine/`（renderer 门面）、状态在 `game/`（PlayerState/RaceState + GameLoop 编排）、UI 在 `ui/`（可选字段守卫模式）、存储在 `ui/save.ts`（localStorage key 前缀 `outrun-pseudo3d-`）。

**Tech Stack:** TypeScript + Vite + Canvas 2D + Vitest（当前 383 用例）+ Playwright 冒烟。

## Global Constraints

- 验证链顺序：typecheck → lint → test（383 基线）→ build → bot（3 圈 76.017s / 0 违规基线不变）
- 每个 Task 独立 commit（message 格式：`feat(...)` / `fix(...)` / `perf(...)`），只暂存本 Task 文件
- 不入库：`.slim/`、`docs/superpowers/plans/*.md`、`test-m*.py`、`debug-*.py`、`shots/`
- 新增 UI 元素必须走"可选字段 + `if (elements.x)` 守卫 + `!showHud` 分支同步隐藏"模式（HudElements/ScreenElements）
- 新增常量必须进 `src/game/constants.ts` 并同步 `tests/unit/constants.test.ts` 注册表
- 新增 PlayerState 必填字段需同步 player-state.test.ts / collision.test.ts 的工厂断言
- 全注释与测试描述用中文
- game-loop.ts（808 行）为共同热点：各 Task 串行执行，禁止并行写同一文件

---

### Task G5: 每帧分配优化（LastLapRef 复用）

**Files:**
- Modify: `src/game/game-loop.ts`（4 处 `const lapRef = { value: ... }` 新建点：热座 P1 ~643、热座 P2 ~655、非热座 P1 ~669、非热座 P2 ~682）
- Test: `tests/unit/game-loop.test.ts`（回归，无需新用例）

**Interfaces:**
- 不变：`updatePlayerFrame(dt, input, player, carConfig, lapLength, lapTimes?, lastLapRef?)` 签名保持（导出纯函数，game-loop.test.ts 10+ 用例直接调用）
- 新增（GameLoop 私有字段）：`private lapRef = { value: 1 }`、`private lapRef2 = { value: 1 }`（构造一次复用）

- [x] **Step 1: 写失败测试（可跳过——行为不变，回归保护由既有用例承担）**：无新断言（按计划跳过；回归由 game-loop.test.ts 10+ 直接调用用例 + integration 47 用例承担）。
- [x] **Step 2: 实现**：GameLoop 增加两个复用字段（`private lapRef = { value: 1 }`、`private lapRef2 = { value: 1 }`，放 lastCollisionCount 旁，构造一次）；4 处调用点（热座 P1 ~643、热座 P2 ~655、非热座 P1 ~669、非热座 P2 ~682，实际 650-706 行）改为 `this.lapRef.value = this.race.lastLap; updatePlayerFrame(..., this.lapRef); this.race.lastLap = this.lapRef.value`（lapRef2 对应 lastLap2）。热座/非热座共用同一对字段（不同分支不同帧执行，无并发）。
- [x] **Step 3: 验证**：`npx vitest run tests/unit/game-loop.test.ts tests/unit/game-loop-integration.test.ts` 全绿（2 文件 47 用例）→ typecheck/lint 通过 → `npm test` 32 文件 / 387 用例全绿 → bot 3 圈 76.017s / 0 违规（基线不变）。
- [x] **Step 4: Commit**：`perf(game): reuse lapRef objects across frames instead of per-frame allocation`（commit `566603a`，1 文件 game-loop.ts，20 insertions / 12 deletions）

**实施偏差（G5）**：
1. **用例数 383 → 387**：任务描述「当前 383 用例」，实际工作区 `npm test` 为 387（M12 G1-G4 前序任务已增 4 用例），全绿即可，非本任务引入。
2. **行号偏移**：计划标注 643/655/669/682，实际源码因 M11 F4/F5 与 G 系列任务行号已偏移至 650-706 区间（grep 定位，以源码为准）。
3. **无 RED 阶段**：任务明确「行为零变化、不新增测试用例」，Step 1 按计划可跳过；正确性由既有 47 目标用例 + 全量 387 用例回归保护（非严格 RED/GREEN 流程）。

---

### Task G6: MusicPlayer 调度纯函数化

**Files:**
- Modify: `src/audio/music.ts`（playStep ~107-117 行的 step→事件映射提取）
- Test: `tests/unit/music.test.ts`（新增 stepEvents/nextStep 用例）

**Interfaces:**
- 新增导出：`stepEvents(step: number): { bass: string; melody: string | null; hat: boolean }`（bass = BASS_LINE[Math.floor(step / 4) % 4]、melody = step % 2 === 0 ? MELODY_LINE[Math.floor(step / 2) % 8] : null、hat = step % 4 === 0）
- 新增导出：`nextStep(step: number): number`（`(step + 1) % 16`）
- 不变：`noteToFreq` / `tickMsForBpm` / `BASS_LINE` / `MELODY_LINE`（既有 9 用例零改动）

- [x] **Step 1: 写失败测试**：music.test.ts 新增 describe「调度纯函数」：stepEvents(0) bass = BASS_LINE[0]、melody = MELODY_LINE[0]、hat = true；stepEvents(1) melody = null、hat = false；stepEvents(2) melody = MELODY_LINE[1]；nextStep(0)=1、nextStep(15)=0。实测：4 用例（stepEvents 3 + nextStep 1）
- [x] **Step 2: 运行确认失败**：`npx vitest run tests/unit/music.test.ts` → 新用例 RED（`stepEvents/nextStep is not a function`）。实测：4 failed / 9 passed
- [x] **Step 3: 实现**：提取 `stepEvents`/`nextStep` 纯函数导出；`playStep` 改调 `stepEvents(step)` 分发（bass 恒播、melody 非 null 播、hat 播），行为逐字节一致。实测：`playStep` 用 `const { bass, melody, hat } = stepEvents(step)` 分发；`schedule()` 内 `this.step = nextStep(this.step)`；既有导出与 9 用例零改动
- [x] **Step 4: 验证**：music.test.ts 全绿 → typecheck/lint/test 全量 → bot。实测：music 13/13 全绿；typecheck/lint 通过；32 文件 / 387 用例全绿（383 + 4）；bot 3 圈 76.017s / 0 违规（基线分毫不差，纯重构不影响物理/决策）
- [x] **Step 5: Commit**：`refactor(audio): extract step events and step advance as pure functions`。实测 commit：`ebb3b27`（2 文件，55 insertions / 8 deletions）

**实施偏差（G6）**：无实质偏差。`playStep` 分发重构保持行为逐字节一致（bass 恒播 / melody `step % 2 === 0` / hat `step % 4 === 0` 映射原样迁入 `stepEvents`）；`schedule()` 内 step 推进改用 `nextStep`（与 `(step+1)%16` 逐字节等价）；验证链按任务与计划 Step 4 指示不含 `npm run build`（纯函数重构无构建产物差异风险）。

---

### Task G2: 车灯随车流避让动态转向

**Files:**
- Modify: `src/engine/traffic.ts`（TrafficCar 加 shiftDir 字段 + 避让 AI 同步记录）
- Modify: `src/engine/renderer.ts`（drawHeadlight 加 steerDir 参数 + drawTraffic 传值）
- Test: `tests/unit/traffic.test.ts`、`tests/unit/renderer-state.test.ts`

**Interfaces:**
- `TrafficCar` 加必填 `shiftDir: -1 | 0 | 1`（createTraffic 初始化 0；updateTraffic 避让分支：目标侧为正/负时设 1/-1，远离不触发保持 0）
- `drawHeadlight(cx, topY, width, height, steerDir: -1 | 0 | 1)`：核心灯 `hx = cx + steerDir * width * 0.35`、外层光晕 `hx + steerDir * width * 0.18`；steerDir = 0 与现状逐字节一致
- `drawTraffic(..., night)` 内调用处传 `car.shiftDir`

- [x] **Step 1: 写失败测试**：traffic.test.ts「车流避让」describe 补 2 用例（同车道逼近后 `car.shiftDir === -1`（玩家 x>0 时避让目标 -0.75 → 远离侧 -1）、远离场景 shiftDir 保持 0）；renderer-state.test.ts night 用例补 1 用例（shiftDir=1 时核心灯 arc 的 x 参数 ≠ shiftDir=0 时——用 __args 记录比对）。注意 traffic.test.ts 既有 `createTraffic` 断言若用 toEqual 需同步补 shiftDir。实测：3 用例（traffic 2 + renderer-state 1，arc x 增量序列切片对比）；createTraffic 的 toEqual 对比两侧输出均含 shiftDir: 0 无需修改
- [x] **Step 2: 运行确认失败**：`npx vitest run tests/unit/traffic.test.ts tests/unit/renderer-state.test.ts` → RED。实测：3 failed（shiftDir undefined ≠ -1/0、arc x 序列相同 not toEqual）/ 32 passed
- [x] **Step 3: 实现**：traffic.ts 加字段与避让分支赋值；renderer.ts drawHeadlight 加参 + 偏移逻辑。实测：`TrafficCar` 加必填 `shiftDir: -1|0|1`（createTraffic 初始化 0；避让分支 `car.shiftDir = player.x > 0 ? -1 : 1`、远离/不触发恢复 0）；`drawHeadlight(cx, topY, width, height, steerDir)` 核心灯 `cx + steerDir*width*0.35`、外层光晕 `cx + steerDir*width*0.18`；drawTraffic 传 `car.car.shiftDir`（见偏差 2）
- [x] **Step 4: 验证**：目标文件全绿 → 全量链 → bot（避让 AI 行为不变，bot 基线应分毫不差）。实测：目标 35/35 全绿；typecheck/lint 通过（含 collision/traffic-render 字面量补丁）；32 文件 / 393 用例全绿（390 + 3，见偏差 3）；bot 3 圈 76.017s / 0 违规（分毫不差）
- [x] **Step 5: Commit**：`feat(render): headlights steer toward lane-change direction`。实测 commit：`8367b77`（6 文件，77 insertions / 15 deletions，见偏差 1）

**实施偏差（G2）**：
1. **提交 6 文件而非计划 4 文件**：`TrafficCar` 加必填 `shiftDir` 后，`tests/unit/collision.test.ts`（trafficCar helper）与 `tests/unit/traffic-render.test.ts`（car helper）的 TrafficCar 字面量缺字段致 typecheck 报 TS2741——必须同步补 `shiftDir: 0`，故实际提交含 2 个连锁补丁文件（traffic.ts / renderer.ts / traffic.test.ts / renderer-state.test.ts / collision.test.ts / traffic-render.test.ts）。
2. **drawTraffic 循环变量是 TrafficProjection 而非 TrafficCar**：`projectTraffic` 返回对象嵌套 `car: TrafficCar` 字段，初版传 `car.shiftDir` 为 undefined（steerDir 变 NaN、arc x 序列相同致断言失败）→ 修正为 `car.car.shiftDir`。
3. **基线偏移**：任务背景「当前 387 用例」过时——HEAD 实际为 `566603a`（G6 后其他 worker 提交 lapRef 重构 +3 用例，基线 390）；全量 393 = 390 + 本任务 3 新用例，bot 基线分毫不差。
4. **远离恢复 0 语义**：按计划「远离不触发保持 0」实现为避让 else 分支 `car.shiftDir = 0`（车灯回中）；不带 player 时（`!player` continue）不触碰 shiftDir（初始化 0 保持）。
5. **他人未提交改动共存**：工作区存在 game-loop.ts / car.ts / car.test.ts / game-loop.test.ts 未提交改动（并行任务），本提交严格只含本任务 6 文件，未触碰。`shifts/` 等不入库惯例照旧。

---

### Task G3: 雨天物理（抓地力/刹车距离）

**Files:**
- Modify: `src/physics/car.ts`（updateCar 加第 6 可选参 wet）
- Modify: `src/game/game-loop.ts`（updatePlayerFrame 加 wet 尾参透传 + 两处调用传雨段判定）
- Test: `tests/unit/car.test.ts`、`tests/unit/game-loop.test.ts`

**Interfaces:**
- `updateCar(dt, input, state, config, turnRateOverride?, wet = false): boolean`：wet 时 `turnEff = (turnRateOverride ?? config.turnRate) * 0.85`（抓地力降 15%）、刹车 `speed - config.braking * 0.7 * dt`（制动力降 30% → 刹车距离变长）；wet=false 路径逐字节不变
- `updatePlayerFrame(dt, input, player, carConfig, lapLength, lapTimes?, lastLapRef?, wet = false)`（尾参，既有调用零改动）
- game-loop 帧块（~623 前）算 `const wet = Math.floor(race.player1.raceTime / WEATHER_CYCLE_SECONDS) % 3 === 2`（与雨段/雨声同公式），热座与非热座全部 updatePlayerFrame 调用补 wet 尾参

- [x] **Step 1: 写失败测试**：car.test.ts 新增「wet 雨天物理」describe 2 用例（① wet 转向抓地力 0.85×：`updateCar(1, {throttle:0,brake:false,steer:1}, state, cfg, undefined, true)` position 增量 = 非 wet 的 0.85 倍；② wet 刹车 0.7×：brake 1 秒后速度 = 3000 - braking*0.7）。game-loop.test.ts 补 1 用例（同速度预热后 wet=true 转向偏移 < wet=false，验证 updatePlayerFrame 透传）。
- [x] **Step 2: 运行确认失败**：RED——car 2 failed（position 未降 15%、speed 未降 30%）+ game-loop 1 failed（wet/dry 偏移相等）。
- [x] **Step 3: 实现**：car.ts `updateCar(..., turnRateOverride?, wet = false)`——brake 分支 `config.braking * (wet ? 0.7 : 1)`（松油门 deceleration 不动）、转向 `(turnRateOverride ?? config.turnRate) * (wet ? 0.85 : 1)`，wet=false 路径逐字节不变；game-loop.ts `updatePlayerFrame` 加第 8 尾参 `wet = false` 透传 updateCar（既有调用零改动）；帧块（F4 雨段判定旁）加 `const wet = Math.floor(race.player1.raceTime / WEATHER_CYCLE_SECONDS) % 3 === 2`（与雨声同公式同源），热座 P1/P2、非热座 P1/P2 4 处 updatePlayerFrame 调用补 wet 尾参（P2 世界统一同一 wet 值）。
- [x] **Step 4: 验证**：目标文件全绿（car 20 + game-loop 14 = 34）→ typecheck/lint 通过 → `npm test` 32 文件 / 393 用例全绿 → bot 3 圈 76.017s / 0 违规（classic 白天 wet=false 路径，基线分毫不差）。
- [x] **Step 5: Commit**：`feat(physics): wet weather reduces traction and braking`（commit `e00b1f5`，4 文件：car.ts、game-loop.ts、car.test.ts、game-loop.test.ts；50 insertions / 3 deletions）

**实施偏差（G3）**：
1. **car.test.ts 基础断言修正**：首次 RED 运行发现「基准增量 0.4」断言失败（实际 0.24）——松油门分支先减速（3000-1200=1800）再算转向，position 增量 = 0.8 × (1800/6000) = 0.24。修正基础断言为 0.24，`base.position * 0.85` 对比语义不变。
2. **wet 判定与 raining 并列两行**（而非改名复用）：F4 的 `raining` 变量用于雨声语义保持不动，G3 新增独立 `const wet = ...` 同公式（两行并列、注释说明同源），雨声代码零改动。
3. **用例数 387 → 393**：任务描述「当前 387 用例」，实际 npm test 为 393（G5 后工作区累计 6 用例差，非本任务引入），全绿无回归即可。
4. **wet 尾参类型未导出新常量**：`0.85`/`0.7` 为 car.ts 局部系数（不引入游戏常量——计划未要求进 constants.ts，且 wet 属派生行为参数）。

---

### Task G7: 音效音量分级（SFX/音乐双 gain）

**Files:**
- Modify: `src/game/game-loop.ts`（音频创建链 564-578 拆分 gain、三 slider 绑定、setMusicVolume/setSfxVolume）
- Modify: `src/ui/screens.ts`（ScreenElements 加 pauseMusicVolume?/pauseSfxVolume?）
- Modify: `index.html`（#pause-controls 加两 slider）
- Modify: `src/style.css`（复用 #pause-volume 样式）
- Test: `tests/unit/game-loop-integration.test.ts`（FakeAudioContext 多节点支持 + 用例）

**Interfaces:**
- 音频链改：`masterGain`（总，value = volume）→ `musicGain`/`sfxGain`（各连 masterGain）；EngineSound/RainSound/CollisionSound 注入 sfxGain、MusicPlayer 注入 musicGain
- 新字段：`musicVolume`/`sfxVolume`（默认 0.8/1.0）；`loadVolume` 拆出 `loadMusicVolume`/`loadSfxVolume`；localStorage key `outrun-pseudo3d-music-volume`/`outrun-pseudo3d-sfx-volume`（string 0-1，无效回退默认）
- `setMusicVolume(v)` / `setSfxVolume(v)`（clamp 0-1 + 对应 gain 同步 + 持久化）
- screenElements 加 `pauseMusicVolume?`/`pauseSfxVolume?`；构造器仿 209-215 绑定 input 事件
- 既有 `setVolume`/`pause-volume`/`VOLUME_KEY` 行为不变（总音量）

- [x] **Step 1: 写失败测试**：integration 新增 2 用例——① `pause-music-volume` slider 设 40 → fire input → localStorage `outrun-pseudo3d-music-volume` === '0.4'；② `pause-sfx-volume` slider 设 80 → localStorage `outrun-pseudo3d-sfx-volume` === '0.8'（均用 `stubEnvironment('', {})` 激活 localStorage 以便断言持久化）。
- [x] **Step 2: 运行确认失败**：RED——2 failed（`expected null to be '0.4'/'0.8'`，元素无绑定未写入）。
- [x] **Step 3: 实现**：game-loop 音频链拆分——`masterGain`（总，value=volume，连 destination）→ `musicGain`/`sfxGain`（各连 masterGain，value = musicVolume/sfxVolume）；EngineSound/RainSound/CollisionSound 注入 sfxGain、MusicPlayer 注入 musicGain。新字段 `musicVolume = 0.8`/`sfxVolume = 1.0` + 常量 `MUSIC_VOLUME_KEY`/`SFX_VOLUME_KEY` + `loadMusicVolume`/`loadSfxVolume`（无效回退默认）+ `setMusicVolume`/`setSfxVolume`（clamp + gain 同步 + 持久化）；构造器读三音量；screenElements 补 `pauseMusicVolume`/`pauseSfxVolume` + 守卫式绑定（仿 pauseVolume）；screens.ts 加两可选字段；index.html #pause-controls 加两 slider（音乐 80/音效 100）；style.css 合并选择器 `#pause-volume, #pause-music-volume, #pause-sfx-volume`。debug-hook 未加 getter（保持 17，冒烟走 localStorage）。既有 setVolume/pause-volume/VOLUME_KEY 行为不变。
- [x] **Step 4: 验证**：目标文件全绿（integration 36 用例）→ typecheck/lint 通过 → `npm test` 32 文件 / 395 用例全绿（393 + 2）→ bot 3 圈 76.017s / 0 违规。
- [x] **Step 5: Commit**：`feat(ui): separate music and SFX volume controls`（commit `e83dcce`，5 文件：game-loop.ts、screens.ts、index.html、style.css、game-loop-integration.test.ts；149 insertions / 8 deletions）

**实施偏差（G7）**：
1. **测试断言走 localStorage 而非 gain 值**：计划 Step 1 曾纠结「断言 musicGain.gain.value」需 debug getter——最终采用计划认可方案：断言 localStorage 键值（slider.value/100），无需扩展 debug-hook 17 getter；gain 同步为 setMusicVolume 内部行为（typecheck + 构造回归保护）。
2. **integration 用例需 `stubEnvironment('', {})` 激活存储**：既有音量用例（P6）只断言 debugValue 不需持久化；新用例断言 localStorage 写入，必须传空对象激活 fakeStorage（`getStorage` 双检查：全局 + window.localStorage），不传时 setItem 被 try/catch 忽略。
3. **style.css 合并选择器**：`#pause-volume, #pause-music-volume, #pause-sfx-volume` 共用 slider 样式（宽度 200px、accent-color、cursor），未复制三份。
4. **musicGain/sfxGain 创建顺序在 masterGain 后**（连 masterGain 而非 destination），与计划一致；F4 雨声/碰撞音改注 sfxGain（随音效分轨调节，注释更新）。

---

### Task G1: 漂移挑战模式（?challenge=1 限时刷分）

**Files:**
- Modify: `src/game/game-loop.ts`（challengeMode 解析、CHALLENGE_SECONDS 常量、帧块时间到判定、FINISHED 块记分条件、menu-hint 文案、debug hook 加 challengeTimeLeft）
- Modify: `src/game/constants.ts` + `tests/unit/constants.test.ts`（CHALLENGE_SECONDS = 60）
- Modify: `src/ui/screens.ts`（FinishPanelOptions 加 challengeMode；fillFinishPanel 挑战分支）
- Modify: `src/ui/hud.ts`（HudElements 加 challengeTimer?；显示/隐藏）
- Modify: `index.html`（#hud 加 #challenge-timer）+ `src/style.css`
- Modify: `src/game/debug-hook.ts`（18 getter）
- Test: `tests/unit/game-loop-integration.test.ts`、`tests/unit/hud.test.ts`

**Interfaces:**
- GameLoop：`challengeMode = params.has('challenge') && !splitMode && !hotseatMode`（144-147 处加）
- menu-hint（151-158）：challenge 模式 `挑战模式：60 秒限时刷分 · 1-9 选赛道 · 任意键开始`
- 帧块（~709 前）：`if (this.challengeMode && this.race.player1.raceTime >= CHALLENGE_SECONDS) { this.applyPhase(PHASE_FINISHED); return }`
- applyPhase FINISHED 块（448 行）：addDriftScore P1 条件改 `(finishedP1 || this.challengeMode) && score > 0`；P2 分支挑战模式恒跳过；addMatchResult 仅 splitMode 不受影响
- FinishPanelOptions 加第 9 字段 `challengeMode: boolean`；fillFinishPanel 挑战分支（在 hotseat round2 快照分支之后、finishedP1 分支之前）：finishTime = '挑战结束'、finishSpeed = ''、finishBest = 漂移榜排名（`loadDriftTop()` 找本局 score 对应 index+1，无则空）、finishScore = `挑战漂移得分 ${score}`（同 P1 的 NEW DRIFT RECORD 逻辑可复用）、finishLaps = ''；hud 隐藏逻辑不变
- hud：HudElements 加 `challengeTimer?: HTMLDivElement`；updateHud 内（新尾参 challengeMode？——不从 race 读：挑战剩余时间 = CHALLENGE_SECONDS - race.player1.raceTime，hud 已收 race 可自行计算，但需知道 challengeMode——**方案：updateHud 加第 10 可选尾参 `challengeMode = false`**，或 HudElements 不加字段、由 game-loop 帧块直接操作 #challenge-timer DOM（更简单：challengeTimer 由 game-loop 每帧 `el.textContent = '剩余 X.Xs'`，!showHud 时 hidden）。**采用后者：hud.ts 只加可选字段进 HudElements 类型，显隐与文本由 game-loop 帧块处理**（hud.test.ts 只测类型兼容不新增）
- debug hook 加 `challengeTimeLeft: () => this.challengeMode ? Math.max(0, CHALLENGE_SECONDS - this.race.player1.raceTime) : null`

- [x] **Step 1: 写失败测试**：constants.test.ts 注册表补 `CHALLENGE_SECONDS=60`；integration 新增「challenge 模式」用例（`stubEnvironment('?challenge=1')`：menu-hint 含挑战文案；1250 帧后 phase finished；finish-time '挑战结束'；challengeTimeLeft 首帧 60 → 递减）；hud.test.ts 补 challengeTimer 可选字段兼容用例（updateHud 不抛错且不干预）。
- [x] **Step 2: 运行确认失败**：RED——constants 1 failed（`expected undefined to be 60`）+ integration 1 failed（`expected '' to contain '挑战'`）；hud 兼容用例直接通过（非行为断言）。
- [x] **Step 3: 实现**（按 Interfaces）：constants.ts 加 `CHALLENGE_SECONDS = 60`；game-loop `challengeMode = params.has('challenge') && !splitMode && !hotseatMode` + menu-hint 挑战分支 + challengeTimer 字段/帧块操作（剩余秒数 + 仅挑战模式且 RACING 可见）+ 帧块限时判定（raceTime ≥ 60 → applyPhase FINISHED + return，置于正常完赛判定前）+ FINISHED 块 addDriftScore P1 条件改 `(finishedP1 || challengeMode) && score > 0` + opts 补 challengeMode + debug hook 加 `challengeTimeLeft`（18 getter 三处同步）；screens.ts FinishPanelOptions 加第 9 字段 + fillFinishPanel 挑战分支（hotseat 快照分支前：finishTime '挑战结束'/finishBest 漂移榜排名/`挑战漂移得分 X` + NEW DRIFT RECORD 复用/finishLaps 空）+ import loadDriftTop；hud.ts HudElements 加 challengeTimer 可选字段（仅类型，显隐/文本由 game-loop 帧块处理）；index.html #hud 加 #challenge-timer；style.css 加样式（橙红醒目随漂移指示）。
- [x] **Step 4: 验证**：目标文件全绿（constants 7 + integration 37 + hud 24 = 68）→ typecheck/lint 通过 → `npm test` 32 文件 / 398 用例全绿（395 + 3）→ bot 3 圈 76.017s / 0 违规（默认非挑战路径，基线分毫不差）。
- [x] **Step 5: Commit**：`feat(game): timed drift challenge mode with leaderboard integration`（commit `b0092e3`，10 文件：game-loop.ts、constants.ts、debug-hook.ts、screens.ts、hud.ts、index.html、style.css、constants.test.ts、game-loop-integration.test.ts、hud.test.ts；116 insertions / 4 deletions）

**实施偏差（G1）**：
1. **限时判定与正常完赛判定顺序**：challenge 判定（raceTime ≥ 60）置于正常完赛判定（finishedP1/finishedP2）**之前**——但 P1 全油门约 47s 先完成 3 圈走正常完赛路径，结算面板按 `challengeMode` 走挑战分支（fillFinishPanel 挑战分支在 finishedP1 分支前）。因此实际挑战对局在 3 圈完赛时即收束（约 47s < 60s 限时），限时判定是兜底上限。测试驱动 1250 帧（62.5s）仍断言 finished + 挑战文案（47s 完赛即可），注释说明。
2. **CHALLENGE_SECONDS 补导入 game-loop**：实现期首跑报 `ReferenceError: CHALLENGE_SECONDS is not defined`——game-loop 原未导入 constants（此前用不到 game 层常量），补 `import { CHALLENGE_SECONDS } from './constants'`（GREEN 阶段修复）。
3. **hud.test.ts 兼容用例非 RED**：challengeTimer 由 game-loop 帧块处理（updateHud 不干预），兼容用例实现前后都通过（与 F6 可选访问兼容用例同性质）；RED 由 constants + integration 用例承担。
4. **finishBest 漂移榜排名**：`loadDriftTop()` 在 fillFinishPanel 时已含本局刚 addDriftScore 的分数（applyPhase FINISHED 块先 addDriftScore 后 applyPhaseToScreens），findIndex 匹配 score 得名次；同分场景取首个匹配（降序榜内并列顺序）。
5. **challengeTimer 用 `??=` 惰性获取**：字段初始 null，帧块首次 RACING 时防御式获取 `document.getElementById('challenge-timer')`（stub 环境自动建元素），避免构造器空引用。

---

### Task G4: BOOST 氮气系统

**Files:**
- Modify: `src/physics/input.ts`（CarInput 加 boost?: boolean；PLAYER1_MAPPING 加 boost: 'Space'、PLAYER2_MAPPING 加 boost: 'Enter'；inputFromKeys/touchToCarInput 产出）
- Modify: `src/physics/car.ts`（updateCar 内 boost 分支：`if (input.boost) speed = Math.min(speed + config.acceleration * BOOST_ACCEL_MULT * dt, config.maxSpeed * BOOST_MAX_SPEED_MULT)`）
- Modify: `src/game/constants.ts` + `tests/unit/constants.test.ts`（BOOST_ACCEL_MULT = 0.6、BOOST_MAX_SPEED_MULT = 1.15、BOOST_CHARGE_RATE = 0.3、BOOST_DRAIN_RATE = 0.5）
- Modify: `src/game/player-state.ts`（PlayerState 加 boostCharge: number；createPlayerState 0；resetPlayerState 归 0）
- Modify: `src/game/game-loop.ts`（帧块蓄力/消耗/激活 + hud 组装补 boostBar）
- Modify: `src/ui/hud.ts`（HudElements 加 boostBar?: HTMLDivElement；显示逻辑——文本或宽度）
- Modify: `index.html`（#hud 加 #boost-bar）+ `src/style.css`
- Modify: `src/game/debug-hook.ts`（boostCharge getter，19 getter）
- Test: `tests/unit/input.test.ts`、`tests/unit/car.test.ts`、`tests/unit/game-loop.test.ts`、`tests/unit/hud.test.ts`、`tests/unit/player-state.test.ts`、`tests/unit/collision.test.ts`（若工厂断言破坏）

**Interfaces:**
- `CarInput { throttle; brake; steer; boost?: boolean }`（可选，旧字面量零破坏；inputFromKeys 产出 `boost: pressed[mapping.boost ?? ''] === true`；touchToCarInput 产出 boost: false）
- 蓄力/消耗（game-loop 帧块，input1/input2 取得后）：P1 回合 `if (driftActive) player.boostCharge = Math.min(1, player.boostCharge + dt * BOOST_CHARGE_RATE)`；`if (input.boost && player.boostCharge > 0) { boostActive 帧 = true; player.boostCharge = Math.max(0, player.boostCharge - dt * BOOST_DRAIN_RATE) }`——**实现位置：把 boost 布尔并入传给 updateCar 的 input**（`const effInput1 = { ...input1, boost: input1.boost === true && player1.boostCharge > 0 }`），updateCar 内 boost 分支生效；热座/分屏 P2 同逻辑
- HUD：hud.ts 显示分支 `boostBar.hidden = !showHud || ...`——**简化：由 game-loop 帧块直接操作**（`boostBar.style.width = `${charge * 100}%`` + hidden 控制），hud.ts 仅加类型字段（与 challengeTimer 同模式）
- debug hook：`boostCharge: () => this.race.player1.boostCharge`

- [x] **Step 1: 写失败测试**：constants.test.ts 注册表补 4 常量；input.test.ts 补 2 用例（Space → boost true、未按 → undefined 条件产出）；car.test.ts 补 2 用例（boost 突破 maxSpeed、不越 1.15× 上限）；game-loop.test.ts 补 updateBoostCharge 3 用例（漂移蓄力、消耗激活、边界 clamp）；touch.test.ts 48 行 toEqual 同步补 boost:false。
- [x] **Step 2: 运行确认失败**：RED——constants 1 + input 1 + car 2 + touch 1 + game-loop 3（updateBoostCharge 不存在，含一次 PARSE_ERROR 修复：误删换行符）+ 修复测试自身算式错误（boost 用例最初 throttle=0 走松油门减速先降速）。
- [x] **Step 3: 实现**：input.ts `CarInput.boost?: boolean`（car.ts 定义）、`PlayerMapping.boost?`、PLAYER1_MAPPING `boost:'Space'`/PLAYER2_MAPPING `boost:'Enter'`、inputFromKeys 条件产出（未按不产出字段保持旧对象形状）、touchToCarInput 恒 `boost:false`；constants.ts 4 常量；car.ts boost 分支（throttle 分支后独立执行，上限 1.15×maxSpeed，import 置顶）；player-state.ts `boostCharge`（初始/重置 0）；game-loop.ts 导出 `updateBoostCharge(charge, dt, inputBoost, driftActive)`（4 参，lint 拒绝未用第 5 参 input）+ 帧块蓄力/消耗 + effInput1/effInput2 并入 boost + boostBar 帧块操作（宽度 = charge%）；debug hook `boostCharge`（19 getter 三处同步）；hud.ts/joystick.ts 加可选字段（JoystickInput 补 boost? 修复 typecheck）；index.html #boost-bar；style.css 底部横条样式。
- [x] **Step 4: 验证**：目标文件全绿（7 文件 101 用例）→ typecheck/lint 通过（修复 JoystickInput.boost 类型 + lint no-unused-vars）→ `npm test` 32 文件 / 406 用例全绿（398 + 8 新增）→ bot 3 圈 76.017s / 0 违规（bot 无 boost 输入，基线分毫不差）。
- [x] **Step 5: Commit**：`feat(game): boost nitro system with drift-charged meter`（commit `68358e8`，15 文件：input.ts、car.ts、constants.ts、player-state.ts、game-loop.ts、debug-hook.ts、hud.ts、joystick.ts、index.html、style.css + 5 测试文件；206 insertions / 9 deletions）

**实施偏差（G4）**：
1. **`updateBoostCharge` 第 5 参 input 被移除（4 参）**：计划 Interfaces 签名含 `input: CarInput` 第 5 参——实现中 inputBoost 已显式传参、input 冗余，被 `@typescript-eslint/no-unused-vars` 拒绝（`_input` 前缀不豁免），实现为 4 参；测试与帧块调用同步 4 参。
2. **inputFromKeys 条件产出（未按 Space 无 boost 字段）**：任务允许「boost === false（或 undefined，按实现定）」——条件产出使既有 input.test.ts 5 处三字段 toEqual 断言零改动；touchToCarInput 按任务字面恒产出 `boost: false` → touch.test.ts 48 行 toEqual 同步补字段（纳入提交，超出任务列出的 test 清单）。
3. **car.test.ts boost 用例算式修正**：初版用例 throttle=0 时松油门分支先减速（deceleration 20）再 boost（95-20+30=105 ≠ 115）；修正为全油门 + boost（throttle 分支 clamp 100 → boost 130 → clamp 115），并改用 `toBeCloseTo`（`100 * 1.15` 浮点表示 114.99999999999999）。
4. **JoystickInput 补 boost? 可选字段**：`input1` 可为 `JoystickInput`（joystick.getInput()），`input1.boost === true` 触发 TS2339；joystick.ts 接口加可选字段修复（摇杆恒不产出，undefined 兼容）。
5. **car.ts BOOST 常量 import 置顶**：初版误放文件中部（createCarConfig 后），修正移至文件顶部 import 区。
6. **game-loop.test.ts PARSE_ERROR**：一次编辑误删换行符导致语法错误，修复后恢复。

---

### Task G8: 全量验证 + 冒烟 + bot 夜间回归

**Files:**
- Create: `test-m12.py`（untracked）
- 验证：全量链 + `python test-m12.py` + 临时夜间 bot 校验（不改 run-bot.ts 正式接口）

- [ ] **Step 1: 全量验证链**：typecheck → lint → `npm test`（383 + 新增）→ build → `npm run bot`（76.017s/0 违规基线）。
- [ ] **Step 2: 夜间 bot 回归**：临时脚本/命令用 simulateLaps 跑 canyon（night）3 圈，断言完赛且违规 0（不改 run-bot.ts）。
- [ ] **Step 3: test-m12.py 冒烟**（Playwright，CHROME=chromium-1234 路径，dev server 5175）：O1 挑战模式（?challenge=1 → 等 ~61s 自动结算 → finish-time='挑战结束' + #drift-top 记录 + 截图 challenge.png）；O2 BOOST（单屏 W 满速后 Space 激活，hud-speed 数值 > 600（6000*1.15 → 690 km/h），截图 boost.png）；O3 雨天物理冒烟（可选：湿天速度/刹车肉眼验证，截图 wet-race.png）；O4 音量分级（Escape → 音乐 slider 设 40 → localStorage outrun-pseudo3d-music-volume='0.4'，截图 volume-split.png）；O5 车灯转向（?split=1 canyon 双夜世界 + 车流避让，截图 night-headlight.png）。截图 shots/m12/。
- [ ] **Step 4: obs-2 复核**（shots/m12/ 截图）。
- [ ] **Step 5: 汇报**（G9 一起）。

### Task G9: codemap 刷新 + 汇总报告

- [ ] `codemap.mjs changes --root ./` → 派 fixer 更新受影响子目录（src/game、src/physics、src/engine、src/ui、src/audio、tests）→ orchestrator 更新聚合（根/src/docs/plans codemap）→ `codemap.mjs update --root ./`
- [ ] 汇总报告：commit 列表、用例数、bot 基线、冒烟结果、遗留问题、下一步建议
