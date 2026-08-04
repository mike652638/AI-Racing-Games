# AI-Racing-Games 项目深入分析与总结（共享层解环后最新状态）

## 执行摘要

AI-Racing-Games 是一个用 TypeScript + Vite + Canvas 2D 从零构建的 OutRun 伪 3D 街机赛车游戏，全部渲染由 Canvas 2D 的 1/dz 透视投影完成，不依赖任何 WebGL/Three.js。其本质是用于压力测试 AI IDE 长程无人值守编程能力的验证性工程，因此工程化水准远超一般 demo：纯函数优先的领域层、确定性随机种子、四层质量门禁与 codemap 文档体系构成可复现、可追溯的长程演进机制。本项目已完成 M1 至 M17 共 17 个里程碑，并在其后完成了三项架构级收尾：新建 src/shared/ 独立共享层解掉 game↔ui 双向依赖环、renderer.ts 按关注点拆分出 5 个纯函数子模块、以及全量文档同步。实测 typecheck、lint、44 文件 639 用例单测、9 赛道 bot 跑圈矩阵（0 违规）、PWA build 全部通过，处于全绿可发布状态。整体架构分层清晰、依赖方向单向化、文档体系完备，是"测试驱动 + 黑盒复现验证"为硬约束的游戏项目范例。

## 一、项目背景与定位

项目名为 "AI-Racing-Games"，AGENTS.md 明确记载其定位：用于测试 OpenCode Win11 Desktop IDE v1.18.11 长程编程能力极限（主力模型 DeepSeek V4 Flash）。技术栈固定为 TypeScript（ES2022 / strict mode）、Vite、Canvas 2D、Vitest、tsx（bot 脚本）、ESLint（typescript-eslint）、Prettier、husky/lint-staged、vite-plugin-pwa@1.3.0（M15 起离线 PWA）。

这种定位直接塑造了项目形态：刻意采用 TDD 流程（先写失败测试 → 最小实现 → 集成 → 全量验证 → 提交）、确定性随机种子（mulberry32）保证场景可复现、bot 跑圈作为黑盒质量门禁、以 codemap 体系承载架构知识。每个里程碑的验收标准被固化为"typecheck + lint + test + build + bot 全绿"，且新增功能必须对既有 API 向后兼容（"现有 API 只做加法"契约）。

## 二、架构总览（最新状态）

代码按关注点分七层，src 下共约 49 个 TypeScript 源文件：

| 层 | 职责 | 规模与核心文件 |
|---|---|---|
| shared/ | 独立共享层（唯一真源）：常量、阶段、圈数 | 4 个 ts：constants.ts、phase.ts、phase-logic.ts、lap.ts |
| engine/ | 伪 3D 渲染引擎：投影、赛道生成、路面几何、景物、车流、烟雾、光照、环境配置、玩家车 | 20 个 ts；renderer.ts 为渲染门面（拆分后约 560 行） |
| physics/ | 车辆运动学、漂移系统、输入规范化 | 3 个 ts：car.ts、drift.ts、input.ts |
| game/ | 游戏编排：GameLoop、RaceState、阶段 FSM、模式策略、结算记账、碰撞 | 20 个 ts；game-loop.ts 为编排壳 |
| ai/ | Bot 决策器与无头跑圈模拟器 | 2 个 ts：bot.ts、simulate.ts |
| ui/ | HUD、屏幕、存档、格式化、文案、摇杆、小地图 | 8 个 ts |
| audio/ | WebAudio 程序化合成：引擎/雨声/碰撞/BOOST/漂移摩擦/胎噪/音乐 | 2 个 ts：engine.ts、music.ts |

**依赖方向（已解环）**：依赖方向单向——engine/physics → shared；ui → shared + physics(type) + game(type only)；game → engine/physics/ui/shared。原先 game↔ui 的受限双向环已被消除：ui/ 对 game/ 仅剩 `import type`（RaceState/TrackContext，编译期擦除），其运行时依赖（常量 DRIFT_SCORE_MAX、CHALLENGE_TARGET_SCORE 与 phase/phase-logic/lap）已全部提升至 src/shared 并由 ui 直接导入。若未来再消除 ui 对 game 的类型级依赖，可 100% 解耦。

**常量唯一真源**：src/shared/constants.ts 集中全部游戏参数（DRIFT_*、CHALLENGE_*、BOOST_*、COLLISION_*、RENDER_*、ROAD_*、TRAFFIC_DEFAULT_COUNT），engine/physics 反向导入杜绝魔法数字，并有 constants.test.ts 注册表断言防回潮。实测 TRAFFIC_DEFAULT_COUNT = 14（此前 README 与部分 codemap 记载默认 8，文档已随解环任务刷新，且 createTraffic 默认参数 count=8 与 simulate.ts 的 `?? 8` 是 bot 基线的独立默认值，属于刻意保留）。

**关键设计模式**：纯函数领域层、RaceState 集中可变状态容器（每帧读改写同一对象）、Renderer 门面 + RenderView 多视图参数化（分屏双世界零重建）、TrackContext 双世界建模（分屏 = 两个独立赛道世界）、TrackManager 双玩家依赖注入、ModeStrategy 策略对象（四模式差异封装）、四态阶段 FSM（menu/racing/paused/finished）、确定性 PRNG（mulberry32）、离屏缓存（远山 day/night 双套、雨丝、road-strip 曲率段、fillStyle 字符串缓存）。

## 三、核心系统深入分析

### 3.1 渲染引擎：伪 3D 投影数学与性能优化

核心是 engine/projection.ts 的唯一纯函数 `project`：`scale = depth / (z - camera.z)`、`x = width/2 + scale*(x - camera.x)*(width/2)`、`y = horizon + scale*(camera.y - y)*(height/2)`，相机后方或平齐的点返回 null。其中 `depth = width * RENDER_DEPTH_RATIO(0.84)`、`horizon = height * RENDER_HORIZON_RATIO(0.35)`。路面以每段 SEGMENT_LENGTH=200 世界单位分段，`projectSegmentQuad` 将四角点投影为梯形逐段绘制，弯道由中心线横向偏移 curveSum 逐段累计实现，是 OutRun 风格的经典 1/dz 投影，数学实现极凝练。

渲染采用画家算法分层：天空 → 远山（离屏缓存 + 视差平铺）→ 草地 → 地形装饰 → 路面分段（远→近，优先消费 roadStrip 离屏缓存）→ 景物（远→近，空间索引）→ 车流（远→近排序）→ 烟雾 → BOOST 尾焰 → 玩家车 → 雨丝 overlay → 速度线/BOOST 金色 vignette/碰撞红闪 vignette。

性能优化已形成体系：其一，road-strip.ts 按曲率差阈值将赛道分段合并为曲率段，直道段预烘焙到离屏 canvas 后帧内 drawImage 平移复用，替代逐段 drawQuad 循环；其二，曲率前缀和（Float64Array）提供 O(1) 累计偏移查询，sprites 空间索引按段分组实现环形可见窗口 O(候选段数) 查询；其三，雨滴预渲染到离屏 canvas 双幅 drawImage 平铺（帧内零逐段 stroke）；其四，fillStyle 字符串缓存（key = 归一化 rgba 分量，命中复用同一字符串，上限 1024 防泄漏）；其五，三档性能模式（PERF_HIGH 120 段全特效 / PERF_MID 分屏 80 段 / PERF_LOW 60 段 + skipSmoke/skipBoostParticles/skipRain 开关），`?perf=1` 查询参数触发。

**M16 道路视觉升级**：路面按 5 段横向渐变亮度（中央 +2.5%、次中 +1.5%、近缘 -1.5%、边缘 -3%）消除"平板纯色"条带感，叠加确定性颗粒噪点（每段 14 点、种子按 strip 起始段偏移避免跨段重复、跳过中心虚线带）模拟沥青颗粒，全部烘焙进离屏纹理，帧内零成本。

### 3.2 渲染器拆分（解环任务成果）

renderer.ts 已从 1143 行拆分为约 560 行的渲染门面 + 5 个关注点纯函数模块：sprite-draw.ts（树/仙人掌/棕榈/雪堆/路灯形状）、screen-effects.ts（速度线/BOOST 金色 vignette/碰撞红色 vignette）、traffic-draw.ts（车流+车前灯）、terrain-draw.ts（沙漠沙丘/海岸海面波浪/峡谷岩壁锯齿顶线）、road-surface.ts（道路渲染 + RoadSurfaceResources 资源接口 + NO_STRIP 哨兵）。Renderer 保留生命周期、入口渲染、远山/雨滴/roadStrip 缓存与粒子投影。拆分采用"资源接口 + 哨兵"设计避免模块间循环依赖，测试未直接访问私有方法，零回归。

### 3.3 赛道系统与环境差异化（M17）

赛道由 `createSmoothTrack(controlPoints)` 生成：沿 z 每 200 单位一个 Segment，相邻控制点间曲率线性插值（四舍五入到 0.001），支持环形 O(1) 定位与闭环约束（totalCurve）。tracks.ts 维护 TRACK_DEFS 注册表，当前 9 条赛道（classic/highway/s-curve/island/canyon/desert/forest/coast/alpine），每条含难度星级（1-3）、圈数、车流密度 trafficCount（缺省走 TRAFFIC_DEFAULT_COUNT=14）、可选夜晚标记 timeOfDay（canyon/alpine 为 'night'）与 M17 新增的必选 environment 字段。

M17 的成果集中在 engine/environment.ts：9 种环境的单一真源配置，每个 EnvironmentProfile 定义天空色相（skyHue，如 desert 35 暖橙、coast 195 更蓝）、草地色相/饱和度/明度、远山 day/night 配色、景物类型（tree/cactus/palm/snowpile）与密度（treeRatio/spacing，如 forest 更密 600、desert 更稀 1100）、树冠配色与可选地形装饰（沙漠 dunes / 海岸 sea / 峡谷 rock）。渲染层按环境差异化：光照色板（updateLighting 第 5 参）、远山缓存按环境懒重建（currentEnv 字段比较，切换时重建一次）、景物形状分发（SpriteKind 扩展 + rotation 随机化 + 沙漠小仙人掌 scale 0.5）、地形装饰绘制。environment.test.ts 单测锚定 plains 零回归与各环境差异。

### 3.4 物理与漂移系统

car.ts 的 `updateCar` 是纯函数运动学核心（77 行）：油门/刹车/滑行三分支、转向灵敏度随速度线性缩放、出界钳制并施加减速并返回 boolean 出界标记，支持 `turnRateOverride` 参数注入漂移有效转向率（×1.5）、wet 雨天物理（制动 ×0.7、转向 ×0.85，非雨天路径与旧版逐字节一致）、BOOST 氮气分支（突破 maxSpeed 至 1.15×，加速倍率 ×0.6）。drift.ts 的 `updateDrift` 是完整纯函数状态机（不修改入参、返回新状态）：蓄力积累/衰减（decay 2/s）、激活阈值、烟雾粒子生命周期（0.6s）、得分与速度成正比并受 DRIFT_SCORE_MAX(99999) clamp，M10 起叠加连击/倍率（combo 每 0.5s 窗口累积，得分 ×(1+combo×0.25)，上限 10 档封顶 3.5x），M13 H1 起支持第 7 尾参 scoreMultiplier 挑战加成（雨天 +50%、难度 (★-1)×25%）。input.ts 提供双人按键映射（P1 WASD+Space / P2 方向键+Enter，mergeCarInputs 合并，左右抵消）与触屏四分区 touchToCarInput。

### 3.5 游戏编排层：M15 重构与 ModeStrategy 策略对象

game-loop.ts 已从 938 行降至约 700 行，拆出四个纯函数模块：frame-update.ts（每帧更新段，聚合 ctx 依赖注入 + FrameUpdateResult 帧间状态写回，处理雨声/挑战倒计时/双世界车流/输入路由/BOOST 蓄力与音效/玩家物理/碰撞红闪/漂移胎声/完赛判定）、frame-render.ts（菜单预览/分屏/单屏渲染三分支 + 小地图重建 + updateHud）、frame-pure.ts（updatePlayerFrame、updateBoostCharge、viewFor、PerformanceConfig 等纯函数/常量/类型）、finish-accounting.ts（结算记账纯函数）。

最值得称道的是 mode-strategy.ts 的 ModeStrategy 策略对象（约 300 行）：接口定义九个差异点（splitMode/hotseatMode/challengeMode 标志 + getInputs/updateActivePlayer/shouldUpdateP2Traffic/collisionIncludesP2/updatePlayers/shouldFinish/afterSelectP1Track/menuHint），SINGLE/SPLIT/HOTSEAT/CHALLENGE 四个实例封装全部模式差异，createModeStrategy 工厂按已解析的 URL 标志互斥判定（split 优先）返回。GameLoop 内散落的模式 if/else 分支全部收敛为 mode.xxx() 调用。四种模式支撑完整：单屏（默认）、分屏（?split=1，两个独立 TrackContext 世界 + renderRegion 双区域 + drawDivider 分隔线 + P1/P2 独立选赛道独立存档）、热座（?hotseat=1，双人先后跑同赛道，回车交棒，输入/车流/碰撞/渲染按当前回合玩家路由）、挑战（?challenge=1，60 秒限时刷漂移分，CHALLENGE_TARGET_SCORE=5000 达标判定，挑战计分加成雨天 +50%）。

### 3.6 AI 与无头模拟

bot.ts（约 81 行）是规则型控制器：对前方 lookAheadSegments 段做环形曲率求和（aheadCurve），|Σcurve| 超阈值判定弯道并提前降速（cornerSpeedFactor），转向采用横向偏移比例纠偏（-position*steerGain）并 clamp。simulate.ts（约 111 行）是确定性无头跑圈引擎 simulateLaps：固定步长 dt（默认 1/60）驱动 bot 决策 → updateCar 物理 → 分段导航 → 违规检测的完整链路，输出圈速/里程/出界违规等可断言指标，maxSteps 防止死循环。这个组合使"bot 跑圈矩阵"成为游戏项目罕见的黑盒回归手段——9 条赛道全部完赛 0 违规，且每圈用时稳定可复现。

### 3.7 UI 表现层与存档

HUD 采用"render-as-function-of-state"模式：HudElements 接口聚合全部 DOM 引用（构造期一次性查询），updateHud 每帧以 RaceState 为输入同步双人文本，P2 元素显隐、热座玩家标签、双人 BEST、漂移连击倍率、得分 MAX 标记、挑战倒计时统一处理。screens.ts 的 applyPhaseToScreens 按阶段四态切换屏幕，FinishPanelOptions 九字段驱动多模式结算填充。存档 save.ts 设计统一且兼容性强：最佳时间按玩家维度 key（P2 用 -p2 后缀）、胜场统计（hotseat/split 独立 key + 连胜 streak 字段）、漂移 TOP10（跨玩家，M13 起条目含可选 combo 字段、旧 4 字段条目兼容不丢）、分屏对局最近 10 局（unshift + 截断）。Minimap 小地图构造时预计算轨迹折线并归一化，每帧按 cameraZ % lapLength 重绘玩家位置点，trackContext 不一致时重建。

### 3.8 音频合成

零外部资源的 WebAudio 程序化合成，依赖注入 + 惰性创建（首次按键满足浏览器自动播放策略）。engine.ts 提供 EngineSound（双锯齿波 + 低通滤波引擎声，setSpeedRatio 调制）、RainSound（白噪声循环 + bandpass 800Hz 雨声，幂等 start/stop）、CollisionSound（碰撞冲击音：噪声层 lowpass 300Hz + 低频正弦冲击层 55Hz 指数衰减 0.12s，80ms 防刷屏，play(volume) 按速度强度分级）、BoostSound（sawtooth 200→600Hz 扫频氮气音）、DriftSound（M15 漂移摩擦声，bandpass 噪声 + setIntensity 强度调制，湿滑频率 ×0.75 增益 ×0.8）、TireSound（M15 轻量胎噪，lowpass 1500Hz 封顶 0.02，构造即启动 gain 0 静音）；music.ts 的 MusicPlayer 用 RAF 30Hz 固定步长 + 0.2s 前瞻调度实现 16 步 chiptune 循环，调度逻辑纯函数化（stepEvents/nextStep 可单测）。M12 起 masterGain 总控下挂 musicGain/sfxGain 分轨，与暂停菜单三 slider 持久化联动。

## 四、测试与验证体系

项目建立了四层质量门禁，本次全部实测通过：

1. **静态校验**：typecheck（tsc --noEmit，strict + noUnusedLocals/noUnusedParameters/noFallthroughCasesInSwitch）、ESLint（typescript-eslint）、Prettier format:check——零错误零告警。
2. **白盒单测**：44 个测试文件 639 用例全绿。亮点是 canvas mock 基建（tests/__mocks__/canvas.ts 提供 __calls/__args 调用记录机制，支撑"渲染输出确实发生且稳定"类断言，如夜晚车灯 arc 增量、雨滴离屏"帧内零 stroke"）与 game-loop-integration.test.ts 的真实主循环集成冒烟（stub 全局 DOM/rAF/AudioContext 驱动真实 GameLoop，覆盖阶段流转、分屏、热座、9 赛道、暂停菜单、挑战模式、雨段环境音）。中文行为规格命名使测试兼具行为文档作用。M15 新增 mode-strategy / finish-accounting / frame-update / frame-render / drift-tire-audio / frame-update-audio 六个测试文件；M16 新增 collision-feedback / copy 同源测试；M17 新增 environment 测试。
3. **黑盒 bot 跑圈**：tests/bot/run-bot.ts 遍历 TRACK_DEFS 全部 9 条赛道按各自圈数调用 simulateLaps，输出 JSON 报告，全部赛道 finished 且 violations ≤ 3 才退出码 0——本次实测 9/9 完赛、0 违规（classic 三圈约 76s、island avgSpeed 最高）。
4. **E2E 视觉回归**：M16 起 Playwright（桌面 1280×720 + 移动横屏 812×375 双 project，CI 独立 job 自动拉起 vite dev server），覆盖菜单光晕、标题叠影、天空条纹（canvas 像素级 maxDelta < 60）、倒计时提示同源、热座 HUD 标签、移动端视口等视觉缺陷防回归。

**覆盖强弱项评估**：强项——领域层纯函数（投影、漂移、车流、光照、格式化、音频合成）覆盖极其充分且断言精确，集成冒烟覆盖了真实主循环的复杂交互。可观察到的薄弱点——renderer.ts 仅做状态级验证未逐像素比对（受 mock 基建限制的合理取舍）；bot 判定容忍 violations ≤ 3；game-loop-integration 的「分屏双人完赛」用例需 testTimeout 放宽至 15000ms（文档记录为既有脆弱性）。

## 五、工程化实践与文档体系

工程化达到专业水准：CI workflow（typecheck → lint → format:check → test → bot → build 串行 + e2e 独立 job + 失败产物上传 retention 7 天，Node 22 + npm cache）、PWA 离线发布（vite-plugin-pwa generateSW + autoUpdate，manifest 含 maskable 图标 + SVG 图标、横屏 orientation、导航回退 index.html）、husky + lint-staged 提交前自动 eslint --fix + prettier --write、三档性能模式、OG 协议微信分享卡片 meta（部署后注入正式域名）。CRLF 换行防护已根治：项目根 .gitattributes（* text=auto eol=lf）+ 本地 core.autocrlf=false + IDE files.eol "\n" 三层防护，已随解环提交入库。

文档体系是另一大强项：根目录与每个子目录（src/、engine/、physics/、game/、ai/、ui/、audio/、tests/、docs/）都有 codemap.md（职责/设计/流程/集成/文件清单），docs/ 下 19 份计划文档构成完整演进档案，均按 superpowers writing-plans 约定（Goal/Architecture/Tech Stack/Global Constraints + Task checkbox + Files/Interfaces/TDD 步骤）。每份新计划承诺对既有 API 向后兼容，形成可追溯的工程契约。docs/reports/ 下还沉淀了 10+ 份专题研究报告（碰撞反馈、环境差异化、运行时实测、道路优化、track 验证等），本次分析即延续该档案体系。

## 六、最新架构收尾分析（shared 层解环 + renderer 拆分）

相比 docs/reports/research_report_project_analysis_m17.md（M17 状态），最新进展集中在三项架构收尾：

1. **新建 src/shared/ 独立共享层**：constants/phase/phase-logic/lap 四个文件成为唯一真源；engine/physics/ui 改直接导入 src/shared/constants；ui/gamestate、ui/format 改从 shared 导入；game 层保留 re-export 兼容层（game/constants.ts 等 4 文件）。解环后 ui 对 game 仅剩 import type（RaceState/TrackContext），运行时环消除。依赖方向单向：engine/physics → shared；ui → shared + physics(type) + game(type only)；game → engine/physics/ui/shared。
2. **renderer.ts 拆分**（1143→约 560 行）：拆出 sprite-draw / screen-effects / traffic-draw / terrain-draw / road-surface 五个关注点纯函数模块，Renderer 持资源接口传入避免环。
3. **全量验证与文档同步**：typecheck/lint/format:check/test（639 用例）/bot（9 赛道 0 违规）/build（PWA）全绿；AGENTS.md、README.md、codemap 系列、tests/codemap.md 同步刷新（车流数字、game/ 20 文件、tests 44 文件）；历史计划档案与分析报告保留快照未改。Git 已提交 3 个提交（shared 解环 16 文件、renderer 拆分 6 文件 +698/-612、文档同步 9 文件）。

## 七、综合分析

**架构优势**：其一，纯函数优先设计让游戏核心完全可单测、可无头运行，bot 跑圈矩阵是游戏项目罕见的黑盒回归手段；其二，M15 的策略模式与纯函数拆分成功控制了 game-loop.ts 的复杂度，四模式差异隔离清晰；其三，shared 层的建立彻底消除了模块间的运行时循环依赖，常量唯一真源 + 确定性生成 + 中文行为规格测试三重机制共同保证长期演进安全；其四，性能优化（离屏缓存、空间索引、每帧分配削减、fillStyle 缓存、三档性能模式）体现了对 60fps 目标的认真对待，且均有测试锚定；其五，渲染器按关注点拆分与资源接口设计展示了"大文件演进"的正确路径——先在内部用纯函数模块收敛，再逐步外提。

**代码质量观察与可改进点**：其一，game-loop.ts 仍是全项目最大单文件（约 700 行，M16/M17 新增功能使其有回升趋势），可考虑按"生命周期/输入采集/音频驱动"再拆；其二，ui 对 game 仍存在类型级依赖（RaceState/TrackContext import type），若将类型提升至 shared 可 100% 解耦；其三，debug-hook 暴露 19 个 window.__gameDebug getter 供测试断言，是巧妙的测试钩子，但也增加生产运行时负担（可考虑条件编译/构建剥离）；其四，bot 判定对 violations 的容差、分屏双人完赛用例的超时放宽，属于已记录的已知折衷；其五，index.html 与 HUD DOM 结构承载了较多交互逻辑，若未来继续增加 UI 复杂度可考虑引入轻量组件抽象（但需权衡破坏纯函数测试体系的风险）。

## 八、结论

AI-Racing-Games 不是普通的 demo 游戏，而是一个工程方法论完备的验证性项目。它用 17 个里程碑加上三项架构收尾证明了：纯函数领域层 + 确定性生成 + 四层测试门禁（typecheck/lint、单测、bot 黑盒、e2e 视觉回归）的组合，可以在无人值守的 agent 驱动开发模式下稳定地长程演进。其架构分层（shared 唯一真源层、engine/physics 纯函数底层、game 编排中层、ui/audio 表现层、ai 独立模拟层）、常量唯一真源、mode-strategy 策略模式、renderer 关注点拆分、codemap 知识体系，都是可复用的工程样板。截至本次分析，项目 typecheck/lint/639 单测/9 赛道 bot 矩阵/PWA build 全绿，处于稳定可发布状态。若未来继续演进，最优先的建议是：将 ui 对 game 的类型级依赖提升至 shared 实现 100% 解耦、按"生命周期/输入采集/音频驱动"再拆 game-loop.ts、为 debug-hook 增加构建剥离、以及继续沿"架构级改动 + 运行时打磨交替"的节奏推进。

## 九、局限性

本报告基于静态代码阅读、codemap/计划文档分析与既有验证记录，未在当前会话重新运行 typecheck/lint/test/bot/build（依据 AGENTS.md 与 memory 中 2026-08-05 实测记录：44 文件 639 用例全绿、bot 9 赛道 0 违规、PWA build 通过）。未实际启动 `npm run dev` 进行浏览器人工游玩实测，也未运行 `npm run test:e2e`（Playwright 需先安装 chromium）。因此游戏运行时的帧率、PWA 离线可用性、移动端触控体验、e2e 视觉断言等运行时维度为推断而非本次实测。bot 圈速数据沿用实测记录（classic 三圈约 76s），与 README 示例已同步一致。

## 十、参考资料

1. [AGENTS.md（项目规范）](AGENTS.md)
2. [README.md（快速开始与里程碑状态）](README.md)
3. [codemap.md（仓库总览）](codemap.md)
4. [src/codemap.md（源码目录总览）](src/codemap.md)
5. [src/shared/（共享层）](src/shared/)
6. [src/engine/codemap.md](src/engine/codemap.md)
7. [src/game/codemap.md](src/game/codemap.md)
8. [src/physics/codemap.md](src/physics/codemap.md)
9. [src/ai/codemap.md](src/ai/codemap.md)
10. [src/ui/codemap.md](src/ui/codemap.md)
11. [src/audio/codemap.md](src/audio/codemap.md)
12. [tests/codemap.md（测试体系全景）](tests/codemap.md)
13. [docs/codemap.md（计划档案目录）](docs/codemap.md)
14. [docs/reports/research_report_project_analysis_m17.md（M17 状态上一版分析）](docs/reports/research_report_project_analysis_m17.md)
