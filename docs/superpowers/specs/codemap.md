# docs/superpowers/specs/

## Responsibility

存放 AI-Racing-Games 项目**已批准的设计文档**。每份设计文档在对应实施计划（`../plans/`）落地之前产出，是计划的技术前置依据——先经设计评审批准，再由 `writing-plans` 展开为可执行的 Task 契约。当前仅含 M14 性能优化设计一份。

## Design

- **按日期命名**：`YYYY-MM-DD-<slug>-design.md`，与 `../plans/` 的 `YYYY-MM-DD-<slug>-plan.md` / `-<slug>.md` 命名体系对齐，便于按时间追溯设计与计划的对应关系。
- **文档要素**：头部声明日期、状态（已批准）与目标（如 M14「省帧、省 CPU/GPU 占用、降低内存分配」），正文给出现状基线分析（预计算 + 缓存模式）、可选方案与选定设计，供实施计划直接引用。
- **状态标注**：仅存放已批准设计；草案与复盘归 `../plans/`（如 `2026-08-02-optimize.md` 复盘草案）。

## Flow

1. `2026-08-03-performance-optimization-design.md`：M14 性能优化设计（已批准）——基于当前「预计算 + 缓存」模式的基线分析，设计三层优化：道路离屏缓存（road-strip 曲率段预渲染）、每帧分配削减（复用数组/缓存对象/fillStyle 缓存）、分屏/性能模式降级（PERF_HIGH/MID/LOW 三档）。
2. 该设计随后由 `../plans/2026-08-03-performance-optimization-plan.md` 展开为 10 个 Task 实施，并由 `../plans/2026-08-03-performance-optimization-task8-report.md` 记录 Task 8 落地详情。

## Integration

- 被 `docs/codemap.md` 聚合引用（设计文档约定一节）。
- 与 `../plans/` 衔接：`../plans/codemap.md` 的 Design 一节明确"重大里程碑先经 `../specs/` 设计文档批准（如 M14 性能优化设计），再由本目录计划展开 Task 实施"。
- 设计结论直接映射到 `src/engine/road-strip.ts`、`src/shared/constants` 等实现文件。

## Files

| File | Responsibility |
|------|----------------|
| `codemap.md` | 本目录索引（本文件） |
| `2026-08-03-performance-optimization-design.md` | M14 性能优化设计文档（已批准）：预计算 + 缓存基线分析，道路离屏缓存 / 分配削减 / 三档降级设计，对应实施计划 `../plans/2026-08-03-performance-optimization-plan.md` |
