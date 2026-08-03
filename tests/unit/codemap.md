# tests/unit/

## Responsibility

Vitest 单元测试目录。覆盖 `src/` 下所有模块的纯函数、状态机与领域逻辑，用行为驱动的中文测试名描述场景，既验证正确性又充当模块行为文档。

## Design

- **纯函数优先**：对 `project`、`formatSpeed`、`noteToFreq`、`updateLighting` 等纯函数直接断言输入输出，无需 mock。
- **依赖注入隔离**：对 `save.test.ts` 注入 `fakeStorage`，对 `collision.test.ts` 使用可变包装对象模拟冷却状态。
- **状态机多帧测试**：`drift.test.ts`、`collision.test.ts` 等以固定 `dt` 循环多次调用被测函数，验证状态转换、冷却衰减与粒子生命周期。
- **端到端模拟测试**：`simulate.test.ts` 串联 bot 决策、车辆物理与赛道分段，验证跑圈链路。
- **中文行为规格**：测试用例名使用中文描述场景，增强可读性与可维护性。

## Flow

1. `npm test` 执行 `vitest run`，根据 `vite.config.ts` 的 `include: ['tests/**/*.test.ts']` 加载所有测试文件。
2. 每个测试文件聚焦一个模块，使用局部 helper 构造被测输入。
3. 测试直接断言返回值或状态变化，避免不必要的 DOM/Canvas 依赖。
4. 测试通过后进入 `npm run bot` 与 `npm run build` 验证。

## Integration

- **测试目标**：`src/engine`、`src/physics`、`src/ai`、`src/ui`、`src/audio`、`src/game` 下所有模块。
- **依赖**：`vitest`（运行器）、`tsx`（间接用于 bot 脚本）、`src/` 各被测模块。
- **被调用方**：`package.json` 的 `test` 脚本；`tests/codemap.md` 的详细文件表。

## Files

| File | Responsibility |
|------|----------------|
| `bot.test.ts` | 验证 `decideBotInput` 决策逻辑 |
| `car.test.ts` | 验证 `updateCar` 车辆运动学与 `collidePlayers` 碰撞 |
| `collision.test.ts` | 验证 `updateCollisions` 与 `applyTrafficCollision` |
| `drift.test.ts` | 验证 `updateDrift` 漂移状态机 |
| `engine-audio.test.ts` | 验证引擎音效参数映射 |
| `format.test.ts` | 验证 HUD 格式化函数 |
| `gamestate.test.ts` | 验证阶段 FSM 状态转移 |
| `input.test.ts` | 验证双人键盘输入映射 |
| `joystick.test.ts` | 验证虚拟摇杆输入归一化 |
| `lighting.test.ts` | 验证昼夜光照循环 |
| `music.test.ts` | 验证音符频率与节拍换算 |
| `projection.test.ts` | 验证伪 3D 透视投影 |
| `road-geometry.test.ts` | 验证路面分段四边形投影 |
| `save.test.ts` | 验证 localStorage 存档逻辑 |
| `scenery.test.ts` | 验证远山轮廓与视差 |
| `simulate.test.ts` | 验证 `simulateLaps` 端到端跑圈 |
| `smoke-render.test.ts` | 验证漂移烟雾投影 |
| `sprites.test.ts` | 验证路边景物生成与曲率前缀和 |
| `touch.test.ts` | 验证触屏四分区输入 |
| `track.test.ts` | 验证赛道分段生成与环形索引 |
| `tracks.test.ts` | 验证赛道定义注册表 |
| `traffic.test.ts` | 验证车流生成与碰撞 |
| `traffic-render.test.ts` | 验证车流投影渲染 |
| `codemap.md` | 本目录索引（本文件） |

更详细的模块级测试说明请参见 `tests/codemap.md`。
