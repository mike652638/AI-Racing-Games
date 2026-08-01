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
- 完成 3 圈后显示结算；R：重新开始
- 音效为 WebAudio 实时合成（首键后启动）
- 最佳圈速自动存档（localStorage）；刷新页面后仍保留
- 双人分屏：`http://localhost:5173/?split=1`（P1 = WASD，P2 = 方向键）

## 里程碑状态

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 | 渲染骨架：伪 3D 路面分段投影、直道滚动、60fps 循环 | ✅ |
| M2 | 车辆物理：速度/加速度/转向、路缘限制、出界减速 | ✅ |
| M3 | 赛道系统：弯道分段路点、视差远山/天空、可配置赛道数据 | ✅ |
| M4 | bot 跑圈：沿路点自动行驶、圈速与违规报告（`npm run bot`） | ✅ |
| M5 | HUD、音效合成、启动画面、胜利结算、发布构建 | ✅ |
| 扩展 | 平滑弯道（控制点插值）、路边景物（树木/路灯）、漂移系统、双人分屏、最佳圈速存档 | ✅ |

## 目录结构

```
src/
  engine/       # 伪3D投影、路面分段渲染、视差山景、路边景物、漂移烟雾
  physics/      # 车辆运动学、漂移、双人按键映射
  track/        # 赛道数据（分段路点、曲线配置）[位于 engine/]
  ai/           # bot 决策器、圈速模拟器
  ui/           # HUD、格式化、游戏状态机、启动/结算画面、存档
  audio/        # WebAudio 引擎音效合成
tests/
  unit/         # Vitest 单测
  bot/          # bot 跑圈校验脚本
```

## 实现要点

- **伪 3D 投影**：分段路面梯形投影，`scale = depth / (z - camera.z)`，相机 z 随行进同步
- **曲线赛道**：每段 `curve` 值累计中心线偏移，控制点线性插值生成平滑弯道，支持环形赛道与回环约束
- **漂移系统**：急转蓄力触发漂移，转向增强 + 轻微减速，漂移烟雾粒子随车尾生成
- **分屏渲染**：单 Renderer 区域渲染（`renderRegion`），双车独立物理与 HUD，URL 参数开关
- **bot 决策**：前瞻窗口检测弯道（|Σcurve| 阈值），弯道降速 + 横向回中转向
- **验证闭环**：每个里程碑经 typecheck + lint + test + build + bot 全量验证后提交
