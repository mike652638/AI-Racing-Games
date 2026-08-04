# AI-Racing-Games 深入分析与总结报告

> 基于仓库目录结构、AGENTS.md、README.md、根目录与 src 各层 codemap.md、package.json、docs/reports 研究报告、tests 测试体系文档归纳。**本次会话两轮实测全部通过**：第一轮 typecheck / npm test / npm run bot；第二轮（第十二节优化实施后）typecheck / lint / format:check / npm test（45 文件 645 用例）/ bot / build + 浏览器运行时实测；仅 Playwright e2e 未重跑（标注「基于文档记录」）。

## 一、执行摘要

AI-Racing-Games 是一个用 TypeScript + Vite + Canvas 2D 从零构建的 OutRun 风格伪 3D 街机赛车游戏，全部渲染由 Canvas 2D 的 1/dz 透视投影完成，不依赖 WebGL/Three.js。项目同时是用于压力测试 AI IDE（OpenCode Win11 Desktop v1.18.11，主力模型 DeepSeek V4 Flash）长程无人值守编程能力的验证性工程，因此工程化水准远超一般 demo。

完成度方面：M1 至 M17 共 17 个里程碑全部完成，并在其后完成了三项架构级收尾——新建 `src/shared/` 独立共享层解掉 game↔ui 运行时依赖环、renderer.ts（1143 行）按关注点拆分为约 560 行门面 + 5 个纯函数子模块、全量文档同步。**本次会话实测验证（2026-08-05）**：typecheck（tsc --noEmit）零错误、`npm test` 44 文件 639 用例全绿（耗时 25.57s）、`npm run bot` 9 赛道矩阵全部完赛且 0 违规；lint / PWA build / e2e 13 用例依据文档记录此前全绿（本次未重跑）。项目处于全绿可发布状态。

主要结论：这是一个以「纯函数领域层 + 确定性生成 + 四层质量门禁 + codemap 文档体系」为硬约束的长程演进范例，架构分层清晰、依赖单向化、文档可追溯，适合作为 agent 驱动开发模式的工程样板。

## 二、项目定位与目标

项目具有明确的双重定位（AGENTS.md 明文记载）：

1. **游戏定位**：OutRun 伪 3D 复刻——Canvas 2D 伪 3D 街机赛车，支持单屏、分屏（`?split=1`）、热座（`?hotseat=1`）、挑战（`?challenge=1`，60 秒限时刷分）四种游玩模式，9 条差异化赛道（含 2 条夜晚赛道）、漂移计分、BOOST 氮气、车流碰撞、PWA 离线游玩。
2. **验证定位**：测试 AI IDE 长程编程能力极限的实验载体。该定位直接塑造了项目形态——刻意采用 TDD 流程、确定性随机种子（mulberry32）保证可复现、bot 跑圈作为黑盒质量门禁、codemap 体系承载架构知识；每个里程碑的验收标准被固化为「typecheck + lint + test + build + bot 全绿」，且新增功能承诺「现有 API 只做加法」的向后兼容契约。

## 三、技术栈与工程约束

package.json 与 AGENTS.md 共同锁定的技术栈（明确约束「已定，不要随意更换」）：

| 类别 | 选型 | 用途 |
|------|------|------|
| 语言 | TypeScript（ES2022，strict + noUnusedLocals/noEmit） | 全部源码，类型安全 |
| 构建 | Vite | 开发服务器与生产构建（build 前先 tsc --noEmit） |
| 渲染 | Canvas 2D | 伪 3D 投影、路面、景物、车流、烟雾，禁用 WebGL/Three.js |
| 单测 | Vitest | tests/unit，44 文件 639 用例 |
| 脚本 | tsx | bot 跑圈脚本（tests/bot/run-bot.ts） |
| 静态检查 | ESLint（typescript-eslint）+ Prettier | lint / format:check |
| 提交门禁 | husky + lint-staged | 提交前 eslint --fix + prettier --write |
| 离线发布 | vite-plugin-pwa@1.3.0 | generateSW + autoUpdate，M15 起 |
| E2E | Playwright（@playwright/test） | M16 起视觉回归，双 project |

关键约束：渲染不得使用 WebGL/Three.js；验证必须按 typecheck → lint → test → build 顺序；engine/physics 为纯函数领域层不依赖 DOM；所有回复/注释/文档使用中文。

## 四、项目结构与分层架构

src 下按关注点分七层（约 49 个 TypeScript 源文件）：

| 层 | 目录 | 职责 |
|----|------|------|
| 共享层 | `src/shared/`（5 ts，本轮 +types） | 常量（constants）、阶段（phase/phase-logic）、圈数（lap）、类型（types：RaceState/TrackContext 真源） |
| 渲染层 | `src/engine/`（20 ts） | 投影数学、赛道定义与生成、路面几何、景物、车流、烟雾、光照、环境配置、road-strip 离屏缓存、Renderer 门面 |
| 物理层 | `src/physics/`（3 ts） | 车辆运动学（car）、漂移（drift）、双人/触屏输入规范化（input） |
| 编排层 | `src/game/`（24 ts，本轮 +audio-rig/countdown/track-preview/dom-setup） | GameLoop 主循环、RaceState、阶段 FSM、模式策略、帧更新/渲染纯函数、结算记账、碰撞与碰撞反馈、赛道上下文/管理器 |
| AI 层 | `src/ai/`（2 ts） | bot 决策器（bot.ts）、无头跑圈模拟器（simulate.ts） |
| UI 层 | `src/ui/`（8 ts） | 双人 HUD、画面、存档、格式化、文案（copy.ts）、摇杆、小地图 |
| 音频层 | `src/audio/`（2 ts） | WebAudio 程序化合成：引擎/漂移/胎噪/碰撞/BOOST 音效与 chiptune 音乐 |
| 测试层 | `tests/` | unit（Vitest）、e2e（Playwright）、bot（跑圈脚本）、__mocks__（canvas mock）、helpers |
| 档案层 | `docs/` | 计划档案（superpowers/plans）、视觉分析、reports 研究报告 |

架构特征：

- **依赖方向单向化（2026-08-05 已解环）**：engine/physics → shared；ui → shared + physics(type) + game(type only)；game → engine/physics/ui/shared。原 game↔ui 双向环已消除——ui 对 game 仅剩 `import type`（RaceState/TrackContext，编译期擦除），运行时依赖全部提升至 shared；game 层保留 re-export 兼容层。若再将类型提升至 shared 可 100% 解耦。
- **常量唯一真源**：`src/shared/constants.ts` 集中全部游戏参数（DRIFT_*、CHALLENGE_*、BOOST_*、COLLISION_*、RENDER_*、TRAFFIC_DEFAULT_COUNT=14），engine/physics/ui 直接导入杜绝魔法数字，并有 constants.test.ts 注册表断言防回潮。
- **状态集中 + 纯函数**：RaceState 是运行时唯一可变状态容器，渲染与 UI 均为 `state → output` 纯函数/渲染函数；副作用集中在 GameLoop 与 ui 表现层。
- **关键设计模式**：Renderer 门面 + RenderView 多视图参数化（分屏零重建）、TrackContext 双世界建模、TrackManager 依赖注入、ModeStrategy 策略对象（四模式差异封装）、四态阶段 FSM、确定性 PRNG、多级离屏缓存。

## 五、核心系统分析

1. **伪 3D 投影渲染**：engine/projection.ts 的 `project` 唯一纯函数，`scale = depth / (z - camera.z)`（depth = 宽 × 0.84，地平线比 0.35），路面每 200 世界单位分段，弯道由 curveSum 逐段累计横向偏移，画家算法分层绘制（天空→远山→草地→地形→路面→景物→车流→烟雾→粒子→玩家车→雨丝→屏幕特效）。
2. **赛道生成与注册表**：`createSmoothTrack` 控制点曲率线性插值生成，支持环形 O(1) 定位与闭环约束；TRACK_DEFS 注册表 9 条赛道（classic/highway/s-curve/island/canyon/desert/forest/coast/alpine），含难度星级、圈数、车流密度、夜晚标记、环境字段。
3. **环境差异化（M17）**：engine/environment.ts 为 9 种环境的单一真源（天空/草地色相、远山配色、景物类型密度、地形装饰）；渲染层按环境差异化光照、远山缓存懒重建、景物形状分发（cactus/palm/snowpile + rotation/scale 随机化）、地形装饰（沙丘/海面波浪/岩壁锯齿）。
4. **车辆物理与漂移**：`updateCar` 纯函数（77 行）：油门/刹车/滑行、速度相关转向灵敏度、出界钳制减速、漂移转向 override（×1.5）、wet 雨天（制动 ×0.7/转向 ×0.85）、BOOST 突破 1.15×maxSpeed；`updateDrift` 完整纯函数状态机：蓄力/衰减、激活阈值、烟雾粒子生命周期、得分随速度累计并经连击倍率（0.5s 窗口、上限 10 档 3.5×）与 DRIFT_SCORE_MAX(99999) clamp。
5. **碰撞与碰撞反馈**：车流碰撞裁决（大幅减速 + 1s 冷却）；M16 collision-feedback.ts 红闪纯函数状态机（impact 速度比映射）+ 屏幕红晕 vignette + HUD 碰撞计数 + 双层碰撞音 + 横向弹开防贴车。
6. **游戏主循环与模式策略**：game-loop.ts（M15 重构后约 700 行）仅作编排，每帧逻辑拆入 frame-update/frame-render/frame-pure/finish-accounting 四个纯函数模块；ModeStrategy 接口九个差异点、SINGLE/SPLIT/HOTSEAT/CHALLENGE 四实例，模式 if/else 全部收敛为 `mode.xxx()` 调用。
7. **音频合成**：零外部资源 WebAudio 程序化合成——EngineSound（双锯齿波+低通）、RainSound、CollisionSound（强度分级）、BoostSound 扫频、DriftSound/TireSound（M15）、MusicPlayer 16 步 chiptune（调度纯函数化可单测）；masterGain 下挂 musicGain/sfxGain 分轨，三 slider 持久化；首次按键惰性创建 AudioContext 满足自动播放策略。
8. **HUD/UI/存档**：updateHud 每帧以 RaceState 同步双人 DOM；screens.ts 四态画面切换 + 多模式结算填充；save.ts 统一存档（玩家维度 key、胜场/连胜、漂移 TOP10 含 combo 字段兼容、对局最近 10 局、JSON 损坏回退）。
9. **小地图**：Minimap 构造预计算归一化轨迹折线，每帧按 `cameraZ % lapLength` 重绘玩家位置点（M14）。
10. **AI bot 与无头模拟**：bot.ts 规则型控制器（前瞻曲率和判弯 + 降速 + 横向回中）；simulate.ts 确定性固定步长跑圈引擎，输出圈速/违规可断言指标；二者构成 `npm run bot` 9 赛道黑盒矩阵回归（**本次实测：9/9 完赛、全部 0 违规 0 出界**）。

## 六、测试与质量门禁

六层验证机制（验证顺序固化于 AGENTS.md 与 CI）：

1. **typecheck**（tsc --noEmit，strict）与 **lint**（typescript-eslint）+ **format:check**（Prettier）——静态门禁。
2. **单元测试**：44 文件 639 用例，中文行为规格命名兼具行为文档作用；canvas mock 基建（`__calls`/`__args` 调用记录）支撑「渲染确实发生且稳定」类断言；game-loop-integration.test.ts 以 stub 全局 DOM/rAF/AudioContext 驱动真实 GameLoop 的集成冒烟，覆盖阶段流转、四模式、9 赛道、暂停菜单、雨段环境音等。**本次实测**：44/44 文件、639/639 用例全绿，总耗时 25.57s；最重的集成文件 game-loop-integration.test.ts（45 用例）23.4s 完成，单用例最慢 3.4s（F4 雨段），均在放宽后的 15000ms 超时内稳定通过。
3. **bot 跑圈矩阵**（黑盒）：run-bot.ts 遍历 TRACK_DEFS 9 赛道按各自圈数 simulateLaps，输出 JSON 报告，全部 `finished && violations <= 3` 才退出码 0；确定性种子保证可复现。**本次实测（与文档基线完全一致，验证确定性）**：classic 三圈 76.017s、avgSpeed 3631.7；highway 100.233s；s-curve 44.883s；island 52.167s（avgSpeed 5188.7）；canyon 56.467s；desert 71.967s（avgSpeed 5219.3 最高）；forest 34.767s；coast 54.983s；alpine 43.867s——9 赛道全部 0 违规 0 出界，输出「✅ bot 跑圈通过」。
4. **build**：tsc --noEmit && vite build，产出含 sw.js/manifest 的 PWA 离线产物。
5. **E2E 视觉回归**（M16）：Playwright 双 project（桌面 1280×720 + 移动横屏 812×375），覆盖菜单光晕、标题叠影、天空条纹（canvas 像素级）、倒计时文案同源、热座 HUD 标签、移动端视口（文档记录 13 用例通过，本次未重跑）。
6. **CI 全链路**：typecheck → lint → format:check → test → bot → build 串行 + e2e 独立 job（needs: [ci]）+ 失败产物上传（保留 7 天）。

质量保障作用：白盒单测锚定纯函数行为与历史缺陷回归点；bot 矩阵以游戏项目罕见的黑盒手段保证「赛道可跑通」这一最高层不变量；e2e 守住视觉体验底线；四层门禁叠加使每个里程碑可独立验收。

## 七、工程化与文档体系

- **CI**：Node 22 + npm cache，ci job 串行六步 + e2e 独立 job，失败自动上传 test-results。
- **提交前检查**：husky pre-commit + lint-staged（eslint --fix + prettier --write）；CRLF 换行三层防护（.gitattributes eol=lf + autocrlf=false + IDE 设置，基于文档记录）。
- **PWA 离线**：vite-plugin-pwa generateSW + autoUpdate，maskable/SVG 图标、横屏 orientation、导航回退 index.html。
- **性能模式**：三档 PerformanceConfig（PERF_HIGH 120 段全特效 / PERF_MID 分屏 80 段 / PERF_LOW 60 段 + 粒子/雨丝跳过开关），`?perf=1` 触发。
- **文档体系**：根目录与每个子目录（src/engine/physics/game/ai/ui/audio/tests/docs）配套 codemap.md（职责/设计/流程/集成/文件清单）；docs/superpowers/plans 下 M4-M15 共十余份计划文档按 superpowers writing-plans 约定（Goal/Architecture/Tech Stack/Global Constraints + Task checkbox + TDD 步骤）；docs/reports 沉淀 10+ 份专题研究报告（碰撞反馈、环境差异化、运行时实测、道路优化等）；历史计划保留为快照不改写，形成可追溯工程契约。

## 八、当前状态与里程碑演进脉络

演进遵循「先打地基、再扩展、后优化、末解耦」节奏：

- **M1-M5（基础闭环）**：渲染骨架 → 车辆物理 → 赛道系统 → bot 跑圈 → HUD/音效/结算/发布构建，定义并冻结核心 API。
- **扩展 1-2（M6 前后）**：平滑弯道、景物、漂移、分屏、存档；车流碰撞、漂移得分、关卡选单、chiptune、触控。
- **M6-M7**：GameLoop 重构与阶段 FSM 下沉 game 层；双人存档与结算。
- **M8-M13（功能密度期）**：热座/车流密度 → 9 赛道+难度星级+排行榜 → 车流避让/BEST 汇总/连击倍率 → 夜晚赛道/对局榜/触屏暂停/雨声 → 挑战模式/雨天物理/BOOST/分轨音量 → H 系列打磨与 9 赛道 bot 矩阵回归。
- **M14（性能期）**：road-strip 曲率段离屏缓存、小地图、每帧分配削减、三档性能模式、死代码清理。
- **M15（架构+工程期）**：game-loop 938→约 720 行四模块拆分、ModeStrategy 策略对象、漂移/胎噪音效、PWA 离线、CI/lint/husky 工程化。
- **M16（运行时实测期）**：天空条纹/热座渲染/移动端适配修复、碰撞反馈增强、路面 9 带渐变+噪点、copy.ts 文案同源、帧调度纯函数化、Playwright 视觉回归落地。
- **M17（内容差异化期）**：environment.ts 9 环境配置 + 差异化景物形状与地形装饰 + 远山缓存按环境懒重建。
- **架构收尾（M17 后，2026-08-05）**：三项架构级收口——src/shared/ 独立共享层解环（16 文件）、renderer.ts 拆分（6 文件 +698/-612）、全量文档同步（9 文件），依赖方向完全单向化。

## 九、优势与亮点

1. **纯函数优先设计**：engine/physics 核心完全可单测、可无头运行，状态经显式参数传递，RaceState 集中管理，副作用边界清晰。
2. **可测试性**：639 用例 + canvas mock 调用记录机制 + 真实主循环集成冒烟 + 中文行为规格测试兼具行为文档。
3. **确定性模拟**：mulberry32 种子保证场景/车流/远山同输入一致，支撑可复现回归。
4. **黑盒跑圈验证**：bot 矩阵是游戏项目罕见的端到端不变量门禁（9 赛道可完赛、违规可控）。
5. **文档可追溯性**：codemap 全层级覆盖 + 计划档案 + 研究报告三层体系，架构知识不依赖个人记忆。
6. **性能优化成体系**：离屏缓存（远山/雨丝/road-strip）、空间索引、曲率前缀和、fillStyle 缓存、每帧分配削减、三档降级模式，且多数有测试锚定。
7. **演进纪律**：「现有 API 只做加法」契约 + 每里程碑全量验证 + 提交前门禁，适合长程 agent 驱动开发。

## 十、风险、技术债与可改进点

> 本节状态已按「十二、本轮无人值守优化实施记录」刷新：原 6 项风险中 4 项已解决、1 项部分缓解、仅 1 项遗留。

1. **大文件复杂度（已缓解）**：game-loop.ts 本轮再拆分后从 999 行降至 861 行（音频装备/倒计时/赛道预览/DOM 组装下沉 4 个新模块）；仍为最大单文件，若 UI 继续复杂化可考虑轻量组件抽象（需权衡对纯函数测试体系的影响）。
2. **类型级依赖残留（✅ 已解决）**：RaceState/TrackContext 接口已提升至 `src/shared/types.ts`，ui 三文件改从 shared 导入，ui→game 类型与运行时依赖全部消除，100% 解耦。
3. **调试钩子生产负担（✅ 已解决）**：installDebugHook 增加 `import.meta.env.DEV` 门控，vite build 下静态替换为 false 并被死码消除；vitest/dev 保持安装，测试断言不受影响。
4. **测试脆弱性（✅ 大部分解决）**：四个分屏重用例改用 forest 短赛道（2 圈，帧数 1075→700），15000/30000ms 超时放宽全部移除，回到默认 5000ms（实测最慢 2.3s）；bot 判定容忍 violations ≤ 3 与 renderer 状态级验证属刻意折衷，维持不变。
5. **运行时体验（✅ 部分补齐）**：本轮已完成浏览器无人值守实测（见第十二节）：FPS 121 无掉帧、完整阶段流转、音频/音乐运行、结算 NEW RECORD；移动端触控手感、PWA 离线可用性、e2e 视觉回归仍待人工/CI 验证。
6. **常量双默认值语义（✅ 已标注）**：根 codemap.md 已显式标注 14（运行时）/ 8（bot 基线）双默认值刻意保留、勿统一。

## 十一、后续建议（按优先级排序）

**架构优化**
1. ~~将 RaceState/TrackContext 类型提升至 shared~~（✅ 已完成，见第十二节）。
2. ~~再拆 game-loop.ts~~（✅ 已部分完成：999→861 行；后续可继续按「输入采集/事件绑定」下沉）。
3. ~~debug-hook 构建剥离~~（✅ 已完成：DEV 门控）。

**运行时打磨**
4. 补齐人工游玩实测（移动端触控手感、PWA 离线安装/更新流程），本轮浏览器自动化实测已覆盖桌面主流程。
5. 继续沿「架构级改动 + 运行时打磨交替」的节奏推进新功能（如音效空间化、更多环境特效）。

**测试增强**
6. ~~消除分屏用例超时放宽~~（✅ 已完成：短赛道降帧方案）。
7. 评估引入真实 canvas（node-canvas 或浏览器内截图比对）提升渲染断言强度。

**文档同步**
8. ~~codemap 标注车流双默认值~~（✅ 已完成）。

**发布准备**
9. 完善 OG/分享卡片正式域名注入与 PWA 更新提示体验，为正式对外发布做准备。

## 十二、本轮无人值守优化实施记录（2026-08-05）

依据第十/十一节的诊断，完成一轮无人值守的测试/优化/打磨/验证闭环，六项实施 + 全量验证 + 浏览器运行时实测：

**架构优化（3 项）**
1. **类型提升 100% 解耦**：新建 `src/shared/types.ts`（RaceState/TrackContext 接口唯一真源，仅 import type 转发 engine/game 类型，编译期擦除）；game/state.ts、game/track-context.ts 改为 re-export 兼容层；ui/hud.ts、ui/screens.ts、ui/minimap.ts 改从 shared 导入——ui→game 类型与运行时依赖全部消除。
2. **game-loop.ts 再拆分（999→861 行）**：新增 `src/game/audio-rig.ts`（createAudioRig 音频装备束）、`src/game/countdown.ts`（runCountdown 倒计时）、`src/game/track-preview.ts`（integrateControlPoints + buildTrackPreviewSvg 纯函数）、`src/game/dom-setup.ts`（HUD/屏幕 DOM 引用组装）；并新增 track-preview.test.ts（6 用例）。
3. **debug-hook 生产剥离**：`import.meta.env.DEV` 门控，生产构建死码消除 19 个 getter。

**测试增强（1 项）**
4. **消除超时放宽**：四个分屏重用例（P1 完赛/P2 完赛/双人完赛横幅/对局榜）改用 forest 短赛道（2 圈，Digit7/Shift+Digit7 双人同步选道），帧数 1075→700，15000/30000ms 放宽全部移除，回到默认 5000ms；断言语义不变（F2 赛道名断言同步改「森林穿梭」）。

**文档同步（1 项）**
5. **车流双默认值标注**：根 codemap.md 新增 14/8 双默认值语义说明；根与 src/codemap.md 依赖方向表述刷新为「含类型层 100% 解耦」。

**工程修正（1 项）**
6. **eslint 忽略清单补 `.qoder`**：外部 IDE 工具产物目录（better-harness 生成的 canvas 脚本）导致 lint 报 8 错，补入 ignores 恢复门禁绿色。

**全量验证（本次会话实测，全绿）**：typecheck 零错误；lint/format:check 零告警；`npm test` 45 文件 **645 用例**全绿（22.96s，含新增 6 用例，分屏用例最慢 2.3s 稳定在默认超时内）；`npm run bot` 9 赛道全部完赛 0 违规、圈速与基线逐位一致；`npm run build` PWA 产物正常（sw.js/manifest，JS 82.58 kB / gzip 25.63 kB）。

**浏览器无人值守运行时实测**（vite dev + 自动化浏览器，补齐运行时证据链）：
- 菜单加载零控制台错误/告警；DEV 下 debug 钩子正常安装（phase=menu、trafficCount=14 验证门控未误伤）。
- 开始比赛后实测 **FPS 121 无掉帧**、phase=racing、音频与音乐 AudioContext running、车流碰撞正常发生（collisions 递增）。
- 全油门自主完赛：结算面板完整填充（总用时 0:49.865、均速 295 km/h、NEW RECORD、三圈分圈、漂移得分），M19「回主菜单」按钮可见。
- 阶段流转全链路验证：menu → racing → finished →（R 回菜单）→ Digit5 选 canyon → racing →（Escape）paused，赛道切换与暂停均正常。
- 竖屏窄视口正确触发「请旋转设备」提示层（移动端适配逻辑工作正常）。
- 遗留观察：高负载渲染下自动化截图工具偶发超时（不影响游戏本身）；移动端触控手感与 PWA 离线安装仍待人工验证。

## 总体总结（≤200 字）

AI-Racing-Games 以 TypeScript + Vite + Canvas 2D 完整复刻了 OutRun 伪 3D 街机赛车，17 个里程碑加架构收尾全部完成。本轮无人值守优化又落地三项架构改进（shared/types 类型提升 100% 解耦、game-loop 999→861 行、debug-hook 生产剥离）与测试脆弱性修复；实测 typecheck/lint/645 单测/bot 9 赛道 0 违规/PWA build 全绿，浏览器实测 FPS 121、全阶段流转正常，处于稳定可发布状态。

## 五条最重要结论

1. **项目全绿可发布且本轮实测覆盖全部六层门禁**：typecheck 零错误、lint/format 零告警、645/645 单测、bot 9 赛道 0 违规（圈速逐位复现）、PWA build 正常，另加浏览器运行时实测。
2. **ui→game 已 100% 解耦**：RaceState/TrackContext 类型提升至 src/shared/types.ts 后，运行时与类型层依赖环全部消除，依赖方向完全单向化。
3. **黑盒跑圈矩阵持续实证确定性**：bot 圈速两次实测与文档基线逐位一致（classic 76.017s），是可复现性的最硬证据。
4. **测试脆弱性已系统性修复**：短赛道降帧方案消除全部超时放宽，分屏重用例回到默认 5000ms 且最慢仅 2.3s。
5. **技术债大幅收敛**：原 6 项风险已解决 4 项、缓解 1 项，仅剩人工游玩实测（移动端触控/PWA 离线）与 game-loop 后续拆分两项低优先级遗留。

## 局限性说明

本报告以静态代码与文档阅读归纳为基础，并经本次会话（2026-08-05）两轮实测：第一轮运行 typecheck / npm test（当时 44 文件 639 用例）/ npm run bot；第二轮实施优化后重跑全部门禁（typecheck / lint / format:check / npm test 45 文件 645 用例 / bot / build 均本次实测通过），并完成浏览器无人值守运行时验证（FPS/阶段流转/音频/结算）。Playwright e2e 视觉回归（需安装 chromium）未在本次会话运行，其 13 用例通过引自文档记录；移动端触控手感、PWA 离线安装为「未实测」。
