# docs/superpowers/plans/

## Responsibility

存放 AI-Racing-Games 项目的具体长程开发计划文档。每份文件对应一个完整的开发阶段（里程碑、扩展或优化复盘），记录目标、任务分解、文件变更、接口契约与验证命令，是项目执行过程的权威档案。

## Design

- **按日期命名**：`YYYY-MM-DD-<slug>.md`，便于按时间顺序排序与追溯。
- **统一模板**：文档头部包含 Goal / Architecture / Tech Stack / Global Constraints，正文以 Task 列表展开，每个 Task 包含 Files、Interfaces、TDD 步骤与验证命令。
- **checkbox 跟踪**：每个 Task 用 `- [x]` / `- [ ]` 标记完成状态，形成可扫描的进度。
- **API 向后兼容**：扩展计划通常声明"现有 API 只做加法"，避免破坏既有单测与 bot 跑圈。

## Flow

1. `2026-08-02-m4-m5-complete.md`：完成核心可玩闭环（M4 bot 跑圈 + M5 打磨）。
2. `2026-08-02-extensions.md`：第一轮扩展（平滑弯道、路边景物、漂移、双人分屏、存档）。
3. `2026-08-02-extensions-2.md`：第二轮扩展（车流、漂移得分、赛道选单、音乐、触控）。
4. `2026-08-02-optimize.md`：早期复盘优化草案（部分已实现）。
5. `2026-08-03-optimization.md`：基于代码复核与浏览器实测的完整优化实施计划，覆盖 P0 缺陷修复、架构重构、测试补充与无人值守推进规范。

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
