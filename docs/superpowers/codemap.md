# docs/superpowers/

## Responsibility

superpowers 长程开发计划的父目录。集中存放 AI 辅助开发过程中的阶段性计划文档（`plans/`），用于记录需求分解、架构设计、TDD 步骤与验证命令，是项目历史与执行契约的档案。

## Design

- **计划文档化**：所有重大里程碑与扩展方向均以 Markdown 文件落地，便于追溯、复盘与多人协作。
- **TDD 驱动**：每份计划遵循"先写失败测试 → 最小实现 → 集成 → 全量验证"的闭环。
- **验证一致性**：所有计划统一使用 `typecheck → lint → test → build →（bot / browser）` 的验证顺序，与 `AGENTS.md` 对齐。

## Flow

1. 项目启动 / 新里程碑设计时，在 `plans/` 下创建新的计划文档（命名 `YYYY-MM-DD-<slug>.md`，里程碑编号从 M4 一路演进，最新为 M13）。
2. 计划文档按 Goal / Architecture / Tech Stack / Global Constraints / Tasks 结构展开，每个 Task 用 checkbox 跟踪状态。
3. 执行阶段按 Task 顺序开发，每完成一组改动即跑通验证命令。
4. 收尾阶段通过复盘文档（如 `2026-08-02-optimize.md`）沉淀经验与待办。

## Integration

- `docs/superpowers/plans/`：子目录，存放具体计划文档。
- `AGENTS.md`：引用 superpowers 技能使用规则（TDD、systematic-debugging、verification-before-completion 等）。
- 各计划文档：引用 `src/`、`tests/` 中的具体文件与接口作为实施目标。

## Files

| File | Responsibility |
|------|----------------|
| `codemap.md` | 本目录索引（本文件） |
| `plans/codemap.md` | 子目录索引 |
| `plans/*.md` | 具体里程碑 / 扩展 / 优化计划（M4-M13，完整清单见 `plans/codemap.md`） |
