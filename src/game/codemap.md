# src/game/

## Responsibility

游戏逻辑（gameplay orchestration）层：在 `engine/`（伪 3D 渲染与赛道数据）与 `physics/`（车辆运动学）之上，编排一局完整比赛所需的三类运行时职责：

- `state.ts` —— 对局可变状态容器（mutable state container）：集中持有单人/分屏双玩家的车辆、漂移、相机位置、计时、碰撞冷却、圈速记录与车流引用，并提供创建（`createRaceState`）与原地重置（`resetRaceState`）能力，是每帧数据流的唯一汇聚点，便于统一重置与单测。
- `input.ts` —— 输入管理（input manager）：以工厂函数监听全局键盘事件，将按键按下集合映射为两套独立输入（P1/P2），供主循环与物理层消费。
- `collision.ts` —— 碰撞检测与惩罚调度（collision resolution）：每帧检测玩家与车流碰撞及分屏 P1-P2 互碰，施加速度惩罚并维护冷却，结果写回 `RaceState`。

该目录本身不含渲染与物理推导逻辑，只做状态编排、输入适配与碰撞裁决。

## Design

- **集中式可变状态容器（single source of truth）**：`RaceState` 接口聚合全部运行时可变数据，主循环每帧读改写同一对象；`createRaceState` / `resetRaceState` 提供对称的构造与 in-place 重置，重置保留 `phase` 字段（阶段切换由屏幕管理 `ui/screens.ts` 负责）。
- **双玩家对称抽象（split-screen support）**：P1/P2 的车辆、漂移、相机、计时、碰撞冷却均为成对字段（`carState/carState2`、`driftState/driftState2`、`cameraZ/cameraZ2`、`raceTime/raceTime2`、`collisionCooldown/collisionCooldown2`），输入侧通过 `PLAYER1_MAPPING` / `PLAYER2_MAPPING` 两套键位映射复用同一 `inputFromKeys` 纯函数。
- **工厂函数 + 闭包封装**：`createInputManager(window)` 返回 `{ pressed, getP1Input, getP2Input, destroy }`，事件监听器封装在闭包内，`destroy()` 负责移除监听以防泄漏。
- **纯函数 + 显式依赖注入**：碰撞模块不持有全局状态，所有依赖（`CarState`、`TrafficCar[]`、冷却）通过参数传入；冷却使用可变包装对象 `{ value }` 传递，使衰减与重置能同步写回 `RaceState` 的原始数字字段。
- **职责分层清晰**：碰撞的几何判定下沉到 `physics/car.ts`（`collidePlayers`）与 `engine/traffic.ts`（`collideWithPlayer`），本目录只负责调度、惩罚因子（`COLLISION_SPEED_FACTOR = 0.5`）与冷却策略（`COLLISION_COOLDOWN = 1s`）。

## Flow

1. **初始化**：`main.ts` 调用 `createRaceState(createTraffic(lapLength))` 创建状态（车流由调用方生成后传入），`createInputManager(window)` 注册 `keydown`/`keyup` 监听，渲染器持有 `race.traffic` 引用。
2. **每帧（PHASE_RACING 阶段）**：主循环先推进车流 `updateTraffic`，再通过 `input.getP1Input()`（或 joystick 替代）与 `input.getP2Input()` 获取 `CarInput`。
3. **物理更新**：`main.ts` 依次执行 `updateDrift` → `updateCar` → 推进 `cameraZ` 与 `raceTime`，期间读取输入管理器与 `RaceState`，物理结果写回 `RaceState`。
4. **圈数检测**：`lapFromZ(cameraZ, lapLength)` 与 `lastLap` 比较，过圈则把当前 `raceTime` 压入 `lapTimes` 并推进 `lastLap`。
5. **碰撞裁决**：调用 `updateCollisions(race, dt, splitMode)` —— 冷却先随 `dt` 衰减；命中则 `speed *= 0.5` 并重置冷却 1s；分屏模式下额外执行 P1-P2 互碰（两车同罚）；所有碰撞共享 `collisionCount` 计数。
6. **消费与渲染**：渲染器读取 `carState.position` / `cameraZ` / `driftState.smoke` 绘制画面；`updateHud` 与 `applyPhaseToScreens` 读取 `RaceState` 展示速度、计时、圈数与结算。
7. **重置**：菜单/换赛道时 `resetRace()` 调用 `resetRaceState` 原地清空状态并重建车流，随后 `renderer.setTraffic` 同步新引用。

## Integration

- Consumed by:
  - `src/main.ts` —— 主循环唯一运行时入口，导入 `createInputManager`、`createRaceState`/`resetRaceState`、`updateCollisions`，每帧编排本目录与 physics/engine 各模块。
  - `src/ui/hud.ts` —— 类型导入 `RaceState`，只读展示 HUD 数据。
  - `src/ui/screens.ts` —— 类型导入 `RaceState`，结算面板填充数据。
- Depends on:
  - `src/physics/car.ts` —— `CarState`/`CarInput` 类型、`collidePlayers` 互碰判定。
  - `src/physics/drift.ts` —— `DriftState` 类型与 `createDriftState` 工厂。
  - `src/physics/input.ts` —— `PLAYER1_MAPPING`/`PLAYER2_MAPPING` 键位映射与 `inputFromKeys` 纯函数。
  - `src/engine/traffic.ts` —— `TrafficCar` 类型与 `collideWithPlayer` 车流碰撞判定。
  - `src/ui/gamestate.ts` —— `Phase` 类型与 `PHASE_MENU` 常量（仅类型/常量依赖）。

## Files

| File | Responsibility |
|------|----------------|
| `state.ts` | 定义 `RaceState` 接口，提供 `createRaceState` 创建与 `resetRaceState` 原地重置（保留 `phase`） |
| `input.ts` | `createInputManager` 工厂：键盘事件监听 + P1/P2 键位映射 → `CarInput`，提供 `destroy` 清理 |
| `collision.ts` | `applyTrafficCollision` 单玩家-车流碰撞（冷却+惩罚）与 `updateCollisions` 完整调度（P1/P2 车流 + 互碰） |
