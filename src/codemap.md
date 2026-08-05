# src/

## Responsibility

`src/` 是游戏的全部源代码根目录。按关注点分层为：渲染引擎（`engine/`）、车辆物理（`physics/`）、游戏逻辑编排（`game/`）、AI 决策与模拟（`ai/`）、用户界面（`ui/`）、程序化音频（`audio/`），以及运行时唯一入口 `main.ts` 与全局样式（2026-08-05 按屏幕维度拆分为 `style.base.css` 设计令牌/全局/HUD、`style.screens.css` 菜单/结算、`style.interaction.css` 暂停/摇杆/响应式媒体查询，加载顺序即原 `style.css` 顺序）。各子目录均为纯函数优先的领域层或副作用受限的表现层，由 `game/game-loop.ts` 的 `GameLoop` 在 `requestAnimationFrame` 主循环中串联（`main.ts` 仅引导入口，编排全部下沉 `game/` 层）。

## Design

- **纯函数领域层**：`engine/` 与 `physics/` 的核心逻辑全部为纯函数/无副作用类型，不依赖 DOM、浏览器事件或全局状态；副作用集中在 `game/game-loop.ts`（GameLoop 主循环）与 `ui/` 表现层。
- **状态集中管理**：`game/state.ts` 的 `RaceState` 是运行时的唯一可变状态容器（含双玩家 `PlayerState` 与双 `TrackContext`），主循环每帧读改写同一对象；渲染与 UI 函数均为 `state → output` 的纯函数/渲染函数。
- **门面封装**：`engine/renderer.ts` 的 `Renderer` 类作为渲染门面，`render`/`renderRegion` 支持 `RenderView` 视图参数化（分屏双世界零重建），`drawDivider` 处理分屏分隔线。
- **依赖方向**：`engine/` 与 `physics/` 处于底层；`game/` 依赖 `engine/` + `physics/`，并对 `ui/` 存在运行级调用（hud/screens/joystick/save/minimap）；`ui/` 对 `game/` 已完全断开——连 `import type`（RaceState/TrackContext）也已提升至 `src/shared/types.ts`（2026-08-05 解环，ui 从 shared 导入类型），运行时依赖（`DRIFT_SCORE_MAX`/`CHALLENGE_TARGET_SCORE` 与 format 的 re-export）全部改从 `src/shared/` 导入（constants/phase/phase-logic/lap/types 唯一真源；ui/gamestate 纯 re-export 兼容层 2026-08-05 删除，hud/screens 直接导入 shared/phase），engine/physics 亦直接依赖 `src/shared/constants`——运行时与类型层依赖环均已消除（game 层 constants/phase/phase-logic/lap/state/track-context 保留 re-export 兼容层）；`audio/` 仅依赖外部注入的 `AudioContext`；`ai/` 依赖 `engine/` + `physics/`。
- **可测试与可复现**：领域层纯函数、确定性生成器（`mulberry32`）、无头模拟器（`ai/simulate.ts`）、canvas mock 基建（`tests/__mocks__/canvas.ts`）共同支撑 Vitest 单测与 `npm run bot` 跑圈验证（`tests/bot/run-bot.ts` 自 0eb8b6e 起跑全 9 赛道矩阵回归）。
- **M14 性能优化与 UI 增强**：`engine/road-strip.ts`（曲率段合并 `buildRoadStrips` + 离屏 canvas 预渲染 `renderRoadStripToCanvas`，`TrackContext` 预计算 `roadStrips` 供直道段切片 drawImage 加速）与 `ui/minimap.ts`（`Minimap` 类小地图/赛道进度指示器：构造预计算轨迹折线并归一化、每帧按 `cameraZ % lapLength` 重绘玩家位置点）为 M14 新增。
- **M16 碰撞反馈与道路视觉优化**：`game/collision-feedback.ts`（碰撞红闪纯函数状态机 `updateCollisionFlash` + 速度比映射 `flashSeedFromSpeedRatio`，渲染层 `drawCollisionVignette` 屏幕红晕 + HUD 碰撞计数）；`ui/copy.ts`（文案常量唯一真源，倒计时提示与 README 同源）；`game/frame-pure.ts` 新增 `shouldScheduleNextFrame`（帧循环调度契约）；`engine/road-strip.ts` 路面 9 带横向渐变 + 颗粒噪点 + `shadeColor` 亮度调节。
- **M17 环境差异化**：`engine/environment.ts`（9 种环境配置唯一真源：天空/草地色相、远山配色、景物类型与密度、地形装饰）；`TrackDef.environment` 必选字段；渲染层按环境差异化光照/远山（懒重建）/景物形状（SpriteKind 扩展 cactus/palm/snowpile + rotation/scale）/地形装饰（沙丘/海面/岩壁）；`track-preview.ts` 赛道缩略图按环境取主题色（`getEnvironmentPreviewColor`）；菜单背景按赛道 id 换 `track-xxx` 类。
- **M18 UI/UX 深度打磨**：`engine/player-car.ts` 新增可选 `flash?/headlightColor?`（碰撞车身边框白→红描边 3px 闪白 + 环境车灯 canyon '#ff8a5c'/alpine '#dff1ff'）；`engine/projection.ts` 新增 `MAX_SPRITE_SCALE=2.2` + `clampSpriteScale`（精灵近距缩放上限，clamp 放精灵侧不污染 project 数学）；`engine/road-surface.ts` 新增 `drawCurbDetail`/`drawCurbSide` 路缘立体感（分隔线 shadeColor 0.75 + 高光 1.15，宽<6px 跳过）；`engine/terrain-draw.ts` 沙丘 sin 变形（DUNE_* 预计算折线）+ 海面波浪随 `time` 漂移（`drawTerrain` 可选第 5 参，向后兼容）+ 仙人掌两档明暗；`ui/copy.ts` 新增 4 文案常量（FINISH_DRIFT_HINT/MATCH_EMPTY_HINT/STATS_EMPTY_HINT/RACING_TOUCH_HINT）；UI 表现层可访问性（榜单卡键盘展开/focus-visible 全覆盖/ARIA 补全）、`prefers-reduced-motion` 降级、颜色令牌化（--color-p1/p2/danger/accent）、屏幕过渡（.leaving/.pause-in）、BOOST 未蓄能 `.no-charge` 红闪、漂移得分 `.score-pop` 激活、`#racing-touch-hint` 触屏引导浮层。
- **2026-08-05 运行时实测修复批次**：`RACE_START_GRACE`（起步碰撞保护期 5s）+ `TRAFFIC_SPAWN_SAFE_ZONE`（车流出生安全窗口）防开局误撞；`OFF_ROAD_PUSHBACK`（出界内侧推回 0.05）修复"钉死边缘"BUG-2；碰撞横向容差 0.9→0.55；`ensureLoop` 幂等 RAF 重启 + `silenceDriveSounds` 静音（防完赛/暂停持续蜂鸣）；完赛界面空边框卡片 `hideIfEmpty` 修复；菜单打磨（赛道缩略图放大 + 环境主题预览色 + 光晕、暂停按钮真实指针可点性）。
- **测试辅助迁移（死代码清理）**：仅测试使用的导出 `createDefaultTrack`（原 `engine/track.ts`）与 `spritesInRange` 线性版（原 `engine/sprites.ts`）已迁移至 `tests/helpers/`（`tests/helpers/track.ts`、`tests/helpers/sprites.ts`），生产代码不再导出；`createStraightTrack` 因禁碰测试文件仍自 src 导入而保留并标注 `@deprecated`。

## Flow

1. **启动**：`index.html` 加载 `src/main.ts`；`main.ts` 仅调用 `initGame()`；`GameLoop` 构造时解析游玩模式（默认单屏 / `?split=1` 分屏 / `?hotseat=1` 热座轮流 / `?challenge=1` 限时挑战，split 优先互斥）、组装 DOM 引用、`TrackManager` 双玩家 TrackContext、`createRaceState`、`Renderer`、输入/摇杆、存档加载（含总音量/音乐/音效三档）。
2. **主循环**：`requestAnimationFrame` 驱动 `frame(now)`，计算 `dt` 后分阶段执行：
   - `PHASE_MENU`：预览相机推进 + 赛道预览渲染（分屏双区域；夜晚赛道按 `viewFor` 的 night 透传渲染），等待输入；展示各赛道 BEST 汇总（`refreshBestSummary`）、漂移 TOP10 榜单与对局榜（`refreshMatchTop`）。
   - `PHASE_RACING`：双世界车流推进（`updateTraffic` 传玩家位置触发避让）→ 采集双输入（P1 Space / P2 Enter 可含 BOOST）→ BOOST 蓄力/消耗（漂移蓄能 `updateBoostCharge`，按键激活突破 1.15×maxSpeed，`#boost-bar` 200px 像素映射宽度）→ **H2 BOOST 音效/尾焰**（`boostOn && !boostActive` 边沿触发 `boostSound.play()`；P1 激活期间每帧至多 push 1 粒 `BoostParticle { x, z: cameraZ + 2, t: 0 }`，t 随帧推进、超 0.6s 移除，经 `viewFor(ctx, boostParticles?)` 并入 `RenderView.boostParticles` 由 renderer 投影）→ `updatePlayerFrame`（漂移/连击倍率/运动学/相机/计时/各自圈速；**H5 直返新 lastLap 单行赋值 `race.lastLap`**；雨天 wet 尾参制动 ×0.7/转向 ×0.85；**H1 挑战加成 `challengeMult` 第 7 尾参——雨天 +50%、难度 (★-1)×25%**；热座仅更新当前回合玩家）→ 碰撞裁决（M16：命中返回 impact 速度比，`updateCollisionFlash` 写回红闪状态）→ 环境音效（雨段 `rainSound` start/stop、碰撞 `collisionSound.play(impact)`——**H6 `impact = max(P1/P2 速度比)` 强度随速度**）→ 挑战限时判定（raceTime ≥ 60 → finished）与各自完赛判定 → 渲染（单屏或分屏双区域 + 分隔线；天气三态 `updateLighting(timeSec, overcast, raining, night, environment)` 晴/阴/雨各 45s + M17 环境色板，雨态叠加雨滴离屏 overlay，夜晚赛道深暗色板 + 车灯光晕随避让 shiftDir 转向 + night 车流红色尾灯；M16 碰撞红闪 `drawCollisionVignette`）→ `updateHud` 双人刷新（含热座当前玩家标签、漂移连击倍率与得分 MAX 标记、碰撞计数 `#hud-collision`、挑战倒计时 `#challenge-timer`）。
   - `PHASE_PAUSED`：暂停输入与物理（`joystick.reset()` 清残留触屏输入），显示暂停画面（继续/重开按钮 + 音量/音乐/音效三 slider 分轨持久化，KeyR 直接回菜单，触屏 `#pause-btn`/`#pause-resume` 可进出）。
   - `PHASE_FINISHED`：结算面板按完赛标记双人填充，P1/P2 各自写入存档（P2 用 `-p2` key）；挑战模式走「挑战结束 / 漂移榜第 N 名 / 挑战漂移得分」分支（`challengeMode` 第 9 字段）；分屏双完赛显示漂移竞速横幅，热座 P2 回合显示胜负横幅；胜场统计（`recordWin`）、漂移得分 TOP10（`addDriftScore`/`refreshDriftTop`，**H4 起条目带 `combo: Math.round(driftState.combo)` 最高连击档位、榜单渲染 ` · 连击 x倍率` 后缀，旧条目不追加**）与分屏对局榜（`addMatchResult`/`refreshMatchTop`）按 `FINISHED && !finishShown` 守卫记账，防 ESC 重入重复计数。
3. **阶段切换**：`window.addEventListener('keydown')` 触发 `nextPhase` / `togglePause`（`game/phase-logic.ts`）；菜单阶段数字键 1-9（P1）与分屏 Shift+1-9（P2）从 `TRACK_DEFS` 9 条赛道选赛道（数字键与修饰键单独按下均不触发开始）；比赛阶段 P1 Space / P2 Enter 激活 BOOST；热座 P1 回合完赛后 Enter/R 交棒 P2。
4. **音频启动**：首次按键时创建 `AudioContext` 并建 `masterGain`（总控 gain = 持久化总音量），下挂 `musicGain`（音乐，默认 0.8）与 `sfxGain`（音效，默认 1.0）分轨；`EngineSound`/`RainSound`/`CollisionSound`/`BoostSound`（H2 氮气音效）注入 sfxGain、`MusicPlayer` 注入 musicGain（M12 起音效/音乐音量可独立调节持久化）；主循环每帧以速度比驱动引擎音效，调度器使用纯函数 `stepEvents`/`nextStep`（M12 起导出可单测）；碰撞音 `play(impact)` 带速度强度参（H6，`CollisionSound` 内部按 0.25 × clamp(impact, 0.4, 1) 缩放增益，80ms 防刷屏不变）。
5. **分屏/热座/挑战支持**：`?split=1` 双人同时——两个独立 `TrackContext` 赛道世界，渲染器 `renderRegion` 左右视口 + `drawDivider`，碰撞/圈速/存档完全按玩家分离；`?hotseat=1` 双人轮流——同赛道先后跑，输入路由到当前回合玩家，回合间重置世界；`?challenge=1` 限时挑战——60 秒内刷漂移分，时间到自动结算并与漂移 TOP10 联动。

## Integration

- `src/main.ts` 是 `src/` 内唯一运行时入口，仅调用 `initGame()`；实质编排在 `game/game-loop.ts`（GameLoop）。
- 子目录间依赖关系：
  - `engine/` ← 被 `game/game-loop.ts`、`game/track-context.ts`、`game/track-manager.ts`、`game/state.ts`、`ai/bot.ts`、`ai/simulate.ts` 消费
  - `physics/` ← 被 `game/game-loop.ts`、`game/collision.ts`、`ai/bot.ts`、`ai/simulate.ts`、`ui/hud.ts`、`ui/screens.ts` 消费
  - `game/` ← 被 `main.ts`、`ui/`（类型/re-export）、`tests/` 消费
  - `ui/` ← 被 `game/game-loop.ts` 运行级消费
  - `audio/` ← 被 `game/game-loop.ts` 消费（H2 起含 `BoostSound`）
  - `ai/` ← 被 `tests/` 消费（headless，生产循环不直接依赖；`tests/bot/run-bot.ts` 全 9 赛道矩阵回归）

## 子目录详细地图

| 目录           | 详细地图                                         |
| -------------- | ------------------------------------------------ |
| `src/engine/`  | [src/engine/codemap.md](src/engine/codemap.md)   |
| `src/shared/`  | [src/shared/codemap.md](src/shared/codemap.md)   |
| `src/physics/` | [src/physics/codemap.md](src/physics/codemap.md) |
| `src/ai/`      | [src/ai/codemap.md](src/ai/codemap.md)           |
| `src/game/`    | [src/game/codemap.md](src/game/codemap.md)       |
| `src/ui/`      | [src/ui/codemap.md](src/ui/codemap.md)           |
| `src/audio/`   | [src/audio/codemap.md](src/audio/codemap.md)     |

## 根级文件

| 文件                        | 职责                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`               | 运行时入口（4 行）：`initGame()` + `setupPwaUpdate()`（样式经 index.html 三个 link 加载）                                                                                                                                                                                                                                                                                                                                           |
| `src/style.base.css`        | 样式拆分 A（2026-08-05）：设计令牌 `:root`（含 M18 颜色令牌 `--color-p1/--color-p2/--color-danger/--color-accent` + RGB 变量、`prefers-reduced-motion` 降级区块）、全屏 Canvas、HUD 定位（含分屏左右对称布局）、榜单内容区滚动样式；原 `style.css` 1-518 行                                                                                                                                                                         |
| `src/style.screens.css`     | 样式拆分 B（2026-08-05）：启动/暂停/结算画面样式（9c57c8f 起 `#finish-screen` 加 `overflow-y: auto` 防内容溢出截断；2026-08-05 起 `hideIfEmpty` 空边框卡片修复）、赛道选单双类高亮（selected/selected-p2）+ 赛道缩略图放大与预览光晕（74742d8）、`.leaving/.pause-in` 屏幕过渡、`.btn-primary` 公共按钮、集中 `focus-visible` 焦点环、`#racing-touch-hint` 触屏引导浮层、自定义滚动条与低高度移动端压缩；原 `style.css` 519-1736 行 |
| `src/style.interaction.css` | 样式拆分 C（2026-08-05）：暂停菜单玻璃风格与按钮可点性、触屏暂停/摇杆、模式徽章/HUD 侧标签、赛道主题背景类、竖屏 portrait-mode、全部响应式媒体查询（≤640/390、max-height、≥1600、prefers-reduced-motion）、PWA 更新提示；原 `style.css` 1737-2729 行                                                                                                                                                                                |
| `src/vite-env.d.ts`         | Vite 客户端类型声明                                                                                                                                                                                                                                                                                                                                                                                                                 |
