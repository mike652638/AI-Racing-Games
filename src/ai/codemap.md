# src/ai/

## Responsibility

Bot 自动驾驶控制器（决策层）与无头模拟器（验证层）的实现。该目录将"如何开车"的决策逻辑与"如何跑完整圈"的模拟验证逻辑解耦为两个纯 TypeScript 模块：

- `bot.ts`：基于赛道曲率前瞻的规则型控制器，输入车辆状态与赛道数据，输出每帧控制指令（油门/刹车/转向）。
- `simulate.ts`：确定性离散时间步进模拟器，以固定步长驱动 bot + 车辆物理跑圈，输出圈速、里程、出界违规等可断言指标，供单测与 `npm run bot` 自动跑圈校验使用。

## Design

- **纯函数 / 无状态设计**：`decideBotInput` 与 `aheadCurve` 均为无副作用纯函数（仅依赖参数与输入赛道数据），不持有内部状态，便于单测与确定性复现。
- **关注点分离（Separation of Concerns）**：决策（`bot.ts`）、车辆物理执行（`src/physics/car.ts` 的 `updateCar`）、模拟统计（`simulate.ts`）三者分层，bot 不感知模拟循环细节，模拟器不感知决策内部策略。
- **策略注入 / 依赖倒置**：`BotContext` 聚合 `track: Segment[]`、`config: BotConfig`、`maxSpeed: number`，赛道与配置由调用方注入，模块间仅通过接口耦合。
- **工厂模式 + 默认配置合并**：`DEFAULT_BOT_CONFIG` 提供默认参数，`createBotConfig(overrides)` 以浅合并方式覆盖生成配置，保持 API 简洁并支持按赛道/难度调参。
- **规则型控制策略（前瞻 + 比例纠偏）**：
  - 转向：对车辆横向偏移 `state.position` 做带增益的线性比例纠偏（`-position * steerGain`），并钳制到 [-1, 1]。
  - 速度：通过 `aheadCurve` 对前方 `lookAheadSegments` 段做环形取模求和，|Σcurve| 超过 `cornerCurveThreshold` 判定为弯道，弯道限速为 `targetSpeed * cornerSpeedFactor`，实现提前减速。
- **确定性模拟**：固定步长 `dt`（默认 1/60）离散积分，无随机源，同输入必得同输出，保证跑圈校验结果可复现。
- **安全防护**：`maxSteps` 步数上限防止死循环（如车辆卡死无法完赛），`LapResult.finished` 标志区分正常完赛与超时截断。

## Flow

1. 调用方（如 `tests/bot/run-bot.ts`）通过 `createTrack` / `createCarConfig` / `createBotConfig` 构造赛道、车辆物理参数与 bot 参数，调用 `simulateLaps(track, carConfig, botConfig, opts)`。
2. `simulateLaps` 初始化 `CarState`（position=0, speed=0）、`cameraZ=0` 及统计计数器（距离/时间/违规/圈时数组），并计算单圈长度 `lapLength = track.length * SEGMENT_LENGTH`。
3. 进入固定步长循环（每步 `dt`）：
   - `decideBotInput(botCtx, state, cameraZ)` 依据当前横向偏移计算转向、依据 `aheadCurve` 前瞻曲率计算限速，产出 `CarInput`（throttle/brake/steer）。
   - `updateCar(dt, input, state, carConfig)` 应用物理：加速/刹车/滑行改变速度，转向改变横向位置，出界时钳制位置并施加越野减速，返回 `clipped` 布尔标志。
   - 累加 `cameraZ`、`distance`、`timeSec`；`clipped` 为真时累计 `offRoadTimeSec` 并将连续出界合并为一次 `violations`。
4. 当累计 `distance` 越过 `lapLength` 整数倍时，向 `lapTimes` 压入当前 `timeSec`；达到目标圈数即返回 `finished: true` 的 `LapResult`。
5. 若步数耗尽仍未完成目标圈数，返回 `finished: false` 的 `LapResult`（含已累计指标），由调用方判断超时/失败。

## Integration

- Consumed by:
  - `tests/bot/run-bot.ts`（`npm run bot` 自动跑圈校验入口：直连 `createBotConfig` + `simulateLaps`，输出圈速与违规报告）
  - `tests/unit/bot.test.ts`（单测 `decideBotInput` / `aheadCurve` / `createBotConfig`）
  - `tests/unit/simulate.test.ts`（单测 `simulateLaps` 的圈速、违规、步长稳定性与超时行为）
  - 主游戏循环可复用 `decideBotInput` 实现 AI 对手/演示车辆（当前版本为 headless 设计，不直接消费 UI/渲染）
- Depends on:
  - `src/engine/track`：`Segment` 类型、`SEGMENT_LENGTH`、`trackIndexForCameraZ`（环形取模索引，用于赛道查询与前瞻）
  - `src/physics/car`：`CarState` / `CarInput` / `CarConfig` 类型与 `updateCar`（车辆运动学执行、出界检测）

## Files

| File          | Responsibility                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bot.ts`      | Bot 配置（`BotConfig` / `DEFAULT_BOT_CONFIG` / `createBotConfig`）、决策上下文 `BotContext`、前瞻曲率求和 `aheadCurve`、控制指令决策 `decideBotInput`（转向纠偏 + 弯道限速） |
| `simulate.ts` | 无头跑圈模拟：`LapOptions` / `LapResult` 契约、固定步长驱动循环 `simulateLaps`（逐帧调用 bot 决策与物理更新，统计里程、圈速、出界违规与时长）                                |
