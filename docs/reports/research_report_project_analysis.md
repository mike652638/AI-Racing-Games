# AI-Racing-Games 项目深度分析报告

## 执行摘要

AI-Racing-Games 是一个用 TypeScript + Vite + Canvas 2D 从零构建的 OutRun 伪 3D 街机赛车游戏，不依赖任何 WebGL/Three.js，完全以 Canvas 2D 实现伪 3D 透视投影。项目最具辨识度的特征是"纯函数优先的领域层 + 强测试门禁"的工程模式：核心逻辑（物理、渲染、AI、结算）全部是无副作用纯函数，由 41 个测试文件 593 个用例和 9 赛道 bot 跑圈矩阵作为回归防线，已完成 M1 到 M15 共 15 个里程碑。整体架构分层清晰、依赖方向基本单向、代码注释与文档体系极其完备，是目前少见的"以测试驱动、可复现验证"驱动的游戏项目范例。

## 一、项目背景与定位

该项目名为"AI-Racing-Games"，本质上是**用于测试 OpenCode Win11 Desktop IDE 长程编程能力极限的载体工程**（主力模型 DeepSeek V4 Flash）。这意味着它的工程化水平远超一般 demo 游戏：它刻意采用 TDD 流程（先写失败测试 → 最小实现 → 集成 → 全量验证 → 提交）、确定性随机种子（mulberry32）保证场景可复现、bot 跑圈作为黑盒质量门禁、以 codemap 体系承载架构知识。

技术栈固定为：TypeScript（ES2022 / strict mode）、Vite、Canvas 2D、Vitest、tsx（bot 脚本）、ESLint（typescript-eslint）、Prettier、husky/lint-staged、vite-plugin-pwa@1.3.0（M15 起离线 PWA）。

## 二、架构总览

代码按关注点分六层，规模约 56 个源文件（src 下 48 个 ts）：

| 层 | 职责 | 核心文件与规模 |
|---|---|---|
| engine/ | 伪 3D 渲染引擎（投影、赛道、路面几何、景物、车流、烟雾、光照、玩家车） | 13 个 ts；renderer.ts 886 行最大，投影核心 projection.ts 仅 45 行 |
| physics/ | 车辆运动学与玩家输入领域层 | 3 个 ts；car.ts 77 行、drift.ts 129 行、input.ts 85 行 |
| game/ | 游戏编排层（GameLoop、状态、阶段 FSM、常量真源、模式策略、结算记账） | 19 个 ts；game-loop.ts 980 行，M15 拆分后已大幅瘦身 |
| ai/ | Bot 决策器与无头跑圈模拟器 | 2 个 ts；bot.ts 81 行、simulate.ts 111 行 |
| ui/ | HUD、启动/暂停/结算画面、存档、格式化、触屏摇杆、小地图 | 7 个 ts；hud.ts、screens.ts、save.ts 等 |
| audio/ | WebAudio 程序化合成（引擎音效、环境音、BOOST、chiptune 音乐） | 2 个 ts；engine.ts、music.ts |

**依赖方向**：engine/ 与 physics/ 为底层纯函数领域层，不依赖 DOM；game/ 依赖 engine + physics，并对 ui/ 存在运行级调用；ui/ 对 game/ 的业务类型依赖全部为 `import type`，运行时依赖仅限 `game/constants` 常量值与 gamestate/format 的 re-export 兼容层——构成一个**受限双向依赖环**（codemap 明确记录这是有意折衷：环的实质是"共享常量值层 + 兼容层"，无循环初始化问题，彻底解环留作未来可选重构）。audio/ 仅依赖外部注入的 AudioContext；ai/ 依赖 engine + physics，生产循环不直接依赖它（headless，仅被 tests 消费）。

**常量唯一真源**：`game/constants.ts`（48 行，18 个常量）被 engine/physics 反向导入，杜绝魔法数字，并有 constants.test.ts 做值断言防回潮。

## 三、核心系统深入分析

### 3.1 渲染引擎：伪 3D 投影数学

核心是 `engine/projection.ts` 的唯一纯函数 `project`（45 行），配合 `road-geometry.ts` 的 `projectSegmentQuad` 构成渲染基础：

```
dz = point.z - camera.z          // 相对相机纵深，dz <= 0 剔除
scale = depth / dz               // 近大远小的透视缩放核心
x = width/2 + scale * (point.x - camera.x) * (width/2)
y = horizon  + scale * (camera.y - point.y) * (height/2)
```

其中 `depth = width * RENDER_DEPTH_RATIO(0.84)`、`horizon = height * RENDER_HORIZON_RATIO(0.35)`。路面每段长 `SEGMENT_LENGTH = 200`，取 z 处四个世界角点投影成梯形（Quad），逐段绘制构成"近宽远窄"的连续道路；弯道由中心线横向偏移 `curveSum` 逐段累计实现左右平移。这是 OutRun 风格的经典 1/dz 投影，数学实现仅 45 行，非常凝练。

### 3.2 赛道生成与确定性

`track.ts` 提供 `createSmoothTrack(controlPoints)`：沿 z 每 200 单位生成一个 Segment，在相邻控制点间对 curve 做线性插值（四舍五入到 0.001），支持环形回绕（`trackIndexForCameraZ` O(1) 定位）与闭环约束（`totalCurve` 校验）。`tracks.ts` 维护 `TRACK_DEFS` 注册表（9 条赛道，含难度星级、圈数、车流密度 `trafficCount`、夜晚标记 `timeOfDay: 'night'`——canyon/alpine 两条）。景物、车流、远山全部由 `mulberry32` 确定性 PRNG 生成（车流 seed=777），保证同输入下场景一致，支撑 bot 可复现校验。

### 3.3 性能优化手段（M14 批次）

性能策略分三路：其一，`road-strip.ts` 按曲率差合并赛道分段为曲率段（`buildRoadStrips`），直道段预烘焙到离屏 canvas（`renderRoadStripToCanvas`），帧内 drawImage 平移复用替代逐段 drawQuad 循环；其二，每帧分配削减——`spritesInRangeIndexed` 复用数组、`viewFor` 返回 `_viewCache` 缓存对象、fillStyle 字符串缓存、`lapRef` 复用；其三，分屏/性能模式降级——`PerformanceConfig` 三档（PERF_HIGH 120 / PERF_MID 80 / PERF_LOW 60），`?perf=1` 查询参数 + skipSmoke/skipBoostParticles/skipRain 渲染开关。另有远山离屏缓存（day/night 双套）、雨滴离屏 canvas 双幅 drawImage 平铺（帧内零逐段绘制）、曲率前缀和 O(1) 偏移查询、sprites 空间索引（`spritesInRangeIndexed` 环形可见窗口查询）。

### 3.4 物理与漂移系统

`car.ts` 的 `updateCar` 是纯函数运动学核心：速度/转向/出界推进，含漂移转向注入、雨天 wet 物理（制动 ×0.7、转向 ×0.85）、BOOST 氮气突破 1.15×maxSpeed。`drift.ts` 的 `updateDrift` 是完整状态机：蓄力（charge 积累/衰减）、激活阈值、烟雾粒子生命周期、转向率 ×1.5 与速度损耗 ×0.985、得分与速度成正比，M10 起叠加连击/倍率（combo 每 0.5s 窗口累积，得分 ×(1+combo×0.25)），M12 起叠加雨天/难度加成 `scoreMultiplier`（第 7 可选尾参，雨天 +50%、难度 (★-1)×25%），并受 `DRIFT_SCORE_MAX` clamp（HUD 触顶显示 MAX）。`input.ts` 提供双人按键映射（P1 WASD+Space / P2 方向键+Enter）、`mergeCarInputs` 与触屏四分区 `touchToCarInput`。

### 3.5 游戏编排层：M15 架构重构的成果

`game-loop.ts`（M15 后 980 行）是主循环编排壳，M15 重构将每帧逻辑拆分为四个纯函数模块：

- `frame-update.ts`（271 行）：`updateFrame(dt, ctx)` 每帧更新——车流推进、输入路由、BOOST、碰撞、完赛判定、环境音效驱动，通过聚合 ctx 对象注入依赖，帧间状态经 `FrameUpdateResult` 返回值写回；
- `frame-render.ts`（139 行）：`renderFrame(dt, ctx)` 渲染分支——菜单预览/分屏/单屏三分支、小地图重建与更新、updateHud 调用；
- `frame-pure.ts`（192 行）：纯函数/常量/类型集中地（updatePlayerFrame、updateBoostCharge、viewFor、PreviewConfig、PerformanceConfig）；
- `finish-accounting.ts`（113 行）：`accountFinish` 结算记账纯函数——完赛标记、漂移胜者、胜场/漂移/对局记录，DOM 副作用留在 GameLoop。

最值得称道的是 `mode-strategy.ts`（299 行）：`ModeStrategy` 接口定义 8 个差异点（splitMode/hotseatMode/challengeMode 标志、menuHint、getInputs、updateActivePlayer、shouldUpdateP2Traffic、collisionIncludesP2、updatePlayers、shouldFinish、afterSelectP1Track），SINGLE/SPLIT/HOTSEAT/CHALLENGE 四个实例封装全部模式差异，`createModeStrategy` 工厂按互斥判定（split 优先）返回。GameLoop 内原有的散落条件分支全部收敛为 `mode.xxx()` 调用——这是策略模式消除大 if 分支的教科书级应用。

阶段管理采用四态 FSM（PHASE_MENU/RACING/PAUSED/FINISHED），`phase.ts` 仅 6 行定义常量，`phase-logic.ts`（22 行）提供 `nextPhase`/`togglePause` 纯函数。

### 3.6 AI 与无头模拟

`bot.ts`（81 行）是规则型控制器：前瞻窗口检测弯道（|Σcurve| 阈值），弯道降速 + 横向回中转向，配置经 `createBotConfig` 参数化。`simulate.ts`（111 行）是确定性无头跑圈引擎 `simulateLaps`：固定步长驱动 bot 决策 → 车辆物理 → 赛道分段 → 违规检测的完整链路，M15 起支持 `withTraffic` 车流模式（含 collisions 计数）。

### 3.7 UI 表现层

HUD 采用"render-as-function-of-state"模式：`HudElements` 接口聚合全部 DOM 引用（构造期一次性查询），`updateHud` 每帧以 RaceState 为输入同步 P1/P2 文本，双人显隐（splitMode、热座当前玩家标签、BEST 三套逻辑）统一处理。`screens.ts` 的 `applyPhaseToScreens` 按阶段四态切换启动/暂停/结算画面，`FinishPanelOptions` 9 字段驱动多模式结算填充（完赛标记、热座快照、分屏漂移竞速横幅、胜场统计、挑战分支）。存档 `save.ts` 设计统一：最佳时间 `outrun-pseudo3d-best-{trackId}{-p2}`（P2 用 -p2 key）、胜场统计（模式独立 key + 连胜）、漂移 TOP10（跨玩家，M13 起条目含 combo 连击字段、旧条目兼容）、分屏对局最近 10 局。

### 3.8 音频合成

零外部资源的 WebAudio 程序化合成。`engine.ts` 提供 EngineSound（引擎）、RainSound（雨段循环噪声）、CollisionSound（碰撞冲击音，80ms 防刷屏、play(volume) 强度分级）、BoostSound（200→600Hz 扫频）、DriftSound（M15 漂移摩擦声，bandpass 噪声 + 强度调制）、TireSound（M15 轻量胎噪，lowpass 噪声封顶 0.02）；`music.ts` 的 MusicPlayer 调度器纯函数化（`stepEvents`/`nextStep` 导出可单测）。M12 起 masterGain 下挂 musicGain/sfxGain 分轨音量，与三 slider 持久化联动。

## 四、测试与验证体系

项目建立了**三层质量门禁**，每里程碑验收必须 typecheck + lint + test + build + bot 全绿：

1. **白盒单测**：41 个测试文件 593 用例（Vitest），覆盖 src 全部六大目录。亮点是 canvas mock 基建（`tests/__mocks__/canvas.ts` 提供 `__calls`/`__args` 调用记录机制）与真实 GameLoop 集成冒烟（`game-loop-integration.test.ts` 通过 stub 全局 DOM/rAF/AudioContext 驱动真实帧循环，47 个 it 用例，覆盖阶段流转、分屏、热座、9 赛道、暂停菜单、挑战模式等）。确定性种子测试、多帧状态机测试、中文行为规格命名（测试兼具行为文档作用）也是鲜明特色。
2. **黑盒 bot 跑圈**：`tests/bot/run-bot.ts` 遍历 TRACK_DEFS 全部 9 条赛道按各自圈数调用 simulateLaps，输出 JSON 报告（圈速/平均速度/违规数/出界时间），全部赛道 `finished && violations <= 3` 才退出码 0。
3. **工程化校验**：ESLint（typescript-eslint）、Prettier、husky + lint-staged（提交前自动 eslint --fix + prettier --write）、tsc --noEmit、vite-plugin-pwa 离线构建（sw.js/manifest.webmanifest/registerSW.js 产物）。

**覆盖强弱项评估**：强项——领域层纯函数（投影、漂移、车流、光照、格式化、音频合成）覆盖极其充分且断言精确；集成冒烟覆盖了真实主循环的复杂交互。可观察到的薄弱点：renderer.ts 仅通过 renderer-state.test.ts 做状态级验证（33 个 it），未逐像素比对渲染输出（这受限于 mock 基建，是合理的取舍）；bot 跑圈矩阵判定容忍 violations <= 3，对轻微越界有一定容差；`game-loop-integration.test.ts` 的「分屏双人完赛」用例需 testTimeout 放宽至 15000ms（文档记录为既有脆弱性，默认 5000ms 偶发超时）。

## 五、工程化实践与文档体系

工程化已达到专业水准：CI 工程化（eslint/prettier/husky/lint-staged）、PWA 离线发布、三档性能模式。文档体系是另一个强项——根目录与每个子目录都有 codemap.md（职责/设计/流程/集成/文件清单），docs/ 下 19 份文档构成完整演进档案：15 份里程碑计划（M4-M15，均按 superpowers writing-plans 约定：Goal/Architecture/Tech Stack/Global Constraints + Task checkbox + Files/Interfaces/TDD 步骤）、视觉分析、UI 优化方案。每份新计划承诺对既有 API 向后兼容（"现有 API 只做加法"），形成可追溯的工程契约。所有回复与注释用中文（代码/命令/标识符保留英文）。

## 六、综合分析

**架构优势**：其一，纯函数优先设计让游戏核心完全可单测、可无头运行，bot 跑圈矩阵是游戏项目罕见的黑盒回归手段；其二，M15 的策略模式与纯函数拆分成功控制了 game-loop.ts 的复杂度（938→722 行），模式差异隔离清晰；其三，常量唯一真源 + 确定性生成 + 中文行为规格测试，三重机制共同保证长期演进安全；其四，M14 的性能优化（离屏缓存、空间索引、每帧分配削减）体现了对 60fps 目标的认真对待，且均有测试锚定（如雨滴离屏"帧内零 stroke"断言）。

**代码质量观察**：总体整洁度很高，但存在几个可探讨的点：game-loop.ts 仍达 980 行，虽已拆分但仍是全项目最大单文件；renderer.ts 886 行承载全部渲染编排，后续若继续扩展建议再拆（如天气/分屏/车流渲染子模块）；`game↔ui` 双向依赖环是明确记录的有意折衷，未来若引入独立共享模块层可彻底解环；debug-hook.ts（114 行）暴露 19 个 window.__gameDebug getter 供测试断言，是巧妙的测试钩子，但也增加了生产运行时负担（可考虑条件编译）。bot 判定对 violations 的容差、分屏双人完赛用例的超时放宽，属于已记录的已知折衷。

## 七、结论

AI-Racing-Games 不是普通的 demo 游戏，而是一个工程方法论完备的验证性项目。它用 15 个里程碑证明了：纯函数领域层 + 确定性生成 + 三层测试门禁（typecheck/lint/test、单测、bot 黑盒）的组合，可以在无人值守的 agent 驱动开发模式下稳定地长程演进。其架构分层（engine/physics 纯函数底层、game 编排中层、ui/audio 表现层、ai 独立模拟层）、常量唯一真源、mode-strategy 策略模式、codemap 知识体系，都是可复用的工程样板。若未来继续演进，最优先的建议是：将常量层提升为独立共享模块解掉 game↔ui 双向环、按渲染关注点拆分 renderer.ts、以及把 M15 已完成的"每里程碑全量验证"固化为 CI pipeline 自动执行（当前 CI workflow 已在 M15 规划中，可确认落地状态）。

## 八、局限性

本报告基于静态代码阅读与 codemap/计划文档分析，未实际运行 `npm run dev` 进行浏览器实测（游戏运行时的帧率、PWA 离线可用性、移动端触控体验等运行时维度未验证）；renderer 的逐像素渲染正确性依赖 mock 断言而非视觉确认；bot 圈速数据引用自 README 示例（24.55s 等），未在当前环境重跑 `npm run bot` 验证最新 9 赛道圈速。如需更全面的结论，可补充运行实测与性能采样。

## 九、参考资料

1. [AGENTS.md（项目规范）](AGENTS.md)
2. [README.md（快速开始与里程碑状态）](README.md)
3. [codemap.md（仓库总览）](codemap.md)
4. [src/codemap.md（源码目录总览）](src/codemap.md)
5. [tests/codemap.md（测试体系全景）](tests/codemap.md)
6. [docs/codemap.md（计划档案目录）](docs/codemap.md)
7. [src/game/codemap.md](src/game/codemap.md)
8. [src/engine/codemap.md](src/engine/codemap.md)
9. [src/physics/codemap.md](src/physics/codemap.md)
10. [src/ui/codemap.md](src/ui/codemap.md)
11. [src/audio/codemap.md](src/audio/codemap.md)
12. [src/ai/codemap.md](src/ai/codemap.md)
