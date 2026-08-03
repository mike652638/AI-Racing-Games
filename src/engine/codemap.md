# src/engine/

## Responsibility

该目录是游戏的**伪 3D 渲染引擎核心**（Canvas 2D，非 WebGL）。职责包括：

- **投影数学**：提供相机模型与透视投影纯函数，将世界坐标（赛道平面 y=0，相机朝 +z）映射为屏幕坐标与缩放。
- **赛道数据层**：定义分段路点数据结构（`Segment`），提供赛道生成（直道/分组曲线/平滑插值）、环形索引与曲率统计。
- **场景渲染**：天空、视差远山、草地等背景的分层绘制（远山采用离屏预渲染 + 视差平铺）。
- **动态对象渲染**：曲线路面分段四边形、路边景物（树/路灯）、车流、漂移烟雾的投影与绘制。
- **环境状态**：昼夜光照循环配色；确定性风景/车流数据生成。
- 对外暴露一个**渲染门面**（`Renderer` 类），供游戏主循环直接调用。

## Design

- **纯函数分层**：`projection.ts`、`road-geometry.ts`、`traffic-render.ts`、`smoke-render.ts`、`lighting.ts` 均为无副作用纯函数（输入世界坐标/时间，输出投影或颜色），不接触 DOM，易于单测。
- **门面模式（Facade）**：`renderer.ts` 的 `Renderer` 类组合所有子模块，对外只暴露 `render` / `renderRegion` / `setViewport` / `setTrack` / `setTraffic` 等粗粒度 API；`main.ts` 仅依赖 `Renderer` 与若干数据生成函数。
- **数据结构驱动**：赛道以环形 `Segment[]` 表达，通过 `trackIndexForCameraZ` 做 O(1) 环形分段定位；曲率用 `Float64Array` 前缀和（`buildCurvePrefixSum` / `curveOffsetAtZ`）实现 O(1) 累计偏移查询，避免逐段累加。
- **确定性生成**：`scenery.ts` 的 `mulberry32` PRNG 是唯一随机源，远山轮廓、路边景物、车流均由种子生成，结果可复现（利于 bot 校验与存档）。
- **离屏缓存**：远山轮廓先渲染为 offscreen canvas，再按视差偏移平铺 `drawImage`，避免每帧重绘路径。
- **画家算法分层**：渲染顺序固定为 天空 → 远山 → 草地 → 路面分段（远→近）→ 景物（远→近）→ 车流（远→近）→ 烟雾，靠绘制顺序保证遮挡正确。
- **常量集中与 re-export**：`SEGMENT_LENGTH`、`ROAD_HALF_WIDTH`、`EDGE_WIDTH`、`DRAW_DISTANCE` 定义在 `track.ts` / `road-geometry.ts`，并由 `renderer.ts` re-export 供外部统一引用。

## Flow

1. **初始化**：`main.ts` 从 `tracks.ts`（`TRACK_DEFS` + `createTrackFromDef`）生成 `Segment[]`，用 `createRoadsideSprites`、`createTraffic` 生成景物与车流，构造 `Renderer(canvas, track, w, h, dpr, sprites, traffic)`；构造时预构建远山离屏位图与曲率前缀和。
2. **每帧驱动**（60fps）：外部更新相机位置（z 由车辆前进推进，x 由 `setCameraX` 设置），调用 `render(cameraZ, smoke, timeSec)`（分屏时用 `renderRegion`）。
3. **背景层**：`updateLighting(timeSec)` 求昼夜配色 → 填充天空 → 按 `parallaxOffset` 平铺远山离屏图 → 填充草地。
4. **路面层**：`trackIndexForCameraZ` 定位起点分段，自相机处向前迭代 `DRAW_DISTANCE`(120) 段；每段 `projectSegmentQuad` 求当前/下一段四边形的投影，绘制路面 + 两侧路缘，按段号奇偶交替配色，每两段画一次中心线虚线；`curveSum` 逐段累加作为后续分段的中心线横向偏移。
5. **景物层**：`spritesInRange` 求环形可见窗口，`curveOffsetAtZ`（前缀和 O(1)）求中心线偏移，`project` 投影后按远→近绘制树（树干+双层树冠）或路灯（灯杆+发光灯头）。
6. **车流层**：`projectTraffic` 过滤后方/超距车辆并远→近排序，投影为车身矩形，`renderer` 再叠加车窗，按 `colorIndex` 取色。
7. **烟雾层**：`projectSmoke` 过滤相机后方粒子，半径随 `scale` 缩放、透明度随存活时间衰减，绘制半透明圆。
8. **分屏**：`renderRegion` 用 `ctx.save/translate/clip` 将渲染限定到 `[viewX, viewX+viewW)` 区域，内部按区域宽度重建投影参数。

## Integration

- Consumed by:
  - `src/main.ts`：游戏主循环——构造 `Renderer`、`SEGMENT_LENGTH`、`createRoadsideSprites`、`TRACK_DEFS` / `createTrackFromDef`、`createTraffic` / `updateTraffic`。
  - `src/game/state.ts`：使用 `TrafficCar` 类型维护车流状态。
  - `src/game/collision.ts`：调用 `collideWithPlayer` 做玩家与车流碰撞检测。
  - `src/ai/bot.ts`、`src/ai/simulate.ts`：消费 `Segment`、`SEGMENT_LENGTH`、`trackIndexForCameraZ` 用于 bot 导航与跑圈模拟。
- Depends on:
  - `src/physics/drift`：仅类型依赖（`SmokeParticle`，被 `renderer.ts` 与 `smoke-render.ts` 引用）。
  - 浏览器 Canvas 2D 运行时（`HTMLCanvasElement` / `CanvasRenderingContext2D`）。
- 依赖方向单向：engine 处于系统底层，不反向依赖 game / ai / ui / audio 业务模块。

## Files

| File | Responsibility |
|------|----------------|
| projection.ts | 伪 3D 透视投影纯函数与类型（`ProjectionOptions`、`Camera3D`、`Point3D`、`project`）：世界坐标→屏幕坐标/缩放，相机后方点返回 null |
| track.ts | 赛道分段数据结构（`Segment`、`SEGMENT_LENGTH=200`）；生成器（`createTrack` / `createSmoothTrack` / `createStraightTrack` / `createDefaultTrack`）；环形索引 `trackIndexForCameraZ`、总曲率统计 `totalCurve` |
| tracks.ts | 赛道定义注册表：`TrackDef`（id/名称/控制点/圈数）、`TRACK_DEFS`（classic、highway、s-curve）；`createTrackFromDef`、`getTrackDef` |
| road-geometry.ts | 路面几何常量（`ROAD_HALF_WIDTH`、`EDGE_WIDTH`、`DRAW_DISTANCE`）；分段四边形投影 `projectSegmentQuad`；路面/路缘配色 `roadColors`；中心线绘制判定 `shouldDrawCenterLine` |
| scenery.ts | 确定性 PRNG `mulberry32`；远山轮廓 `generateMountainProfile`（多层正弦叠加）；视差偏移 `parallaxOffset` |
| sprites.ts | 路边景物（`tree`/`lamp`）确定性成对生成 `createRoadsideSprites`；环形可见窗口 `spritesInRange`；曲率前缀和 `buildCurvePrefixSum` 与 O(1) 曲率偏移查询 `curveOffsetAtZ` |
| lighting.ts | 昼夜光照循环 `updateLighting`：按 120s 周期分段 HSL 插值，输出天空/草地/远山配色（`LightingColors`） |
| traffic.ts | 车流数据（`TrafficCar`）与常量（`TRAFFIC_Z_TOL`/`X_TOL`/`CRUISE_SPEED`）；确定性生成 `createTraffic`、推进 `updateTraffic`、玩家碰撞 `collideWithPlayer` |
| traffic-render.ts | 车流渲染投影 `projectTraffic`：可见性过滤、远→近排序、车身/车窗投影与配色表 `TRAFFIC_COLORS` |
| smoke-render.ts | 漂移烟雾投影 `projectSmoke`：过滤不可见粒子，半径随 scale 缩放、透明度随存活时间衰减 |
| renderer.ts | 渲染门面 `Renderer` 类：组合天空/远山/草地/路面/景物/车流/烟雾的分层绘制，支持分屏 `renderRegion`、视口/赛道/车流切换与相机横向偏移 |
