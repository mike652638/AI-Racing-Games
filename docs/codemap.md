# docs/

## Responsibility

项目计划与演进档案目录。集中存放各里程碑（M1-M5）与扩展方向（M6+）的实施计划文档、复盘优化方案以及目录级 codemap 索引，为长程无人值守开发（agent 驱动）提供可执行规范、任务跟踪与历史依据。所有计划文档遵循 TDD 流程（先写失败测试→最小实现→集成→全量验证→提交），是代码库之外唯一的行为契约来源。

## Design

- **计划文档约定**：每个计划一个 Markdown 文件，位于 `superpowers/plans/`，文件名按日期命名（`YYYY-MM-DD-<slug>.md`）；内容采用 superpowers `writing-plans` / `executing-plans` 约定——文档头部声明 Goal/Architecture/Tech Stack/Global Constraints，正文按 Task 分解，每个 Task 以 `- [x]` checkbox 跟踪完成状态，并给出 Files、Interfaces（Consumes/Produces）、TDD 步骤与验证命令。
- **验证优先级约定**：所有计划统一约定 `typecheck → lint → test → build →（bot / browser）` 的验证顺序，与 AGENTS.md 保持一致。
- **索引体系**：每层目录配套 `codemap.md` 描述职责、设计、流程与文件清单，构成自顶向下的导航（`docs/codemap.md` → `docs/superpowers/codemap.md` → `docs/superpowers/plans/codemap.md`）。

## Flow

计划文档按开发时间与依赖关系演进，形成三层递进：

1. **基础闭环（M4-M5）**：`2026-08-02-m4-m5-complete.md` 完成核心可玩闭环——M4 bot 决策器/跑圈模拟器/违规报告（`npm run bot`）、M5 HUD/引擎音效/启动画面/状态机/结算/发布构建。此阶段定义并冻结核心 API（`createDefaultTrack`、`updateCar` 返回出界标记、`decideBotInput`、`simulateLaps`、`format*` 等），后续所有计划承诺"现有 API 只做加法"。
2. **第一轮扩展（M6）**：`2026-08-02-extensions.md` 在基础闭环之上新增 5 个独立方向——平滑弯道控制点（`createSmoothTrack`）、路面景物（sprites.ts）、漂移系统（drift.ts）、双人分屏（input.ts + renderRegion）、存档（save.ts）。各 Task 独立闭环、互不阻塞，并为下一轮提供 API（如 `mulberry32`、`Sprite`、`DriftState`）。
3. **第二轮扩展**：`2026-08-02-extensions-2.md` 继续叠加 5 个方向——车流/碰撞（traffic.ts）、漂移得分（扩展 DriftState）、关卡选单（tracks.ts）、合成音乐（music.ts）、移动端触控（touchInputFrom/mergeCarInput）。显式依赖第一轮产物（traffic 消费 `Segment`/渲染管线，tracks 消费控制点）。
4. **复盘优化**：`2026-08-02-optimize.md` 收尾阶段系统性复盘——按 P0/P1/P2 优先级分类 8 个功能缺陷（F1-F8）、8 个代码质量问题（Q1-Q8）、4 个性能热点（P1-P4）与 8 个游戏性增强（G1-G8），并以 10 个 Task 落地（暂停菜单、分屏碰撞、多赛道存档、漂移得分上限、分圈计时、main.ts 拆分、山形预渲染、sprites 分组、虚拟摇杆、天气循环），同时沉淀 5 条关键经验（相机 z 同步、合成事件局限、HMR 状态丢失、Window vs Document 事件、TDD 红绿分离）。

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
