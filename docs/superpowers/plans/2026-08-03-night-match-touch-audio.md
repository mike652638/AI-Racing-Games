# M11 夜晚赛道/对局榜/触屏暂停/音效/性能优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 按 superpowers:executing-plans 逐 Task 执行（TDD：先失败测试 → 最小实现 → 全量验证 → 独立 commit）。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 六项扩展——赛道夜晚模式 + 车灯、分屏漂移对局 TOP10、触屏暂停菜单、雨声/碰撞音效、drawRain 离屏缓存、DRIFT_SCORE_MAX 显示 MAX 标记。

**Architecture:** 全部沿用现有分层（engine 纯渲染 / game 编排 / ui 表现 / audio 合成），文件重叠大（game-loop/renderer/save/hud/index.html），Task 串行执行。

**Tech Stack:** TypeScript + Vite + Canvas 2D + Vitest + WebAudio。

## Global Constraints

- 验证优先级：typecheck → lint → test（基线 32 文件 363 用例）→ build → bot（3 圈 76.017s / 0 违规基线不变）。
- 每 Task 独立 commit，信息用中文注释、英文 message；不入库：`.slim/`、`docs/superpowers/plans/`、`test-*.py`、`shots/`。
- 新增可选 DOM 字段一律 `?` + `if (elements.x)` 守卫（hud.test.ts mock 字面量兼容）；可选函数参数默认值向后兼容（既有调用零改动）。
- 常量改动须同步 `tests/unit/constants.test.ts` 注册表。
- hud.ts 漂移得分显示非 MAX 时输出必须与现状一致（`String(Math.round(score))`）。

---

### Task F1: 赛道夜晚模式 + 车灯（engine + tracks）

**Files:**
- Modify: `src/engine/tracks.ts`（TrackDef 加 `timeOfDay?: 'day' | 'night'`；给 2 条赛道设 night：`canyon`（峡谷夜色）与 `alpine`（山岳夜道））
- Modify: `src/engine/lighting.ts`（`updateLighting(timeSec, overcast = false, raining = false, night = false)`——night 时整体锁定夜晚色板：`skyTop: build(220, 55, 12)`、`skyBottom: build(210, 50, 8)`、`grass: build(120, 30, 12)`（深暗蓝紫/暗绿），mountain 色经 build 暗化；非 night 路径逐字节不变）
- Modify: `src/engine/renderer.ts`（`RenderView` 加 `night?: boolean`；renderWithOpts 取 `const night = view?.night ?? false` 传入 updateLighting；`buildMountains(colorFar, colorNear)` 参数化——night 时用 `'#101a2a'`/`'#0a1220'`；`drawTraffic` 加车灯：night 时每辆在车前画光晕 `arc` 双色 `rgba(255,235,180,0.35)` + 核心 `'#ffe08a'`，位置 = 车投影底部前缘，半径随 scale）
- Modify: `src/game/game-loop.ts`（`viewFor(ctx)` 组装 RenderView 时加 `night: ctx.def.timeOfDay === 'night'`）
- Test: `tests/unit/lighting.test.ts`（night 天空色相∈[200,260] 且亮度 < 白天）、`tests/unit/renderer-state.test.ts`（带 night view 渲染不抛错 + arc 调用计数增加）、`tests/unit/tracks.test.ts`（canyon/alpine timeOfDay==='night'、其余 'day'）

- [x] **Step 1:** 写失败测试（lighting night 断言 + renderer night view arc 计数 + tracks 字段断言），跑 RED。实测：4 新用例失败（lighting 2：night 亮度/异于 day；renderer-state 1：night arc 增量；tracks 1：timeOfDay 缺失）/ 35 既有通过
- [x] **Step 2:** 实现 tracks.ts `timeOfDay` 字段（canyon/alpine 设 night）。实测：TrackDef 加 `timeOfDay?: 'day' | 'night'`，canyon（峡谷疾驰）与 alpine（山岳险道）设 `'night'`，其余 7 条不写
- [x] **Step 3:** 实现 lighting.ts 第 4 参 night 色板。实测：night=true 锁定 `skyTop hsl(220,55%,12%)`/`skyBottom hsl(210,50%,8%)`/`grass hsl(120,30%,12%)`/mountain 暗化，不随 timeSec 时段插值；night=false 路径逐字节不变
- [x] **Step 4:** 实现 renderer.ts（RenderView.night + buildMountains 参数化 + drawTraffic 车灯光晕）+ game-loop viewFor 传 night。实测：`viewFor` 加 `night: ctx.def.timeOfDay === 'night'`；renderWithOpts 取 `night = view?.night ?? false` 传 updateLighting 第 4 参并选深色远山；drawTraffic 车头双弧光晕（rgba(255,235,180,0.35) + #ffe08a，半径随 scale）
- [x] **Step 5:** 全量验证 typecheck/lint/test/build/bot。实测：typecheck/lint 通过；32 文件 / 367 用例全绿（363 + 4）；build 通过（43.12 kB）；bot 3 圈 76.017s / 0 违规（基线分毫不差，bot 用 classic 白天赛道不受影响）
- [x] **Step 6:** Commit（`feat(render): night mode tracks with headlights`）。实测 commit：`9140c14`（7 文件，120 insertions / 13 deletions）

**实施偏差（F1）**：
1. **renderer-state 车灯测试两次修正**（RED 阶段排障记录）：首次写法「night 渲染 arc 计数 vs 无车流直道基线」因 canyon 的 `createRoadsideSprites` 路灯也画 arc 而假阳性通过；改为「同场景累计值对比」仍假阳性（`callCount` 是累计值，第二次渲染恒大于第一次）；最终落地为「预热一帧后，分别统计同场景 day 渲染与 night 渲染的新增 arc 增量」对比（nightIncrement > baseIncrement），严格隔离车灯贡献。计划原案「arc 计数增加」未指明增量语义，实现取增量对比。
2. **buildMountains 双缓存**：计划写「buildMountains(colorFar, colorNear) 参数化」——实现为参数化 + 构造/`setViewport` 时同时构建 day/night 两套远山离屏缓存（`mountains`/`mountainsNight`，night 色 `#101a2a`/`#0a1220`），渲染按 `view.night` 选择，避免每帧重建离屏位图，且支持同一 Renderer 渲染 day/night 双世界（分屏 P1 day + P2 night 场景）。
3. **lighting night 色板 mountain 值**：任务给定 skyTop/skyBottom/grass 三值，mountainFar/mountainNear 未明确——落地为 `hsl(220, 30%, 10%)`/`hsl(220, 35%, 8%)`（深暗蓝紫，与 skyTop 同 hue）；renderer 实际不消费 lighting 的 mountain 色（远山走 buildMountains 硬编码深色），该两值仅保证 LightingColors 完整性。
4. **车灯绘制参数化**：night 经参数传入 `drawTraffic(cameraZ, opts, v, night)`（非 this 字段，保持无状态）；车灯参考 drawLamp 双弧模式——外层 `rgba(255,235,180,0.35)` 半径 ×1.6 + 核心 `#ffe08a`，中心在车身上部（`top.y + height × 0.25`，车头方向即画面上方），半径随投影宽（scale）缩放，night=false 零新增绘制。

### Task F2: 分屏漂移对局 TOP10（save + game-loop + screens + index.html）

**Files:**
- Modify: `src/ui/save.ts`（`interface MatchEntry { winner: 'P1' | 'P2'; p1Score: number; p2Score: number; trackId: string }`、`MATCH_TOP_KEY = 'outrun-pseudo3d-match-top'`、`MATCH_TOP_MAX = 10`、`loadMatchTop(storage?): MatchEntry[]`、`addMatchResult(entry, storage?): { top; entered }`——仿 addDriftScore：push → sort（先 winner 无关，按 p1Score+p2Score 总分降序？不——对局榜按**最近** 10 局，用 unshift + slice 保新局优先，或按时间序。落地：**最近 10 局**（时间倒序），JSON 校验回退 []）
- Modify: `src/game/game-loop.ts`（applyPhase FINISHED && !finishShown 块内：`splitMode && finishedP1 && finishedP2` 时 `addMatchResult({ winner: driftWinner ?? 'P1', p1Score, p2Score, trackId: getTrackId(0) })`；新私有 `refreshMatchTop()` 渲染 `#match-top` 前 10 条（`${i+1}. ${winner} 胜 · ${p1}:${p2} · ${getTrackDef(trackId)?.name ?? trackId}`），构造 + MENU 分支 + FINISHED 记录后三处调用）
- Modify: `index.html`（`#drift-top` 后加 `<div id="match-top">暂无对局记录</div>`）
- Modify: `src/style.css`（复用 #drift-top 样式，max-height 132px + overflow-y auto）
- Test: `tests/unit/save.test.ts`（新增「对局记录」describe：addMatchResult 首局/同局多次/JSON 损坏回退/存储降级/截断 10）、`tests/unit/game-loop-integration.test.ts`（分屏双完赛 → #match-top 非占位 + stub 特例?——match-top 默认可见无需 hidden 特例）

- [x] **Step 1:** 写失败测试（save 5 例 + integration 1 例），RED
  - save.test.ts「对局记录」5 例：无存档 []、首局写回可读、多局最近优先 + 截断 10（新局头部、最旧被挤）、JSON 损坏回退 [] + 非法条目过滤、storage null 安全降级
  - integration 1 例：分屏双完赛后 `#match-top` 以 `1. ` 开头且含 `胜 ·` 与 `经典赛道`，构造时占位 `暂无对局记录`
  - 实测 RED：save 5 failed（loadMatchTop/addMatchResult is not a function）+ integration 1 failed（expected '' to be '暂无对局记录'），既有 58 用例无回归
- [x] **Step 2:** save.ts 实现 MatchEntry 三 API
  - `MatchEntry { winner: 'P1'|'P2'; p1Score; p2Score; trackId }`、`MATCH_TOP_KEY`、`MATCH_TOP_MAX = 10`（导出）
  - `loadMatchTop`：JSON 损坏/不可用/非数组回退 []，逐条校验（winner ∈ {P1,P2}、score 有限数、trackId 字符串），保持存储顺序
  - `addMatchResult`：unshift（新局头部）→ slice 截断 → 写回 → `{ top, entered }`；storage null 仅返回内存结果
- [x] **Step 3:** game-loop refreshMatchTop + 记录点 + index.html/style.css
  - `refreshMatchTop()`（仿 refreshDriftTop，`document.getElementById('match-top')` 防御式）：无记录 `暂无对局记录`，否则前 10 条 `i+1. ${winner} 胜 · ${p1}:${p2} · ${getTrackDef(trackId)?.name ?? trackId}`
  - 三处调用：构造器（refreshDriftTop/refreshBestSummary 旁）、FINISHED && !finishShown 块（addMatchResult 后）、PHASE_MENU 分支（resetRace 后）
  - 记录点：`splitMode && finishedP1 && finishedP2` → `addMatchResult({ winner: driftWinner ?? 'P1', p1Score, p2Score, trackId: getTrackId(0) })`
  - index.html `#drift-top` 后加 `#match-top`；style.css 复用 #drift-top 风格 + `max-height: 132px; overflow-y: auto`
- [x] **Step 4:** GREEN + 全量验证 + Commit（`feat(save): drift match results TOP10 for split mode`）
  - GREEN：save 33 + integration 31 = 64 用例全绿；typecheck/lint 通过；npm test 32 文件 / 373 用例全绿（367 + 6）；build 通过（44.16 kB）；bot 3 圈 76.017s / 0 违规
  - commit：`5b750b9`（6 文件：save.ts、game-loop.ts、index.html、style.css、save.test.ts、game-loop-integration.test.ts；188 insertions / 1 deletion）

**实施偏差（F2）**：
1. **记录点条件用 `driftWinner ?? 'P1'` 冗余防御**：触发条件 `splitMode && finishedP1 && finishedP2` 下 driftWinner 恒非 null（平局归 P1），`?? 'P1'` 仅为类型收窄防御，语义不变。
2. **match-top 渲染全部 10 条而非 slice(0,5)**：计划 Files 写「渲染前 10 条」，`loadMatchTop()` 本身已截断至 MATCH_TOP_MAX，直接渲染无需再 slice（与 refreshDriftTop 的 slice(0,5) 不同——漂移榜存储超 10 条需截取前 5 展示，对局榜存储即前 10）。
3. **loadMatchTop 校验含 `Number.isFinite`**：计划要求「p1Score/p2Score 为有限数」，实现用 `typeof === 'number' && Number.isFinite`（JSON 解析值不会产生 NaN/Infinity，但手动写入的存储可能，防御到位）。
4. **integration 用例未加 stub hidden 特例**：stub getElementById 通配实现自动建 match-top（hidden=false、textContent 可写），与 index.html 初始可见一致，无需特例（计划已预期）。
5. **style.css 限高 132px**：仿 #best-summary 的 168px 限高，对局榜行数更少（10 行）取 132px（约 5 行可视 + 滚动），防挤压底部 `#menu-hint`。

### Task F3: 触屏暂停/恢复 + 暂停菜单「继续」按钮（game-loop + joystick + index.html）

**Files:**
- Modify: `src/ui/joystick.ts`（新增 `reset(): void`——清空内部指针状态与 input，供暂停进入时调用）
- Modify: `src/game/game-loop.ts`（进入 PAUSED 时 `this.joystick.reset()`（守卫式）；hud 组装补 `pauseBtn`；`#pause-btn` click → `applyPhase(togglePause(PHASE_RACING))`（进入暂停）；screenElements 补 `pauseResume`；`#pause-resume` click → `applyPhase(togglePause(PHASE_PAUSED))`（恢复）；`#pause-btn` 显隐：updateHud 或 applyPhase 中 RACING 显示 / 非 RACING 隐藏）
- Modify: `src/ui/hud.ts` 或 applyPhase（`#pause-btn` 显隐控制——放 applyPhase 更合适：RACING → `pauseBtn.hidden = false`，其余 true）
- Modify: `index.html`（`#hud` 内加 `<button id="pause-btn" hidden>⏸</button>`；`#pause-screen` 的 #pause-controls 内加 `<button id="pause-resume" type="button">继续</button>`）
- Modify: `src/style.css`（`#pause-btn` 悬浮按钮样式）
- Test: `tests/unit/game-loop-integration.test.ts`（stub 基建已支持 click 事件：新增「pause-btn click 进入暂停」「pause-resume click 恢复」「PAUSED 时 joystick.reset 被调用」3 用例）、`tests/unit/joystick.test.ts`（reset 清空 input 用例）

- [x] **Step 1:** 失败测试（integration 2 + joystick 1），RED
  - joystick.test.ts 新增「JoystickUI」describe 1 例：stub document（createElement/body）+ canvas 事件记录，pointerdown/pointermove 激活后 `reset()` → `isActive()` false 且 `getInput()` 零输入
  - integration 新增 2 例：比赛阶段 `fireElementEvent('pause-btn', 'click')` → PAUSED；暂停菜单 `fireElementEvent('pause-resume', 'click')` → RACING
  - 实测 RED：joystick 1 failed（`joystick.reset is not a function`）+ integration 2 failed（expected 'racing'/'paused' 未切换），既有 38 用例无回归
- [x] **Step 2:** joystick.reset() 实现
  - `reset(): void`——`activeId = null`、`input` 归零、`base.style.display = 'none'`（与 endTouch 语义一致，隐藏摇杆底盘）
- [x] **Step 3:** game-loop 事件绑定 + 显隐 + index.html/style.css
  - HudElements 加可选 `pauseBtn?: HTMLButtonElement`、ScreenElements 加可选 `pauseResume?: HTMLButtonElement`（组装处守卫式绑定）
  - 构造器绑定：`#pause-btn` click → `applyPhase(togglePause(this.phase))`（RACING 进入暂停）；`#pause-resume` click → 同式（PAUSED 恢复）
  - applyPhase：`newPhase === PHASE_PAUSED` → `this.joystick.reset()`（清残留输入）；`pauseBtn.hidden = newPhase !== PHASE_RACING`（仅比赛可见）
  - index.html：`#hud` 内（drift-combo 后）加 `<button id="pause-btn" type="button" hidden>⏸</button>`；`#pause-controls` 内、重开按钮前加 `<button id="pause-resume" type="button">继续</button>`
  - style.css：`#pause-btn` 悬浮按钮（右下角固定 16px、52px 圆形、半透明黑底、z-index 30）；`#pause-resume` 合并进 `#pause-restart` 选择器（含 hover/active）
- [x] **Step 4:** GREEN + 全量验证 + Commit（`feat(ui): touch pause button and resume in pause menu`）
  - GREEN：joystick 8 + integration 33 = 41 用例全绿；typecheck/lint 通过；npm test 32 文件 / 376 用例全绿（373 + 3）；build 通过（44.60 kB）；bot 3 圈 76.017s / 0 违规
  - commit：`5ce51ac`（8 文件：joystick.ts、hud.ts、screens.ts、game-loop.ts、index.html、style.css、joystick.test.ts、game-loop-integration.test.ts；126 insertions / 4 deletions）

**实施偏差（F3）**：
1. **integration 用例 3 → 2**：计划列「pause-btn click 进入暂停」「pause-resume click 恢复」「Escape 暂停时 joystick.reset 被调用」3 用例——第 3 例需暴露 joystick 引用（私有字段，debug hook 无暴露），采用任务允许的退路方案：reset 行为由 joystick.test.ts 单测覆盖（激活 → reset → 断言清空），integration 仅 2 例；Escape 往返正确性由既有用例「Escape 在比赛与暂停阶段往返切换」覆盖。
2. **`this.joystick.reset()` 未用可选链**：joystick 字段为构造器必填 readonly（非可选），直接调用；`?.` 守卫不必要。
3. **pause-btn 显隐放 applyPhase**（计划备选方案之一）：RACING → `hidden=false`、其余 true；构造时 applyPhase 未调用，`#pause-btn` index.html 初始 hidden，进入 RACING 时 applyPhase 显示（构造器首帧前 phase=PHASE_MENU，MENU→RACING 必经 applyPhase）。
4. **style.css 合并选择器**：`#pause-restart, #pause-resume` 共用按钮样式 + 独立 hover/active 组；`#pause-btn` 单独悬浮按钮样式（z-index 30 高于 canvas 层）。

### Task F4: 雨声 + 碰撞音效（audio + game-loop）

**Files:**
- Modify: `src/audio/engine.ts`（新增导出 `class RainSound`——`constructor(ctx, output)`：白噪声 buffer（2s 循环，`mulberry32` 或随机）→ bandpass 800Hz → gain 0.05 → output；`start()`/`stop()`（增益渐入渐出）；新增导出 `class CollisionSound`——`constructor(ctx, output)`：短噪声 burst（0.15s）→ lowpass 300Hz → gain 0.25 → output，`play()` 触发单次（每次 play 重放 buffer 起点））
- Modify: `src/game/game-loop.ts`（字段 `rainSound`/`collisionSound`；音频惰性创建块内一并 `new RainSound(ctx, masterGain)` + `new CollisionSound(ctx, masterGain)`；帧循环 `PHASE_RACING` 块内算 `raining = Math.floor(this.race.player1.raceTime / WEATHER_CYCLE_SECONDS) % 3 === 2`（import WEATHER_CYCLE_SECONDS）→ raining 时 `rainSound.start()`（幂等）否则 `stop()`；updateCollisions 调用后对比 `this.race.collisionCount` 变化 → 增加时 `collisionSound.play()`）
- Test: `tests/unit/engine-audio.test.ts`（RainSound 构造/stop 幂等、CollisionSound play 触发——用 FakeAudioContext 现有模式）、`tests/unit/game-loop-integration.test.ts`（可选：雨段不崩 + 碰撞后 collisionSound 被调用——stub AudioContext 需支持 createBuffer/createBufferSource；若过重则用 debug hook 观测 `rainPlaying` 状态，新增 debug getter）

- [x] **Step 1:** 失败测试（engine-audio 2-3 例），RED。实测：3 新用例失败（engine-audio 2：RainSound 幂等/isPlaying、CollisionSound 防刷屏；integration 1：rainPlaying debug getter undefined）/ 39 既有通过
- [x] **Step 2:** RainSound/CollisionSound 实现。实测：audio/engine.ts 新增两导出类——RainSound（2s 白噪声循环 buffer → bandpass 800Hz Q1 → gain 0.05，`start()` 幂等惰性建源、`stop()` 归零、`isPlaying()`）、CollisionSound（0.15s burst → lowpass 300Hz → gain 0.25，`play()` 每次重建 BufferSource、80ms 防刷屏、`count` getter），均 `constructor(ctx, output = ctx.destination)` 注入模式
- [x] **Step 3:** game-loop 接线（raining 检测 + 碰撞计数对比 + debug getter）。实测：音频惰性创建块内 `new RainSound(ctx, masterGain)` + `new CollisionSound(ctx, masterGain)`；PHASE_RACING 块按 `floor(raceTime / WEATHER_CYCLE_SECONDS) % 3 === 2` 判定雨段驱动 `rainSound.start()/stop()`（类内幂等）；updateCollisions 后对比 `collisionCount > lastCollisionCount` 触发 `collisionSound.play()`；resetRace 同步快照 0；debug-hook 加 `rainPlaying` getter（`rainSound?.isPlaying() ?? false`）
- [x] **Step 4:** GREEN + 全量验证 + Commit（`feat(audio): rain ambience and collision impact sounds`）。实测：目标 2 文件 42 用例全绿；typecheck/lint 通过；32 文件 / 379 用例全绿（376 + 3）；build 通过（46.61 kB）；bot 3 圈 76.017s / 0 违规（基线分毫不差，bot 不碰音频）。commit：`3ed2bd3`（5 文件，244 insertions / 30 deletions）

**实施偏差（F4）**：
1. **engine-audio.test.ts mockCtx 提升到文件顶层并扩展**：mockCtx 原定义在 describe('EngineSound 输出注入') 内部，RainSound/CollisionSound 新 describe 作用域访问不到（RED 首跑 `mockCtx is not defined`）→ 提升到文件顶层；并补 `Q`（RainSound bandpass 设 `filter.Q.value`）、`createBuffer`/`createBufferSource`/`sampleRate`（白噪声 buffer 生成）、`getBufferSourceCount`（start 幂等断言）、可变 `currentTime`（防刷屏时间推进断言）。
2. **integration FakeAudioContext 扩展**：RainSound/CollisionSound 构造需 `createBuffer`/`createBufferSource`，FakeAudioContext 原缺两方法（不补则既有触发音频创建的用例全崩）→ 补之；`createAudioNode` 补 `Q: { value: 1 }`。
3. **雨段用例驱动段调整**：初版 `driveFrames(900)×3` 断言 45s/90s/135s 因首帧 dt 略小于 0.05（env.now 与 GameLoop.last 起始差）导致 raceTime≈89.9s 未过 90s 边界（floor=1 阴）而失败 → 改 `driveFrames(1000)×3`（50s/100s/150s），断言点远离 45s 倍数边界。
4. **RainSound 白噪声用 Math.random**（audio/engine.ts 未导入 mulberry32，声音无需确定性）；`stop()` 直接 `source.stop()` + gain 归零（任务允许的简化）；CollisionSound 暴露 `count` getter 供单测（未加 collisionSoundCount debug getter——任务标注可选，最小化处理）。

### Task F5: drawRain 离屏缓存（renderer）

**Files:**
- Modify: `src/engine/renderer.ts`（新增 `rainCanvas: HTMLCanvasElement | null` 与 `buildRainCanvas(opts)`——setViewport 时重建：离屏 canvas 宽 = opts.width、高 = opts.height + 20，预绘制全部 80 条雨丝（当前 drawRain 的 beginPath/moveTo/lineTo/stroke 序列，y0 直接用原数据）；`drawRain` 改为每帧 `drawImage(rainCanvas, 0, yOffset - (opts.height + 20))` 双幅平铺（yOffset = timeSec*600 % (height+20)），`alpha = 0.35` 由预绘制时写入 rgba；canvas mock 需支持第二个 createMockCanvas 实例——用现有 mock 工厂即可（getContext 返回新 mock ctx））
- Test: `tests/unit/renderer-state.test.ts`（雨天渲染：drawImage 调用计数 ≥ 2（双幅平铺）、stroke 调用 ≤ 1（仅构建期）；setViewport 后重建 rainCanvas 尺寸断言）

- [x] **Step 1:** 失败测试（drawImage 计数 + stroke 计数变化），RED。实测：3 用例失败（改写 P5 雨天用例：主 ctx 帧内 stroke 非零；新增 drawImage 增量 4>4；新增 rainCanvas 尺寸 undefined）/ 14 既有通过
- [x] **Step 2:** buildRainCanvas + drawRain 平铺实现。实测：renderer.ts 新增 `rainCanvas` 字段与 `buildRainCanvas(opts)`（离屏 canvas 宽 = opts.width、高 = opts.height + 20，预绘制 80 条雨丝 strokeStyle rgba(180,200,220,0.35)/lineWidth 1/beginPath+moveTo+lineTo+stroke）；构造器与 `setViewport` 均调用重建；`drawRain` 改为双幅 `drawImage(rainCanvas, 0, yOffset - h)` + `drawImage(rainCanvas, 0, yOffset)`（`yOffset = (timeSec*600 % (h)) - 10`，h = opts.height + 20），帧内零逐段绘制
- [x] **Step 3:** GREEN + 全量验证 + Commit（`perf(render): pre-render raindrops to offscreen canvas`）。实测：目标文件 17 用例全绿；typecheck/lint 通过；32 文件 / 381 用例全绿（379 + 2 净增）；build 通过（46.88 kB）；bot 3 圈 76.017s / 0 违规（基线分毫不差）。commit：`8245109`（2 文件，64 insertions / 18 deletions）

**实施偏差（F5）**：
1. **既有 P5 雨天用例改写**：原「雨天渲染产生雨滴 stroke 路径调用」（`rainStroke > clearStroke`）在 F5 后失效（主 ctx 帧内 stroke 恒 0）→ 改写为「雨丝预渲染离屏后主 ctx 帧内零 stroke」（断言两态相等）。
2. **setViewport 尺寸用例引用修正**：`buildRainCanvas` 在 setViewport 时**替换** rainCanvas 对象引用，测试首次写法持有旧引用导致断言仍 800 → 改为每次经 `getRainCanvas()` 重新读取当前引用。
3. **-10 偏移并入平铺位移**：离屏 canvas 雨丝画在 [0, height+20) 区间（无 -10）；帧内 `yOffset = (timeSec*600 % h) - 10` 双幅平铺（yOffset - h 与 yOffset 两处），保留原「雨丝整体上移 10px」视觉语义。覆盖分析：yOffset ∈ [-10, h-10)，两幅合盖 [yOffset-h, yOffset+h) ⊇ [0, height]，环形回绕无缝。
4. **构建期 stroke 在独立 mock ctx**：离屏 canvas 的 stroke 记录在其自身 mock ctx（`document.createElement('canvas')` 独立实例），不计入主 canvas `__calls`——「帧内 stroke === 0」断言可靠；`game-loop-integration` F4 雨段用例（断言 rainPlaying debug getter）不受渲染改动影响。
5. bot 基线分毫不差（bot 76s 不进入雨段，且渲染改动不影响物理/决策）。

### Task F6: DRIFT_SCORE_MAX 显示 MAX 标记（hud）

**Files:**
- Modify: `src/ui/hud.ts`（import `DRIFT_SCORE_MAX` from `../game/constants`；漂移指示分支：`score >= DRIFT_SCORE_MAX` → `textContent = 'MAX'`，否则 `String(Math.round(score))` 不变）
- Test: `tests/unit/hud.test.ts`（新增「hud 漂移得分 MAX 标记」：score=99999 → 'MAX'；score=12345 → '12345' 不变；菜单隐藏）

- [x] **Step 1:** 失败测试（2 例），RED
  - hud.test.ts 新增 describe「hud 漂移得分 MAX 标记（F6）」：① active 且 score = DRIFT_SCORE_MAX → `driftScoreValue.textContent === 'MAX'`；② active 且 score = 12345 → `'12345'`（格式不变）
  - 实测 RED：① failed（`expected '99999' to be 'MAX'`）；② passed（现状即符合）；既有 21 用例无回归
- [x] **Step 2:** hud.ts 实现
  - import `DRIFT_SCORE_MAX`（`../game/constants`，hud.ts 新增第 6 个 import）
  - 漂移指示分支改为三目：`score >= DRIFT_SCORE_MAX ? 'MAX' : String(Math.round(score))`——非上限时与现状逐字一致
- [x] **Step 3:** GREEN + 全量验证 + Commit（`feat(hud): show MAX marker when drift score hits cap`）
  - GREEN：hud.test.ts 23 用例全绿；typecheck/lint 通过；npm test 32 文件 / 383 用例全绿（381 + 2）；build 通过（46.91 kB）；bot 3 圈 76.017s / 0 违规
  - commit：`d808b14`（2 文件：hud.ts、hud.test.ts；32 insertions / 1 deletion）
  - 未动：drift.ts、constants.ts、index.html、style.css（按计划约束）

**实施偏差（F6）**：
1. **「菜单阶段仍隐藏」用例未新增**：计划列「③ 菜单阶段仍隐藏（既有用例已覆盖，可略）」——既有「hud visibility」首用例已断言菜单阶段 `driftIndicator.hidden === true`（漂移得分文本隐藏随指示元素），故未重复新增。
2. **import 追加方式**：hud.ts 现有 import 从 `./gamestate` 消费阶段常量（非 `../game/phase` 直接路径），DRIFT_SCORE_MAX 新增为独立第 6 条 import（`../game/constants`），未重排既有导入。
3. **比较用 `>=` 而非 `===`**：drift.ts clamp 保证 score ≤ DRIFT_SCORE_MAX，`>=` 覆盖边界（含未来可能溢出场景），非上限分支不受影响。

### Task F7: 全量验证 + 浏览器冒烟

- [ ] 全量链：typecheck/lint/`npm test`/build/`npm run bot`（基线 76.017s/0 违规不变）
- [ ] `test-m11.py`（untracked）冒烟：N1 夜晚赛道（Digit5 canyon → 天空暗像素断言 + 车灯可见性采样 + 截图 night-track.png）、N2 对局榜（分屏双完赛 → #match-top 首行 `P1 胜` + 截图 match-top.png）、N3 触屏暂停（evaluate 触发 #pause-btn click → phase paused → #pause-resume click → racing + 截图 pause-touch.png）、N4 雨声（无法听——用 __gameDebug.rainPlaying getter 断言雨段 true/晴段 false）、N5 碰撞音（debug getter 计数）、N6 MAX 标记（注入高分场景或单测覆盖即可，冒烟可选）
- [ ] obs-2 复核截图（夜晚色调/车灯/对局榜排版/暂停按钮布局）
- [ ] 计划文档 checkbox 全勾 + 实施偏差

### Task F8: codemap 刷新 + 汇总报告

- [ ] `codemap.mjs changes` 检出差异目录
- [ ] 派 fixer 更新受影响子目录 codemap.md（engine：夜晚模式/车灯/RainSound 不在 engine——audio 目录也更新；game：对局榜/触屏暂停/雨声碰撞接线/debug getter；ui：pause-btn/match-top/MAX；tests：用例数）
- [ ] orchestrator 更新 4 聚合文档（根/src/docs/plans codemap）+ `codemap.mjs update --root ./`
- [ ] codemap 文档不提交 git（既有惯例）
- [ ] 汇总报告：commit 列表、用例数、bot 基线、冒烟/复核结论、遗留、下一步建议
