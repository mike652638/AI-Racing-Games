# src/physics/

## Responsibility

车辆运动学与玩家输入的领域层。负责将玩家原始操作（键盘 / 触屏）规范化为统一输入信号，并基于该输入推进车辆的纵向速度与横向位移，同时实现漂移（蓄力、激活、得分、烟雾）与出界减速、玩家碰撞判定。该目录遵循纯函数式设计：不持有 UI / DOM 依赖、不直接访问渲染层，所有状态通过显式参数传入传出，因此可被游戏主循环、bot 模拟器与单测独立复用。

## Design

- **纯函数 + 数据对象（无 class）**：核心逻辑全部为导出的纯函数（`updateCar`、`updateDrift`、`inputFromKeys` 等），车辆/漂移/输入均以接口类型（`CarState`、`DriftState`、`CarInput`）描述，便于测试与替换。
- **接口集中定义（依赖倒置）**：`car.ts` 定义被全模块共享的核心接口 `CarConfig` / `CarInput` / `CarState`；`drift.ts`、`input.ts` 仅以 `import type` 依赖 `car.ts`，不反向依赖，形成单向依赖环内无循环的依赖结构。
- **配置与状态分离**：`CarConfig` 为不可变参数（含 `DEFAULT_CAR_CONFIG` 默认值与 `createCarConfig` 工厂做浅合并覆盖），`CarState` / `DriftState` 为可变运行态。
- **in-place 更新约定**：`updateDrift` 直接修改传入的 `DriftState` 并返回同一引用（含烟雾数组的换新淘汰），`updateCar` 直接修改 `CarState` 并返回布尔标志（是否出界）。
- **参数覆盖（策略注入）**：`updateCar` 通过可选参数 `turnRateOverride` 接收漂移系统计算出的有效转向率，使漂移转向加成（`effectiveTurnRate`，×1.5）与速度损耗（`driftSpeedFactor`，×0.985/帧）以参数方式注入运动学，而无需在 `car.ts` 中耦合漂移概念。
- **输入规范化抽象**：`input.ts` 将多种输入源（WASD / 方向键 / 触屏四分区）统一归一为 `CarInput`（`throttle: 0~1`、`brake: boolean`、`steer: -1~+1`），左右同按或触屏多点取并集并互相抵消。

## Flow

1. **输入采集**：`game/input.ts` 收集按键集合 `Set<string>`，通过 `inputFromKeys(pressed, PLAYER1_MAPPING | PLAYER2_MAPPING)` 生成 P1/P2 的 `CarInput`；触屏路径经 `touchToCarInput`（屏幕四分区：右上油门 / 左上刹车 / 左下左转 / 右下右转）得到同一结构。
2. **漂移状态更新**（`main.ts` 主循环每帧）：`updateDrift(dt, input, state, config, driftState, cameraZ)` 依据「转向幅度 > 0.7 且 速度 > 50% maxSpeed」判定充能；蓄力值累积/衰减（衰减速率 2/s），超过 0.25 激活漂移；激活期间按 `速度 × dt × 0.01` 累积得分，并以 1s 间隔在漂移外侧生成 `SmokeParticle`（含生成时刻 `cameraZ`），逐帧推进粒子 `t` 并淘汰超过 0.6s 存活的粒子。
3. **速度修正**：`state.speed *= driftSpeedFactor(driftState)` —— 漂移激活时每帧损耗至 98.5%。
4. **运动学推进**：`updateCar(dt, input, state, config, effectiveTurnRate(config, driftState))`：
   - 油门时 `speed = min(maxSpeed, speed + acceleration × throttle × dt)`；刹车时按 `braking` 减速；否则按 `deceleration` 滑行衰减，速度下限钳制为 0；
   - `position += steer × turnRate × (speed / maxSpeed) × dt`（转向灵敏度随速度线性缩放）；
   - 若 `|position| > roadHalfWidth`（出界）：施加 `offRoadDeceleration` 减速并把位置夹紧回路缘内，返回 `true`。
5. **玩家碰撞判定**：`game/collision.ts` 用 `collidePlayers(z1, x1, z2, x2, zTol=80, xTol=0.9)` 对两车纵向（z）与横向（x）距离做容差比较，命中即判碰撞。
6. **渲染消费**：`engine/smoke-render.ts` / `renderer.ts` 读取 `DriftState.smoke` 中的 `SmokeParticle` 绘制轮胎烟雾；`ui/hud.ts` 读取 `CarConfig` 展示车辆参数。

## Integration

- Consumed by:
  - `src/main.ts`：主循环每帧串联 `updateDrift` → `driftSpeedFactor` → `updateCar(effectiveTurnRate)`，管理 P1/P2 两套 `CarState` / `DriftState`
  - `src/game/input.ts`：键盘输入 → `inputFromKeys` + 玩家按键映射
  - `src/game/state.ts`：持有 `CarState` / `DriftState` 并调用 `createDriftState`
  - `src/game/collision.ts`：`collidePlayers` 双人碰撞检测
  - `src/ai/simulate.ts`、`src/ai/bot.ts`：复用 `updateCar` / `CarConfig` / `CarState` / `CarInput` 做 bot 跑圈模拟与校验
  - `src/engine/renderer.ts`、`src/engine/smoke-render.ts`：消费 `SmokeParticle` 渲染烟雾
  - `src/ui/hud.ts`、`src/ui/screens.ts`：读取 `CarConfig` 显示参数
- Depends on: 无外部依赖（不依赖引擎 / 渲染 / 赛道模块）；仅 `drift.ts`、`input.ts` 以类型方式依赖同目录 `car.ts`

## Files

| File | Responsibility |
|------|----------------|
| `car.ts` | 车辆运动学核心：`CarConfig` / `CarInput` / `CarState` 接口、默认配置与工厂、`updateCar` 速度/转向/出界推进、`collidePlayers` 双人碰撞判定 |
| `drift.ts` | 漂移系统：`DriftState` / `SmokeParticle`、充能/激活/得分/烟雾生命周期管理、`effectiveTurnRate` 与 `driftSpeedFactor` 参数注入 |
| `input.ts` | 输入规范化：`PlayerMapping`、P1（WASD）/P2（方向键）映射、`inputFromKeys`、触屏四分区 `touchToCarInput` |
