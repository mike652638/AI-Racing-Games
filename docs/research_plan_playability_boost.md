# 研究计划：AI-Racing-Games 可玩性提升方案

日期：2026-08-07
项目：OutRun 伪 3D 复刻（TypeScript + Vite + Canvas 2D）

## 1. 目标

为用户"分析当前项目，联网搜索并规划提升可玩性方案（包括但不限于氮气加速等）"提供一份可落地的深度研究报告与实施规划，输入到 M21 之后的可玩性里程碑。

## 2. 项目现状要点（已从代码确认）

- 技术栈：TS + Vite + Canvas 2D 伪 3D；纯函数领域层（frame-update/frame-render/frame-pure）；常量唯一真源 src/shared/constants；单向依赖 engine/physics → shared → game/ui。
- 现有玩法：单屏/分屏/热座/挑战 4 模式（URL 参数）；BOOST 氮气（漂移蓄能 charge→空格激活，突破 maxSpeed 1.15×，加速度 +0.6×）；漂移系统（得分+连击倍率 0.25/级 上限 3.5× + 烟雾）；车流避让 AI；雨天物理（制动×0.7/转向×0.85）；9 条赛道（环境差异化 M17）；TOP10 排行榜；碰撞反馈（红闪/计数/横向弹开）。
- 验证流水线：typecheck → lint → vitest 711 用例 → bot 9 赛道矩阵 0 违规 → build PWA → Playwright e2e。
- 里程碑已到 M21（菜单沉浸感优化收尾），当前代码树干净。

## 3. 研究方法

深度优先 + 广度优先混合。3 个并行研究子代理：

### Subagent A：经典街机竞速可玩性机制全景

- 关键词：OutRun 伪3D 竞速 玩法、街机赛车游戏 系统、retro racing game mechanics、OutRun-style pseudo-3D game features
- 产出：经典街机竞速（OutRun/Sega 系）的核心可玩性机制清单（道具、时间关卡、分支路线、近道、Rank、目标得分、关卡递进等），哪些适合本项目落地。

### Subagent B：现代/移动端竞速游戏可玩性趋势

- 关键词：mobile racing game features 2025、idle racing mechanics、game juice racing、赛车游戏 手游 可玩性、nitro boost game design
- 产出：现代竞速游戏流行机制（解锁/收集/成就/每日挑战/Roguelike/游戏化 juice 等），轻量实现成本评估。

### Subagent C：氮气/加速/漂移系统的深度设计研究

- 关键词：nitro boost game design、boost meter racing design、drift boost combo design、氮气 加速 游戏设计 数值
- 产出：氮气系统的设计维度（蓄力来源、消耗、倍率曲线、反馈、与赛道/碰撞/雨天交互），对本项目现有 BOOST 的扩展点（如近道、擦墙充能、漂移即加速、BOOST 触发漂移等）。

### 微信公众号信息源

- 通过 subagent 使用 web_search 检索中文游戏设计类公众号/知乎/indie 文章（"赛车游戏 可玩性 设计"、"漂移 氮气 数值"、"街机 赛车 游戏 设计"），优先高信息密度中文来源。

## 4. 时间范围

优先 2023-2026 年的设计与趋势资料；经典街机机制部分可追溯到 1980-1990s（OutRun 1986 等）。

## 5. 综合方法

3 个子代理结果 + 本项目代码约束交叉评审：

1. 可玩性方向 → 落地可行性（纯函数/常量真源/确定性种子约束）
2. 每个方案标注：类型（新机制/系统扩展/打磨）、涉及模块、预估改动面、风险（bot 矩阵/e2e）
3. 按"投入产出比 × 与现有系统协同度"排序，形成分阶段实施路线图（P0 快赢 / P1 系统级 / P2 远期）。

## 6. 交付物

- docs/reports/research_report_playability_plan.md（研究报告 + 实施规划）
- 同步更新记忆文件。
