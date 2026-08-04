# AI-Racing-Games 项目深度分析报告（M17 状态，2026-08-05 实测复核）

## 执行摘要

AI-Racing-Games 是一个用 TypeScript + Vite + Canvas 2D 从零构建的 OutRun 伪 3D 街机赛车游戏，不依赖任何 WebGL/Three.js，全部渲染由 Canvas 2D 的 1/dz 透视投影完成。项目的本质是用于测试 OpenCode Win11 Desktop IDE 长程编程能力极限的载体工程（主力模型 DeepSeek V4 Flash），因此其工程化水准远超一般 demo：纯函数优先的领域层、确定性随机种子、三层质量门禁与 codemap 文档体系共同构成可复现、可追溯的长程演进机制。截至本次复核，项目已完成 M1 至 M17 共 17 个里程碑，实测 typecheck、lint、44 文件 639 用例单测、9 赛道 bot 跑圈矩阵（0 违规）全部通过，处于全绿可发布状态。整体架构分层清晰、依赖方向基本单向、文档体系极其完备，是目前少见的以"测试驱动 + 黑盒复现验证"为硬约束的游戏项目范例。

## 一、项目背景与定位

该项目名为 "AI-Racing-Games"，本质是**用于压力测试 AI IDE 长程无人值守编程能力的验证性工程**。AGENTS.md 明确记载：技术栈固定为 TypeScript（ES2022 / strict mode）、Vite、Canvas 2D、Vitest、tsx（bot 脚本）、ESLint（typescript-eslint）、Prettier、husky/lint-staged、vite-plugin-pwa@1.3.0（M15 起离线 PWA）。

这种定位直接塑造了项目形态：它刻意采用 TDD 流程（先写失败测试 → 最小实现 → 集成 → 全量验证 → 提交）、确定性随机种子（mulberry32）保证场景可复现、bot 跑圈作为黑盒质量门禁、以 codemap 体系承载架构知识。每个里程碑的验收标准被固化为"typecheck + lint + test + build + bot 全绿"，且新增功能必须对既有 API 向后兼容（计划文档中的"现有 API 只做加法"契约）。

本次复核（2026-08-05）的实际验证结果：`npm run typecheck` 零错误、`npm run lint` 零告警、`npm test` 44 个测试文件 639 用例全部通过（耗时约 30 秒）、`npm run bot` 9 条赛道全部 `finished` 且 `violations = 0`（退出码 0）。项目的 CI workflow（.github/workflows/ci.yml）固化了 typecheck → lint → format:check → test → bot → build 的串行主流水线，以及独立运行的 Playwright e2e 视觉回归 job。

## 二、架构总览

代码按关注点分六层，src 下共约 49 个 TypeScript 源文件：

| 层 | 职责 | 规模与核心文件 |
|---|---|---|
| engine/ | 伪 3D 渲染引擎：投影、赛道生成、路面几何、景物、车流、烟雾、光照、环境配置、玩家车 | 14 个 ts；renderer.ts 最大（渲染门面），projection.ts 仅 45 行 |
| physics/ | 车辆运动学、漂移系统、输入规范化 | 3 个 ts；car.ts、drift.ts、input.ts 均 100 行以内 |
| game/ | 游戏编排：GameLoop、RaceState、阶段 FSM、常量真源、模式策略、结算记账、碰撞 | 20 个 ts；game-loop.ts 为编排壳 |
| ai/ | Bot 决策器与无头跑圈模拟器 | 2 个 ts；bot.ts、simulate.ts |
| ui/ | HUD、屏幕、存档、格式化、文案、摇杆、小地图 | 8 个 ts |
| audio/ | WebAudio 程序化合成：引擎/雨声/碰撞/BOOST/漂移摩擦/胎噪/音乐 | 2 个 ts；engine.ts、music.ts |

**依赖方向**：engine/ 与 physics/ 为底层纯函数领域层，不依赖 DOM、浏览器事件或全局状态；game/ 依赖 engine + physics，并对 ui/ 存在运行级调用；ui/ 对 game/ 的业务类型依赖全部为 `import type`（RaceState/TrackContext），运行时依赖仅限 game/constants 常量值与 gamestate/format 的 re-export 兼容层——构成 codemap 明确记录的**受限双向依赖环**（有意折衷：环的实质是"共享常量值层 + 兼容层"，无循环初始化问题，彻底解环留作未来可选重构）。audio/ 仅依赖外部注入的 AudioContext；ai/ 依赖 engine + physics，生产循环不直接消费它（headless，仅被 tests/bot 与单测使用）。

**常量唯一真源**：game/constants.ts 集中全部 18 个游戏参数（DRIFT_*、CHALLENGE_*、BOOST_*、COLLISION_*、RENDER_*、ROAD_*、TRAFFIC_DEFAULT_COUNT），engine/physics 反向导入杜绝魔法数字，并有 constants.test.ts 注册表断言防回潮。**注意**：实测当前代码中 `TRAFFIC_DEFAULT_COUNT = 14`，而 README 与部分 codemap 记载的默认值为 8，文档与代码存在偏差（详见综合分析）。

**关键设计模式**：纯函数领域层、RaceState 集中可变状态容器（每帧读改写同一对象）、Renderer 门面 + RenderView 多视图参数化（分屏双世界零重建）、TrackContext 双世界建模（分屏 = 两个独立赛道世界）、TrackManager 双玩家依赖注入、ModeStrategy 策略对象（四模式差异封装）、四态阶段 FSM（menu/racing/paused/finished）、确定性 PRNG（mulberry32）、离屏缓存（远山 day/night 双套、雨丝、road-strip 曲率段）。

## 三、核心系统深入分析

### 3.1 渲染引擎：伪 3D 投影数学与性能优化

核心是 engine/projection.ts 的唯一纯函数 `project`：`scale = depth / (z - camera.z)`、`x = width/2 + scale*(x - camera.x)*(width/2)`、`y = horizon + scale*(camera.y - y)*(height/2)`，相机后方或平齐的点返回 null。其中 `depth = width * RENDER_DEPTH_RATIO(0.84)`、`horizon = height * RENDER_HORIZON_RATIO(0.35)`。路面以每段 SEGMENT_LENGTH=200 世界单位分段，`projectSegmentQuad` 将四角点投影为梯形逐段绘制，弯道由中心线横向偏移 curveSum 逐段累计实现，是 OutRun 风格的经典 1/dz 投影，数学实现极凝练。

渲染采用画家算法分层：天空 → 远山（离屏缓存 + 视差平铺）→ 草地 → 路面分段（远→近）→ 景物（远→近，空间索引）→ 车流（远→近排序）→ 烟雾 → BOOST 尾焰 → 雨丝 overlay。光照由 `updateLighting` 统一处理：120 秒昼夜四段 HSL 插值 + 45 秒晴/阴/雨三态天气循环（阴/雨降饱和压暗）+ 赛道级夜晚模式（night 锁定深暗色板）三套管线组合。

性能优化已形成体系：其一，M14 的 road-strip.ts 按曲率差阈值将赛道分段合并为曲率段，直道段预烘焙到离屏 canvas 后帧内 drawImage 平移复用，替代逐段 drawQuad 循环；其二，曲率前缀和（Float64Array）提供 O(1) 累计偏移查询，sprites 空间索引按段分组实现环形可见窗口 O(候选段数) 查询；其三，雨滴预渲染到离屏 canvas 双幅 drawImage 平铺（帧内零逐段 stroke）；其四，三档性能模式（PERF_HIGH 120 段全特效 / PERF_MID 分屏 80 段 / PERF_LOW 60 段 + skipSmoke/skipBoostParticles/skipRain 开关），`?perf=1` 查询参数触发，与 split 模式共存时不互斥。

### 3.2 赛道系统与环境差异化（M17 最新）

赛道由 `createSmoothTrack(controlPoints)` 生成：沿 z 每 200 单位一个 Segment，相邻控制点间曲率线性插值（四舍五入到 0.001），支持环形 O(1) 定位与闭环约束（totalCurve）。tracks.ts 维护 TRACK_DEFS 注册表，当前 9 条赛道（classic/highway/s-curve/island/canyon/desert/forest/coast/alpine），每条含难度星级（1-3）、圈数、车流密度 trafficCount、可选夜晚标记 timeOfDay（canyon/alpine 为 'night'）与 M17 新增的必选 environment 字段。

M17 是本项目最近的架构级扩展，其成果集中在 engine/environment.ts：9 种环境（plains/highway/s-curve/island/canyon/desert/forest/coast/alpine）的单一真源配置，每个 EnvironmentProfile 定义天空色相、草地色相/饱和度/明度、远山 day/night 配色、景物类型与密度、树冠配色与可选地形装饰（沙漠 dunes / 海岸 sea / 峡谷 rock）。渲染层按环境差异化：光照色板（updateLighting 第 5 参）、远山缓存按环境懒重建、景物形状分发（SpriteKind 扩展 cactus/palm/snowpile + rotation 随机化 + 沙漠小仙人掌 scale 0.5）、地形装饰绘制（沙丘/海面波浪/岩壁锯齿顶线）。environment.test.ts 单测锚定了 plains 零回归与各环境差异（如 desert 草地偏黄、coast 天空偏蓝）。

### 3.3 物理与漂移系统

car.ts 的 `updateCar` 是纯函数运动学核心：油门/刹车/滑行分支、转向灵敏度随速度线性缩放、出界钳制并施加减速，支持 `turnRateOverride` 参数注入漂移有效转向率（×1.5）、wet 雨天物理（制动 ×0.7、转向 ×0.85）、BOOST 氮气分支（突破 maxSpeed 至 1.15×）。drift.ts 的 `updateDrift` 是完整纯函数状态机（不修改入参、返回新状态）：蓄力积累/衰减、激活阈值、烟雾粒子生命周期、得分与速度成正比并受 DRIFT_SCORE_MAX(99999) clamp，M10 起叠加连击/倍率（combo 每 0.5s 窗口累积，得分 ×(1+combo×0.25)，上限 10 档），M13 H1 起支持第 7 尾参 scoreMultiplier 挑战加成（雨天 +50%、难度 (★-1)×25%）。input.ts 提供双人按键映射（P1 WASD+Space / P2 方向键+Enter）与触屏四分区 touchToCarInput，M12 起条件产出 boost 字段。

### 3.4 游戏编排层：M15 架构重构的成果与最新演进

M15 是项目最重要的架构重构里程碑，将 game-loop.ts 从 938 行降至约 722 行，拆出四个纯函数模块：frame-update.ts（每帧更新段，聚合 ctx 依赖注入 + FrameUpdateResult 帧间状态写回）、frame-render.ts（渲染三分支）、frame-pure.ts（纯函数/常量/类型集中地：updatePlayerFrame、updateBoostCharge、viewFor、PerformanceConfig）、finish-accounting.ts（结算记账纯函数）。最值得称道的是 mode-strategy.ts 的 ModeStrategy 策略对象：接口定义八个差异点（getInputs/updateActivePlayer/shouldUpdateP2Traffic/collisionIncludesP2/updatePlayers/shouldFinish/afterSelectP1Track/menuHint），SINGLE/SPLIT/HOTSEAT/CHALLENGE 四个实例封装全部模式差异，createModeStrategy 工厂按 URL 互斥判定（split 优先）返回——这是策略模式消除大 if 分支的教科书级应用，GameLoop 内散落的模式分支全部收敛为 mode.xxx() 调用。

M16 起新增碰撞反馈系统：collision-feedback.ts 提供碰撞红闪纯函数状态机（updateCollisionFlash 命中重置 + 指数衰减 exp(-6·dt)，flashSeedFromSpeedRatio 速度比映射），渲染层 drawCollisionVignette 屏幕红晕 + HUD #hud-collision 碰撞计数 + 双层碰撞音强度分级 + 横向弹开防贴车；同时引入 copy.ts 文案唯一真源（倒计时提示与 README 同源，copy.test.ts 读取 README 原文断言关键词一致防漂移）与 shouldScheduleNextFrame 帧循环调度契约纯函数。

四种游玩模式支撑完整：单屏（默认）、分屏（`?split=1`，两个独立 TrackContext 世界 + renderRegion 双区域 + drawDivider 分隔线，P1/P2 独立选赛道独立存档）、热座（`?hotseat=1`，双人先后跑同赛道，回车交棒，输入路由到当前回合玩家）、挑战（`?challenge=1`，60 秒限时刷漂移分，CHALLENGE_TARGET_SCORE=5000 达标判定，与漂移 TOP10 联动）。

### 3.5 AI 与无头模拟

bot.ts（81 行）是规则型控制器：对前方 lookAheadSegments 段做环形曲率求和（aheadCurve），|Σcurve| 超阈值判定弯道并提前降速（cornerSpeedFactor），转向采用横向偏移比例纠偏（-position*steerGain）并 clamp。simulate.ts（111 行）是确定性无头跑圈引擎 simulateLaps：固定步长 dt（默认 1/60）驱动 bot 决策 → updateCar 物理 → 分段导航 → 违规检测的完整链路，输出圈速/里程/出界违规等可断言指标，maxSteps 防止死循环。这个组合使得"bot 跑圈矩阵"成为游戏项目罕见的黑盒回归手段——本次实测 9 条赛道全部完赛 0 违规，且每圈用时稳定（如 classic 三圈 26.083/51.05/76.017 秒，island 平均速度最高 5188.7）。

### 3.6 UI 表现层

HUD 采用"render-as-function-of-state"模式：HudElements 接口聚合全部 DOM 引用（构造期一次性查询），updateHud 每帧以 RaceState 为输入同步双人文本，P2 元素显隐、热座玩家标签（hudPlayerTag）、双人 BEST、漂移连击倍率与得分 MAX 标记统一处理。screens.ts 的 applyPhaseToScreens 按阶段四态切换屏幕，FinishPanelOptions 九字段驱动多模式结算填充（完赛标记、热座快照、分屏漂移竞速横幅、胜场统计、挑战分支）。存档 save.ts 设计统一且兼容性强：最佳时间按玩家维度 key（P2 用 -p2 后缀）、胜场统计（hotseat/split 独立 key + 连胜）、漂移 TOP10（跨玩家，M13 起条目含可选 combo 连击字段、旧条目兼容不丢）、分屏对局最近 10 局（unshift + 截断）。M14 起新增 Minimap 小地图/赛道进度指示器（构造时预计算轨迹折线并归一化，每帧按 cameraZ % lapLength 重绘玩家位置点）。

### 3.7 音频合成

零外部资源的 WebAudio 程序化合成，依赖注入 + 惰性创建（首次按键满足浏览器自动播放策略）。engine.ts 提供 EngineSound（双锯齿波 + 低通滤波引擎声）、RainSound（白噪声循环 + bandpass 雨声，幂等 start/stop）、CollisionSound（碰撞冲击音，80ms 防刷屏，play(volume) 按速度强度分级）、BoostSound（sawtooth 200→600Hz 扫频氮气音）、DriftSound（M15 漂移摩擦声，bandpass 噪声 + setIntensity 强度调制）、TireSound（M15 轻量胎噪，lowpass 噪声封顶 0.02）；music.ts 的 MusicPlayer 用 RAF 30Hz 固定步长 + 0.2s 前瞻调度实现 16 步 chiptune 循环，调度逻辑纯函数化（stepEvents/nextStep 可单测）。M12 起 masterGain 总控下挂 musicGain/sfxGain 分轨，与暂停菜单三 slider 持久化联动。

## 四、测试与验证体系

项目建立了**四层质量门禁**，本次全部实测通过：

1. **静态校验**：typecheck（tsc --noEmit，strict + noUnusedLocals/noUnusedParameters/noFallthroughCasesInSwitch）、ESLint（typescript-eslint）、Prettier format:check——零错误零告警。
2. **白盒单测**：44 个测试文件 639 用例（本次实测 30.10s 全绿）。亮点是 canvas mock 基建（tests/__mocks__/canvas.ts 提供 __calls/__args 调用记录机制，支撑"渲染输出确实发生且稳定"类断言，如夜晚车灯 arc 增量、雨滴离屏"帧内零 stroke"）与 game-loop-integration.test.ts 的真实主循环集成冒烟（stub 全局 DOM/rAF/AudioContext 驱动真实 GameLoop，覆盖阶段流转、分屏、热座、9 赛道、暂停菜单、挑战模式、雨段环境音等）。中文行为规格命名使测试兼具行为文档作用。
3. **黑盒 bot 跑圈**：tests/bot/run-bot.ts 遍历 TRACK_DEFS 全部 9 条赛道按各自圈数调用 simulateLaps，输出 JSON 报告，全部赛道 finished 且 violations ≤ 3 才退出码 0——本次实测 9/9 完赛、0 违规。
4. **E2E 视觉回归**：M16 起 Playwright（桌面 1280×720 + 移动横屏 812×375 双 project，CI 独立 job 自动拉起 vite dev server），覆盖菜单光晕、标题叠影、天空条纹（canvas 像素级 maxDelta < 60）、倒计时提示同源、热座 HUD 标签、移动端视口等视觉缺陷防回归。

**覆盖强弱项评估**：强项——领域层纯函数（投影、漂移、车流、光照、格式化、音频合成）覆盖极其充分且断言精确，集成冒烟覆盖了真实主循环的复杂交互。可观察到的薄弱点——renderer.ts 仅做状态级验证未逐像素比对（受 mock 基建限制的合理取舍）；bot 判定容忍 violations ≤ 3；game-loop-integration 的「分屏双人完赛」用例需 testTimeout 放宽至 15000ms（文档记录为既有脆弱性）。

## 五、工程化实践与文档体系

工程化达到专业水准：CI workflow（typecheck → lint → format:check → test → bot → build 串行 + e2e 独立 job + 失败产物上传）、PWA 离线发布（vite-plugin-pwa generateSW + autoUpdate，manifest 含 maskable 图标）、husky + lint-staged 提交前自动 eslint --fix + prettier --write、三档性能模式、OG 协议微信分享卡片 meta（部署后注入正式域名）。

文档体系是另一大强项：根目录与每个子目录（src/、engine/、physics/、game/、ai/、ui/、audio/、tests/、docs/）都有 codemap.md（职责/设计/流程/集成/文件清单），docs/ 下 19 份计划文档构成完整演进档案，均按 superpowers writing-plans 约定（Goal/Architecture/Tech Stack/Global Constraints + Task checkbox + Files/Interfaces/TDD 步骤）。每份新计划承诺对既有 API 向后兼容，形成可追溯的工程契约。docs/reports/ 下还沉淀了 10 份专题研究报告（碰撞反馈、环境差异化、运行时实测、道路优化等），本次分析即延续该档案体系。

## 六、M16/M17 最新演进分析

相比 docs/reports/research_report_project_analysis.md（M15 状态旧报告），M16/M17 两个里程碑带来以下增量：

M16 的主题是"运行时实测修复 + 碰撞反馈增强"：修复了天空条纹、热座 P2 渲染/RAF 链断裂、菜单光晕、移动端适配等真实运行时问题；新增碰撞红闪 vignette（屏幕红晕）、HUD 碰撞计数、双层碰撞音强度分级与横向弹开防贴车；道路视觉升级为 9 带横向渐变 + 颗粒噪点 + shadeColor；倒计时提示与 README 文案同源（copy.ts 防漂移）；帧循环调度契约纯函数化（shouldScheduleNextFrame）；并引入 Playwright 视觉回归建立防回归网。

M17 的主题是"环境差异化"：TrackDef 新增必选 environment 字段 + environment.ts 环境配置唯一真源（9 种环境）；SpriteKind 扩展 cactus/palm/snowpile 并支持 rotation 随机化与 scale 缩放；地形装饰扩展（沙漠沙丘、海岸海面波浪、峡谷岩壁锯齿顶线）；远山缓存按环境懒重建。配套 environment.test.ts 单测锚定 plains 零回归与各环境差异。

这两个里程碑展示了项目的迭代风格：架构级改动（M15/M17）与运行时打磨（M16）交替推进，每次改动都配套单测锚点与文档同步，验证体系始终跟住代码演进。

## 七、综合分析

**架构优势**：其一，纯函数优先设计让游戏核心完全可单测、可无头运行，bot 跑圈矩阵是游戏项目罕见的黑盒回归手段；其二，M15 的策略模式与纯函数拆分成功控制了 game-loop.ts 的复杂度，四模式差异隔离清晰；其三，常量唯一真源 + 确定性生成 + 中文行为规格测试三重机制共同保证长期演进安全；其四，性能优化（离屏缓存、空间索引、每帧分配削减、三档性能模式）体现了对 60fps 目标的认真对待，且均有测试锚定。

**代码质量观察与可改进点**：其一，文档与代码存在偏差——TRAFFIC_DEFAULT_COUNT 实测为 14，但 README 与 codemap 多处记载默认 8，建议统一刷新；其二，game-loop.ts 仍是全项目最大单文件（虽已从 938 行降至 700+ 行，但 M16/M17 新增功能使其有回升趋势）；其三，renderer.ts（880+ 行）承载全部渲染编排，未来若继续扩展建议按关注点再拆（天气/分屏/车流渲染子模块）；其四，game↔ui 双向依赖环是明确记录的有意折衷，未来若引入独立共享模块层可彻底解环；其五，debug-hook.ts 暴露 19 个 window.__gameDebug getter 供测试断言，是巧妙的测试钩子，但也增加了生产运行时负担（可考虑条件编译）；其六，bot 判定对 violations 的容差、分屏双人完赛用例的超时放宽，属于已记录的已知折衷。

## 八、结论

AI-Racing-Games 不是普通的 demo 游戏，而是一个工程方法论完备的验证性项目。它用 17 个里程碑证明了：纯函数领域层 + 确定性生成 + 四层测试门禁（typecheck/lint、单测、bot 黑盒、e2e 视觉回归）的组合，可以在无人值守的 agent 驱动开发模式下稳定地长程演进。其架构分层（engine/physics 纯函数底层、game 编排中层、ui/audio 表现层、ai 独立模拟层）、常量唯一真源、mode-strategy 策略模式、codemap 知识体系，都是可复用的工程样板。截至 2026-08-05 实测，项目 typecheck/lint/639 单测/9 赛道 bot 矩阵全绿，处于稳定可发布状态。若未来继续演进，最优先的建议是：统一刷新文档中的常量偏差、将常量层提升为独立共享模块解掉 game↔ui 双向环、按渲染关注点拆分 renderer.ts、以及继续沿"架构级改动 + 运行时打磨交替"的节奏推进。

## 九、局限性

本报告基于静态代码阅读、codemap/计划文档分析与实际运行验证命令（typecheck/lint/test/bot 已实测通过），但未实际启动 `npm run dev` 进行浏览器人工游玩实测，也未运行 `npm run test:e2e`（Playwright 需先安装 chromium）与 `npm run build`（PWA 构建）。因此游戏运行时的帧率、PWA 离线可用性、移动端触控体验、e2e 视觉断言等运行时维度为推断而非实测。bot 圈速数据来自本次实测运行（classic 三圈 76.017s 等），与 README 示例（24.55s 等）不一致，说明 README 示例为早期版本数据，建议刷新。

## 十、参考资料

1. [AGENTS.md（项目规范）](AGENTS.md)
2. [README.md（快速开始与里程碑状态）](README.md)
3. [codemap.md（仓库总览）](codemap.md)
4. [src/codemap.md（源码目录总览）](src/codemap.md)
5. [src/engine/codemap.md](src/engine/codemap.md)
6. [src/game/codemap.md](src/game/codemap.md)
7. [src/physics/codemap.md](src/physics/codemap.md)
8. [src/ai/codemap.md](src/ai/codemap.md)
9. [src/ui/codemap.md](src/ui/codemap.md)
10. [src/audio/codemap.md](src/audio/codemap.md)
11. [tests/codemap.md（测试体系全景）](tests/codemap.md)
12. [docs/codemap.md（计划档案目录）](docs/codemap.md)
13. [docs/reports/research_report_project_analysis.md（M15 状态旧版分析）](docs/reports/research_report_project_analysis.md)
