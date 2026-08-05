# docs/

## Responsibility

项目计划与演进档案目录。集中存放各里程碑（M1-M17）的实施计划文档、研究报告、视觉分析与复盘优化方案，以及目录级 codemap 索引，为长程无人值守开发（agent 驱动）提供可执行规范、任务跟踪与历史依据。所有计划文档遵循 TDD 流程（先写失败测试→最小实现→集成→全量验证→提交），研究报告记录实施后的实测取证与交付结论，共同构成代码库之外唯一的行为契约来源。

M16 起演进档案形成"计划 + 研究报告"双轨：`superpowers/plans/` 存放可执行的计划/Task 契约，`reports/` 存放实施后的研究/交付/实测报告，`visual-analysis/` 存放基于截图的视觉与 UI/UX 分析，`superpowers/specs/` 存放已批准的设计文档，`screenshots/` 归档证据截图。

## Design

- **计划文档约定**：每个计划一个 Markdown 文件，位于 `superpowers/plans/`，文件名按日期命名（`YYYY-MM-DD-<slug>.md`）；内容采用 superpowers `writing-plans` / `executing-plans` 约定——文档头部声明 Goal/Architecture/Tech Stack/Global Constraints，正文按 Task 分解，每个 Task 以 `- [x]` checkbox 跟踪完成状态，并给出 Files、Interfaces（Consumes/Produces）、TDD 步骤与验证命令。
- **研究报告约定**：`reports/` 下以 `research_report_<slug>.md` 命名，每份报告记录任务背景、现状分析、实施改动（含文件与接口）、回归测试增量（如 608 → 624 用例）与全量验证结果（typecheck + lint + test + bot 9 赛道矩阵 + build + e2e），并附 Playwright/浏览器实测取证。
- **视觉分析约定**：`visual-analysis/` 存放基于多路 observer 截图分析的整合报告，按 P0/P1/P2/P3 分级问题清单输出，供后续修复计划引用。
- **设计文档约定**：`superpowers/specs/` 存放已批准的设计文档（如 M14 性能优化设计），早于对应计划文档落地，是计划的技术前置依据。
- **截图归档约定**：`screenshots/` 按前缀归档证据截图（`audit-*` 运行时实测、`auto-*` 无人值守自动化、`shot-*` 各模式演进、`roadfix-*`/`zorder-*`/`zfix-*`/`road-*`/`menu-*`/`finishbox-*` 专项修复前后对比）。
- **验证优先级约定**：所有计划统一约定 `typecheck → lint → test → build →（bot / browser）` 的验证顺序，与 AGENTS.md 保持一致。
- **索引体系**：每层目录配套 `codemap.md` 描述职责、设计、流程与文件清单，构成自顶向下的导航（`docs/codemap.md` → `docs/superpowers/codemap.md` → `docs/superpowers/plans/codemap.md` 与 `docs/superpowers/specs/codemap.md` → `docs/reports/codemap.md` → `docs/visual-analysis/codemap.md`）。

## Flow

计划与研究报告按开发时间与依赖关系演进，形成多层递进：

1. **基础闭环（M4-M5）**：`2026-08-02-m4-m5-complete.md` 完成核心可玩闭环——M4 bot 决策器/跑圈模拟器/违规报告（`npm run bot`）、M5 HUD/引擎音效/启动画面/状态机/结算/发布构建。此阶段定义并冻结核心 API（`createDefaultTrack`、`updateCar` 返回出界标记、`decideBotInput`、`simulateLaps`、`format*` 等），后续所有计划承诺"现有 API 只做加法"。
2. **第一轮扩展（M6）**：`2026-08-02-extensions.md` 在基础闭环之上新增 5 个独立方向——平滑弯道控制点（`createSmoothTrack`）、路面景物（sprites.ts）、漂移系统（drift.ts）、双人分屏（input.ts + renderRegion）、存档（save.ts）。各 Task 独立闭环、互不阻塞，并为下一轮提供 API（如 `mulberry32`、`Sprite`、`DriftState`）。
3. **第二轮扩展**：`2026-08-02-extensions-2.md` 继续叠加 5 个方向——车流/碰撞（traffic.ts）、漂移得分（扩展 DriftState）、关卡选单（tracks.ts）、合成音乐（music.ts）、移动端触控（touchInputFrom/mergeCarInput）。显式依赖第一轮产物（traffic 消费 `Segment`/渲染管线，tracks 消费控制点）。
4. **复盘优化**：`2026-08-02-optimize.md` 收尾阶段系统性复盘——按 P0/P1/P2 优先级分类 8 个功能缺陷（F1-F8）、8 个代码质量问题（Q1-Q8）、4 个性能热点（P1-P4）与 8 个游戏性增强（G1-G8），并以 10 个 Task 落地（暂停菜单、分屏碰撞、多赛道存档、漂移得分上限、分圈计时、main.ts 拆分、山形预渲染、sprites 分组、虚拟摇杆、天气循环），同时沉淀 5 条关键经验（相机 z 同步、合成事件局限、HMR 状态丢失、Window vs Document 事件、TDD 红绿分离）。
5. **完整优化实施**：`2026-08-03-optimization.md` 基于代码复核（oracle）+ 浏览器实测（Playwright/observer）的完整优化计划，10 个 Task 覆盖 P0 缺陷修复（互碰冷却、渲染尺寸校准、菜单 HUD 隐藏）、架构重构（分屏独立 PlayerState、main.ts 拆分与 Phase 下沉、updateDrift 纯函数化、常量集中）、体验增强（赛道切换预览动画）与测试/性能补强（Renderer/主循环测试、sprites 空间索引），并附无人值守闭环推进指南。
6. **分屏双赛道（M6）**：`2026-08-03-split-screen-multi-track.md` 实现双人独立世界——Task A 分屏分界线像素对齐与分隔线、Task B1 TrackContext 建模（双世界数据容器）、B2 Renderer 多 view 渲染参数化、B3 TrackManager 双玩家选赛道、B4 GameLoop 双世界集成、B5 全量验证与冒烟；双人各自选赛道（P1: 1/2/3、P2: 7/8/9）、独立圈数/完赛判定。
7. **双人存档与结算（M7）**：`2026-08-03-split-save-finish.md` 补齐分屏玩家维度——Task C1 存档玩家维度（P2 用 `-p2` key 后缀）、C2 P2 圈速记录与 HUD P2 BEST、C3 结算面板双人化（完赛标记驱动 P1/P2 行独立填充）、C4 全量验证与冒烟、C5 codemap 刷新。
8. **热座与游戏性扩展（M8）**：`2026-08-03-hotseat-drift-gameplay.md` 三项扩展——D1 单屏 P2 BEST、D2 热座轮流模式（`?hotseat=1` 双人先后跑同赛道比成绩，回合间回车交棒）、D3 分屏漂移得分竞速横幅、D4 新赛道 ×2（island/canyon，选择 UI 扩为 5 槽，P2 键位 Shift+1-5）、D5 车流密度赛道级调参（`TrackDef.trafficCount`）、D6 天气循环（晴/阴 45s 交替）、D7 全量验证与冒烟、D8 codemap 刷新；另含修饰键不触发开始的缺陷修复。
9. **遗留修复与双人持久化（M9）**：`2026-08-03-wins-ranks-difficulty.md` 六项任务——E1 分屏结算 P1 行前缀、E2 白天天空色相修复（消除正午绿天空；「亮青竖条纹」确认为山脊剪影）、E3 热座 P2 回合车流推进与碰撞、E4 热座/分屏胜场统计与连胜（localStorage 分模式 key）、E5 新赛道 ×4（desert/forest/coast/alpine）扩至 9 条 + 赛道难度星级（`TrackDef.difficulty` + 菜单 ★ 显示）、E6 漂移得分 TOP10 排行榜（跨玩家，菜单 `#drift-top` 展示前 5）、E7 全量验证与冒烟、E8 codemap 刷新；另含 9 槽菜单布局修复。
10. **结算打磨与游戏性扩展（M10）**：`2026-08-03-finish-combo-weather-pause.md` 六项任务——P1 结算面板打磨（P1/P2 圈速行前缀 + 面板底部间距）、P2 漂移连击/倍率系统（`combo` 累积 + `DRIFT_SCORE_MAX` clamp 落地，P7 冒烟修复连击窗口 2→0.5s）、P3 各赛道 BEST 汇总（菜单 `#best-summary` 9 行）、P4 车流避让 AI（`updateTraffic` 玩家尾参变道）、P5 雨天气（晴/阴/雨三态各 45s + 雨滴 overlay）、P6 暂停菜单（音量 slider 持久化 + 重开按钮）、P7 全量验证与冒烟、P8 codemap 刷新；另含 BEST 汇总限高修复。
11. **夜晚/对局/触屏/音效扩展（M11）**：`2026-08-03-night-match-touch-audio.md` 六项任务——F1 赛道夜晚模式（`TrackDef.timeOfDay`，canyon/alpine 设 night，深暗色板 + 车头灯光晕 + day/night 双套远山缓存）、F2 分屏对局榜（`addMatchResult` 最近 10 局 + 菜单 `#match-top`）、F3 触屏暂停（`#pause-btn`/`#pause-resume` + `joystick.reset()`）、F4 环境音效（`RainSound` 雨段循环噪声 + `CollisionSound` 碰撞冲击音 80ms 防刷屏）、F5 drawRain 离屏缓存（`buildRainCanvas` 双幅 drawImage 平铺，帧内零 stroke）、F6 漂移得分 MAX 标记（HUD 触顶显示 `MAX`）、F7 全量验证与冒烟、F8 codemap 刷新。
12. **挑战/氮气/雨天/工程优化（M12）**：`2026-08-03-challenge-boost-wet-audio.md` 七项任务——G1 漂移挑战模式（`?challenge=1` 限时 60s 刷分自动结算，与漂移 TOP10 联动 + `#challenge-timer`）、G2 车灯随车流避让转向（`TrafficCar.shiftDir` + `drawHeadlight` steerDir 偏移）、G3 雨天物理（`updateCar` wet 尾参：制动 ×0.7、转向 ×0.85）、G4 BOOST 氮气（漂移蓄力 `updateBoostCharge` + Space/Enter 激活突破 1.15×maxSpeed + `#boost-bar` 200px 像素映射）、G5 每帧分配优化（lapRef/lapRef2 复用）、G6 MusicPlayer 调度纯函数化（`stepEvents`/`nextStep` 导出）、G7 音效音量分级（masterGain 下分 musicGain/sfxGain + 三 slider 持久化）、G8 全量验证与冒烟（含夜间 bot 回归）、G9 codemap 刷新；另含 BOOST 条宽度修复（8660e28）。
13. **挑战加成/粒子/尾灯/排行榜/回归矩阵（M13）**：`2026-08-03-challenge-bonus-particles-matrix.md` 八项任务（H1-H8）——H1 挑战模式天气/难度加成计分（`updateDrift` 第 7 可选尾参 `scoreMultiplier`，雨天 +50%、难度 2★+25%/3★+50%，默认 1 逐字节兼容）、H2 BOOST 音效与视觉粒子（`BoostSound` 200→600Hz 扫频 + `BoostParticle` 尾焰拖尾）、H3 车流夜间尾灯（drawTraffic night 分支 `#ff3b30` 双灯 fillRect，day 零新增）、H4 漂移连击排行榜权重（`DriftEntry` 可选 `combo` 字段 + `#drift-top` 连击 x 倍率显示，旧条目兼容不丢）、H5 updatePlayerFrame 返回 lastLap 消除桥接（删除 `LastLapRef`/lapRef，wet 上移第 6 尾参，净删 23 行）、H6 CollisionSound 强度分级（`play(volume)` 按碰撞速度 clamp 0.4-1 缩放 gain）、H7 结算面板可滚动（`#finish-screen` 加 max-height + overflow-y: auto）、H8 run-bot 9 赛道矩阵回归（遍历 `TRACK_DEFS` 全赛道 simulateLaps + 汇总报告）；另含 H9 全量验证与冒烟（test-m13.py + observer 复核）、H10 codemap 刷新。H1-H8 全部完成并提交（1e8900c/58fec9c/9cdbb08/6b2504b/cde19e4/eb81310 及后续收尾提交）。
14. **性能优化（M14）**：`2026-08-03-performance-optimization-plan.md` 实施三层优化（10 个 Task）——(A) 道路离屏缓存：新增 road-strip.ts（`buildRoadStrips` 曲率段合并 + `renderRoadStripToCanvas` 离屏预渲染），`TrackContext.roadStrips` 预计算字段，Renderer 帧内 drawImage 平移复用替代 drawQuad 循环；(B) 每帧分配削减：`spritesInRangeIndexed` 复用数组、`viewFor` 返回 `_viewCache` 缓存对象、fillStyle 字符串缓存；(C) 分屏/性能模式降级：`PerformanceConfig` + `resolvePerformanceConfig`（PERF_HIGH 120 / PERF_MID 80 / PERF_LOW 60），`?perf=1` 查询参数，skipSmoke/skipBoostParticles/skipRain 渲染开关；Task 10 收尾 bot 9 赛道矩阵回归。另附 `2026-08-03-performance-optimization-task8-report.md`（Task 8 实施报告：`?perf` 参数与三档配置落地详情）。
15. **已识别改进实施（M15）**：`2026-08-04-improvements.md` 按文件边界拆 6 条并行 lane（Task A-F）——A 激活 roadStrip 离屏缓存消费（直道段切片 drawImage 加速、弯道段保留逐段 drawQuad，零渲染回归）、B 车流避让恢复逻辑（`TrafficCar.cruiseOffset` 巡航偏移 + 避让后渐变恢复）、C simulateLaps 车流模式（`LapOptions.withTraffic` 可选 + `collisions` 计数，默认基线 76.017s/0 违规不变）、D game-loop.ts 拆分与 pauseTitle（提取 volume.ts / top-refresh.ts，拆分后 938→722 行）、E 死代码清理与文档同步（移除 `collidePlayers`、仅测试导出迁 tests/helpers）、F 工程化配置（ESLint 安全规则 / Prettier / husky lint-staged / CI workflow / .gitignore 规范化）；收尾统一全量验证并按 lane 分提交（355bfe1 拆分、9afa434 四模块单测、c483916 菜单/结算动画、7b816e8 漂移/轮胎音效、da7c27d 离线 PWA 构建、a6dfdc0 集成超时放宽、4378cd5 codemap 同步）。
16. **运行时实测与修复（M16）**：由 `reports/` 系列报告承载闭环——`research_report_runtime_testing.md` 通过 agent-browser 实测（四模式 + 9 赛道代表）发现 minimap 渲染空白、玩家车出界卡死、开局碰撞 ×1 等 2 个核心 bug 与多项 UX 问题；`research_report_fixes_applied.md` 按 P0-P3 优先级实施全部修复（天空条纹、热座 P2 渲染/RAF 链断裂、菜单光晕、移动端适配、HUD 对比度），另发现并修复热座 P1 完赛后 RAF 链断裂 bug；`research_report_m16_improvements.md` 落地三项工程化改进（copy.ts 操作提示与 README 同源、`shouldScheduleNextFrame` 帧循环调度纯函数化、Playwright 视觉回归 + CI 集成，桌面/移动横屏双 project）；`research_report_road_optimization.md` 完成道路视觉优化（路面 9 带渐变 + 颗粒噪点 + fallback 3 带 + shadeColor 纯函数化）；`research_report_collision_feedback.md` 增强碰撞反馈（屏幕红闪 vignette + HUD 碰撞计数 + 双层碰撞音 + 横向弹开防贴车）；`research_report_legacy_issues_audit.md` 对旧运行时报告逐项代码级核查修复。
17. **环境差异化（M17）**：`research_report_track_validation.md` 验证 9 赛道几何/难度有差异但环境视觉维度缺失 → `research_report_environment_diff.md` 为 `TrackDef` 增加 `environment` 字段 + environment.ts 9 环境配置（plains/highway/s-curve/island/canyon/desert/forest/coast/alpine 的天空/草地/远山/景物色板）并渲染层落地 → `research_report_sprite_terrain.md` 扩展 SpriteKind（cactus/palm/snowpile）+ EnvironmentProfile.terrain 地形装饰（沙漠沙丘/海岸海面/峡谷岩壁）→ `research_report_phase2_terrain.md` 增强阶段 2（海面波浪/仙人掌群/棕榈弯曲/岩壁锯齿）；远山缓存按环境懒重建。
18. **专项优化方案（docs/ 根）**：`ui-optimization-plan.md`（基于 22 张截图分析确认的 UI/UX 真实问题清单，纯 CSS/HTML/DOM 修复，orchestrator + fixer 协作执行）与 `menu-ui-optimization-plan.md`（菜单页图标风格统一、星级显示、选中状态、信息层次与交互反馈优化方案）直接存放于 docs 根目录，供对应里程碑引用。

整体演进遵循"先打地基、再扩展、后优化"的顺序，每份新计划都承诺对既有 API 的向后兼容，形成可追溯的工程档案。

## Files

| File | Responsibility |
|------|----------------|
| codemap.md | 本目录索引：docs 目录职责、规划方式、文档演进关系与文件清单 |
| superpowers/codemap.md | `docs/superpowers` 子目录索引（计划体系与技能目录的说明占位） |
| superpowers/plans/codemap.md | `plans` 子目录索引（计划文档清单的说明占位） |
| superpowers/plans/2026-08-02-m4-m5-complete.md | M4-M5 完整实施方案：bot 决策器 + 跑圈模拟器 + `npm run bot` 报告 + HUD/音效/状态机/结算/发布（8 个 Task） |
| superpowers/plans/2026-08-02-extensions.md | 第一轮扩展（M6）：平滑弯道控制点、路面景物（路灯/树木）、漂移系统、双人分屏、localStorage 存档（5 个 Task） |
| superpowers/plans/2026-08-02-extensions-2.md | 第二轮扩展：车流/碰撞、漂移得分、关卡选单（3 条赛道）、WebAudio 合成音乐、移动端触控（5 个 Task） |
| superpowers/plans/2026-08-02-optimize.md | 项目复盘与优化：P0 功能缺陷修复（暂停/分屏碰撞/多赛道存档等）、代码质量与性能优化、游戏性增强（10 个 Task + 经验总结） |
| superpowers/plans/2026-08-03-optimization.md | 完整优化实施：互碰冷却、渲染尺寸校准、菜单 HUD 隐藏、分屏独立实例、main.ts 拆分与 Phase 下沉、纯函数化、常量集中、赛道预览动画、测试补充、空间索引（10 个 Task + 无人值守推进指南） |
| superpowers/plans/2026-08-03-split-screen-multi-track.md | M6 分屏双赛道：分界线修复 + 双人独立选赛道与双世界渲染重构（Task A + B1-B5） |
| superpowers/plans/2026-08-03-split-save-finish.md | M7 双人存档与结算：P2 最佳成绩独立存档、P2 圈速与 HUD BEST、结算面板双人化、codemap 刷新（Task C1-C5） |
| superpowers/plans/2026-08-03-hotseat-drift-gameplay.md | M8 热座与游戏性扩展：单屏 P2 BEST、热座轮流模式、漂移竞速横幅、新赛道 ×2 与 5 槽选择、车流密度调参、天气循环（Task D1-D8） |
| superpowers/plans/2026-08-03-wins-ranks-difficulty.md | M9 遗留修复与双人持久化：P1 结算前缀、白天天空色相修复、热座车流推进、胜场统计与连胜、新赛道 ×4 扩至 9 条 + 难度星级、漂移得分 TOP10 排行榜（Task E1-E8） |
| superpowers/plans/2026-08-03-finish-combo-weather-pause.md | M10 结算打磨与游戏性扩展：圈速行前缀与面板间距、漂移连击/倍率 + 得分上限落地、各赛道 BEST 汇总、车流避让 AI、雨天气三态循环、暂停菜单音量/重开（Task P1-P8） |
| superpowers/plans/2026-08-03-night-match-touch-audio.md | M11 夜晚/对局/触屏/音效扩展：夜晚赛道 + 车灯、分屏对局 TOP10、触屏暂停入口、雨声/碰撞音、drawRain 离屏缓存、漂移得分 MAX 标记（Task F1-F8） |
| superpowers/plans/2026-08-03-challenge-boost-wet-audio.md | M12 挑战/氮气/雨天/工程优化：漂移挑战模式限时刷分、车灯转向、雨天物理、BOOST 氮气、lapRef 复用、MusicPlayer 纯函数化、音量分级（Task G1-G9） |
| superpowers/plans/2026-08-03-challenge-bonus-particles-matrix.md | M13 挑战加成/粒子/尾灯/排行榜/回归矩阵：挑战模式天气/难度加成计分、BOOST 音效与尾焰粒子、车流夜间尾灯、漂移连击排行榜权重、updatePlayerFrame 签名重构、碰撞音强度分级、结算面板可滚动、run-bot 9 赛道矩阵回归（Task H1-H10） |
| superpowers/plans/2026-08-03-performance-optimization-plan.md | M14 性能优化：道路曲率段离屏缓存（road-strip.ts）、每帧分配削减（复用数组/缓存对象/fillStyle 缓存）、分屏与性能模式降级（Task 1-10） |
| superpowers/plans/2026-08-03-performance-optimization-task8-report.md | M14 Task 8 实施报告：PerformanceConfig 三档（PERF_HIGH 120 / PERF_MID 80 / PERF_LOW 60）与 `?perf` 查询参数落地详情 |
| superpowers/plans/2026-08-04-improvements.md | M15 已识别改进实施：渲染缓存激活、车流避让恢复、simulateLaps 车流模式、GameLoop 拆分 + pauseTitle、死代码清理与文档同步、工程化配置（Task A-F） |
| superpowers/specs/codemap.md | `specs` 子目录索引（设计文档清单） |
| superpowers/specs/2026-08-03-performance-optimization-design.md | M14 性能优化设计文档（已批准）：预计算 + 缓存基线分析、道路离屏缓存 / 分配削减 / 三档降级设计 |
| reports/codemap.md | `reports` 子目录索引（15 份研究报告清单与主题） |
| reports/research_report_*.md | 15 份研究报告：M16-M17 运行时实测、修复交付、工程化改进、道路/碰撞/环境差异化、项目级复盘（详见 reports/codemap.md） |
| visual-analysis/codemap.md | `visual-analysis` 子目录索引（视觉分析报告清单） |
| visual-analysis/FINAL_VISUAL_ANALYSIS.md | 视觉分析最终综合报告（8 任务调和版）：3 路 observer + 5 路代码侧分析整合，P0-P3 分级问题与性能评价（2026-08-04） |
| visual-analysis/UI_UX_ANALYSIS.md | UI/UX 综合分析报告：22 张截图自动化视觉分析，52 项问题分级清单（2026-08-03） |
| visual-analysis/VISUAL_ANALYSIS_RECONCILED.md | 视觉分析三方整合报告：A1/A2/A3 三路 observer 诊断的去重与优先级合并（11 张截图） |
| menu-ui-optimization-plan.md | 菜单页面 UI/UX 优化方案：图标风格统一、星级显示、选中状态、信息层次与交互反馈（2026-08-03） |
| ui-optimization-plan.md | UI/UX 专项优化实施计划：22 张截图分析确认的真实问题清单 + 纯 CSS/HTML/DOM 修复方案（orchestrator + fixer 协作执行） |
| screenshots/ | 证据截图归档：`audit-*`（运行时实测）、`auto-*`（无人值守自动化）、`shot-*`（各模式演进）、`roadfix-*`/`zorder-*`/`zfix-*`/`road-*`/`menu-*`/`finishbox-*`（专项修复前后对比） |
