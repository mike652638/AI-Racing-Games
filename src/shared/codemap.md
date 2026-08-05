# src/shared/

## Responsibility

独立共享层（2026-08-05 解环 game↔ui 时新建）：承载**跨层共用的常量、阶段、圈数计算与共享类型**，是运行时依赖图的**最底层**。原 game↔ui 之间形成受限双向环的运行时实质，是 `ui/`（及 `engine/`、`physics/`）对 `game/constants` 的常量导入与对 `game/state` / `game/track-context` 的 `import type` 类型导入；2026-08-05 将真源提升至本层后，`engine/`、`physics/`、`ui/` 均直接依赖 `src/shared/`，`ui → game` 的依赖（含类型层）**完全断开**。本目录承担四类职责：

- **常量唯一真源**（`constants.ts`）：全部跨层游戏参数（漂移/挑战/BOOST/碰撞/渲染/路面几何/车流密度），禁止在模块内散落魔法数字；改动数值须同步 `tests/unit/constants.test.ts` 的注册表断言。
- **阶段常量与转移**（`phase.ts` / `phase-logic.ts`）：四态阶段常量与 `Phase` 类型、`nextPhase` / `togglePause` 纯函数——供状态容器、主循环、UI 屏幕切换共同消费。
- **圈数计算**（`lap.ts`）：`lapFromZ` 行进距离 → 1 基圈数，主循环圈数记录与 HUD 圈数显示共用同一实现。
- **共享类型提升**（`types.ts`）：`RaceState` / `TrackContext` 接口唯一真源——`ui/` 改从本模块导入，`game/state.ts` 与 `game/track-context.ts` 保留同名 re-export 兼容层（既有导入路径不受影响）。

## Design

- **解环动机（2026-08-05）**：重构前 `ui/` 对 `game/` 存在运行时依赖（`DRIFT_SCORE_MAX`、`CHALLENGE_TARGET_SCORE` 等常量）与类型依赖（`RaceState` / `TrackContext` 的 `import type`），构成受限双向环（game 运行时调用 ui，ui 静态依赖 game）。将真源提升至 `src/shared/` 后：`ui/hud.ts`、`ui/screens.ts`、`ui/minimap.ts` 直接从本层导入类型与常量，`ui/gamestate.ts` / `ui/format.ts` 的 re-export 也改从本层导出；`engine/renderer.ts` / `road-geometry.ts` / `road-strip.ts` 与 `physics/car.ts` / `drift.ts` 直接导入本层常量。依赖方向单向：`engine/physics/ui → shared`，`game → shared`（经 re-export 或直接导入），共享层自身零运行时依赖。
- **纯函数零副作用**：本层全部模块为常量定义 / 纯函数 / 纯类型，无 DOM、无浏览器 API、无全局可变状态，Vitest 可直接覆盖（`constants.test.ts`、`phase.test.ts`、`lap` 相关断言）。
- **types.ts 的类型依赖方向**：`types.ts` 对 `../engine/*`（TrackDef/Segment/Sprite/TrafficCar/RoadStrip）与 `../game/player-state`（PlayerState）仅 `import type`（编译期擦除，运行时无任何 import 执行），且 `Phase` 来自本层 `./phase`——故 shared 仍为运行时最底层，类型转发不构成运行时环；`PlayerState` 未提升至本层（其实现引用 physics 的 CarState/DriftState，属 game 内聚数据），类型依赖链 game → shared 仅存在于编译期。未来若彻底消除该类型级反指（将 PlayerState 一并提升），shared 可对 game 零引用。
- **兼容层策略**：`game/constants.ts`（`export *`）、`game/phase.ts`、`game/phase-logic.ts`、`game/lap.ts` 为纯 re-export 兼容层（保留 game 内部消费方与既有测试的导入路径）；`game/state.ts` / `game/track-context.ts` re-export `RaceState` / `TrackContext` 类型。新代码一律直接导入 `src/shared/`，兼容层仅供旧路径过渡。
- **常量覆盖域**：`RACE_START_GRACE`（起步保护期 5s，与 `TRAFFIC_SPAWN_SAFE_ZONE` 配套防开局误撞）与 `OFF_ROAD_PUSHBACK`（出界内侧推回量，修复"钉死边缘"BUG-2）为 2026-08-05 运行时实测修复新增；`TRAFFIC_DEFAULT_COUNT` 现为 14（赛道可用 `TrackDef.trafficCount` 覆盖）。

## Flow

1. **编译期**：`engine/`、`physics/`、`ui/`、`game/` 的模块各自 `import ... from '../shared/xxx'` 消费常量/阶段/圈数/类型；`game/` 内部旧路径经 re-export 兼容层间接到达本层，行为等价。
2. **运行期**：本层无初始化逻辑、无状态，纯被消费——`RaceState` 由 `game/state.ts` 创建时以 `PHASE_MENU` 初始化；阶段流转由 `game/game-loop.ts` 调 `nextPhase` / `togglePause`（经 re-export）；圈数判定在 `frame-pure.ts` / `mode-strategy.ts` / `finish-accounting.ts` 中经 `lapFromZ` 完成；渲染与物理模块直接读取常量。

## Integration

- Consumed by（以实际 import 为准）：
  - `src/ui/hud.ts` —— `import type { RaceState, TrackContext } from '../shared/types'` + `DRIFT_SCORE_MAX`（`../shared/constants`）。
  - `src/ui/screens.ts` —— `import type { RaceState } from '../shared/types'` + `CHALLENGE_TARGET_SCORE`（`../shared/constants`）。
  - `src/ui/minimap.ts` —— `import type { TrackContext } from '../shared/types'`。
  - `src/ui/gamestate.ts` —— re-export `PHASE_*` / `Phase`（`../shared/phase`）与 `nextPhase` / `togglePause`（`../shared/phase-logic`）。
  - `src/ui/format.ts` —— re-export `lapFromZ`（`../shared/lap`）。
  - `src/engine/renderer.ts` —— `RENDER_DEPTH_RATIO` / `RENDER_HORIZON_RATIO`（`../shared/constants`）。
  - `src/engine/road-geometry.ts` —— `EDGE_WIDTH` / `RENDER_DRAW_DISTANCE` / `ROAD_HALF_WIDTH`（`../shared/constants`）。
  - `src/engine/road-strip.ts` —— `EDGE_WIDTH` / `ROAD_HALF_WIDTH`（`../shared/constants`）。
  - `src/physics/car.ts` —— `BOOST_ACCEL_MULT` / `BOOST_MAX_SPEED_MULT` / `OFF_ROAD_PUSHBACK`（`../shared/constants`）。
  - `src/physics/drift.ts` —— `DRIFT_STEER_THRESHOLD` / `DRIFT_CHARGE_THRESHOLD` / `DRIFT_SPEED_FACTOR` / `DRIFT_SCORE_MAX`（`../shared/constants`）。
  - `src/game/` —— 兼容层 re-export（`constants` / `phase` / `phase-logic` / `lap` / `state` / `track-context`）；新代码直接导入本层（如 `frame-pure.ts` 的 `BOOST_*`、`mode-strategy.ts` 的 `CHALLENGE_SECONDS`、`collision.ts` 的 `COLLISION_*` / `RACE_START_GRACE`）。
  - `tests/unit/*` —— `constants.test.ts` 注册表断言锁定全部常量值；`phase.test.ts` 覆盖 `nextPhase` / `togglePause`。
- Depends on：
  - `types.ts` 仅 `import type`：`../engine/track`（Segment）、`../engine/sprites`（Sprite）、`../engine/tracks`（TrackDef）、`../engine/traffic`（TrafficCar）、`../engine/road-strip`（RoadStrip）、`../game/player-state`（PlayerState）、`./phase`（Phase）——编译期擦除，运行时零依赖。
  - `phase-logic.ts` 依赖 `./phase`（常量与类型）；其余文件零依赖。

## Files

| File             | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constants.ts`   | 游戏参数唯一真源（20 常量，2026-08-05 由 game/constants 提升）：`DRIFT_STEER_THRESHOLD`（0.7）/`DRIFT_CHARGE_THRESHOLD`（0.25）/`DRIFT_SPEED_FACTOR`（0.985）/`DRIFT_SCORE_MAX`（99999，漂移得分 clamp 上限）；`CHALLENGE_SECONDS`（60，挑战限时）/`CHALLENGE_TARGET_SCORE`（5000，挑战目标分）；`BOOST_ACCEL_MULT`（0.6）/`BOOST_MAX_SPEED_MULT`（1.15）/`BOOST_CHARGE_RATE`（0.3）/`BOOST_DRAIN_RATE`（0.5）；`COLLISION_SPEED_FACTOR`（0.5）/`COLLISION_COOLDOWN`（1s）/`RACE_START_GRACE`（5s 起步保护期，2026-08-05）；`RENDER_DRAW_DISTANCE`（120）/`RENDER_HORIZON_RATIO`（0.35）/`RENDER_DEPTH_RATIO`（0.84）；`ROAD_HALF_WIDTH`（1）/`EDGE_WIDTH`（0.15）/`OFF_ROAD_PUSHBACK`（0.05 出界推回，2026-08-05 BUG-2 修复）；`TRAFFIC_DEFAULT_COUNT`（14，赛道可覆盖）。模块头注释含解环说明；改动须同步 tests/unit/constants.test.ts 注册表 |
| `phase.ts`       | 阶段常量唯一真源：`PHASE_MENU` / `PHASE_RACING` / `PHASE_FINISHED` / `PHASE_PAUSED` 与 `Phase` 联合类型（2026-08-05 由 game/phase 提升；ui/gamestate.ts 与 game/phase.ts 均 re-export）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `phase-logic.ts` | 阶段转移纯函数（2026-08-05 由 game/phase-logic 提升）：`nextPhase(phase, lap, totalLaps)`（menu→racing / racing 超圈→finished / finished→menu / paused 原样）与 `togglePause(phase)`（racing↔paused，其余无效）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `lap.ts`         | 圈数计算纯函数（2026-08-05 由 game/lap 提升）：`lapFromZ(cameraZ, lapLength)` = `floor(cameraZ / lapLength) + 1`（1 基圈数；主循环圈数记录与 HUD 显示共用）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `types.ts`       | 共享类型提升（2026-08-05）：`RaceState`（双玩家 PlayerState / 双 TrackContext / 碰撞计数 / 圈速记录 lapTimes·lastLap·lapTimes2·lastLap2 / phase / finishShown）与 `TrackContext`（def / segments / lapLength / totalLaps / curvePrefixSum / spriteIndex / sprites / roadStrips / traffic）接口唯一真源——ui 从本模块导入（对 game 的类型依赖消除），game/state 与 game/track-context 保留 re-export 兼容层；全部依赖为 `import type`（编译期擦除，运行时零依赖）                                                                                                                                                                                                                                                                                                                                                                                 |
