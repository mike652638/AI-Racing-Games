# tests/

## Responsibility
质量验证层。通过两层自动化测试保障 OutRun 伪 3D 赛车游戏各模块的正确性，并作为里程碑验收的门禁（typecheck + test + bot 全绿）：

- `tests/unit/`：白盒单元测试（Vitest）。对 `src/` 下各模块的纯函数与状态机做行为验证，覆盖伪 3D 投影、路面分段几何、赛道生成、车辆运动学、漂移、碰撞、bot 决策、跑圈模拟、UI 格式化、存档、输入映射、音频合成、光照与场景生成。
- `tests/bot/`：黑盒集成验收脚本。用 `simulateLaps` 驱动 bot 在真实赛道上自动跑圈，输出圈速/违规 JSON 报告，并以进程退出码（0/1）判定通过/失败。

## Design
- **纯函数优先**：被测模块多为无副作用的纯函数（`project`、`roadColors`、`formatSpeed`、`noteToFreq`、`updateLighting` 等），测试直接断言输入→输出映射，无需 mock 框架。
- **依赖注入便于隔离**：`save.test.ts` 注入内存版 `fakeStorage()` 模拟 Web Storage；`collision.test.ts` 用 `{ value: 0 }` 可变包装对象模拟冷却状态；渲染类测试（projection / road-geometry / traffic-render / smoke-render）直接传 `ProjectionOptions` 字面量，不依赖真实 Canvas。
- **确定性种子测试**：对种子化生成器（`createTraffic`、`createRoadsideSprites`、`generateMountainProfile`）验证同 seed 输出一致、不同 seed 输出不同。
- **多帧状态机测试**：`drift`、`collision` 等状态机测试以固定 `dt` 循环调用多次，模拟帧推进验证状态转换、冷却衰减与粒子生命周期。
- **集成式端到端模拟**：`simulate.test.ts` 与 bot 脚本通过 `simulateLaps` 串联 bot 决策 → 车辆物理 → 赛道分段 → 违规检测，验证整条跑圈链路（含弯道、环形回绕、步长敏感性）。
- **局部辅助构造器**：每个测试文件内定义 helper（`state()`、`car()`、`trafficCar()`、`straightCtx()`）构造被测输入，保持用例简洁。
- **中文行为规格**：用例以中文命名描述行为场景（如「弯道前超速时刹车」），测试本身兼具行为文档作用。

## Flow
1. `npm run typecheck`（tsc --noEmit）：静态类型检查，先于一切验证。
2. `npm run lint`（eslint）：代码规范检查。
3. `npm test`（vitest run）：执行 `tests/unit/*.test.ts` 全部 23 个单测文件。
4. `npm run bot`（tsx tests/bot/run-bot.ts）：调用 `simulateLaps(createDefaultTrack(), createCarConfig(), createBotConfig(), { laps: 3 })` 跑 3 圈，输出 JSON 报告（圈速、总时间、均速、违规数、offRoad 时间）；`finished && violations <= 3` 时打印「✅ bot 跑圈通过」并以退出码 0 结束，否则退出码 1。
5. `npm run build`（tsc --noEmit && vite build）：发布构建验证，每里程碑最后执行。

## Integration
- Tests: 覆盖 `src/engine`（projection、road-geometry、track、tracks、traffic、traffic-render、sprites、scenery、smoke-render、lighting）、`src/physics`（car、drift、input）、`src/ai`（bot、simulate）、`src/ui`（format、gamestate、save、joystick）、`src/audio`（engine、music）、`src/game`（collision、state）。
- Depends on: `vitest`（单测运行器）、`tsx`（bot 脚本执行器）、`src/ai/simulate`（simulateLaps 跑圈引擎）、`src/engine/track`（createDefaultTrack / createStraightTrack / createTrack）、`src/physics/car`（createCarConfig / updateCar）、`src/ai/bot`（createBotConfig / decideBotInput）。

## Files
| File | Responsibility |
|------|----------------|
| `unit/bot.test.ts` | 验证 `decideBotInput` 决策逻辑：直道油门、巡航松油、弯道前瞻刹车、横向回中、输出限幅与环形边界 |
| `unit/car.test.ts` | 验证 `updateCar` 速度/转向/路缘出界模型与 `collidePlayers` 双车碰撞判定 |
| `unit/collision.test.ts` | 验证 `updateCollisions`/`applyTrafficCollision`（P1/P2/分屏）、冷却机制与 `createRaceState`/`resetRaceState` 状态工厂 |
| `unit/drift.test.ts` | 验证 `updateDrift` 漂移状态机：charge 积累/衰减、烟雾粒子、转向率与速度损耗、漂移得分 |
| `unit/engine-audio.test.ts` | 验证 `computeEngineParams` 引擎音效频率/增益映射与钳制 |
| `unit/format.test.ts` | 验证 HUD 格式化：速度 km/h 换算、MM:SS.mmm 计时、圈数推导与圈速列表 |
| `unit/gamestate.test.ts` | 验证 `nextPhase` 菜单/比赛/结算状态流转与 `togglePause` 暂停切换 |
| `unit/input.test.ts` | 验证键盘双人按键映射 `inputFromKeys`（WASD / 方向键、互不干扰、抵消） |
| `unit/joystick.test.ts` | 验证 `offsetToInput` 虚拟摇杆：死区、方向映射、幅值钳制 |
| `unit/lighting.test.ts` | 验证 `updateLighting` 昼夜循环光照：hsl 输出、日出/日落变化、周期回绕 |
| `unit/music.test.ts` | 验证 `noteToFreq` 音符转频率、`tickMsForBpm` 节拍换算与低音/旋律序列 |
| `unit/projection.test.ts` | 验证 `project` 伪 3D 透视投影：scale、横向映射、地平线收敛、相机后方剔除 |
| `unit/road-geometry.test.ts` | 验证 `projectSegmentQuad` 分段四边形投影、`roadColors` 颜色交替、中心线虚线规则 |
| `unit/save.test.ts` | 验证 `saveBestTime`/`loadBestTime`/漂移分数存档：纪录覆盖策略与 storage 不可用容错 |
| `unit/scenery.test.ts` | 验证 `generateMountainProfile` 远山轮廓（确定性/值域/起伏）与 `parallaxOffset` 视差 |
| `unit/simulate.test.ts` | 验证 `simulateLaps` 端到端跑圈：直线/弯道赛道完成、多圈递增、步长不敏感、maxSteps 截断、`updateCar` 出界标记 |
| `unit/smoke-render.test.ts` | 验证 `projectSmoke` 漂移烟雾投影：剔除、透明度衰减、近大远小 |
| `unit/sprites.test.ts` | 验证 `createRoadsideSprites` 路边树/灯生成、曲率前缀和 `curveOffsetAtZ`、环形可见窗口 `spritesInRange` |
| `unit/touch.test.ts` | 验证 `touchToCarInput` 四分区触控映射与多点触控并集 |
| `unit/track.test.ts` | 验证赛道分段生成：直道/分组曲线/平滑弯道控制点插值、`trackIndexForCameraZ` 环形回绕、`totalCurve` 闭环约束 |
| `unit/tracks.test.ts` | 验证 `TRACK_DEFS` 3 条关卡配置、`createTrackFromDef` 与 `getTrackDef` 查询 |
| `unit/traffic.test.ts` | 验证 `createTraffic` 车流生成（确定性/均匀分布）、`updateTraffic` 推进与 `collideWithPlayer` 碰撞判定 |
| `unit/traffic-render.test.ts` | 验证 `projectTraffic` 车流投影：可见性窗口、远→近排序、近大远小、颜色循环 |
| `bot/run-bot.ts` | 集成验收脚本：`simulateLaps` 跑 3 圈，输出圈速/违规 JSON 报告，违规 ≤ 3 时退出码 0 |
