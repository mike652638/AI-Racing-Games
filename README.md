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

`npm run bot` 输出示例（classic 赛道，3 圈，实测值）：

```json
{
  "laps": 3,
  "lapTimesSec": [26.083, 51.05, 76.017],
  "totalTimeSec": 76.017,
  "avgSpeed": 3631.7,
  "violations": 0,
  "offRoadTimeSec": 0,
  "passed": true
}
```

另有性能与安全工具：

```bash
npm run bench        # 性能基准（投影/漂移/输入热路径帧分配与耗时，--reuse 对比复用路径）
npm run scan         # 安全静态扫描（innerHTML/监听器对称性/定时器/类型泄漏）
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

| 里程碑 | 内容                                                                                                                                                                                                                                                                                                                                        | 状态 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| M1     | 渲染骨架：伪 3D 路面分段投影、直道滚动、60fps 循环                                                                                                                                                                                                                                                                                          | ✅   |
| M2     | 车辆物理：速度/加速度/转向、路缘限制、出界减速                                                                                                                                                                                                                                                                                              | ✅   |
| M3     | 赛道系统：弯道分段路点、视差远山/天空、可配置赛道数据                                                                                                                                                                                                                                                                                       | ✅   |
| M4     | bot 跑圈：沿路点自动行驶、圈速与违规报告（`npm run bot`）                                                                                                                                                                                                                                                                                   | ✅   |
| M5     | HUD、音效合成、启动画面、胜利结算、发布构建                                                                                                                                                                                                                                                                                                 | ✅   |
| 扩展   | 平滑弯道（控制点插值）、路边景物（树木/路灯）、漂移系统、双人分屏、最佳圈速存档                                                                                                                                                                                                                                                             | ✅   |
| 扩展 2 | 车流与碰撞、漂移得分、关卡选单（3 赛道）、chiptune 背景音乐、移动端触控                                                                                                                                                                                                                                                                     | ✅   |
| M6-M7  | GameLoop 重构（DOM/初始化/流程控制/每帧编排下沉 `game/` 层）、阶段 FSM 下沉                                                                                                                                                                                                                                                                 | ✅   |
| M8     | 双人 HUD 扩展（单屏 P2 BEST、热座玩家标签）、赛道自定义车流密度                                                                                                                                                                                                                                                                             | ✅   |
| M9     | 9 条赛道 + 难度星级选单、胜场统计、漂移得分 TOP10 排行榜                                                                                                                                                                                                                                                                                    | ✅   |
| M10    | 车流避让 AI、各赛道 BEST 汇总、主音量调节、漂移连击倍率                                                                                                                                                                                                                                                                                     | ✅   |
| M11    | 夜晚赛道（车灯/尾灯）、分屏对局 TOP10、触屏暂停、雨声/碰撞音、雨滴离屏渲染、得分 MAX 标记                                                                                                                                                                                                                                                   | ✅   |
| M12    | 挑战模式（60s 限时刷分）、雨天物理、BOOST 氮气、车灯随变道转向、音乐/音效分轨音量                                                                                                                                                                                                                                                           | ✅   |
| M13    | H 系列打磨：挑战计分加成、BOOST 音效与尾焰粒子、漂移连击入榜、lastLap 直返、碰撞音强度、9 赛道 bot 矩阵回归                                                                                                                                                                                                                                 | ✅   |
| M14    | 性能优化批次：曲率段离屏缓存（road-strip.ts）、小地图/赛道进度指示器（minimap.ts）；死代码清理（collidePlayers 移除、仅测试导出迁移 `tests/helpers/`）                                                                                                                                                                                      | ✅   |
| M15    | 架构重构（mode-strategy/finish-accounting/frame-update/frame-render 下沉）、漂移摩擦声/胎噪、PWA 离线发布、菜单/结算动画升级、UI/UX 修复、CI 工程化（eslint/prettier/husky/lint-staged）                                                                                                                                                    | ✅   |
| M16    | 运行时实测修复（天空条纹/热座 P2 渲染/菜单光晕/移动端适配）、碰撞反馈增强（屏幕红闪 vignette + HUD 碰撞计数 + 双层碰撞音 + 横向弹开）、道路视觉优化（路面 9 带渐变 + 颗粒噪点）、倒计时提示文案与 README 同源（copy.ts）、`shouldScheduleNextFrame` 纯函数化、Playwright 视觉回归（`npm run test:e2e`，桌面 1280×720 + 移动横屏 812×375）   | ✅   |
| M17    | 环境差异化（`TrackDef.environment` + environment.ts 配置，9 赛道天空/草地/远山/景物差异化）、差异化景物形状（cactus/palm/snowpile + rotation 随机化 + 沙漠小仙人掌）、地形扩展（沙漠沙丘/海岸海面波浪/峡谷岩壁锯齿顶线）                                                                                                                    | ✅   |
| M18    | UI/UX 深度打磨：可访问性（榜单卡片键盘展开 + focus-visible + ARIA + prefers-reduced-motion 降级）、颜色令牌化、屏幕切换过渡、碰撞/BOOST/漂移得分反馈增强、环境渲染细节（精灵限高/车灯色/路缘立体感）、文案 copy.ts 同源、移动端触屏引导浮层                                                                                                 | ✅   |
| M19    | 潜在改进点收尾：debug 钩子生产剥离（DEV 门控死码消除）、输入采集去重（collectSteerInputs 下沉 mode-strategy）、ui/gamestate 死层删除、e2e 玩法链路扩展（BOOST 蓄能 + 碰撞反馈，双 project）                                                                                                                                                 | ✅   |
| M20    | 运行期实测修复（大屏布局根因/portrait 旋转同步/路灯缩放上限/噪点降密度/暂停文案去重/视口缩放放宽）、HUD 行驶期修复（BOOST 条 bottom-center、速度线淡蓝白）、榜单菜单优化 v1-v3（独立展开/整体控制/dashboard 容器）、M20 收尾批次（HUD 脏值比对/roadStrip 宽度守卫/音频节点释放/样式三文件拆分/菜单专项测试）、CI e2e 大屏 1920×1080 project | ✅   |

## 测试命令

- 单元测试：`npm test`（Vitest）
- E2E 视觉回归：`npm run test:e2e`（Playwright，需先 `npx playwright install chromium`）
  - 覆盖：菜单光晕不遮挡赛道卡片、标题与副标题不叠影、天空无高频条纹（canvas 像素级）、倒计时提示同源填充、热座 P1 HUD 标签、移动端横屏开始按钮在视口内、大屏 1920×1080 内容居中
- bot 跑圈：`npm run bot`（9 赛道矩阵回归，0 违规）
- 全量 CI：typecheck → lint → format:check → test → bot → build → e2e（见 `.github/workflows/ci.yml`）

## 目录结构

```
src/
  engine/       # 伪3D投影、路面分段渲染、视差山景、路边景物（含环境差异化形状）、漂移烟雾、车流渲染、赛道定义（tracks.ts）、环境配置、玩家车渲染
  physics/      # 车辆运动学、漂移、双人按键映射
  game/         # GameLoop 主循环（29 文件）、帧更新/渲染纯函数、模式策略、结算统计、阶段 FSM、碰撞、赛道上下文、常量（re-export shared）
  ai/           # bot 决策器、圈速模拟器
  shared/       # 独立共享层：游戏常量（constants）、阶段（phase/phase-logic）、圈数（lap）唯一真源（解环 game↔ui）
  ui/           # HUD、格式化、游戏状态机、启动/结算画面、存档、触屏摇杆、小地图
  audio/        # WebAudio 合成：引擎音效（漂移摩擦/胎噪）、背景音乐
tests/
  unit/         # Vitest 单测（48 文件 710 用例；连同 tests/bench 冒烟合计 49 文件 711 用例）
  e2e/          # Playwright 视觉回归（visual.spec.ts，桌面/移动横屏/大屏三 project）
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
