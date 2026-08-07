# AI-Racing-Games 项目深入分析报告（2026-08-06 实测）

## 执行摘要

AI-Racing-Games 是一个基于 TypeScript + Vite 构建、纯 Canvas 2D 实现的 OutRun 伪 3D 街机赛车游戏，不依赖 WebGL/Three.js，全量代码约 9475 行（69 个 TS 文件）。项目已完整走完 M1-M20 共 20 个里程碑，形成一套罕见的"纯函数领域层 + 策略对象 + 共享常量层 + 确定性生成 + 多级验证门禁"的严谨架构。2026-08-06 全量实测六项门禁全绿：typecheck、lint、711 单测、9 赛道 bot 跑圈 0 违规、PWA 构建、Playwright e2e 40 通过 8 视口条件跳过。当前处于高完成度、高代码质量的"可交付、可演进"状态，主要遗留风险集中在 game-loop.ts 1093 行超大类与测试环境负载稳定性上。

## 项目概览

该项目是 OutRun 伪 3D 复刻，作为 OpenCode Win11 Desktop IDE 长程编程能力极限测试项目，主力模型 DeepSeek V4 Flash。游戏支持 9 条差异化赛道（含峡谷/山岳两夜间赛道）、漂移连击与得分 TOP10、BOOST 氮气（漂移蓄能）、车流避让 AI、雨天物理、天气三态循环（晴/阴/雨各 45s）、双人分屏（?split=1）、热座轮流（?hotseat=1）、60 秒挑战模式（?challenge=1）、WebAudio 程序化合成音效（引擎/漂移摩擦/胎噪/雨声/碰撞/chiptune 音乐）、移动端触控与竖屏兼容、localStorage 存档版本化、PWA 离线安装与微信分享卡。线上已部署至 CloudBase 静态托管（https://joyful-d6glfqzna80c9f036-1252524693.tcloudbaseapp.com/ai-racing-games/）与 GitHub（mike652638/AI-Racing-Games）。

## 技术架构

架构核心是"分层解耦 + 纯函数优先"的设计哲学，依赖方向严格单向：engine/physics → shared → ui → game，其中 game → engine/physics/ui/shared，ui → game 已实现 100% 解耦（2026-08-05 连类型级 import type 也提升至 shared）。

src/shared/ 为运行时最底层唯一真源，共 5 个文件：constants.ts（31 个游戏参数常量，含漂移/挑战/BOOST/碰撞/渲染/路面/车流/粒子/视觉调参九组）、phase.ts（menu/racing/finished/paused 四阶段 FSM 定义）、phase-logic.ts（阶段转移逻辑）、lap.ts（圈数推进）、types.ts（RaceState/TrackContext 类型转发层，仅 import type 编译期擦除）。engine/ 与 physics/ 直接依赖 shared/constants，杜绝魔法数字；改动常量需同步 constants.test.ts 注册表断言。

engine/ 渲染层 19 文件：伪 3D 投影（projection.ts，含 MAX_SPRITE_SCALE/MAX_LAMP_SCALE 近距缩放上限）、路面渲染（road-surface.ts 401 行，9 带渐变 + 颗粒噪点 + 路缘立体感）、曲率段离屏缓存（road-strip.ts）、景物形状（sprite-draw.ts，树/仙人掌/棕榈/雪堆/路灯）、地形装饰（terrain-draw.ts，沙丘 sin 变形/海面波浪/峡谷岩壁锯齿）、车流绘制（traffic-draw.ts）、屏幕特效（screen-effects.ts，速度线/BOOST/vignette）、环境配置（environment.ts，9 种环境色板）、玩家车渲染（player-car.ts，碰撞闪白/车灯色）、确定性 PRNG（mulberry32）。

game/ 编排层 29 文件：GameLoop 主循环（game-loop.ts 1093 行）为核心编排壳，将更新/渲染逻辑下沉为纯函数——frame-update.ts 的 updateFrame（344 行）、frame-render.ts 的 renderFrame、frame-pure.ts（shouldScheduleNextFrame/updatePlayerFrame/viewFor 等决策函数）、finish-accounting.ts 结算记账、mode-strategy.ts 四模式策略对象（SINGLE/SPLIT/HOTSEAT/CHALLENGE，312 行）、collision-feedback.ts 碰撞红闪状态机、audio-rig/countdown/dom-setup/track-preview/menu-preview/leaderboard-cards/portrait-mode/screen-transition 等支撑模块。

GameLoop.frame() 主循环已"薄壳化"：只做 dt 计算、调用 updateFrame 纯函数获取返回值、把返回状态写回字段（lastActivePlayer/boostActive/collisionFlash/challengeTimer 等）、根据 shouldScheduleNextFrame 判断是否跳过渲染与 rAF 自续、复用 ur.steer1/steer2 或回退 collectSteerInputs、调用 renderFrame、驱动引擎音效。模式分支（输入路由/车流/碰撞/完赛判定）全部委托 ModeStrategy 策略对象，避免大 if 分支。构造函数还解析 URL 参数（split/hotseat/challenge/perf 互斥关系）、装配 DOM/HUD/屏幕元素、构建 TrackManager/Renderer/InputManager/JoystickUI；destroy() 取消 rAF、执行 cleanups 清理监听、释放输入/摇杆/持续音效与 destroyAudioRig。

## 代码规模与结构

2026-08-06 实测（子代理逐目录统计 + 关键文件精确行数）：src/ 共 67 个 .ts 文件（另含根级 main.ts 与 vite-env.d.ts 共 69 个），总代码约 9475 行。分布为 game/ 29 文件约 3649 行、engine/ 19 文件约 3252 行、ui/ 7 文件约 1292 行、audio/ 2 文件约 573 行、physics/ 3 文件约 311 行、shared/ 5 文件约 206 行、ai/ 2 文件约 192 行。

最大 10 个文件：game-loop.ts 1093、renderer.ts 667、audio/engine.ts 413、road-surface.ts 401、ui/screens.ts 357、ui/save.ts 350、frame-update.ts 344、mode-strategy.ts 312、tracks.ts 253、environment.ts 228。game-loop.ts 自 M15 的 938 行历经四轮拆分（拆出 mode-strategy/finish-accounting/frame-update/frame-render/frame-pure/leaderboard-cards/menu-preview/portrait-mode/screen-transition），但仍为项目最大单体，是剩余最突出的技术债。

package.json 零运行时依赖，仅 12 项 devDependencies：@playwright/test ^1.62.1、@types/node ^26.1.2、eslint ^10.8.0、husky ^9.1.7、lint-staged ^17.3.0、prettier ^3.9.6、tsx ^4.23.1、typescript ^6.0.3、typescript-eslint ^8.65.0、vite ^8.2.0、vite-plugin-pwa ^1.3.0、vitest ^4.1.10。scripts 含 dev/build/preview/typecheck/lint/test/test:e2e/bot/bench/bench:reuse/scan/format/format:check/prepare。

## 测试与质量保障体系

项目建立了四层自动化质量门禁（CI 中按 typecheck → lint → format:check → test → bot → build → e2e 顺序执行，playwright 独立 job）：

单元测试 tests/unit/ 48 个文件（连同 bench 冒烟共 49 文件 711 用例，2026-08-06 实测 26.18s 全绿），覆盖 src 六大目录，核心设计是纯函数优先 + 依赖注入 mock（fakeStorage/StubElement/stubEnvironment）+ canvas mock 调用记录 + 确定性种子测试 + 多帧状态机测试 + 真实主循环集成冒烟（game-loop-integration.test.ts 47 用例，含分屏/热座/挑战/雨段长程用例）。

bot 跑圈 tests/bot/run-bot.ts 用 simulateLaps 跑 9 赛道矩阵，2026-08-06 实测全部 finished 0 违规（classic 三圈 76.017s、island avgSpeed 5188.7 最高、desert 5219.3 最高），确定性生成保证结果可复现；README 的 bot 示例数据与实测一致。

Playwright e2e（tests/e2e/visual.spec.ts）三 project（desktop 1280×720 / mobile-landscape 812×375 / large-screen 1920×1080），覆盖菜单光晕移除回归、9 卡网格完整性、标题不叠影、开始按钮在视口内、倒计时覆盖层、暂停按钮真实指针可点性、起步碰撞保护回归、大屏内容居中、天空无高频条纹（canvas 像素级）、操作提示 copy.ts 同源、热座 P1 HUD 标签、BOOST 蓄能链路、碰撞反馈链路。2026-08-06 实测 48 执行 40 通过 + 8 视口条件跳过，0 失败。

工程化辅助：lint-staged（eslint --fix + prettier --write 提交前自动）、husky prepare、perf-bench.ts 性能基准（投影/漂移/输入热路径帧分配与耗时，--reuse 对比）、security-scan.ts 安全静态扫描（innerHTML/监听器对称性/定时器/类型泄漏）、vitest 全量并行。

## 里程碑进展

M1-M20 全部完成，每阶段均经 typecheck + lint + test + bot（+ M15 起 build PWA、M16 起 e2e）全量验证后提交。最近几轮（2026-08-05/06）集中在：架构解环（ui→game 100% 解耦、shared 层）、renderer 拆分 5 关注点模块、运行时实测修复（大屏网格根因 grid 3×3、portrait 旋转同步、路灯缩放上限、路面噪点降密度）、HUD 行驶期修复（BOOST 条 bottom-center、速度线淡蓝白）、榜单菜单优化 v1-v3（整体控制 master 切换、dashboard 容器、紧凑格式）、菜单专项测试与优化（.menu-sun 移除、track-preview 重绘 560×140、开始按钮移出滚动容器根治 sticky 遮挡）、存档版本化（SAVE_VERSION=1 + v0 兼容迁移）、渲染性能加固（fillStyle 缓存分片、projectTraffic 零分配）、PWA 缓存策略（HTML 剔除 SW 预缓存 + Cache-Control meta）、微信分享卡 v2、CI 全绿与 e2e 大屏 project。

## 分析：设计模式与工程实践亮点

该项目在长程开发中沉淀了一套可复用的工程模式：策略对象（ModeStrategy 四实例封装模式差异）、门面（Renderer 生命周期入口）、依赖注入（AudioContext/storage/TrackManagerDeps）、re-export 兼容层（game 层保留旧导入路径）、有限状态机（四阶段 + countdownRemaining 冻结窗）、对象池（_viewCache/spriteScratch）、离屏缓存三套（远山 day/night、雨滴双幅、road-strip 曲率段）、确定性 PRNG、纯函数下沉（frame-update/render/finish-accounting）。最关键的是"运行时依赖图单向 + 共享层唯一真源"的架构纪律，以及"纯函数可单测、确定性可复现"的验证闭环——这两者共同支撑了 711 用例 + 9 赛道 bot 矩阵 + e2e 三视口的质量基线。

## 结论

当前项目处于高完成度交付状态：功能完整（9 赛道、4 种游玩模式、完整音效与存档、PWA 离线、移动端兼容）、架构整洁（依赖单向、纯函数领域层、共享常量真源）、质量门禁全绿（六项验证 2026-08-06 实测通过）。可作为"长程编程 + 严谨工程化"的参考样本。若继续演进，建议优先处理 game-loop.ts 超大类与测试环境负载稳定性两项已知技术债，功能候选可考虑幽灵回放、手柄支持、云排行榜等。

## 局限性

本次分析基于 2026-08-06 实测（typecheck/lint/test/bot/build/e2e 全量）与代码逐文件审计，但 e2e 的 8 个跳过用例（视口条件限定）未实际执行；集成测试（game-loop-integration）与 e2e 在低配置环境并行时存在已知的负载型超时抖动（非代码回归）；game-loop.ts 等大文件行数为精确读取，其余目录行数基于 grep 计数（每文件 ±1 行误差）。

## 参考文献

1. [AGENTS.md（项目规范）](https://github.com/mike652638/AI-Racing-Games/blob/main/AGENTS.md)
2. [README.md（用户文档）](https://github.com/mike652638/AI-Racing-Games/blob/main/README.md)
3. [codemap.md（仓库总览）](https://github.com/mike652638/AI-Racing-Games/blob/main/codemap.md)
4. [项目线上地址（CloudBase 静态托管）](https://joyful-d6glfqzna80c9f036-1252524693.tcloudbaseapp.com/ai-racing-games/)
5. [GitHub 仓库](https://github.com/mike652638/AI-Racing-Games)
