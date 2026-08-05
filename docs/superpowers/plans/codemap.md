# docs/superpowers/plans/

## Responsibility

存放 AI-Racing-Games 项目的具体长程开发计划文档。每份文件对应一个完整的开发阶段（里程碑、扩展或优化复盘），记录目标、任务分解、文件变更、接口契约与验证命令，是项目执行过程的权威档案。

## Design

- **按日期命名**：`YYYY-MM-DD-<slug>.md`，便于按时间顺序排序与追溯。
- **统一模板**：文档头部包含 Goal / Architecture / Tech Stack / Global Constraints，正文以 Task 列表展开，每个 Task 包含 Files、Interfaces、TDD 步骤与验证命令。
- **checkbox 跟踪**：每个 Task 用 `- [x]` / `- [ ]` 标记完成状态，形成可扫描的进度。
- **API 向后兼容**：扩展计划通常声明"现有 API 只做加法"，避免破坏既有单测与 bot 跑圈。
- **与 specs/ 的衔接**：重大里程碑先经 `../specs/` 设计文档批准（如 M14 性能优化设计），再由本目录计划展开 Task 实施。

## Flow

1. `2026-08-02-m4-m5-complete.md`：完成核心可玩闭环（M4 bot 跑圈 + M5 打磨）。
2. `2026-08-02-extensions.md`：第一轮扩展（平滑弯道、路边景物、漂移、双人分屏、存档）。
3. `2026-08-02-extensions-2.md`：第二轮扩展（车流、漂移得分、赛道选单、音乐、触控）。
4. `2026-08-02-optimize.md`：早期复盘优化草案（部分已实现）。
5. `2026-08-03-optimization.md`：基于代码复核与浏览器实测的完整优化实施计划，覆盖 P0 缺陷修复、架构重构、测试补充与无人值守推进规范。
6. `2026-08-03-split-screen-multi-track.md`：分屏分界线渲染修复 + 双人独立选赛道（M6 扩展）：Task A 分界线像素对齐与分隔线、Task B1-B4 双世界重构（TrackContext/多 view 渲染/双玩家 TrackManager/GameLoop 集成）、Task B5 全量验证与冒烟。
7. `2026-08-03-split-save-finish.md`：双人存档与结算（M7）：Task C1 存档玩家维度（P2 `-p2` key 后缀）、C2 P2 圈速记录与 HUD P2 BEST、C3 结算面板双人化（完赛标记驱动）、C4 全量验证与冒烟、C5 codemap 刷新。
8. `2026-08-03-hotseat-drift-gameplay.md`：热座与游戏性扩展（M8）：Task D1 单屏 P2 BEST、D2 热座轮流模式（`?hotseat=1` 回合交棒）、D3 分屏漂移得分竞速横幅、D4 新赛道 ×2 与 5 槽选择 UI、D5 车流密度赛道级调参、D6 天气循环（晴/阴）、D7 全量验证与冒烟、D8 codemap 刷新。
9. `2026-08-03-wins-ranks-difficulty.md`：遗留修复与双人持久化（M9）：Task E1 分屏结算 P1 行前缀、E2 白天天空色相修复、E3 热座 P2 回合车流推进、E4 胜场统计与连胜（localStorage）、E5 新赛道 ×4 扩至 9 条 + 难度星级、E6 漂移得分 TOP10 排行榜、E7 全量验证与冒烟、E8 codemap 刷新。
10. `2026-08-03-finish-combo-weather-pause.md`：结算打磨与游戏性扩展（M10）：Task P1 圈速行前缀 + 面板间距、P2 漂移连击/倍率 + 得分上限落地（含 P7 连击窗口 2→0.5s 修复）、P3 各赛道 BEST 汇总、P4 车流避让 AI、P5 雨天气三态循环 + 雨滴 overlay、P6 暂停菜单音量/重开、P7 全量验证与冒烟、P8 codemap 刷新。
11. `2026-08-03-night-match-touch-audio.md`：夜晚/对局/触屏/音效扩展（M11）：Task F1 夜晚赛道 + 车头灯、F2 分屏对局榜 TOP10、F3 触屏暂停入口、F4 雨声/碰撞音效、F5 drawRain 离屏缓存、F6 漂移得分 MAX 标记、F7 全量验证与冒烟、F8 codemap 刷新。
12. `2026-08-03-challenge-boost-wet-audio.md`：挑战/氮气/雨天/工程优化（M12）：Task G1 漂移挑战模式、G2 车灯转向、G3 雨天物理、G4 BOOST 氮气、G5 lapRef 复用、G6 MusicPlayer 纯函数化、G7 音量分级、G8 全量验证与冒烟、G9 codemap 刷新。
13. `2026-08-03-challenge-bonus-particles-matrix.md`：挑战加成/BOOST 粒子/尾灯/排行榜权重/回归矩阵（M13）：Task H1 挑战模式天气/难度加成计分、H2 BOOST 音效与视觉粒子、H3 车流夜间尾灯、H4 漂移连击排行榜权重、H5 updatePlayerFrame 返回 lastLap 消除桥接、H6 CollisionSound 强度分级、H7 结算面板可滚动、H8 run-bot 多赛道矩阵回归、H9 全量验证与冒烟、H10 codemap 刷新。
14. `2026-08-03-performance-optimization-plan.md`：性能优化（M14）：Task 1-10 覆盖三层策略——道路离屏缓存（road-strip.ts 曲率段合并 + 离屏预渲染 + TrackContext.roadStrips）、每帧分配削减（spritesInRangeIndexed 复用数组 / viewFor 缓存对象 / fillStyle 缓存）、分屏与性能模式降级（PerformanceConfig 三档 + `?perf=1`）；附 `2026-08-03-performance-optimization-task8-report.md`（Task 8 实施报告）。
15. `2026-08-04-improvements.md`：已识别改进实施（M15）：Task A-F 六条 lane——渲染缓存激活、车流避让恢复、simulateLaps 车流模式、GameLoop 拆分与 pauseTitle、死代码清理与文档同步、工程化配置（ESLint/Prettier/husky/CI/.gitignore）。
16. `2026-08-05-m18-ui-ux-polish.md`：UI/UX 深度打磨（M18）：Goal 概述 + 2 条并行 lane——Lane A designer 表现层 A1-A8（可访问性 / prefers-reduced-motion 降级 / 颜色令牌化 / 屏幕切换过渡 / 文案同源 / 触屏引导浮层 / BOOST 反馈 / 杂项）、Lane B fixer 引擎层 B1-B5（碰撞车身边框闪白 / MAX_SPRITE_SCALE 近距缩放上限 / 环境差异化车灯 / 路缘立体感 / 地形细节），双 lane 独立推进互不阻塞。

## Integration

- 被 `docs/codemap.md` 聚合引用。
- 与 `AGENTS.md` 的验证优先级与技能使用规则对应。
- 计划中的任务目标直接映射到 `src/` 与 `tests/` 下的文件实现。

## Files

| File | Responsibility |
|------|----------------|
| `codemap.md` | 本目录索引（本文件） |
| `2026-08-02-m4-m5-complete.md` | M4-M5 基础闭环：bot 决策器、跑圈模拟器、HUD、音效、启动/结算画面、构建 |
| `2026-08-02-extensions.md` | M6 第一轮扩展：平滑弯道、路边景物、漂移系统、双人分屏、localStorage 存档 |
| `2026-08-02-extensions-2.md` | 第二轮扩展：车流与碰撞、漂移得分、三赛道选单、chiptune 音乐、移动端触控 |
| `2026-08-02-optimize.md` | 复盘优化：P0 缺陷修复、代码质量、性能热点、游戏性增强与经验总结 |
| `2026-08-03-split-screen-multi-track.md` | M6 扩展：分屏分界线修复、双人独立选赛道与双世界渲染重构 |
| `2026-08-03-split-save-finish.md` | M7 扩展：P2 最佳成绩独立存档（`-p2` key）、P2 圈速与 HUD BEST、结算面板双人化 |
| `2026-08-03-hotseat-drift-gameplay.md` | M8 扩展：单屏 P2 BEST、热座轮流模式、漂移竞速横幅、新赛道 ×2、车流密度调参、天气循环 |
| `2026-08-03-wins-ranks-difficulty.md` | M9 扩展：分屏结算 P1 前缀、白天天空色相修复、热座车流推进、胜场统计与连胜、新赛道 ×4 与难度星级、漂移得分 TOP10 |
| `2026-08-03-finish-combo-weather-pause.md` | M10 扩展：圈速行前缀与面板间距、漂移连击/倍率与得分上限、各赛道 BEST 汇总、车流避让 AI、雨天气三态、暂停菜单音量/重开 |
| `2026-08-03-night-match-touch-audio.md` | M11 扩展：夜晚赛道与车头灯、分屏对局 TOP10、触屏暂停入口、雨声/碰撞音效、drawRain 离屏缓存、漂移得分 MAX 标记 |
| `2026-08-03-challenge-boost-wet-audio.md` | M12 扩展：漂移挑战模式、车灯转向、雨天物理、BOOST 氮气、lapRef 复用、MusicPlayer 纯函数化、音量分级 |
| `2026-08-03-challenge-bonus-particles-matrix.md` | M13 扩展：挑战模式天气/难度加成计分、BOOST 音效与视觉粒子、车流夜间尾灯、漂移连击排行榜权重、updatePlayerFrame 返回 lastLap、CollisionSound 强度分级、结算面板可滚动、run-bot 9 赛道矩阵回归 |
| `2026-08-03-performance-optimization-plan.md` | M14 性能优化：道路离屏缓存（road-strip.ts）、每帧分配削减、分屏/性能模式降级（Task 1-10） |
| `2026-08-03-performance-optimization-task8-report.md` | M14 Task 8 实施报告：PerformanceConfig 三档与 `?perf` 查询参数落地 |
| `2026-08-04-improvements.md` | M15 已识别改进实施：渲染缓存激活、车流避让恢复、simulateLaps 车流模式、GameLoop 拆分与 pauseTitle、死代码清理与文档同步、工程化配置（Task A-F） |
| `2026-08-05-m18-ui-ux-polish.md` | M18 UI/UX 深度打磨：双 lane 并行——Lane A designer 表现层 A1-A8（可访问性/reduced-motion/颜色令牌/过渡/文案/触屏引导/BOOST 反馈/杂项）、Lane B fixer 引擎层 B1-B5（碰撞闪白/MAX_SPRITE_SCALE/环境车灯/路缘立体感/地形细节） |
