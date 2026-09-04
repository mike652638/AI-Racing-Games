# AI-Racing-Games 项目深入分析与总结报告

## 摘要

AI-Racing-Games 是一个用 TypeScript + Canvas 2D 实现的 OutRun 风格伪 3D 赛车游戏，不依赖 WebGL/Three.js，全部渲染由手写投影数学完成。项目已历经 35 个里程碑，形成 `shared → engine/physics → ui → game` 的单向依赖分层，核心领域层（渲染数学、车辆物理、漂移、AI 决策）做到纯函数化并可脱离浏览器运行，配合 65 个单测文件约 1051 个用例、9 赛道 bot 跑圈矩阵、Playwright 三视口视觉回归与完整 CI 流水线，工程质量在同规模个人项目中属上乘。当前工作区存在一组未提交改动（M38 模式设置面板 `mode-settings.ts`），把原本只能手输的 URL 参数暴露为菜单可点击卡片，已完成约 85% 集成度。静态分析另发现若干真实缺陷，其中"第二圈起车流既不渲染也不碰撞"（`cameraZ` 单调累加而 `car.z` 取模，两处裸比较未做环形处理）影响核心玩法，建议优先修复。

## 一、项目规模与技术栈

源码为 80 个 TypeScript 文件约 56 万字节（估计 1.2 万行上下，中文注释占字节较多），其中 `src/engine/` 22 个文件约 3770 行，`src/game/` 35 个文件（含 `game-loop.ts` 1215 行），`src/ui/` 8 个文件，`src/audio/` 2 个文件 620 行，`src/physics/` 3 个文件 371 行，`src/shared/` 7 个文件。样式拆为 `style.base.css`（727 行，设计令牌与 HUD）、`style.screens.css`（1314 行，三屏布局与菜单）、`style.interaction.css`（1046 行，暂停控件、响应式与可访问性）共 3087 行。测试侧 73 个 TS 文件约 60 万字节，文档 66 篇 Markdown（含 37 份 `docs/reports/` 研究报告与 18 份 `docs/superpowers/plans/` 实施计划）。

构建与质量工具链完整：Vite 8 + vite-plugin-pwa（`registerType: 'prompt'` 而非 autoUpdate，避免对局中被 Service Worker 打断）、TypeScript strict（额外开 `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch`）、ESLint（typescript-eslint recommended 加 `eqeqeq`/`no-eval`/`no-console` 安全规则）、Prettier、husky + lint-staged（pre-commit 跑 eslint --fix + prettier）、Vitest、Playwright、tsx。部署为 `scripts/deploy-cloudbase.mjs` 上传腾讯云 CloudBase 静态托管，`vite.config.ts` 用 `base: './'` 相对路径以支持子路径托管。

## 二、架构分层与依赖治理

项目最值得称道的是依赖治理。2026-08-05 完成的一次重构彻底消除了 `game ↔ ui` 双向环：把常量（`DRIFT_SCORE_MAX`、`CHALLENGE_TARGET_SCORE`）、阶段（`phase`/`phase-logic`）、圈数（`lap`）与共享类型（`RaceState`/`TrackContext`/`PlayerState`）全部下沉到独立的 `src/shared/` 层，engine、physics、ui 直接依赖 shared，game 层对 ui 只保留运行级调用。2026-08-22 进一步移除 game 层的 re-export 兼容层，让所有消费方直连真源。结果是运行时与类型层依赖环双双归零，依赖方向严格单向：`engine/physics → shared`，`ui → shared`，`game → engine/physics/ui/shared`。

纯函数落地程度约 85%。`projection`、`scenery`、`sprites`、`track`、`tracks`、`road-geometry`、`traffic`、`lighting`、`environment`、`routes` 以及 `physics/*` 全部做到无 DOM、无可变状态。绘制类模块（`sprite-draw`、`screen-effects`、`traffic-draw`、`terrain-draw`、`road-surface`、`player-car`）虽需要 Canvas 上下文，但 ctx 显式作为参数传入、不持有 canvas 状态，因而可测。真正持有可变状态的只有 `Renderer` 类（约 15 个可变字段）与三处离屏 canvas 构建点。

## 三、伪 3D 渲染管线

渲染顺序在 `renderer.ts` 的 `renderWithOpts` 中固定为 14 层：天空渐变 → 远山视差平铺 → 草地 → 地形装饰 → 路面分段 → 导航引导线 → 景物与车流按 z 降序双指针归并 → 距离雾 → 岔路分叉带 → 烟雾 → BOOST 尾焰 → 玩家车 → 雨丝 → 速度线与各类屏幕特效。景物与车流的交错归并是 2026-08-05 的一次 z-order 修复，解决了"远处车永远覆盖近处树"的画家算法错误。

核心投影公式为 `scale = depth / (pz - cz)`，`x = w/2 + scale*(px-cx)*(w/2)`，`y = horizon + scale*(cy-py)*(h/2)`，地平线取 `h*0.35`、景深取 `w*0.84`，绘制距离 120 段、段长 200 世界单位。一个容易踩坑的细节是曲率偏移的两套语义：路面渲染用相对累加（以相机为原点归零），而景物/引导线/分叉用绝对前缀和再减去相机自身偏移，不减会在弯道产生系统性漂移（实测最大 0.36 世界单位）。前缀和用 `Float64Array` 预计算，段内线性插值。

性能优化集中在三类离屏缓存。远山按 day/night 双套各 2 层预渲染、按环境懒重建；雨滴 112 条（M35 从 80 提密度 1.4 倍）以 15° 固定倾角预渲染到离屏 canvas，帧内改为双幅 `drawImage` 平铺，替代了原先每帧 112 次逐段描边；`road-strip.ts` 把曲率差小于 0.001 的相邻分段合并为曲率段（每段 20-50 段，纹理行高 4px，9 带渐变加确定性噪点），绘制时按屏幕高度分 1/2/4/8 档切片 `drawImage`。此外还有模块级复用缓冲（`_quadCur`、`_spriteProj`、`_seenScratch` 等）与 `fillStyle` 字符串缓存（上限 1024，超限删最早一半）来消除每帧分配。

## 四、玩法系统与模式矩阵

物理层简洁有效：`updateCar`（87 行）处理速度/转向/出界，`drift.ts`（200 行）实现漂移蓄力、连击（0.5s 窗口 +1，上限 10，倍率 `1+combo*0.25` 封顶 3.5 倍）与 Mini-Turbo 小喷。碰撞判定为 `|Δz| < 80 && |Δoffset| < 0.55`，命中后速度减半、冷却 1 秒，另有 5 秒起步保护期与 1600 单位车流出生安全窗口。雨天把转向乘 0.85、制动乘 0.7。BOOST 靠漂移蓄力，激活后突破 1.15 倍极速，蓄力不低于 0.8 时触发"完美氮气"。

模式体系通过 `mode-strategy.ts` 的策略对象封装五种玩法，避免了大段 if 分支：单屏合并输入、分屏双独立世界、热座回合制、挑战模式 60 秒限时、路线模式分段推进。URL 参数体系相当丰富——`?split` `?hotseat` `?challenge` `?route` `?weather` `?traffic` `?guide` `?daily` `?perf`，全部由 `game-params.ts`（82 行纯函数）集中解析，且互斥判定（split > hotseat > challenge > route）与 `createModeStrategy` 保持一致。M34 的六模块下沉（game-params、menu-setup、route-choice、boost-feedback、track-cards、pause-controls）把 `game-loop.ts` 从 1490 行压到 1120 行，其中 `game-params.ts` 因无 DOM 依赖成为本次 M38 改造的现成基石，说明抽象是成功的。

内容体量上，9 条赛道各带难度星级与 9 种差异化环境配置（plains/highway/s-curve/island/canyon/desert/forest/coast/alpine，各自天空/草地/远山/景物色板），另有 8 项成就、S/A/B 奖牌、3 条多阶段路线、每日挑战与哈希选赛道。存档层 `save.ts`（502 行）是最扎实的模块之一：8 类 key 前缀，用 `{v: SAVE_VERSION, data}` 信封做版本化并兼容无版本号的 v0 裸格式，存储不可用时降级为纯内存，还能按有效赛道列表惰性清理废弃条目。

AI 侧 `bot.ts` 仅 82 行：转向用 `-position * 1.5` 钳制，速度靠前瞻 8 段累计曲率判弯限速（弯道阈值 0.04，限速 5400 × 0.55），可选叠加车流感知减速。`simulate.ts` 用固定 1/60 步长跑完整圈，统计圈速、出界违规与碰撞数，`tests/bot/run-bot.ts` 遍历 9 条赛道做回归。

## 五、音频与 UI

音频全部是 WebAudio 程序化合成，零音频资源文件，共 7 个合成器类：引擎音用双锯齿波（detune 0/7）过低通 800Hz 映射 55-220Hz；雨声为 2 秒白噪循环过带通；碰撞音是白噪"砰"加 55Hz 正弦"咚"的双层结构；另有 near-miss 上扫音、BOOST 扫频、漂移摩擦带通噪声与常驻胎噪。BGM 是 16 步 chiptune，用 RAF 驱动的 30Hz 累加器加 0.2 秒前瞻调度替代 setInterval，规避后台节流。音量分 master/music/sfx 三轨并持久化到 localStorage。

UI 层把 DOM 引用集中在 `HudElements`（27 字段）与 `ScreenElements`（30+ 字段）两个接口，构造期一次性查询注入，UI 模块本身不持有 id 字符串。HUD 更新已做文本脏值比对（先比 `textContent` 再写），但布尔型 `hidden` 与 `classList.toggle` 仍有约 20 处每帧无条件赋值。可访问性做得相当到位：`:focus-visible` 焦点环覆盖全部交互控件、榜单卡片支持键盘展开并带 `aria-expanded`、`prefers-reduced-motion` 下 15 类动画置停、安全区 `env(safe-area-inset-*)` 贯穿布局、viewport 未禁用缩放。

## 六、质量保障体系

测试分四层：65 个单测文件约 1051 个用例覆盖六个源码目录；`npm run bot` 跑 9 赛道矩阵（判据 `finished && violations <= 3`）；Playwright 三 project（桌面 1280×720、移动横屏 812×375、大屏 1920×1080）共 18 个用例，含 canvas 逐像素断言（天空相邻差小于 60，用于守住"天空条纹"这个曾反复回归的 P0）；另有 `perf-bench`（测每帧对象分配数与中位耗时）与 `security-scan`（扫描 innerHTML/eval/add-removeEventListener 配对/any 使用）。CI 为两个 job：`ci` 跑 typecheck → lint → format:check → test → bot → build，`e2e` 依赖前者并上传失败产物。

一个别处少见的高价值测试是 `copy.test.ts`：它用 `readFileSync` 读 README 原文断言提示关键词与代码常量一致，从机制上防止文案漂移。

## 七、当前进行中的工作：M38 模式设置面板

工作区未提交的改动包含新增的 `src/game/mode-settings.ts` 与 `tests/unit/mode-settings.test.ts`，以及 `game-loop.ts`、`index.html`、两个 CSS 的修改。功能是把 URL 模式参数暴露为菜单 `#mode-selector` 九张卡片：点击循环切值 → `history.replaceState` 写回 URL → 六张卡（weather/traffic/guide/route/challenge/daily）热应用并回调 `GameLoop.applyRuntimeParams()` 重解析；三张卡（split/hotseat/perf）因涉及构造级组件（TrackManager、摇杆、性能档）写 URL 后 `location.reload()`。设计上延续了 M34 的注入式 DOM 风格（`getElement`/`onCleanup` 注入），纯逻辑与绑定分离，20 个单测覆盖循环、互斥、显示态与 reload 分流，整体质量在平均线以上。

不过集成度约 85%，有五处待收口：构造器尾部 `refreshMenuBoard` + `ensureLoop` 连注释重复出现两次（365-367 与 373-375 行）属合并残留；JS 用 `mode-card--selected` 而 `style.base.css:484` 写的是 `.mode-card-selected`（单横线），后者是死规则（选中态实际靠 9 条双横线规则生效，功能无损）；`applyPhase(PHASE_MENU)` 自行 `replaceState` 删除 `?challenge` 却不重渲染卡片，形成 URL 状态与卡片显示的第二真源；`cycleRouteValue` 硬编码 1/2/3 而 `routeLabel` 用 `ROUTE_DEFS.length`，路线增至 4 条时循环会断裂；热切路径无 `phase === PHASE_MENU` 守卫，正确性依赖"卡片只在 start-screen 内"这一隐式前提。

## 八、静态分析发现的缺陷

按严重程度排序。

最严重的是**多圈车流失效**。`frame-pure.ts:245` 的 `player.cameraZ += speed * dt` 单调累加从不取模，而 `traffic.ts:110` 的 `car.z` 每帧 `% lapLength`。碰撞检测 `collideWithPlayer`（traffic.ts:156）用 `Math.abs(car.z - playerZ) < 80` 裸比较，车流投影 `projectTraffic`（traffic-render.ts:43）用 `car.z > cameraZ && car.z <= farZ` 裸比较，两者都未做环形处理。这意味着第二圈起（`cameraZ >= lapLength`）车流既不会被投影渲染也不会触发碰撞，仅在跨圈边界的极窄窗口内偶发命中。值得注意的是同一文件的 `updateTraffic` 避让逻辑（traffic.ts:116）与 `near-miss.ts` 都正确使用了环形语义 `(car.z - player.z + lapLength) % lapLength`，说明这是局部遗漏而非设计意图。bot 矩阵走 `simulate.ts` 的同一条裸比较路径，因此"0 违规"的稳定性部分源于此。建议将碰撞与投影改为环形距离，或在调用方传入 `cameraZ % lapLength`，并补一条多圈场景的回归用例。

其次是 **`#near-miss` 飘字永不隐藏**。`frame-update.ts:540-546` 只在触发时设 `hidden = false` 并重启 CSS 动画，全仓库没有任何地方把它设回 `true`，而非 RACING 分支、`applyPhase`、`resetRace` 都没有兜底（对比 `challengeTimer`、`dailyBadge`、`minimap` 都有兜底隐藏）。效果上依赖 CSS 动画结束后元素停在最终帧，视觉可能不明显，但语义上是残留状态。

第三是**远山环境缓存失效**：`setViewport` 用硬编码的 `#27425e`/`#1f3046` 重建 4 张位图却不重置 `currentEnv`，下一帧 `envForMountains === currentEnv` 直接跳过重建，导致在 canyon/alpine 等环境下 resize 窗口后远山配色退化为 plains，直到环境再次变化才恢复。

其余为中等与轻微问题：`frame-update.ts` 三个提前返回分支（非 RACING / 倒计时 / 正常）各复制一份 8-11 字段的对象字面量，其中倒计时分支漏回传 `boostBar2`/`steer1`/`steer2`、非 RACING 分支漏回传 `boostBar2`，功能上靠下一帧惰性重取兜底但模式脆弱；`buildRoadStrips` 的 `curveAvg` 存在 off-by-one（`curveSum` 从 `segStart+1` 累加却除以 `count = i - segStart`），该字段在 src 内零消费、仅测试用直道断言掩盖；道路渲染 fallback 路径下 `roadColors(baseIndex + k)` 与 `shouldDrawCenterLine(k)` 相差 `baseIndex` 奇偶，中心虚线可能落在与烘焙纹理不同的色带上；`startBtn` 的 600ms `setTimeout` 与 `pause-controls.ts` 中两个岔路按钮的监听未登记 cleanup；`parseGameParams` 的 `challengeMode` 判定未排除 route，与 `createModeStrategy` 的优先级口径不一致；`save.ts` 的 `ACHIEVEMENT_ID_LIST` 与 `copy.ts` 的 `ACHIEVEMENTS` 是两份手工维护的 id 列表，存在漂移风险。

## 九、工程化与流程层面的改进空间

测试体系虽厚，但有几处结构性缺口。最明显的是**零覆盖率阈值**——`package.json` 无 coverage 配置、CI 无 coverage 步骤，无法量化"哪些代码没被测到"，这正是多圈车流语义这类盲区长期存在的原因。其次是 `perf-bench` 与 `security-scan` 只打印统计不做断言、未接入 CI，其价值随时间衰减。bot 矩阵判据偏宽松（`violations <= 3` 且无圈速基线回归，代码注释里留着的经典赛道 76.017s 基线未做成断言）。单测重度依赖手写 stub（`bindModeSelector` 用 `vi.fn()` 而非真实 DOM），导致 CSS 类名不一致这类问题逃过测试——建议对新增交互补真实 DOM 的集成测试。

代码组织上，下一个该拆的模块是 `frame-update.ts`（627 行，单个 `updateFrame` 函数体 456 行，上下文 30+ 字段、结果 16 字段），建议按"环境 → 车流 → 输入 → BOOST → 物理 → 碰撞 → 特效 → HUD"切 8 个 step 函数。零分配纪律也未闭环：`windowedSprite` 对每个可见精灵做 `{...sprite}` 展开，`projectTraffic` 每帧新建结果数组，`guide-line.ts` 每帧新建约 100 个采样对象字面量，与 `road-surface.ts` 的严格纪律形成反差。

文档侧 `codemap.md` 体系整体维护得很好，但存在滞后：`engine/routes.ts`（112 行路线系统）完全未进文件表，`game-loop.ts` 行数记的 1120 而实际 1215，测试文件数与用例数也已过期，`MAX_LAMP_SCALE`、`ROAD_NOISE_PER_SEG` 等常量变动未同步。

## 十、结论与建议

这是一个架构方向正确、工程质量扎实、内容完成度高的个人项目。从 M1 到 M35 的演进轨迹清晰可见一条主线：先做纯函数领域层，再解依赖环，再把编排逻辑持续下沉为可测模块，同时用 bot 矩阵与视觉回归守住行为与像素。当前的主要风险已经从"架构混乱"转变为"增量改动与既有机制缺乏收敛"——URL 写入出现两个真源、CSS 与 JS 类名脱钩、HUD 兜底隐藏清单不完整、codemap 滞后于代码。

建议按以下顺序处理：首先修复三个 P0 缺陷（多圈车流环形语义、`#near-miss` 隐藏、远山环境缓存重置），其中第一个影响核心玩法，应优先安排一次多圈实测确认；其次收口 M38 的五处集成问题（删构造器重复块、统一 CSS 类名、`applyPhase` 后重渲染卡片、路线循环改用 `ROUTE_DEFS.length`、加热切 phase 守卫）并补 `applyRuntimeParams` 的集成测试——该方法目前在全仓库测试中零覆盖；然后拆 `frame-update.ts`；最后把覆盖率阈值与 bot 圈速基线接入 CI，让质量门禁从"通过即算过"升级为"退化即报警"。

## 局限性说明

本报告基于静态代码分析与文档阅读，未实际运行游戏或跑通测试套件，因此第八节列出的缺陷中，多圈车流失效一项虽在代码层面证据明确（`cameraZ` 累加与 `car.z` 取模的不对称、两处裸比较、同文件避让逻辑已用环形语义），仍建议通过一次完整多圈游玩或针对性单测实测确认，不排除存在未被静态分析覆盖的补偿路径。测试用例数（约 1051）为对 `it/test(` 的正则统计，与 vitest 实际执行数可能有小幅出入。源码行数基于文件字节数估算，因中文注释在 UTF-8 下占 3 字节，估算精度有限。

## 参考来源

1. [AI-Racing-Games 仓库总览 codemap.md](d:\AI\AI-Racing-Games\codemap.md)
2. [项目规范 AGENTS.md](d:\AI\AI-Racing-Games\AGENTS.md)
3. [src/engine/codemap.md 渲染引擎层地图](d:\AI\AI-Racing-Games\src\engine\codemap.md)
4. [src/game/codemap.md 游戏编排层地图](d:\AI\AI-Racing-Games\src\game\codemap.md)
5. [src/ui/codemap.md UI 层地图](d:\AI\AI-Racing-Games\src\ui\codemap.md)
6. [tests/codemap.md 测试层地图](d:\AI\AI-Racing-Games\tests\codemap.md)
7. [docs/codemap.md 文档档案索引](d:\AI\AI-Racing-Games\docs\codemap.md)
8. [src/game/mode-settings.ts M38 模式设置面板](d:\AI\AI-Racing-Games\src\game\mode-settings.ts)
9. [src/engine/traffic.ts 车流生成/推进/碰撞](d:\AI\AI-Racing-Games\src\engine\traffic.ts)
10. [src/engine/traffic-render.ts 车流投影](d:\AI\AI-Racing-Games\src\engine\traffic-render.ts)
11. [src/game/frame-pure.ts 帧更新纯函数](d:\AI\AI-Racing-Games\src\game\frame-pure.ts)
12. [src/game/frame-update.ts 每帧更新编排](d:\AI\AI-Racing-Games\src\game\frame-update.ts)
13. [src/shared/constants.ts 常量唯一真源](d:\AI\AI-Racing-Games\src\shared\constants.ts)
14. [vite.config.ts 构建与 PWA 配置](d:\AI\AI-Racing-Games\vite.config.ts)
15. [playwright.config.ts 视觉回归配置](d:\AI\AI-Racing-Games\playwright.config.ts)
