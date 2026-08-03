# src/physics/

## Responsibility

车辆运动学与玩家输入的领域层。负责将玩家原始操作（键盘 / 触屏）规范化为统一输入信号，并基于该输入推进车辆的纵向速度与横向位移，同时实现漂移（蓄力、激活、得分、烟雾）与出界减速、玩家碰撞判定。该目录遵循纯函数式设计：不持有 UI / DOM 依赖、不直接访问渲染层，所有状态通过显式参数传入传出，因此可被游戏主循环、bot 模拟器与单测独立复用。其中 `updateDrift` 已纯函数化——不修改任何入参，基于入参计算并返回全新状态对象。

## Design

- **纯函数 + 数据对象（无 class）**：核心逻辑全部为导出的纯函数（`updateCar`、`updateDrift`、`inputFromKeys`、`touchToCarInput` 等），车辆/漂移/输入均以接口类型（`CarState`、`DriftState`、`CarInput`）描述，便于测试与替换。
- **接口集中定义（依赖倒置）**：`car.ts` 定义被全模块共享的核心接口 `CarConfig` / `CarInput` / `CarState`；`drift.ts`、`input.ts` 仅以 `import type` 依赖 `car.ts`，不反向依赖，形成单向依赖环内无循环的依赖结构。
- **配置与状态分离**：`CarConfig` 为不可变参数（含 `DEFAULT_CAR_CONFIG` 默认值与 `createCarConfig` 工厂做浅合并覆盖），`CarState` / `DriftState` 为可变运行态。
- **更新约定（漂移纯函数 / 运动学 in-place）**：`updateDrift` 不修改传入的 `drift`/`carState`/`config`，复制 `smoke` 数组并以复制方式推进每个粒子（`t` 递增、超龄淘汰），返回全新 `DriftState`——调用方必须接收返回值；`updateCar` 仍 in-place 直接修改 `CarState` 并返回布尔标志（是否出界）。
- **常量集中管理（唯一真源）**：漂移激活阈值、速度损耗因子、得分上限等行为常量（`DRIFT_STEER_THRESHOLD`=0.7、`DRIFT_CHARGE_THRESHOLD`=0.25、`DRIFT_SPEED_FACTOR`=0.985、`DRIFT_SCORE_MAX`=99999——M10 P2 起新增导入，漂移得分 clamp 用）与 M12 G4 BOOST 常量（`BOOST_ACCEL_MULT`=0.6、`BOOST_MAX_SPEED_MULT`=1.15——氮气加速/速度上限）从 `src/game/constants` 导入，不在本模块散落魔法数字；本模块仅保留局部派生常量（`SPEED_RATIO_THRESHOLD`=0.5、`CHARGE_DECAY`=2、`SMOKE_INTERVAL`=1、`SMOKE_LIFETIME`=0.6、`DRIFT_SCORE_RATE`=0.01、`DRIFT_TURN_MULTIPLIER`=1.5、M10 P2 连击三常量 `COMBO_WINDOW_SECONDS`=0.5/`COMBO_MAX`=10/`COMBO_MULTIPLIER_STEP`=0.25）。
- **M10 漂移连击/倍率系统（P2）**：`DriftState` 新增必填 `combo`（连击数）与 `comboTimer`（连击计时器，秒）字段（`createDriftState` 初始 0）；仅 `active` 期间累积 `comboTimer += dt`，满 `COMBO_WINDOW_SECONDS`（0.5s，P7 冒烟修复自 2s 下调——真实物理下 active 窗口受 0.985 帧衰减限制约 0.8s，2s 不可达）→ `combo = min(combo + 1, COMBO_MAX)` 并归零 timer；`active` 翻转（`next.active && !drift.active` 新段 / `!next.active && drift.active` 中断）均重置 combo/comboTimer 为 0（漂移中断断连击）。得分公式带倍率：`score = min(score + speed * dt * DRIFT_SCORE_RATE * (1 + combo * COMBO_MULTIPLIER_STEP) * scoreMultiplier, DRIFT_SCORE_MAX)`（倍率上限 1 + 10×0.25 = 3.5x；得分 clamp 至 99999）。
- **H1 挑战得分加成**：`updateDrift` 新增第 7 尾参 `scoreMultiplier = 1`——挑战模式（M12 G1）下由 `game-loop.ts` 的 `updatePlayerFrame` 第 7 尾参透传，乘入上述漂移得分公式（`* scoreMultiplier`）；默认 1 时得分与旧版逐字节一致，非挑战调用零改动。
- **参数覆盖（策略注入）**：`updateCar(dt, input, state, config, turnRateOverride?, wet = false)` 通过可选参数 `turnRateOverride` 接收漂移系统计算出的有效转向率，使漂移转向加成（`effectiveTurnRate`，×1.5）与速度损耗（`driftSpeedFactor`，×0.985/帧）以参数方式注入运动学，而无需在 `car.ts` 中耦合漂移概念；`drift.ts` 由此对 `car.ts` 保持单向类型依赖。**M12 G3 wet 尾参**：湿滑路面抓地力降 15%（有效转向率 ×0.85）与制动力降 30%（brake 分支 ×0.7，松油门 deceleration 不动），wet=false 路径逐字节不变。**M12 G4 BOOST 分支**：`input.boost === true` 时在 throttle/brake/deceleration 分支后独立加速 `min(speed + acc×0.6×dt, maxSpeed×1.15)`（突破 maxSpeed 但不超过 1.15×）。
- **输入规范化抽象**：`input.ts` 将多种输入源（WASD / 方向键 / 触屏四分区）统一归一为 `CarInput`（`throttle: 0~1`、`brake: boolean`、`steer: -1~+1`、M12 可选 `boost?: boolean`），左右同按或触屏多点取并集并互相抵消；`PlayerMapping` 加可选 `boost?: string`（P1 `Space` / P2 `Enter`）——`inputFromKeys` 条件产出 boost 字段（mapping.boost 存在且按下时 `boost:true`，未按不产出字段保持旧对象形状，既有三字段 toEqual 断言零改动）；`touchToCarInput` 恒产出 `boost:false`（触屏无 boost 键）。

## Flow

1. **输入采集**：`game/input.ts` 收集按键集合 `Set<string>`，通过 `inputFromKeys(pressed, PLAYER1_MAPPING | PLAYER2_MAPPING)` 生成 P1/P2 的 `CarInput`；触屏路径经 `touchToCarInput`（屏幕四分区：右上油门 / 左上刹车 / 左下左转 / 右下右转）得到同一结构。
2. **漂移状态更新**（`game-loop.ts` 的 `updatePlayerFrame` 主循环每帧，纯函数）：`const next = updateDrift(dt, input, state, config, driftState, cameraZ, scoreMultiplier)`（第 7 尾参 `scoreMultiplier = 1`，H1 挑战加成，默认 1 时行为不变），依据「`|steer| > DRIFT_STEER_THRESHOLD`(0.7) 且 速度 > 50% maxSpeed」判定充能；蓄力值累积（上限 1）/衰减（`CHARGE_DECAY`=2/s），超过 `DRIFT_CHARGE_THRESHOLD`(0.25) 激活漂移；激活期间累计连击（`comboTimer` 满 0.5s → `combo+1`，上限 10）并按 `速度 × dt × DRIFT_SCORE_RATE`(0.01) × 倍率 `(1 + combo × 0.25)` × `scoreMultiplier` 累积得分（clamp 至 `DRIFT_SCORE_MAX`=99999），active 翻转（新段/中断）重置连击；以 1s 间隔（`SMOKE_INTERVAL`）在漂移外侧生成 `SmokeParticle`（含生成时刻 `cameraZ`），粒子 `t` 以复制方式逐帧推进，淘汰存活超过 `SMOKE_LIFETIME`(0.6s) 的粒子；调用方以返回值替换旧状态。
3. **速度修正**：`state.speed *= driftSpeedFactor(nextDrift)` —— 漂移激活时每帧损耗至 98.5%（`DRIFT_SPEED_FACTOR`）。
4. **运动学推进**：`updateCar(dt, input, state, config, effectiveTurnRate(config, driftState), wet)`：
   - 油门时 `speed = min(maxSpeed, speed + acceleration × throttle × dt)`；刹车时按 `braking`（M12 G3 wet 时 ×0.7）减速；否则按 `deceleration` 滑行衰减，速度下限钳制为 0；
   - M12 G4 boost 分支：`input.boost === true` 时 `speed = min(speed + acceleration × 0.6 × dt, maxSpeed × 1.15)`（突破 maxSpeed 但受 1.15× 上限约束）；
   - `position += steer × turnRate × (speed / maxSpeed) × dt`（转向灵敏度随速度线性缩放；`turnRateOverride` 注入的漂移有效转向率 ×1.5；M12 G3 wet 时有效转向率再 ×0.85）；
   - 若 `|position| > roadHalfWidth`（出界）：施加 `offRoadDeceleration` 减速并把位置夹紧回路缘内，返回 `true`。
5. **玩家碰撞判定**：分屏升级为独立赛道世界后 P1-P2 互碰已删除，`collidePlayers`（原 car.ts 导出）随死代码清理移除，碰撞仅剩 `game/collision.ts` 的玩家-车流碰撞（`collideWithPlayer`）。
6. **渲染消费**：`engine/smoke-render.ts` / `renderer.ts` 读取 `DriftState.smoke` 中的 `SmokeParticle` 绘制轮胎烟雾；`ui/hud.ts` 读取 `CarConfig` 展示车辆参数。

## Integration

- Consumed by:
  - `src/game/game-loop.ts`：`updatePlayerFrame` 主循环每帧串联 `updateDrift`（接收新状态；第 7 尾参 `scoreMultiplier` 挑战加成透传，默认 1）→ `driftSpeedFactor` → `updateCar(effectiveTurnRate, wet)`，管理 P1/P2 两套 `CarState` / `DriftState`（热座仅当前回合玩家更新）；`src/main.ts` 仅引导入口，不直接消费
  - `src/game/input.ts`：键盘输入 → `inputFromKeys` + 玩家按键映射
  - `src/game/state.ts`：持有 `CarState` / `DriftState` 并调用 `createDriftState`
  - `src/game/collision.ts`：`collideWithPlayer` 玩家-车流碰撞检测（`collidePlayers` 双人互碰已随死代码清理移除）
  - `src/ai/simulate.ts`、`src/ai/bot.ts`：复用 `updateCar` / `CarConfig` / `CarState` / `CarInput` 做 bot 跑圈模拟与校验
  - `src/engine/renderer.ts`、`src/engine/smoke-render.ts`：消费 `SmokeParticle` 渲染烟雾
  - `src/ui/hud.ts`、`src/ui/screens.ts`：读取 `CarConfig` 显示参数
- Depends on: `src/game/constants`（`DRIFT_STEER_THRESHOLD` / `DRIFT_CHARGE_THRESHOLD` / `DRIFT_SPEED_FACTOR` / `DRIFT_SCORE_MAX`——M10 P2 起新增得分上限；`BOOST_ACCEL_MULT` / `BOOST_MAX_SPEED_MULT`——M12 G4 氮气加速，唯一真源）；不依赖引擎 / 渲染 / 赛道模块；`drift.ts`、`input.ts` 以类型方式依赖同目录 `car.ts`

## Files

| File       | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `car.ts`   | 车辆运动学核心：`CarConfig` / `CarInput`（M12 可选 `boost?`）/ `CarState` 接口、`DEFAULT_CAR_CONFIG` 默认值与 `createCarConfig` 工厂、`updateCar(dt, input, state, config, turnRateOverride?, wet = false)` 速度/转向/出界推进（含 `turnRateOverride` 漂移转向注入、M12 G3 wet 制动×0.7 与转向×0.85、G4 boost 分支突破 maxSpeed 至 1.15×）；`collidePlayers` 双人碰撞判定已随死代码清理移除（分屏独立世界后 src 无调用方）；BOOST 常量自 `src/game/constants` 导入         |
| `drift.ts` | 漂移系统：`DriftState`（含 M10 P2 连击 `combo`/`comboTimer` 必填字段）/ `SmokeParticle`、`createDriftState` 工厂、纯函数 `updateDrift`（第 7 尾参 `scoreMultiplier = 1`，H1 挑战加成；不修改入参、返回新状态；激活期间累计连击——满 0.5s 窗口 combo+1、active 翻转重置——并按倍率 `1+combo*0.25` × `scoreMultiplier` 累计得分且 clamp 至 `DRIFT_SCORE_MAX`）、`effectiveTurnRate` 与 `driftSpeedFactor` 参数注入；漂移阈值/速度因子/得分上限常量自 `src/game/constants` 导入 |
| `input.ts` | 输入规范化：`PlayerMapping`（M12 可选 `boost?`）、P1（WASD+Space）/P2（方向键+Enter）映射、`inputFromKeys`（M12 条件产出 boost 字段）、触屏四分区 `touchToCarInput`（含 `TouchPoint`，M12 恒产出 `boost:false`）                                                                                                                                                                                                                                                           |
