# AI-Racing-Games（OutRun 伪 3D 复刻）深度架构分析报告

## 摘要

AI-Racing-Games 是一个基于 TypeScript + Vite + Canvas 2D 实现的 OutRun 伪 3D 赛车游戏，源码 8728 行（src/ 下 64 个 TS 文件），配套 9179 行测试代码（48 个单测文件、约 685 用例、9 赛道 bot 矩阵、14 个 e2e 用例双视口执行）。项目的核心亮点是"纯函数优先的领域层 + 有限状态机 + 确定性生成"的架构：engine/physics/ai 三层可脱离 UI 独立运行，game 层以 GameLoop 编排，ui 对 game 零依赖（含类型层）。整体代码质量高——无 console 残留、无 any/@ts-ignore 滥用、常量集中治理、模块拆分到位、依赖方向单向无环。主要短板集中在渲染热路径的每帧对象分配（project() 每帧 O(n) 分配）、game-loop.ts 的 God Object 倾向（1073 行）、P1/P2 对称代码重复，以及少量健壮性细节（事件监听无清理、倒计时定时器无取消）。未发现可利用的 XSS/注入漏洞，安全面整体收敛。

## 背景

该项目的特殊性在于：它是一个"伪 3D"渲染器——不使用 WebGL/Three.js，全部透视投影数学由 projection.ts 的纯函数手工实现；同时它被用作长程编程能力验证平台，历经 M1-M19 共 19 个里程碑演进，每次演进都以"typecheck + lint + test + bot 矩阵 + build + e2e"全套门禁验收。因此项目形成了罕见的双重资产：既是一套可运行的伪 3D 游戏引擎，又是一套经过 19 轮重构沉淀的架构样板。本报告从架构、数据流、质量、复用资产、可维护性五个维度展开。

## 一、整体架构与技术栈

### 1.1 技术栈

项目技术栈精简且克制：TypeScript（ES2022、strict、noUnusedLocals、bundler 解析）、Vite 8.x（dev/build）、Canvas 2D（唯一渲染手段）、Vitest 4.x（单测）、Playwright 1.62（视觉回归）、tsx（bot 脚本）、ESLint 10 + typescript-eslint + Prettier + husky/lint-staged（工程化）、vite-plugin-pwa 1.3.0（M15 引入，generateSW + autoUpdate 离线 PWA）。关键点是**零运行时依赖**——package.json 的 devDependencies 全是开发工具，游戏本身不依赖任何第三方库，所有渲染、物理、音频（WebAudio 程序化合成）均为手写。

### 1.2 分层架构

代码按"领域层 → 编排层 → 表现层"七目录分层，依赖方向单向无环：

```
src/shared  最底层共享层（零运行时依赖）：constants（20 常量真源）/ phase（四态 FSM）/ phase-logic / lap / types
src/engine  伪 3D 渲染引擎（20 文件）：投影数学、赛道生成与注册表、景物/车流/烟雾系统、环境配置、离屏缓存、Renderer 门面
src/physics 车辆物理（3 文件）：car（运动学）/ drift（漂移连击）/ input（输入规范化）
src/ai      bot 决策器 + 无头跑圈模拟器（headless，不参与生产主循环）
src/game    编排层（25 文件）：GameLoop（1073 行）+ 纯函数下沉件（frame-update/render/pure、mode-strategy、finish-accounting 等）
src/ui      表现层（8 文件）：HUD/屏幕/格式化/存档/摇杆/小地图/文案
src/audio   程序化音频（2 文件）：引擎音/环境音/BOOST 音/背景音乐（WebAudio 合成）
```

依赖规则经实际 import 审计确认：engine/physics/ui 均只依赖 shared；game 依赖 engine+physics+ui（运行级调用）+shared；ui 目录下无任何文件 import 自 game/（连 RaceState/TrackContext 类型也已提升至 shared/types）。这条"解环"是 2026-08-05 架构重构的核心成果，它消除了 game↔ui 之间的类型与运行时双向环。

### 1.3 核心功能模块

六大功能域：一是伪 3D 渲染管线（路面分段投影 + road-strip 曲率段离屏缓存 + 远山视差平铺 + 9 种环境配置 + 晴/阴/雨三态天气 + 夜晚赛道车灯 + 碰撞红闪特效）；二是车辆物理（速度/转向/出界推回、漂移蓄力/连击倍率/得分、BOOST 氮气、雨天物理）；三是四种游玩模式（单屏 / ?split=1 分屏双世界 / ?hotseat=1 热座轮流 / ?challenge=1 限时刷分，经 ModeStrategy 策略对象封装）；四是赛道系统（TRACK_DEFS 注册表 9 条赛道 × 难度星级 × 环境 × 可选夜晚标记）；五是 bot 决策与确定性模拟（9 赛道矩阵回归 0 违规）；六是程序化音频（无任何音频资源文件，全部 WebAudio 实时合成）。

## 二、业务逻辑、数据流向与状态管理

### 2.1 主循环数据流

主循环（requestAnimationFrame 驱动，dt 截断 50ms 防跳帧）为五段式流水：输入采集（键盘/触屏摇杆归一化为 CarInput）→ 物理更新（updatePlayerFrame：漂移 → 速度修正 → 运动学 → 相机推进 → 计时 → 圈数记录）→ 碰撞裁决（updateCollisions 玩家-车流碰撞，写回碰撞计数与红闪状态）→ 渲染（Renderer.render/renderRegion，画家算法分层，分屏双区域 + drawDivider）→ HUD 刷新（updateHud 双人 DOM 文本）。阶段流转由 Phase FSM（menu/racing/paused/finished）驱动，nextPhase/togglePause 为 shared 层纯函数。

### 2.2 状态管理模型

状态分三层管理，层次清晰但存在一个结构性弱点。第一层 RaceState（shared/types.ts）是每局可变状态容器，聚合双 PlayerState、双 TrackContext、碰撞计数、圈速记录、phase、finishShown，是帧循环数据流的汇聚点；第二层 PlayerState 是单玩家子状态（carState/driftState/cameraZ/raceTime/collisionCooldown/boostCharge）；第三层是 GameLoop 实例字段（hotseatPlayer、prevP1Time、lastActivePlayer、boostActive、collisionFlash 等），这些"帧循环外可变状态"游离于 RaceState 之外，分散在编排壳中。更新侧贯彻"纯函数 + 返回值写回"契约：updateDrift 返回全新状态（不修改入参）、updatePlayerFrame 单行直返 lastLap、updateFrame 经返回值回写帧间状态——这套契约使得帧逻辑可脱离 DOM 单测。

### 2.3 持久化与外部接口交互

项目无后端 API，外部交互面有四类。localStorage 持久化（save.ts 管理 8 类 key：最佳圈速按赛道×玩家、漂移 TOP10、胜场统计、对局榜、三档音量，全部 try/catch + 逐字段校验 + 可注入 storage）；URL query 参数配置模式（?split=1/?hotseat=1/?challenge=1/?perf=1，split 优先互斥）；Web Audio API（AudioContext 首次用户手势惰性创建，masterGain 总控下挂 musicGain/sfxGain 分轨）；PWA/ServiceWorker（workbox generateSW 预缓存 + autoUpdate 注册）。一个值得注意的架构偏差点：持久化服务（ui/save.ts）放在 UI 表现层却被 game 层运行级消费，语义上 save.ts 更像是基础设施而非 UI 表现，未来可考虑下沉为独立 storage 层。

## 三、代码质量、性能瓶颈与安全风险

### 3.1 代码质量总体评估

优点突出：全 src 扫描 0 处 console 残留、0 处 any/@ts-ignore；魔法数字治理优秀（shared/constants.ts 20 个常量作为唯一真源，改值须同步 constants.test.ts 注册表断言）；注释与文档极度详尽（每目录 codemap.md 记录设计决策与历史取舍）；纯函数分层使领域层可脱离浏览器运行。

主要质量问题集中在三处。一是超大函数：fillFinishPanel（ui/screens.ts，220 行）与 updateFrame（frame-update.ts，220 行）超 200 行，applyPhase/frame/onKeyDown/renderWithOpts 均为 100+ 行，其中 fillFinishPanel 的 P1/P2 两套结算填充逻辑近乎逐行复制；二是 game-loop.ts 仍是 God Object（实测 1073 行、约 40 个实例字段），虽然已拆出 8 个模块，但构造器、applyPhase、frame、onKeyDown 四大块仍承载过多职责与生命周期管理；三是参数列表过长：renderRoadSurface 达 10 个裸参数，updatePlayerFrame 8 参数、updateDrift 7 参数，未沿用 updateFrame/renderFrame 已使用的 ctx 聚合对象模式。

### 3.2 性能瓶颈（按优先级）

第一梯队是渲染热路径的每帧对象分配。project() 每次调用返回新的 Projected 对象，renderRoadSurface 主循环 120 段 × 每段两次投影 × 4 对象 ≈ 每帧近千个短命对象，分屏时翻倍——这是 60fps 移动端最大的 GC 压力源，项目已用 spriteScratch/_viewCache/getFillStyle 缓存等缓解，但 project 本体仍缺 out 复用参数（spritesInRangeIndexed 已有该模式可参照）。第二梯队是物理层 updateDrift 每帧全量复制 DriftState（含 smoke 数组与每个粒子的 {...particle} 复制），漂移激活时分配量与粒子数成正比。第三梯队是输入管线每帧约 5-7 个对象（effInput1/2 展开、mergeCarInputs、零输入对象），以及 .boost-fill 每帧 querySelector（与同函数内 boostBar ??= 惰性缓存模式不一致）。另有一个设计冗余：frame() 在 updateFrame 已路由输入后，为渲染转向又经 collectSteerInputs 二次路由，同一帧输入被处理两遍。已实施的优化值得肯定：远山/雨滴/road-strip 三套离屏缓存、曲率前缀和 O(1) 查询、景物空间索引、倒计时冻结窗口渲染降级、?perf=1 性能档位。

### 3.3 安全风险

结论先行：未发现可被外部利用的高危漏洞。全部 4 处 innerHTML（赛道星级、SVG 预览、倒计时提示）数据均来自内置常量/受控数值；排行榜用 textContent 写入，即使 localStorage 被篡改也只渲染为文本，不构成 XSS。localStorage 键基于内置 trackId 拼接，无注入面；loadWins 对 JSON 逐字段 typeof + 白名单校验，无 prototype pollution 风险。URL 参数仅用 has() 检测存在性、不读取值，无注入面。可改进项有三：PWA registerType: autoUpdate 会在检测到新版本时自动刷新，可能在对局中途打断玩家，建议评估改 prompt 或加用户确认；top-refresh 对篡改的 trackId 会原样展示（自我攻击面，仅影响本机）；事件监听（keydown/resize/10+ 控件）全部无 removeEventListener，input.ts 的 destroy() 从未被调用——这是健壮性问题而非安全问题，但建议为 GameLoop 提供 destroy() 以便测试隔离与热重载。另有一个真正的健壮性缺陷：countdown.ts 的 setInterval/setTimeout 无句柄保存与取消，倒计时中重复 startGame 会叠加多个并行 interval。

## 四、复用资产与设计模式

### 4.1 高复用工具函数

最核心的复用资产是 shared 层的 lapFromZ（经 re-export 被 7+ 模块消费，圈速/完赛判定的唯一真源）、engine 层的 mulberry32（确定性 PRNG，被 5+ 模块用于景物/车流/雨滴/噪点种子）、project（投影纯函数，被 renderer/road-geometry/smoke-render/traffic-render/player-car 5 处消费）、trackIndexForCameraZ（环形 O(1) 分段定位，4 处）、shadeColor（亮度调节，路面渐变/仙人掌明暗/路缘细节 3 处）。UI 层 format.ts 提供 formatSpeed/formatTime/formatLap/formatLapTimes 四个纯格式化函数，被 HUD、结算、榜单刷新共同消费。

### 4.2 工厂函数与设计模式

项目建立了系统的工厂函数族：createCarConfig/createDriftState/createBotConfig/createTrackContext/createModeStrategy/createInputManager/createAudioRig/createRaceState/createPlayerState，全部以"默认值 + 浅合并覆盖"或"注入依赖"方式提供可配置实例。设计模式应用密集且有明确文档化：门面模式（Renderer 类对外只暴露粗粒度 API）、策略模式（ModeStrategy 四实例封装四模式差异，消除大 if 分支）、依赖注入（AudioContext、storage、TrackManagerDeps 三处）、re-export 兼容层（game/constants 等四文件为 shared 真源过渡）、有限状态机（Phase FSM）、对象池/复用（viewFor 模块级 _viewCache 单例、spriteScratch 复用数组、getFillStyle 归一化缓存）、离屏缓存（三套）、确定性 PRNG 种子生成（支撑 bot 可复现）。注意：本项目是原生 TS + Canvas，无 React/Vue 生态，因此没有传统意义的"自定义 Hooks"；功能等价物是"纯函数更新管线"（updatePlayerFrame/updateDrift/updateBoostCharge）与"策略对象注入"两种模式。

### 4.3 复用度评估

lapFromZ、mulberry32、project 等核心函数复用度健康。可改进点有二：speedRatio 的计算逻辑在 car.ts/collision.ts/frame-update/frame-render/game-loop 中散落 5-6 处重复；combo 倍率 0.25 在 hud.ts 与 drift.ts 两处独立定义，粒子寿命 0.6 在 renderer.ts 与 frame-update.ts 双处硬编码——这些应收敛进 shared/constants。

## 五、可维护性、可扩展性与测试覆盖率

### 5.1 可维护性

分层与文档是最大加分项：七目录职责单一、依赖方向单向无环（有 import 审计证据支撑）、每目录 codemap.md 记录架构决策与历史取舍、文案常量 copy.ts 通过测试与 README 关键词绑定防止漂移。扣分项集中在三个代码结构问题：game-loop.ts God Object（1073 行、40 字段）、fillFinishPanel 220 行超长方法、P1/P2 对称代码重复（screens.ts/mode-strategy.ts/finish-accounting.ts 三处）。这三个问题的本质是"双玩家对称性"未能抽象为通用数据驱动逻辑。

### 5.2 可扩展性

扩展点设计良好：新增赛道只须向 TRACK_DEFS 注册表加一条定义（含环境、难度、车流密度、圈数）；新增环境只须扩展 environment.ts 的 EnvironmentProfile；新增游玩模式只须实现 ModeStrategy 接口并注册（M15 已验证此路径）；新增渲染细节按 RenderView 尾参 + 渲染降级 RenderOptions 的向后兼容模式扩展。项目对"刻意保留的双默认值语义"（游戏车流 14 vs bot 基线 8）等设计取舍有显式注释，防止后人误统一。这一层是项目最成熟的资产。

### 5.3 测试覆盖率

测试体系是项目最强资产之一：48 个单测文件约 685 用例（测试代码 9179 行超过源码 8728 行）、9 赛道 bot 矩阵回归（0 违规门禁）、14 个 e2e 用例在桌面/移动横屏双 project 下执行、husky/lint-staged 提交门禁 + CI 串行六段验收。测试类型四层齐备：纯函数输入输出、canvas mock 渲染断言（__calls/__args/__order 调用序列追踪）、真实 GameLoop 实例的集成测试（stubEnvironment 驱动 46 用例，覆盖四模式玩法链路）、bot 确定性模拟验收。断言强度高（精确 toBe/toEqual 为主），canvas mock 覆盖渲染实际调用的全部方法。需要明确的盲区有五处：screens.ts 的 fillFinishPanel 多模式分支仅经集成间接覆盖；volume.ts/audio-rig.ts 的损坏数据回退路径无独立单测；game/input.ts 的 createInputManager 无直接测试；sprite-draw/screen-effects/traffic-draw 三个拆分模块仅经 renderer 间接断言；M18 新增的 silenceDriveSounds、.leaving 过渡、refreshTrackPreview 等副作用分支"执行到但未验证"。另有轻微过度 mock（finish-accounting.test.ts 用 vi.mock 替换 save 实现，验证了调用参数但未验证与真实 save 的集成结构）与时间脆弱性（集成测试 15000ms 显式放宽、e2e 硬编码 waitForTimeout、热座平手竞态用三选一断言规避）。

## 结论

综合评级：这是一个架构成熟度与测试纪律远超同规模游戏项目的代码库。它最值得称道的三项成就是：纯函数领域层使核心逻辑 100% 可单测、依赖方向经主动重构达到单向无环、19 轮里程碑全部以六段门禁验证交付。最优先的改进清单按投入产出排序：一是削减渲染热路径的每帧对象分配（为 project 增加 out 复用参数、updateDrift 改 in-place 粒子更新），直接改善移动端 60fps 稳定性；二是补 fillFinishPanel 与 volume/audio-rig 的白盒单测，覆盖当前最大的测试盲区；三是为 GameLoop 补 destroy() 并取消倒计时 interval，解决生命周期管理隐患；四是抽象 P1/P2 对称逻辑与 game-loop.ts 的字段分组，治理超长方法；五是评估 PWA autoUpdate 策略避免对局被打断。在新增特性时，应继续遵循"共享常量真源 + ModeStrategy 策略 + re-export 兼容层"的既有扩展范式，避免破坏已收敛的依赖方向。

## 参考来源

1. [项目根 codemap.md（架构总览）](d:/AI/AI-Racing-Games/codemap.md)
2. [AGENTS.md 项目规范（技术栈/验证优先级/里程碑）](d:/AI/AI-Racing-Games/AGENTS.md)
3. [src/ 目录分层地图](d:/AI/AI-Racing-Games/src/codemap.md)
4. [src/engine/codemap.md（渲染引擎细节）](d:/AI/AI-Racing-Games/src/engine/codemap.md)
5. [src/game/codemap.md（编排层细节）](d:/AI/AI-Racing-Games/src/game/codemap.md)
6. [src/physics/codemap.md（车辆物理细节）](d:/AI/AI-Racing-Games/src/physics/codemap.md)
7. [src/shared/codemap.md（共享层与解环说明）](d:/AI/AI-Racing-Games/src/shared/codemap.md)
8. [src/ui/codemap.md（UI 表现层细节）](d:/AI/AI-Racing-Games/src/ui/codemap.md)
9. [src/audio/codemap.md（程序化音频细节）](d:/AI/AI-Racing-Games/src/audio/codemap.md)
10. [src/ai/codemap.md（bot 决策器细节）](d:/AI/AI-Racing-Games/src/ai/codemap.md)
11. [package.json（依赖与脚本）](d:/AI/AI-Racing-Games/package.json)
12. [src/shared/constants.ts（20 常量唯一真源）](d:/AI/AI-Racing-Games/src/shared/constants.ts)
