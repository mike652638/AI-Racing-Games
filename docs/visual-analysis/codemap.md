# docs/visual-analysis/

## Responsibility

存放 AI-Racing-Games 项目基于截图的视觉与 UI/UX 分析报告。报告由多路 @observer 自动化视觉诊断（Playwright / agent-browser 截图）与 @orchestrator 代码侧复核共同产出，按 P0/P1/P2/P3 分级输出问题清单，供后续修复计划（如 `../ui-optimization-plan.md`、`../menu-ui-optimization-plan.md`）引用立项。本目录是「截图取证 → 视觉诊断 → 修复计划」链条的中枢。

## Design

- **截图驱动**：分析基于浏览器实测截图（来源 `../screenshots/`），而非纯代码推断，保证问题清单可复现、可取证。
- **多路整合**：同一批截图由 3 路 observer 独立诊断，再由 orchestrator 侧代码复核，最终去重、合并优先级（`VISUAL_ANALYSIS_RECONCILED.md` 与 `FINAL_VISUAL_ANALYSIS.md` 均为整合产物）。
- **问题分级**：统一采用 P0（阻塞/崩溃）/ P1（功能错误）/ P2（体验缺陷）/ P3（打磨建议）四级清单，与 `../reports/` 的实测修复报告共用同一分级口径。
- **覆盖维度**：菜单（图标风格、星级显示、选中状态）、游戏 HUD（对比度、信息层次）、结算/暂停/挑战面板、移动端布局（812×375 横屏）等。

## Flow

1. `UI_UX_ANALYSIS.md`（2026-08-03）：基于 22 张截图自动化视觉分析，输出 52 项问题分级清单，是 UI/UX 优化的第一手依据（驱动 `../ui-optimization-plan.md` 纯 CSS/HTML/DOM 修复）。
2. `VISUAL_ANALYSIS_RECONCILED.md`：A1/A2/A3 三路 observer 基于 11 张截图的独立诊断，经去重与优先级合并形成的三方整合报告。
3. `FINAL_VISUAL_ANALYSIS.md`（2026-08-04）：最终综合报告（8 任务调和版）——3 路 observer 视觉诊断 + 5 路 orchestrator 代码侧分析整合，对全部发现按 P0-P3 定级并给出性能评价，是视觉问题修复的权威结论。

## Integration

- 被 `../codemap.md` 聚合引用（`docs/codemap.md` 的视觉分析约定一节）。
- 输出问题清单被 `../ui-optimization-plan.md`、`../menu-ui-optimization-plan.md` 等修复计划引用立项。
- 截图取证归档于 `../screenshots/`，与 `../reports/` 的运行时实测报告互为佐证。

## Files

| File | Responsibility |
|------|----------------|
| `codemap.md` | 本目录索引（本文件） |
| `UI_UX_ANALYSIS.md` | UI/UX 综合分析报告：22 张截图自动化视觉分析，52 项问题分级清单（2026-08-03，驱动 ui-optimization-plan） |
| `VISUAL_ANALYSIS_RECONCILED.md` | 视觉分析三方整合报告：A1/A2/A3 三路 observer 诊断的去重与优先级合并（11 张截图） |
| `FINAL_VISUAL_ANALYSIS.md` | 视觉分析最终综合报告（8 任务调和版）：3 路 observer + 5 路代码侧分析整合，P0-P3 分级问题与性能评价（2026-08-04） |
