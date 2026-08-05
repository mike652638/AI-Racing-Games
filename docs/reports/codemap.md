# docs/reports/

## Responsibility

存放 AI-Racing-Games 项目的实施交付研究报告与项目级复盘文档。每份报告以 `research_report_<slug>.md` 命名，记录任务背景、现状分析、实施改动（含文件与接口）、回归测试增量（如 608 → 624 用例）与全量验证结果（typecheck + lint + test + bot 9 赛道矩阵 + build + e2e），并附 Playwright / agent-browser / browser-use 实测取证，是计划文档（`../superpowers/plans/`）执行完毕后的行为契约落地记录。

M16 起演进档案形成"计划 + 研究报告"双轨：计划在前（可执行 Task 契约），报告在后（实测取证 + 交付结论）。本目录 15 份报告按主题分为四类——项目级复盘（4 份）、运行时实测与修复（4 份）、工程化改进（1 份）、视觉/渲染优化（2 份）、环境差异化（4 份）。

## Design

- **命名约定**：统一 `research_report_<slug>.md`，slug 反映主题（project_analysis / runtime_testing / environment_diff 等），便于按主题检索。
- **报告结构**：文档头部为「执行摘要」，给出背景、改动范围、回归增量与全量验证结论；正文按「现状分析 → 实施改动 → 验证与取证」展开；重大修复附浏览器实测数据（如碰撞瞬间 `maxFlash=0.247`、路面亮度差 56、噪点方差 1.30）。
- **实测取证**：运行时报告基于 `npm run dev`（端口 5173）+ agent-browser / browser-use + Chromium，覆盖单机/分屏/热座/挑战四模式与 9 赛道代表，截图归档 `../screenshots/audit-*` / `auto-*`。
- **问题分级**：实测发现的缺陷统一按 P0/P1/P2/P3 分级输出清单，供后续修复计划（如 `research_report_fixes_applied.md`、`research_report_legacy_issues_audit.md`）逐项认领。
- **与计划衔接**：报告结论可直接反向修订计划（如 `research_report_track_validation.md` 发现环境视觉维度缺失 → 驱动 M17 环境差异化四连报告）。

## Flow

报告按开发时间与依赖关系演进，形成三条主线：

1. **项目级复盘（4 份，随架构演进迭代更新）**：`project_analysis.md`（M15 状态，41 文件 593 用例）→ `project_analysis_deep.md`（第十二节优化实施后，45 文件 645 用例）→ `project_analysis_shared.md`（src/shared 解环 + renderer.ts 拆分后，639 用例）→ `project_analysis_m17.md`（M17 状态 2026-08-05 实测复核，44 文件 639 用例）。四份报告针对同一主题在不同架构时点的快照，互为演进证据。
2. **M16 运行时实测与修复闭环（6 份）**：`runtime_testing.md` 通过 agent-browser 实测发现 2 个核心 bug（minimap canvas 渲染空白、玩家车出界卡死）与开局碰撞 ×1 等 UX 问题 → `fixes_applied.md` 按 P0-P3 实施全部修复（天空条纹、热座 P2 渲染/RAF 链、菜单光晕、移动端适配、HUD 对比度），并另发现修复热座 P1 完赛后 RAF 链断裂 → `m16_improvements.md` 落地工程化（copy.ts 操作提示与 README 同源、`shouldScheduleNextFrame` 纯函数化、Playwright 视觉回归 + CI 双 project）→ `road_optimization.md` 道路视觉优化（路面 9 带渐变 + 颗粒噪点 + fallback 3 带 + shadeColor）→ `collision_feedback.md` 碰撞反馈增强（红闪 vignette + HUD 碰撞计数 + 双层碰撞音 + 横向弹开防贴车）→ `legacy_issues_audit.md` 对旧运行时报告逐项代码级核查（2 个核心 bug + 13 项 UX/优化项全部闭合，656 用例 + e2e 18 passed）。
3. **M17 环境差异化（4 份）**：`track_validation.md` 从几何/难度/车流/昼夜维度验证 9 赛道，发现"环境视觉维度"缺失（沙漠无沙丘、森林无树木等）→ `environment_diff.md` 为 `TrackDef` 增加 `environment` 字段 + environment.ts 9 环境配置（plains/highway/s-curve/island/canyon/desert/forest/coast/alpine 的天空/草地/远山/景物色板）→ `sprite_terrain.md` 扩展 SpriteKind（cactus/palm/snowpile）+ `EnvironmentProfile.terrain` 地形装饰（沙漠沙丘/海岸海面/峡谷岩壁）→ `phase2_terrain.md` 增强阶段 2（海面波浪、仙人掌群 SPACING、棕榈弯曲、岩壁锯齿顶线）。
4. **无人值守自动化（独立补充）**：`runtime_visual_auto.md` 用 browser-use 完成全链路自动化验证（菜单→开始→倒计时→行驶→暂停/恢复→完赛→回主菜单 + 三种扩展模式入口，采集 10 张 `auto-*.png`），结论为零 P0/P1 阻塞问题，仅 1 个 P2（开局车流与玩家出生位重叠致碰撞 ×1）。

## Integration

- 被 `../codemap.md` 聚合引用（`docs/codemap.md` Flow 第 16-17 节对应 M16/M17 报告闭环）。
- 与 `../superpowers/plans/` 一一对应：报告是计划 Task 的交付物与取证记录（如 M14 的 `performance-optimization-task8-report.md` 存于 plans 目录）。
- 实测发现的问题清单驱动后续计划与修复报告的立项，构成"实测 → 修复 → 再验证"的闭环。
- 截图取证归档于 `../screenshots/`（`audit-*` 运行时实测、`auto-*` 无人值守自动化）。

## Files

| File | Responsibility |
|------|----------------|
| `codemap.md` | 本目录索引（本文件） |
| `research_report_project_analysis.md` | 项目深度分析报告（M15 状态）：架构分层、依赖方向、测试门禁与文档体系总览（41 文件 593 用例） |
| `research_report_project_analysis_deep.md` | 深入分析与总结报告（第十二节优化实施后）：两轮实测全通过 + 浏览器运行时实测（45 文件 645 用例） |
| `research_report_project_analysis_shared.md` | 项目深入分析与总结（共享层解环后最新状态）：src/shared 独立共享层解掉 game↔ui 双向环、renderer.ts 拆分 5 个子模块、全量文档同步（639 用例 + PWA build） |
| `research_report_project_analysis_m17.md` | 项目深度分析报告（M17 状态，2026-08-05 实测复核）：17 里程碑全绿快照，typecheck/lint/639 用例/bot 9 赛道矩阵 0 违规 |
| `research_report_runtime_testing.md` | 运行时实测与视觉验证：agent-browser + Chromium 实测四模式 + 9 赛道代表，发现 minimap 空白、玩家车出界卡死 2 个核心 bug + 多项 UX 问题 |
| `research_report_runtime_visual_auto.md` | 无人值守运行时自动化测试与视觉验证：browser-use 全链路验证 + 10 张 auto-*.png 截图留证，零 P0/P1 阻塞，1 个 P2（开局碰撞 ×1） |
| `research_report_fixes_applied.md` | 修复应用报告：按 P0-P3 实施全部修复（天空条纹、热座 P2 渲染/RAF 链、菜单光晕、移动端适配、HUD 对比度），另发现修复热座 P1 RAF 链断裂 bug |
| `research_report_m16_improvements.md` | M16 工程化改进：copy.ts 操作提示与 README 同源、shouldScheduleNextFrame 帧循环调度纯函数化、Playwright 视觉回归 + CI 集成（桌面/移动横屏双 project） |
| `research_report_road_optimization.md` | 道路视觉渲染优化：路面 9 带渐变 + 颗粒噪点 + fallback 3 带 + shadeColor 纯函数化（624 → 628 用例） |
| `research_report_collision_feedback.md` | 碰撞反馈增强：屏幕红闪 vignette + HUD 碰撞计数 + 双层碰撞音 + 横向弹开防贴车（608 → 624 用例，实测 maxFlash=0.247） |
| `research_report_legacy_issues_audit.md` | 旧运行时问题审计：对 runtime_testing 报告逐项代码级核查修复，2 个核心 bug + 13 项 UX/优化项全部闭合（656 用例 + e2e 18 passed） |
| `research_report_track_validation.md` | 9 赛道环境差异化评估与验证：几何/难度/车流/昼夜有差异，但环境视觉维度缺失（沙漠无沙丘、森林无树木等） |
| `research_report_environment_diff.md` | 环境差异化实施：TrackDef.environment 字段 + environment.ts 9 环境配置 + 渲染层落地（628 → 636 用例） |
| `research_report_sprite_terrain.md` | 差异化景物与地形扩展：SpriteKind 扩展 cactus/palm/snowpile + EnvironmentProfile.terrain 地形装饰（636 → 640 用例） |
| `research_report_phase2_terrain.md` | 地形增强阶段 2：海面波浪、仙人掌群 SPACING、棕榈弯曲、岩壁锯齿顶线（640 → 642 用例） |
