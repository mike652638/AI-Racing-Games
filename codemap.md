# AI-Racing-Games 仓库总览

## 项目职责

OutRun 伪 3D 复刻赛车游戏。基于 TypeScript + Vite 构建，使用 Canvas 2D 实现伪 3D 投影，不依赖 WebGL/Three.js。项目采用纯函数优先的领域层设计，所有核心模块（物理、渲染、AI）均可脱离 UI 与单测独立运行，并通过 `npm run bot` 跑圈验证作为质量门禁。

## 技术栈

- **TypeScript**（ES2022 / strict mode）
- **Vite**（开发服务器、生产构建）
- **Canvas 2D**（伪 3D 投影、路面、景物、车流、烟雾）
- **Vitest**（单元测试，运行 `tests/unit/*.test.ts`）
- **tsx**（Node.js 脚本执行，用于 bot 跑圈）
- **ESLint**（`typescript-eslint` 推荐配置）

## 系统入口点

| 文件 | 职责 |
|------|------|
| `index.html` | 单页 HTML 壳，定义 Canvas 与 HUD DOM 结构；引入 `src/main.ts` |
| `src/main.ts` | 运行时唯一入口：初始化赛道/车辆/渲染器/输入/音频/状态，驱动 `requestAnimationFrame` 主循环，协调物理、碰撞、渲染、HUD、阶段切换 |
| `package.json` | 脚本：`dev` / `build` / `preview` / `typecheck` / `lint` / `test` / `bot` |
| `vite.config.ts` | Vite 配置：测试入口为 `tests/**/*.test.ts`，Node.js 环境 |
| `tsconfig.json` | ES2022 + bundler 模块解析，`strict` / `noUnusedLocals` / `noEmit` |
| `eslint.config.js` | `typescript-eslint` 推荐规则，忽略 `dist/` |
| `README.md` | 用户级快速开始、操作说明、里程碑状态 |
| `AGENTS.md` | 项目规范：技术栈、验证优先级、目录结构、里程碑、语言约定 |

## 目录地图

| 目录 | 职责摘要 | 详细地图 |
|------|----------|----------|
| `src/engine/` | 伪 3D 渲染引擎核心：投影数学、赛道分段、路面/景物/车流/烟雾渲染、昼夜光照、确定性 PRNG | [src/engine/codemap.md](src/engine/codemap.md) |
| `src/physics/` | 车辆运动学领域层：速度/转向/出界、漂移系统、多输入源规范化 | [src/physics/codemap.md](src/physics/codemap.md) |
| `src/ai/` | Bot 自动驾驶决策器与无头跑圈模拟器 | [src/ai/codemap.md](src/ai/codemap.md) |
| `src/game/` | 游戏逻辑编排层：对局可变状态、输入管理、碰撞裁决 | [src/game/codemap.md](src/game/codemap.md) |
| `src/ui/` | UI 表现层：HUD、启动/暂停/结算画面、格式化、存档、阶段 FSM、虚拟摇杆 | [src/ui/codemap.md](src/ui/codemap.md) |
| `src/audio/` | WebAudio 程序化合成：引擎音效与 chiptune 背景音乐 | [src/audio/codemap.md](src/audio/codemap.md) |
| `tests/` | 质量验证层：23 个 Vitest 单元测试 + bot 跑圈验收脚本 | [tests/codemap.md](tests/codemap.md) |
| `docs/` | 项目计划与演进档案：M1-M5 里程碑及 M6+ 扩展实施方案 | [docs/codemap.md](docs/codemap.md) |
| `src/` | 源代码根目录总览 | [src/codemap.md](src/codemap.md) |

## 主循环数据流

1. **初始化**：`main.ts` 从 `tracks.ts` 加载赛道定义，调用 `createTrackFromDef`、`createRoadsideSprites`、`createTraffic` 构建赛道与场景数据；构造 `Renderer`、`RaceState`、`InputManager`、`JoystickUI`；初始化阶段为 `PHASE_MENU`。
2. **用户交互**：键盘/触屏触发阶段转移（menu → racing → paused → finished）与赛道切换；首次按键时惰性创建 `AudioContext` 并启动引擎音效与音乐。
3. **每帧更新（RACING 阶段）**：
   - 推进车流 `updateTraffic`
   - 获取玩家输入（P1 键盘或摇杆，P2 键盘在分屏模式）
   - 更新漂移状态 `updateDrift` → 速度修正 `driftSpeedFactor` → 运动学推进 `updateCar`
   - 推进相机 z 与累计时间
   - 检测过圈并记录圈速
   - 处理碰撞 `updateCollisions`（车流与玩家、P1-P2 互碰）
4. **每帧渲染**：`renderer.render`（单屏）或 `renderer.renderRegion`（分屏）绘制天空、远山、草地、路面、景物、车流、烟雾；`updateHud` 同步 DOM 文本。
5. **阶段切换**：`applyPhase` 调用 `applyPhaseToScreens` 切换启动/暂停/结算画面；完赛时写入最佳圈速与漂移分数存档。

## 验证优先级

项目强制按以下顺序验证：

1. `npm run typecheck` —— `tsc --noEmit`
2. `npm run lint` —— `eslint .`
3. `npm test` —— `vitest run`
4. `npm run bot` —— `tsx tests/bot/run-bot.ts`（跑 3 圈，输出圈速与违规报告）
5. `npm run build` —— `tsc --noEmit && vite build`

## 关键设计约束

- 不使用 WebGL/Three.js，全部渲染由 Canvas 2D 完成。
- `engine/` 与 `physics/` 为纯函数领域层，不依赖 UI 或 DOM，便于单测与 bot 复用。
- 所有模块通过 TypeScript 类型与显式参数传递状态，避免全局可变状态。
- 确定性生成（`mulberry32`）保证同输入下场景、车流、远山体一致，支撑 bot 可复现校验。
- 阶段管理采用有限状态机（`menu` / `racing` / `paused` / `finished`），状态转移函数为纯函数，副作用集中在 `main.ts` 与 `ui/screens.ts`。

## 延伸阅读

- 用户级说明：`README.md`
- 开发规范：`AGENTS.md`
- 详细架构：各子目录 `codemap.md`
- 实施计划：`docs/superpowers/plans/`
