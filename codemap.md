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
- **vite-plugin-pwa**（M15 离线发布构建，generateSW + autoUpdate 注册）

## 系统入口点

| 文件                    | 职责                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`            | 单页 HTML 壳，定义 Canvas、HUD（含分屏 P2 与 P2 结算行）与菜单 DOM 结构（M15 起含 `.menu-bg` 多层背景/标题动画/榜单卡片与结算 `.finish-line` 动画结构）；`<head>` 含 PWA meta（theme-color、favicon、apple-touch-icon）；引入 `src/main.ts` |
| `src/main.ts`           | 运行时唯一入口（4 行）：导入样式并调用 `initGame()` 启动 `GameLoop`                                                                                                                                                                         |
| `src/game/game-loop.ts` | 主循环编排核心：DOM 组装、每帧更新/渲染分支、阶段切换、双玩家赛道管理、音频/调试钩子                                                                                                                                                        |
| `package.json`          | 脚本：`dev` / `build` / `preview` / `typecheck` / `lint` / `test` / `bot`；devDependency 含 `vite-plugin-pwa@1.3.0`（M15 离线 PWA）                                                                                                         |
| `vite.config.ts`        | Vite 配置：测试入口为 `tests/**/*.test.ts`，Node.js 环境；M15 起集成 `VitePWA`（registerType autoUpdate + manifest + workbox generateSW）产出离线 PWA                                                                                       |
| `tsconfig.json`         | ES2022 + bundler 模块解析，`strict` / `noUnusedLocals` / `noEmit`                                                                                                                                                                           |
| `eslint.config.js`      | `typescript-eslint` 推荐规则，忽略 `dist/`                                                                                                                                                                                                  |
| `README.md`             | 用户级快速开始、操作说明、里程碑状态                                                                                                                                                                                                        |
| `AGENTS.md`             | 项目规范：技术栈、验证优先级、目录结构、里程碑、语言约定                                                                                                                                                                                    |

## 目录地图

| 目录           | 职责摘要                                                                                                                                                                     | 详细地图                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `src/engine/`  | 伪 3D 渲染引擎层（Canvas 2D）：投影数学、赛道定义与生成、路面几何、景物系统、车流系统、漂移烟雾渲染、环境光照、RenderView 多 view 参数化、空间索引、确定性 PRNG              | [src/engine/codemap.md](src/engine/codemap.md)   |
| `src/physics/` | 车辆运动学与玩家输入的领域层：速度/转向/出界、纯函数漂移系统（连击/倍率/得分）、多输入源规范化、雨天物理与 BOOST 氮气加速                                                    | [src/physics/codemap.md](src/physics/codemap.md) |
| `src/ai/`      | Bot 自动驾驶决策器与无头跑圈模拟器                                                                                                                                           | [src/ai/codemap.md](src/ai/codemap.md)           |
| `src/game/`    | 游戏编排层：GameLoop 主循环、双玩家 TrackContext 赛道世界、RaceState、碰撞裁决与碰撞反馈（M16 collision-feedback.ts 红闪状态机）、阶段 FSM、常量真源、挑战模式/热座/分屏支持 | [src/game/codemap.md](src/game/codemap.md)       |
| `src/ui/`      | UI 表现层：双人 HUD、启动/暂停/结算画面（双人化）、格式化、玩家维度存档、虚拟摇杆、漂移连击倍率与 MAX 标记                                                                   | [src/ui/codemap.md](src/ui/codemap.md)           |
| `src/audio/`   | WebAudio 程序化合成：引擎音效、环境音效（雨声/碰撞）、BOOST 氮气音效与 chiptune 背景音乐                                                                                     | [src/audio/codemap.md](src/audio/codemap.md)     |
| `public/`      | PWA 静态资源（M15）：`icon.svg`/`pwa-192.png`/`pwa-512.png`/`maskable-512.png` 图标（零依赖 PNG 编码生成，maskable 版 scale 0.7 居中）                                       | —                                                |
| `tests/`       | 质量验证层：44 个 Vitest 单元测试 639 用例（含 canvas mock 基建）+ Playwright 视觉回归（M16）+ bot 跑圈验收脚本（9 赛道矩阵回归）                                            | [tests/codemap.md](tests/codemap.md)             |
| `docs/`        | 项目计划与演进档案：M1-M13 里程碑及扩展/优化实施方案                                                                                                                         | [docs/codemap.md](docs/codemap.md)               |
| `src/`         | 源代码根目录：渲染引擎、车辆物理、游戏逻辑编排、AI 决策与模拟、用户界面、程序化音频，以及运行时入口与全局样式                                                                | [src/codemap.md](src/codemap.md)                 |

## 主循环数据流

1. **初始化**：`main.ts` → `initGame()` → `GameLoop` 构造：解析游玩模式（默认单屏 / `?split=1` 分屏 / `?hotseat=1` 热座轮流 / `?challenge=1` 挑战模式，split 优先互斥）、组装 DOM 引用、`TrackManager`（双玩家 TrackContext，含赛道分段/圈长/圈数/曲率前缀和/景物索引/车流预计算）、`createRaceState`、`Renderer`、输入/摇杆/存档；阶段初始 `PHASE_MENU`。
2. **用户交互**：键盘/触屏触发阶段转移（menu → racing → paused → finished）；菜单阶段数字键 1-9（P1）与分屏 Shift+1-9（P2）从 9 条赛道独立选赛道（数字键与修饰键均不触发开始）；热座模式下 P1 完赛后回车/R 交棒 P2 同赛道再跑；挑战模式（`?challenge=1`）60 秒限时刷分自动收束；比赛阶段 P1 Space / P2 Enter 激活 BOOST 氮气；首次按键惰性创建 `AudioContext`（masterGain 总控下挂 musicGain/sfxGain 分轨）。
3. **每帧更新（RACING）**：双世界车流独立推进 → 采集双输入 → BOOST 蓄力/消耗（漂移蓄能、按键激活）→ `updatePlayerFrame`（漂移→速度→运动学→相机→计时→各自圈速记录，雨天 wet 制动 ×0.7/转向 ×0.85；热座仅更新当前回合玩家）→ `updateCollisions`（车流碰撞，分屏独立世界无 P1-P2 互碰）→ 挑战限时判定（raceTime ≥ 60 → finished）与各自完赛判定；环境音效驱动（雨段 rainSound start/stop、碰撞 collisionSound）。
4. **每帧渲染**：`renderer.render`（单屏）/ `renderRegion`×2 + `drawDivider`（分屏双世界独立视图）；天气三态循环（`updateLighting` 晴/阴/雨各 45s 交替：phase = floor(timeSec/45) % 3，阴/雨降饱和压暗，雨态叠加雨滴 overlay——M11 起雨滴预渲染到离屏 canvas 双幅平铺，帧内零逐段绘制）；夜晚赛道（`TrackDef.timeOfDay: 'night'`，canyon/alpine）锁定深暗色板 + 深色远山缓存 + 车头灯双弧光晕（M12 起随车流避让 shiftDir 转向）；`updateHud` 同步双人 DOM 文本（含双人 BEST、热座当前玩家标签、漂移连击倍率与得分 MAX 标记、挑战倒计时 `#challenge-timer`、BOOST 条 `#boost-bar` 200px 像素映射宽度）。
5. **阶段切换**：`applyPhase` → `applyPhaseToScreens`（结算面板按完赛标记双人填充：P2 存档独立 `-p2` key、热座回合快照与胜负横幅、分屏漂移竞速横幅、胜场统计行、挑战模式分支「挑战结束/漂移榜第 N 名/挑战漂移得分」）→ 完赛写入最佳圈速/漂移分，并记账热座/分屏胜场（`recordWin`，连胜 localStorage）、跨玩家漂移得分 TOP10（`addDriftScore`）与分屏对局最近 10 局（`addMatchResult`）→ 回菜单刷新排行榜（漂移榜/BEST 汇总/对局榜）。

## 验证优先级

项目强制按以下顺序验证：

1. `npm run typecheck` —— `tsc --noEmit`
2. `npm run lint` —— `eslint .`
3. `npm test` —— `vitest run`
4. `npm run bot` —— `tsx tests/bot/run-bot.ts`（9 赛道矩阵，输出圈速与违规报告）
5. `npm run build` —— `tsc --noEmit && vite build`（M15 起经 vite-plugin-pwa 产出 `dist/sw.js`/`manifest.webmanifest`/`registerSW.js` 等离线 PWA 产物）
6. `npm run test:e2e` —— Playwright 视觉回归（M16 起，桌面 1280×720 + 移动横屏 812×375 双 project；CI 独立 e2e job，失败上传 test-results 产物）

## 关键设计约束

- 不使用 WebGL/Three.js，全部渲染由 Canvas 2D 完成。
- `engine/` 与 `physics/` 为纯函数领域层，不依赖 UI 或 DOM，便于单测与 bot 复用。
- 所有模块通过 TypeScript 类型与显式参数传递状态，避免全局可变状态。
- 确定性生成（`mulberry32`）保证同输入下场景、车流、远山体一致，支撑 bot 可复现校验。
- 阶段管理采用有限状态机（`menu` / `racing` / `paused` / `finished`），`Phase` 定义与转移逻辑下沉 `game/` 层，`ui/gamestate.ts` 仅作 re-export 兼容层。
- 分屏 = 两个独立赛道世界（`TrackContext` 双实例 + RenderView 参数化），渲染/碰撞/圈速/存档完全按玩家分离；热座（`?hotseat=1`）= 同赛道回合制轮流，输入路由到当前回合玩家（热座 P2 回合车流/碰撞按回合参与）。
- 游戏参数唯一真源为 `src/game/constants.ts`，engine/physics 反向导入常量避免魔法数字；车流密度经 `TrackDef.trafficCount` 赛道级调参，天气三态循环（晴/阴/雨各 45s）由 `updateLighting` 参数化。
- **game↔ui 受限双向依赖环（有意折衷，无循环初始化问题）**：ui→game 的业务类型依赖全部为 `import type`（hud/screens 的 `RaceState`、hud/minimap 的 `TrackContext`）；ui→game 的运行时依赖仅限 `game/constants` 常量值（hud.ts 的 `DRIFT_SCORE_MAX`、screens.ts 的 `CHALLENGE_TARGET_SCORE`）与 `gamestate`/`format` 的 re-export 兼容层；game→ui 为运行级调用（hud/screens/joystick/save/minimap）。环的实质是"共享常量值层 + 兼容层"，无循环初始化问题；彻底解环（将常量层提升为独立共享模块）留作未来可选重构，当前不执行。
- 赛道注册表 `TRACK_DEFS` 现有 9 条赛道（含 `difficulty` 星级与菜单 ★ 显示；canyon/alpine 为夜晚赛道 `timeOfDay: 'night'`，深暗色板 + 车头灯光晕）；双人成绩持久化：胜场统计（热座/分屏两模式独立 key + 连胜）、漂移得分 TOP10 排行榜与分屏对局最近 10 局记录均存 localStorage（`save.ts`）；菜单另展示各赛道 BEST 汇总（`refreshBestSummary`）与对局榜（`refreshMatchTop`）。
- 游戏性扩展：漂移连击/倍率系统（`combo` 累积 0.5s 窗口 + 得分 ×(1+combo×0.25) + `DRIFT_SCORE_MAX` clamp，HUD 得分触顶显示 `MAX`）、车流避让 AI（`updateTraffic` 玩家尾参触发变道 + 车灯随 shiftDir 转向）、雨天物理（`updateCar` wet 尾参制动 ×0.7/转向 ×0.85）、BOOST 氮气（漂移蓄力 `updateBoostCharge` + Space/Enter 激活突破 1.15×maxSpeed + 底部渐变条）、挑战模式（`?challenge=1` 限时 60s 刷分结算联动漂移 TOP10）、暂停菜单（总音量/音乐/音效三 slider 分轨持久化 + 重开 + 触屏 `#pause-btn`/`#pause-resume` 进入恢复）、环境音效（`RainSound` 雨段循环噪声 + `CollisionSound` 碰撞冲击音，80ms 防刷屏）、M15 漂移摩擦声 `DriftSound`（bandpass 噪声 + 强度调制）与轻量胎噪 `TireSound`（lowpass 噪声，封顶 0.02）。
- 性能优化：远山离屏缓存（day/night 双套）、雨滴预渲染离屏 canvas（`buildRainCanvas` 双幅 drawImage 平铺）、曲率前缀和、sprites 空间索引、lapRef/lapRef2 复用（消除每帧包装对象分配）、MusicPlayer 调度纯函数化（`stepEvents`/`nextStep` 导出可单测）；**M14 性能优化批次**——`src/engine/road-strip.ts` 按曲率差合并赛道分段为曲率段（`buildRoadStrips`，`TrackContext` 预计算 `roadStrips`，直道段可切片 drawImage 离屏缓存加速渲染）、`src/ui/minimap.ts` 小地图/赛道进度指示器（构造时预计算轨迹折线并归一化到画布，每帧按 `cameraZ % lapLength` 重绘玩家位置点）。
- 死代码清理（本次）：`src/physics/car.ts` 的 `collidePlayers`（分屏独立世界后 src/ 内已无调用方，car.test.ts 用例同步删除）；仅测试使用的导出 `createDefaultTrack`、`spritesInRange`（线性版）迁移至 `tests/helpers/`（`tests/helpers/track.ts`、`tests/helpers/sprites.ts`），`createStraightTrack` 因禁碰测试文件仍自 src 导入而保留并标注 `@deprecated`。

## 延伸阅读

- 用户级说明：`README.md`
- 开发规范：`AGENTS.md`
- 详细架构：各子目录 `codemap.md`
- 实施计划：`docs/superpowers/plans/`
