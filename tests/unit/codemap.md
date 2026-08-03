# tests/unit/

## Responsibility

Vitest 单元测试目录。覆盖 `src/` 下所有模块的纯函数、状态机与领域逻辑，用行为驱动的中文测试名描述场景，既验证正确性又充当模块行为文档。目前共 32 个 `.test.ts` 文件，覆盖引擎投影/渲染、车辆物理、赛道系统、bot 决策、UI/HUD、音频合成、存档与游戏状态等全部模块。

## Design

- **纯函数优先**：对 `project`、`formatSpeed`、`noteToFreq`、`updateLighting`、`projectSmoke` 等纯函数直接断言输入输出，无需 mock。
- **依赖注入隔离**：对 `save.test.ts` 注入 `fakeStorage`（内存 `Map` 模拟 Web Storage），对 `hud.test.ts` 注入 `createMockHudElements()` 对象字面量元素，对 `track-manager.test.ts` 注入 DOM 依赖 mock，对 `collision.test.ts` 使用可变包装对象模拟冷却状态。
- **状态机多帧测试**：`drift.test.ts`、`collision.test.ts` 等以固定 `dt` 循环多次调用被测函数，验证状态转换、冷却衰减与粒子生命周期。
- **端到端模拟测试**：`simulate.test.ts` 串联 bot 决策、车辆物理与赛道分段，验证跑圈链路。
- **canvas mock 调用记录**：`__mocks__/canvas.ts` 提供可记录调用次数与实参的 mock ctx（`__calls`/`__args` 一一对应），支撑 `renderer-state.test.ts` 的「渲染输出稳定、确实发生绘制、坐标整数对齐」断言及夜晚车灯 arc 增量、雨滴离屏 drawImage 平铺等回归锚点。
- **集成冒烟（真实主循环）**：`game-loop-integration.test.ts` 通过 `vi.stubGlobal` 替换 `window`/`document`/`requestAnimationFrame`/`AudioContext`，构造真实 `GameLoop` 并用 rAF 回调驱动帧循环 + 模拟键盘事件，验证 menu→racing→paused→finished 阶段流转、分屏/热座模式、9 赛道选择、暂停菜单（音量/重开/触屏按钮）、挑战模式计时、分轨音量与视觉缺陷回归。
- **常量注册表测试**：`constants.test.ts` 对 `src/game/constants` 的漂移/碰撞/渲染/路面几何/车流常量做值断言（防魔法数字回潮），并校验 `road-geometry` 兼容导出与真源一致。
- **确定性种子测试**：对种子化生成器（`createTraffic`、`createRoadsideSprites`、`generateMountainProfile`）验证同 seed 输出一致、不同 seed 输出不同，支撑 bot 可复现校验。
- **回归锚点**：`traffic-render`（投影尺寸上限）、`sprites`（景物投影高度上限）、`game-loop-integration`（双人结算 P2 行显隐、`finish-wins` 初始隐藏）等用例锚定历史缺陷，防止回退。
- **中文行为规格**：测试用例名使用中文描述场景，增强可读性与可维护性。

## Flow

1. `npm test` 执行 `vitest run`，根据 `vite.config.ts` 的 `include: ['tests/**/*.test.ts']` 加载所有测试文件。
2. 每个测试文件聚焦一个模块，使用局部 helper（`state()`、`car()`、`straightCtx()`、`createHarness()`、`createMockHudElements()`、`createElementStub()`）构造被测输入。
3. 测试直接断言返回值或状态变化；渲染类测试通过 canvas mock 的 `__calls`/`__args` 调用记录断言绘制行为，避免真实 DOM/Canvas 依赖。
4. 测试通过后进入 `npm run bot` 与 `npm run build` 验证。

## Integration

- **测试目标**：`src/engine`（projection、road-geometry、track、tracks、traffic、traffic-render、sprites、scenery、smoke-render、lighting、renderer）、`src/physics`（car、drift、input）、`src/ai`（bot、simulate）、`src/ui`（format、gamestate、save、joystick、hud）、`src/audio`（engine、music）、`src/game`（state、constants、phase、player-state、track-context、track-manager、game-loop）下所有模块。
- **依赖**：`vitest`（运行器）、`tsx`（间接用于 bot 脚本）、`tests/__mocks__/canvas.ts`（Canvas 测试替身）、`src/` 各被测模块。
- **被调用方**：`package.json` 的 `test` 脚本；`tests/codemap.md` 的详细文件表。

## Files

| File | Responsibility |
|------|----------------|
| `bot.test.ts` | 验证 `decideBotInput` 决策逻辑：直道油门、弯道前瞻刹车、横向回中与环形边界 |
| `car.test.ts` | 验证 `updateCar` 车辆运动学（速度/转向/路缘出界）与 `collidePlayers` 碰撞，含 M12 wet 雨天抓地/制动衰减与 boost 氮气（加速倍率、极速上限、charge 消耗） |
| `collision.test.ts` | 验证 `updateCollisions`/`applyTrafficCollision`（P1/P2 分屏、独立冷却）与 `createRaceState`/`resetRaceState` 状态工厂 |
| `constants.test.ts` | 常量注册表：断言 `game/constants` 漂移/碰撞/渲染/路面几何/车流常量值（防魔法数字回潮），含 M12 `CHALLENGE_SECONDS` 与 BOOST 系列，校验 `DRAW_DISTANCE` 兼容导出 |
| `drift.test.ts` | 验证 `updateDrift` 漂移状态机：charge 积累/衰减、激活阈值、烟雾粒子生命周期、转向率 ×1.5 与速度损耗、得分与速度成正比、纯函数性，含 M10 连击/倍率与得分 clamp |
| `engine-audio.test.ts` | 验证 `computeEngineParams` 引擎音效频率/增益映射，M10 `EngineSound` 输出注入，M11 `RainSound`/`CollisionSound` 噪声音效（防刷屏） |
| `format.test.ts` | 验证 HUD 格式化：速度 km/h 换算、MM:SS.mmm 计时、圈数推导与圈速列表 |
| `game-loop.test.ts` | 验证 `updatePlayerFrame` 完整链路（加速/漂移/圈速记录/P1-P2 互不影响）与菜单预览相机推进/回绕，M12 wet 雨天透传与 `updateBoostCharge` 蓄能/消耗 |
| `game-loop-integration.test.ts` | GameLoop 集成冒烟：stub 全局 DOM/rAF/AudioContext 驱动真实主循环，验证阶段流转、分屏/热座模式、9 赛道选择、暂停菜单（音量/重开/触屏）、M12 挑战模式计时、分轨音量与视觉缺陷回归（「分屏双人完赛」用例 testTimeout 15000ms） |
| `gamestate.test.ts` | 验证 `nextPhase`/`togglePause`（旧 ui/gamestate 接口）：菜单/比赛/结算流转与暂停切换 |
| `hud.test.ts` | 验证 `updateHud`：菜单/比赛可见性、分屏布局、双玩家独立圈数、P2 BEST 显隐、热座玩家标签、M10 漂移连击 COMBO 显示、M11 得分 MAX 标记、M12 挑战模式倒计时兼容（元素缺省不抛错） |
| `input.test.ts` | 验证双人键盘输入映射（WASD/方向键、互不干扰、左右抵消），M12 boost 键映射 |
| `joystick.test.ts` | 验证 `offsetToInput` 虚拟摇杆：死区、方向映射、幅值钳制、对角合成，M11 `reset()` 清空内部状态 |
| `lighting.test.ts` | 验证 `updateLighting` 昼夜光照：hsl 输出、日出/日落变化、周期回绕、负时间容错、overcast 阴天、M9 白天天空恒蓝、M10 raining 雨天、M11 night 夜晚色板 |
| `music.test.ts` | 验证 `noteToFreq` 音符频率与节拍换算、低音/旋律音域，M12 调度纯函数 `stepEvents`/`nextStep` 循环回绕 |
| `phase.test.ts` | 验证 `game/phase` 四阶段常量与 `phase-logic` 的 `nextPhase`/`togglePause`：流转、暂停态不响应、菜单/结算态 togglePause 无效 |
| `player-state.test.ts` | 验证 `createPlayerState`/`resetPlayerState`：双玩家状态与 DriftState（含 smoke）对象相互独立、reset 清空 |
| `projection.test.ts` | 验证 `project` 伪 3D 透视投影：scale、横向映射、地平线收敛、相机后方剔除 |
| `renderer-state.test.ts` | 验证 `Renderer` 状态切换：重复渲染稳定、setTrack/setViewport/setTraffic、renderRegion 裁剪、RenderView 路径等价、像素对齐，M11 夜晚车灯 arc 增量、M12 车灯变道转向、M11 雨滴离屏缓存（drawImage 双幅平铺） |
| `road-geometry.test.ts` | 验证 `projectSegmentQuad` 分段四边形投影、`roadColors` 颜色交替、`shouldDrawCenterLine` 中心线虚线规则 |
| `save.test.ts` | 验证 localStorage 存档：纪录覆盖策略、storage 不可用容错、P1/P2 维度 key 独立，M9 胜场统计、漂移 TOP10、M11 对局 TOP10（含 JSON 损坏回退） |
| `scenery.test.ts` | 验证 `generateMountainProfile` 远山轮廓（确定性/值域/起伏）与 `parallaxOffset` 视差取模 |
| `simulate.test.ts` | 验证 `updateCar` 出界标记与 `simulateLaps` 端到端跑圈：直线/弯道完成、多圈递增、步长不敏感、maxSteps 截断 |
| `smoke-render.test.ts` | 验证 `projectSmoke` 漂移烟雾投影：剔除、透明度衰减、近大远小、横向偏移 |
| `sprites.test.ts` | 验证 `createRoadsideSprites` 路边树/灯生成、曲率前缀和与 `curveOffsetAtZ`、环形可见窗口 `spritesInRange`、景物投影尺寸上限回归 |
| `touch.test.ts` | 验证 `touchToCarInput` 四分区触控映射与多点触控并集 |
| `track.test.ts` | 验证赛道分段生成：直道/分组曲线/平滑弯道控制点插值、`trackIndexForCameraZ` 环形回绕、`totalCurve` 闭环约束 |
| `track-context.test.ts` | 验证 `createTrackContext`/`refreshTraffic`：圈长/圈数/分段派生、曲率前缀和与精灵段索引预计算、车流生成与引用替换、密度按赛道 trafficCount 生效 |
| `track-manager.test.ts` | 验证 `TrackManager`：P1/P2 独立赛道上下文（selectTrack 只影响目标玩家）、selected/selected-p2 双类高亮、resetRace 回调、p2TrackName 可选依赖 |
| `tracks.test.ts` | 验证 `TRACK_DEFS` 9 条赛道配置（难度星级 ∈ {1,2,3}、id 唯一、M11 `timeOfDay` 夜晚标记）、`createTrackFromDef` 与 `getTrackDef` 查询 |
| `traffic.test.ts` | 验证 `createTraffic` 车流生成（确定性/均匀分布/不骑线）、`updateTraffic` 推进与环形回绕、`collideWithPlayer` 碰撞，M10 车流避让、M12 shiftDir 变道方向记录 |
| `traffic-render.test.ts` | 验证 `projectTraffic` 车流投影：可见性窗口、远→近排序、近大远小、颜色循环、横向偏移，及投影尺寸上限回归 |
| `codemap.md` | 本目录索引（本文件） |

更详细的模块级测试说明请参见 `tests/codemap.md`。
