# AI-Racing-Games

OutRun 伪 3D 复刻 —— Canvas 2D 伪 3D 街机赛车，TypeScript + Vite 构建，Vitest 单测 + bot 自动跑圈校验。

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器 (http://localhost:5173)
npm run build      # 类型检查 + 生产构建 (dist/)
npm run preview    # 预览生产构建
```

## 测试与验证

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest run（单元测试）
npm run bot        # bot 自动跑圈（输出圈速与违规报告）
```

`npm run bot` 输出示例：

```json
{
  "laps": 3,
  "lapTimesSec": [24.55, 48.0, 71.43],
  "totalTimeSec": 71.43,
  "avgSpeed": 3865,
  "violations": 0,
  "offRoadTimeSec": 0,
  "passed": true
}
```

## 操作说明

- 任意键：开始游戏
- W / ↑：油门　S / ↓：刹车　A/D 或 ←/→：转向
- BOOST 氮气：P1 Space / P2 Enter（加速冲刺）
- 菜单中按 1-9：切换赛道（9 条赛道，难度星级随赛道）；分屏模式 P2 用 Shift+1-9
- Escape：暂停菜单（音量 / 音乐 / 音效三滑块 + 重开）；R：返回菜单
- 完成所选赛道圈数后显示结算（热座模式回车交棒）
- 音效为 WebAudio 实时合成（含引擎音效、漂移摩擦/胎噪与 chiptune 背景音乐）
- 最佳圈速自动存档（localStorage）；刷新页面后仍保留
- 漂移得分：高速急转蓄力进入 DRIFT 状态持续累计得分，结算展示
- 车流碰撞：赛道上有循环行驶的 NPC 车辆，碰撞大幅减速（1 秒冷却）
- 移动端触控：四分区映射 + 虚拟摇杆，多点并发；触屏可暂停
- 双人分屏：`http://localhost:5173/?split=1`（P1 = WASD，P2 = 方向键）
- 热座模式：`http://localhost:5173/?hotseat=1`（两人交替，完赛回车交棒）
- 挑战模式：`http://localhost:5173/?challenge=1`（60 秒限时刷分，目标 5000 分）
- PWA 离线：构建产物可安装并离线游玩（vite-plugin-pwa，自动更新）

## 里程碑状态

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 | 渲染骨架：伪 3D 路面分段投影、直道滚动、60fps 循环 | ✅ |
| M2 | 车辆物理：速度/加速度/转向、路缘限制、出界减速 | ✅ |
| M3 | 赛道系统：弯道分段路点、视差远山/天空、可配置赛道数据 | ✅ |
| M4 | bot 跑圈：沿路点自动行驶、圈速与违规报告（`npm run bot`） | ✅ |
| M5 | HUD、音效合成、启动画面、胜利结算、发布构建 | ✅ |
| 扩展 | 平滑弯道（控制点插值）、路边景物（树木/路灯）、漂移系统、双人分屏、最佳圈速存档 | ✅ |
| 扩展 2 | 车流与碰撞、漂移得分、关卡选单（3 赛道）、chiptune 背景音乐、移动端触控 | ✅ |
| M6-M7 | GameLoop 重构（DOM/初始化/流程控制/每帧编排下沉 `game/` 层）、阶段 FSM 下沉 | ✅ |
| M8 | 双人 HUD 扩展（单屏 P2 BEST、热座玩家标签）、赛道自定义车流密度 | ✅ |
| M9 | 9 条赛道 + 难度星级选单、胜场统计、漂移得分 TOP10 排行榜 | ✅ |
| M10 | 车流避让 AI、各赛道 BEST 汇总、主音量调节、漂移连击倍率 | ✅ |
| M11 | 夜晚赛道（车灯/尾灯）、分屏对局 TOP10、触屏暂停、雨声/碰撞音、雨滴离屏渲染、得分 MAX 标记 | ✅ |
| M12 | 挑战模式（60s 限时刷分）、雨天物理、BOOST 氮气、车灯随变道转向、音乐/音效分轨音量 | ✅ |
| M13 | H 系列打磨：挑战计分加成、BOOST 音效与尾焰粒子、漂移连击入榜、lastLap 直返、碰撞音强度、9 赛道 bot 矩阵回归 | ✅ |
| M14 | 性能优化批次：曲率段离屏缓存（road-strip.ts）、小地图/赛道进度指示器（minimap.ts）；死代码清理（collidePlayers 移除、仅测试导出迁移 `tests/helpers/`） | ✅ |
| M15 | 架构重构（mode-strategy/finish-accounting/frame-update/frame-render 下沉）、漂移摩擦声/胎噪、PWA 离线发布、菜单/结算动画升级、UI/UX 修复、CI 工程化（eslint/prettier/husky/lint-staged） | ✅ |

## 目录结构

```
src/
  engine/       # 伪3D投影、路面分段渲染、视差山景、路边景物、漂移烟雾、车流渲染、赛道定义（tracks.ts）、玩家车渲染
  physics/      # 车辆运动学、漂移、双人按键映射
  game/         # GameLoop 主循环（19 文件）、帧更新/渲染纯函数、模式策略、结算统计、阶段 FSM、碰撞、赛道上下文、常量、音量
  ai/           # bot 决策器、圈速模拟器
  ui/           # HUD、格式化、游戏状态机、启动/结算画面、存档、触屏摇杆、小地图
  audio/        # WebAudio 合成：引擎音效（漂移摩擦/胎噪）、背景音乐
tests/
  unit/         # Vitest 单测（41 文件 593 用例）
  bot/          # bot 跑圈校验脚本（run-bot.ts，9 赛道矩阵）
  __mocks__/    # canvas mock
  helpers/      # 测试辅助
docs/           # 计划档案、视觉分析、superpowers plans
```

## 实现要点

- **伪 3D 投影**：分段路面梯形投影，`scale = depth / (z - camera.z)`，相机 z 随行进同步
- **曲线赛道**：每段 `curve` 值累计中心线偏移，控制点线性插值生成平滑弯道，支持环形赛道与回环约束
- **漂移系统**：急转蓄力触发漂移，转向增强 + 轻微减速，漂移烟雾粒子随车尾生成
- **分屏渲染**：单 Renderer 区域渲染（`renderRegion`），双车独立物理与 HUD，URL 参数开关
- **bot 决策**：前瞻窗口检测弯道（|Σcurve| 阈值），弯道降速 + 横向回中转向
- **验证闭环**：每个里程碑经 typecheck + lint + test + build + bot 全量验证后提交
