# 分屏分界线修复与双人独立选赛道 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复分屏模式交界处路缘石渲染瑕疵（像素对齐 + 分隔线），并实现分屏双人各自独立选择赛道（P1 用 1/2/3、P2 用 7/8/9），左右画面成为两个独立赛道世界。

**Architecture:** 分屏模式升级为"两个独立赛道世界"——每个玩家持有独立的 `TrackContext`（赛道分段/圈长/圈数/曲率前缀和/景物索引/车流）。`Renderer` 渲染参数化：`render`/`renderRegion` 接受可选 `RenderView`（track+前缀和+索引+traffic），分屏两区域分别用各自视图渲染，单次渲染零重建（预计算在 TrackContext 创建时完成）。赛道选择由重构后的 `TrackManager` 按玩家索引管理，DOM 高亮用双类（`.selected` P1 / `.selected-p2` P2）。分屏后 P1-P2 互碰删除（独立世界跨世界碰撞无意义）。单人模式行为不变（仍走 P1 上下文）。

**Tech Stack:** TypeScript + Vite + Canvas 2D + Vitest（无新增依赖）。

## Global Constraints

- 验证优先级（每 Task 至少跑）：`npm run typecheck` → `npm run lint` → 相关单测 → 全部通过后提交
- 每 Task 一个独立 commit，commit message 用英文 Conventional Commits（前缀 `fix:`/`feat:`/`refactor:`/`test:`），只提交本 Task 涉及文件，不动 `.slim/`
- 全部注释、计划文档用中文；代码、标识符、命令保留英文
- 既有 API 不破坏：`physics/car.ts` 的 `collidePlayers` 保留导出（car.test.ts 仍测试），仅 `collision.ts` 不再使用
- 单人模式（无 `?split=1`）行为与渲染输出必须与改造前一致（回归防线：`npm run bot` 3 圈 76.017s 0 违规）
- 分屏菜单按键约定：P1 用 `Digit1/2/3` 选左侧赛道，P2 用 `Digit7/8/9` 选右侧赛道；非分屏仍 `Digit1/2/3`
- 每 Task 完成后在文档对应 Task 末尾追加"实施偏差"小节（如有）

---

### Task A: 分屏分界线渲染瑕疵修复（P0）

**根因（已勘察确认）：**
1. `renderer.ts` `renderRegion`（当前 L166-182）：`ctx.translate(viewX, 0)` + `ctx.rect(0, 0, viewW, height)` + `clip()`，GameLoop 传入 `viewX = w/2`、`viewW = w/2`。窗口宽为奇数时（如 1281px）为 `640.5` 非整数，clip/translate 落在像素网格之间，交界处出现 1px 级重叠/缝隙，近处路缘石斜边交错成"三角形重叠/撕裂"。
2. 两区域独立投影（各自 cameraZ/camera.x），近处路面宽度远超区域宽度被硬裁，交界处无分隔线，画面衔接生硬。

**修复方案：** ① renderRegion 内部对 viewX/viewW 做 `Math.round` 整数像素对齐；② 新增 `drawDivider(x, width)` 在交界处绘制 2px 深色竖分隔线，覆盖交错瑕疵（标准分屏做法）。

**Files:**
- Modify: `src/engine/renderer.ts`（renderRegion 对齐 + 新增 drawDivider）
- Modify: `src/game/game-loop.ts`（分屏渲染分支末尾调用 drawDivider）
- Test: `tests/unit/renderer-state.test.ts`（renderRegion 整数边界 + drawDivider 断言）
- Test: `tests/unit/game-loop-integration.test.ts`（分屏帧 renderRegion 后 drawDivider 被调用——若 canvas mock 已有 `__calls` 计数则直接断言）

**Interfaces:**
- Produces: `Renderer.drawDivider(x: number, width = 2): void` —— 全高竖线，`fillStyle = '#000'`，`fillRect(Math.round(x - width/2), 0, width, this.opts.height)`。必须在 `renderRegion` 的 `ctx.restore()` 之后调用（transform 已复位，用全屏坐标）。

- [x] **Step 1: 写失败测试（renderer-state.test.ts）**

新增用例：
```typescript
it('renderRegion 使用整数像素对齐的裁剪区域', () => {
  const canvas = createMockCanvas(1281, 720)  // 奇数宽触发 640.5
  const renderer = new Renderer(canvas, createStraightTrack(), 1281, 720)
  renderer.renderRegion(0, 640.5, 640.5, [], 0)
  const rectCall = canvas.__ctx.__calls.rect  // 记录 [args]
  expect(rectCall).toBeDefined()
  const args = rectCall[rectCall.length - 1]
  expect(Number.isInteger(args[0])).toBe(true)
  expect(Number.isInteger(args[2])).toBe(true)
})

it('drawDivider 绘制全高深色竖线', () => {
  const canvas = createMockCanvas(800, 600)
  const renderer = new Renderer(canvas, createStraightTrack(), 800, 600)
  renderer.drawDivider(400)
  const lastFill = canvas.__ctx.__calls.fillRect[canvas.__ctx.__calls.fillRect.length - 1]
  expect(lastFill[1]).toBe(0)
  expect(lastFill[3]).toBe(600)
  expect(canvas.__ctx.fillStyle).toBe('#000')
})
```

**说明：** `createStraightTrack` 从 `src/engine/track.ts` 导入；`__calls.rect` 数组记录每次 `rect(x,y,w,h)` 的实参（若现有 mock 无 rect 记录，Step 3 中补充记录）。若 `createMockCanvas` 的 `__calls` 结构与此处假设不同，以实际结构为准调整断言，但必须验证"renderRegion 传入的 translate/rect 坐标是整数"。

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/renderer-state.test.ts`
Expected: 新用例 FAIL（当前 rect 用 640.5 非整数；drawDivider 不存在）

- [x] **Step 3: 实现**

`renderer.ts` `renderRegion`（L166-182 区域）：
```typescript
renderRegion(cameraZ, viewX, viewW, smoke = [], timeSec = 0, view?: RenderView): void {
  const { ctx } = this
  const opts = this.buildOpts(viewW, this.opts.height)
  const ox = Math.round(viewX)
  const ow = Math.round(viewW)
  ctx.save()
  ctx.translate(ox, 0)
  ctx.beginPath()
  ctx.rect(0, 0, ow, this.opts.height)
  ctx.clip()
  this.renderWithOpts(cameraZ, opts, smoke, timeSec, view)
  ctx.restore()
}
```
（注：`view?: RenderView` 参数是 Task B2 的接口，若本 Task 先落地可暂不加，见 Step 3 附注。）

新增方法（放 `setTraffic` 之后）：
```typescript
/** 分屏交界分隔线：全高深色竖线，覆盖两区域近处路缘石交错瑕疵（renderRegion 调用后绘制） */
drawDivider(x: number, width = 2): void {
  const { ctx } = this
  ctx.fillStyle = '#000'
  ctx.fillRect(Math.round(x - width / 2), 0, width, this.opts.height)
}
```

`game-loop.ts` 分屏渲染分支（当前 L297-314 `else if (this.splitMode)` 末尾、以及 PHASE_MENU 分屏分支 L290-292 之后）各追加：
```typescript
this.renderer.drawDivider(w / 2)
```
（菜单与比赛分屏都画分隔线。）

> **Step 3 附注（Task A 与 B2 的边界）：** 若你实现时直接加上 `view?: RenderView` 参数（B2 的接口），则同时补 B2 的最小实现；否则本 Task 不加参数，B2 再加。以不引入未定义类型为准（typecheck 必须过）。

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/renderer-state.test.ts` + 全量 `npm test`
Expected: 全部 PASS

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run bot`
Expected: 全绿，bot 3 圈 76.017s 0 违规（回归防线）

- [x] **Step 6: 浏览器复验（分屏比赛截图）**

- 启动 dev：`Start-Process cmd.exe -ArgumentList '/c','npm run dev -- --port 5175 --strictPort'`（日志重定向到临时文件）
- Playwright 脚本打开 `http://localhost:5175/?split=1`，进入比赛（按 1 或注入 keydown），两玩家各加速 3 秒后截图 `shots/m6/task-a-split.png`
- 调 observer 分析截图，确认：交界处有 2px 深色分隔线、路缘石交错/三角形重叠消失
- 停止 dev server

- [x] **Step 7: 提交**

```bash
git add src/engine/renderer.ts src/game/game-loop.ts tests/unit/renderer-state.test.ts tests/unit/game-loop-integration.test.ts
git commit -m "fix(render): pixel-align split regions and add divider line"
```

#### 实施偏差

1. **canvas mock 结构差异**：计划假设 `__calls.rect` 为"记录每次实参的数组"，实际 `tests/__mocks__/canvas.ts` 的 `__calls` 是纯调用计数（`[method: string]: number`）。本 Task 在 mock 中新增 `__args` 实参记录（`[method: string]: unknown[][]`，与 `__calls` 一一对应），`__calls` 计数接口保持不变（既有测试断言零改动），断言改读 `__args`。该 mock 扩展属本 Task 合理范围，已随 commit 提交。
2. **`createStraightTrack` 需要参数**：计划示例用无参 `createStraightTrack()`，实际签名是 `createStraightTrack(count: number)`（现有测试传 10）。测试沿用既有 `createHarness(width, height)` 辅助函数构造（内部传 10 段），仅改视口尺寸触发奇数宽路径。
3. **`drawDivider` 断言用精确值**：`drawDivider(400)` 实际绘制 `fillRect(399, 0, 2, 600)`（`Math.round(400 - 2/2)`），断言直接写精确值 399/0/2/600。
4. **未加 `view?: RenderView` 参数**：按任务边界说明，本 Task 不加（属 Task B2），`renderRegion` 签名保持不变，typecheck 通过。
5. **集成测试环境参数化**：`stubEnvironment` 增加 `split` 参数（`window.location.search = '?split=1'`），新用例用其构造分屏环境；分隔线断言用"2px 宽、y=0 起、全高 600 的 fillRect 计数递增"（菜单帧与比赛帧各验证）。
6. **浏览器复验**：Playwright 脚本运行一次出现两个 `console.error 404`，排查确认为 `/favicon.ico` 资源缺失（index.html 无 favicon link，项目既有问题，与本 Task 资源无关）；脚本二次运行无任何 4xx/5xx，且全程无 `pageerror`。截图 `shots/m6/task-a-split.png` 已生成（129,348 字节）。

---

### Task B1: TrackContext 建模 + RaceState 迁移（数据层）

**Files:**
- Create: `src/game/track-context.ts`
- Create: `tests/unit/track-context.test.ts`
- Modify: `src/game/state.ts`（RaceState.tracks、createRaceState/resetRaceState 签名）
- Modify: `src/game/game-loop.ts`（构造 createRaceState 调用、resetRace、updateTraffic 参数）
- Modify: `src/game/collision.ts`（P1/P2 车流改取 `race.tracks[i].traffic`；删除 P1-P2 互碰分支与 `collidePlayers` 导入）
- Modify: `tests/unit/collision.test.ts`（互碰用例删除/改写为"分屏各自车流独立碰撞"；createRaceState 调用适配）
- Modify: `tests/unit/game-loop-integration.test.ts`（createRaceState 调用适配，若直接调用）

**Interfaces（本 Task Produces，B2-B4 依赖）：**
```typescript
// track-context.ts
export interface TrackContext {
  def: TrackDef                        // src/engine/tracks
  segments: Segment[]                  // createTrackFromDef(def)
  lapLength: number                    // segments.length * SEGMENT_LENGTH
  totalLaps: number                    // def.laps
  curvePrefixSum: Float64Array         // buildCurvePrefixSum(segments)（src/engine/sprites 导出）
  spriteIndex: Map<number, Sprite[]>   // buildSpriteIndex(sprites, SEGMENT_LENGTH)
  sprites: Sprite[]                    // createRoadsideSprites(segments)
  traffic: TrafficCar[]                // createTraffic(lapLength)
}
export function createTrackContext(def: TrackDef): TrackContext
export function refreshTraffic(ctx: TrackContext): void   // ctx.traffic = createTraffic(ctx.lapLength)
```
注意：`buildCurvePrefixSum`/`buildSpriteIndex` 从 `src/engine/sprites` 导入，`createRoadsideSprites` 同文件；`SEGMENT_LENGTH` 从 `src/engine/track` 导入。

```typescript
// state.ts
export interface RaceState {
  player1: PlayerState
  player2: PlayerState
  /** 双玩家赛道上下文（分屏各用其一；单人模式仅 [0] 生效） */
  tracks: [TrackContext, TrackContext]
  collisionCount: number
  lapTimes: number[]
  lastLap: number
  phase: Phase
  finishShown: boolean
}
export function createRaceState(): RaceState            // 内部用 TRACK_DEFS[0] 创建双 TrackContext
export function resetRaceState(state: RaceState): void  // 不再接收 traffic；只重置玩家状态与计数，不重建 tracks
```
`RaceState.traffic` 字段删除（迁移进 TrackContext）。所有引用 `race.traffic` 的地方同步迁移（本 Task 内：collision.ts、game-loop.ts；测试同理）。

- [x] **Step 1: 写失败测试（track-context.test.ts，新建）**

```typescript
import { describe, expect, it } from 'vitest'
import { TRACK_DEFS } from '../../src/engine/tracks'
import { createTrackContext, refreshTraffic } from '../../src/game/track-context'

describe('createTrackContext', () => {
  it('从赛道定义派生圈长/圈数/分段', () => {
    const ctx = createTrackContext(TRACK_DEFS[0])  // classic
    expect(ctx.totalLaps).toBe(3)
    expect(ctx.lapLength).toBe(ctx.segments.length * 120)  // SEGMENT_LENGTH
    expect(ctx.segments.length).toBeGreaterThan(100)
  })
  it('预计算曲率前缀和与景物段索引', () => {
    const ctx = createTrackContext(TRACK_DEFS[0])
    expect(ctx.curvePrefixSum.length).toBe(ctx.segments.length)
    expect(ctx.spriteIndex.size).toBeGreaterThan(0)
    expect(ctx.sprites.length).toBeGreaterThan(0)
  })
  it('按圈长生成车流', () => {
    const ctx = createTrackContext(TRACK_DEFS[2])  // s-curve
    expect(ctx.traffic.length).toBeGreaterThan(0)
  })
  it('refreshTraffic 重建车流数组（引用替换）', () => {
    const ctx = createTrackContext(TRACK_DEFS[0])
    const old = ctx.traffic
    refreshTraffic(ctx)
    expect(ctx.traffic).not.toBe(old)
  })
  it('不同赛道定义产生不同圈长（S 弯短于经典）', () => {
    const classic = createTrackContext(TRACK_DEFS[0])
    const scurve = createTrackContext(TRACK_DEFS[2])
    expect(scurve.lapLength).toBeLessThan(classic.lapLength)
  })
})
```

`collision.test.ts` 适配（改写，非新增）：
- 现有 `makeRaceWithOverlap` / `createRaceState(traffic)` 调用改 `createRaceState()`；车流直接取 `race.tracks[0].traffic` / `race.tracks[1].traffic`
- 删除 P1-P2 互碰用例（"冷却期内连续重叠只罚速一次"等 3 个 Task1 用例），替换为：分屏时 P1/P2 车流独立——例如把 P1 车流制造碰撞、P2 车流清空，断言只有 P1 罚速；再反向验证
- `updateCollisions(race, dt, splitMode)` 签名不变，但内部互碰分支删除

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/track-context.test.ts tests/unit/collision.test.ts`
Expected: track-context 全 FAIL（文件不存在）；collision 因 `race.traffic` 不存在 FAIL

- [x] **Step 3: 实现**

- 新建 `track-context.ts`（按 Interfaces 实现）
- `state.ts`：RaceState 增 `tracks`、删 `traffic`；`createRaceState()` 用 `TRACK_DEFS[0]` 建双 context；`resetRaceState(state)` 去 traffic 参数
- `collision.ts`：`updateCollisions` 中 P1 车流参数改 `race.tracks[0].traffic`、P2 改 `race.tracks[1].traffic`；删除 L67-85 互碰分支与 `collidePlayers` import；更新文件头注释（说明分屏独立世界、互碰已移除）
- `game-loop.ts`：
  - L152 `createRaceState(createTraffic(this.trackManager.lapLength))` → `createRaceState()`
  - L188 `resetRaceState(this.race, createTraffic(...))` → `resetRaceState(this.race)`；其后 `refreshTraffic(this.race.tracks[0])` + `refreshTraffic(this.race.tracks[1])`；删除 `this.renderer.setTraffic(...)`（B2 改为每帧 view 传入；若 B2 未落地则暂时保留 setTraffic 用 `tracks[0].traffic`——以 typecheck 通过为准）
  - L252 `updateTraffic(this.race.traffic, dt, this.trackManager.lapLength)` → `updateTraffic(this.race.tracks[0].traffic, dt, this.race.tracks[0].lapLength)`；分屏时追加 `updateTraffic(this.race.tracks[1].traffic, dt, this.race.tracks[1].lapLength)`
  - TrackManager 的 lapLength 引用暂保留（B3 重构），但此处已改用 tracks[0]（单人语义一致）

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/track-context.test.ts tests/unit/collision.test.ts tests/unit/player-state.test.ts tests/unit/game-loop-integration.test.ts`
Expected: PASS（game-loop-integration 若仍引用旧签名则同步修复）

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run bot`

- [x] **Step 6: 提交**

```bash
git add src/game/track-context.ts src/game/state.ts src/game/collision.ts src/game/game-loop.ts tests/unit/track-context.test.ts tests/unit/collision.test.ts tests/unit/game-loop-integration.test.ts
git commit -m "feat(game): introduce per-player TrackContext, remove cross-world P1-P2 collision"
```

#### 实施偏差

1. **`SEGMENT_LENGTH` 实际为 200 而非计划示例的 120**：计划测试示例断言 `ctx.lapLength === segments.length * 120`，实际 `src/engine/track.ts` 中 `SEGMENT_LENGTH = 200`。测试改为从 `src/engine/track` 导入 `SEGMENT_LENGTH` 计算，以源码为准。
2. **`buildCurvePrefixSum` 返回长度 `track.length + 1`**：计划测试断言 `curvePrefixSum.length === segments.length`，实际该函数返回带哨兵位的 `Float64Array(track.length + 1)`。断言改为 `segments.length + 1`。
3. **`tests/unit/hud.test.ts` 连带适配（计划 Files 未列）**：其 4 处 `createRaceState([])` 调用在无参签名 `createRaceState()` 下会直接 typecheck 失败，作为签名迁移的连带适配纳入本 Task 提交（`createRaceState([])` → `createRaceState()`）。
4. **互碰用例删除数比计划多**：计划称"删除 3 个 Task1 互碰用例"，实际互碰 describe 下 5 个依赖互碰语义的行为用例全部删除（冷却期内连续重叠×1、冷却结束再次罚速×1、两车同处互碰×1、纵向容差不互碰×1、非分屏不互碰×1）及 `makeRaceWithOverlap` 辅助函数；其中"双方碰撞冷却创建与重置时均为 0"不依赖互碰分支，保留并迁移至 `createRaceState / resetRaceState` describe。新增 2 个分屏双世界车流独立用例（P1 有车 P2 空 / P1 空 P2 有车）。
5. **`tests/unit/game-loop-integration.test.ts` 无改动**：该文件未直接调用 `createRaceState`/`resetRaceState`（通过 `new GameLoop()` 间接使用），无需适配，不在提交清单中；实际提交 7 个文件（4 源码 + 3 测试，含上述 hud.test.ts 替代 game-loop-integration.test.ts）。

---

### Task B2: Renderer 多 view 渲染参数化

**Files:**
- Modify: `src/engine/renderer.ts`（RenderView 接口 + render/renderRegion/renderWithOpts 参数化）
- Modify: `tests/unit/renderer-state.test.ts`（新增 view 渲染用例）

**Interfaces:**
```typescript
// renderer.ts 新增导出
export interface RenderView {
  track: Segment[]
  curvePrefixSum: Float64Array
  spriteIndex: Map<number, Sprite[]>
  traffic: TrafficCar[]
}
render(cameraZ: number, smoke: SmokeParticle[] = [], timeSec = 0, view?: RenderView): void
renderRegion(cameraZ, viewX, viewW, smoke = [], timeSec = 0, view?: RenderView): void
```
`renderWithOpts(cameraZ, opts, smoke, timeSec, view?: RenderView)` 内部以 `const v = view ?? this` 取 track/curvePrefixSum/spriteIndex/traffic（`this` 上的原字段保留作默认，`setTrack`/`setTraffic` 方法保留不删，兼容旧测试与旧调用）。`drawSprites`/`drawTraffic` 需接收 v（或改为从参数传入的视图取数据）。

- [x] **Step 1: 写失败测试（renderer-state.test.ts 追加）**

```typescript
it('renderRegion 可用自定义 RenderView 渲染不同赛道', () => {
  const canvas = createMockCanvas(800, 600)
  const trackA = createStraightTrack()
  const renderer = new Renderer(canvas, trackA, 800, 600)
  const trackB = createTrackFromDef(TRACK_DEFS[2])  // s-curve
  const viewB: RenderView = {
    track: trackB,
    curvePrefixSum: buildCurvePrefixSum(trackB),
    spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
    traffic: [],
  }
  renderer.renderRegion(0, 0, 400, [], 0, viewB)
  // 断言渲染路径使用 viewB：可对比两次渲染 fillRect 计数/顺序差异，或断言未抛错且 fill 计数 > 0
  expect(canvas.__ctx.__calls.fill).toBeGreaterThan(0)  // 按实际 __calls 结构调整
})
```
若断言不好写，退而求其次：直接构造 `new Renderer(canvas, trackA, ...)` 后调 `renderRegion(..., viewB)` 不抛错 + `setTrack(trackB, sprites)` 后 `render()` 与带 viewB 的 `renderRegion()` 的绘制调用序列一致（用 `__calls.fillRect` 长度对比）。

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/renderer-state.test.ts`
Expected: 新用例 FAIL（renderRegion 不接受 view 参数 → TS 编译错误或行为不符）

- [x] **Step 3: 实现**

按 Interfaces 改造 renderer.ts：
- 新增 `RenderView` 接口
- `render`/`renderRegion`/`renderWithOpts` 增加 `view?: RenderView` 尾参并透传
- `renderWithOpts` 内：`const v = view ?? this`；L202 `trackIndexForCameraZ(this.track, ...)` → `v.track`；L205-242 循环内 `this.track[...]` → `v.track[...]`；L243 `this.drawSprites(cameraZ, opts)` → `this.drawSprites(cameraZ, opts, v)`；L244 drawTraffic 同理
- `drawSprites(cameraZ, opts, v)` 内 `spritesInRangeIndexed(v.spriteIndex, v.track, cameraZ, DRAW_DISTANCE * SEGMENT_LENGTH)`、`curveOffsetAtZ(v.track, v.curvePrefixSum, sprite.z)`
- `drawTraffic(cameraZ, opts, v)` 内 `projectTraffic(v.traffic, ...)`
- `buildCurvePrefixSum`/`buildSpriteIndex` 导入路径不变（renderer 已导入）

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/renderer-state.test.ts tests/unit/traffic-render.test.ts tests/unit/sprites.test.ts` + `npm test`

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run bot`

- [x] **Step 6: 提交**

```bash
git add src/engine/renderer.ts tests/unit/renderer-state.test.ts
git commit -m "feat(render): parameterize render/renderRegion with per-view track data"
```

#### 实施偏差

1. **`view ?? this` 改为显式对象构造**：计划原案 `const v = view ?? this` 因 `Renderer` 的 `track`/`curvePrefixSum`/`spriteIndex`/`traffic` 为 private 字段，TS 结构兼容检查报 "Property 'track' is private in type 'Renderer' but not in type 'RenderView'"（且联合类型上无法访问私有成员）。改为类内显式构造 `view ?? { track: this.track, curvePrefixSum: this.curvePrefixSum, spriteIndex: this.spriteIndex, traffic: this.traffic }`，语义与默认视图回退完全一致。
2. **等价性断言需扣除 renderRegion 裁剪 beginPath**：`renderRegion` 的裁剪路径（save→translate→beginPath→rect→clip）在绘制开始前多一次 `ctx.beginPath()`（对比结果 beginPath 536 vs 537，其余 moveTo/lineTo/closePath/fill/fillRect/arc/drawImage 全部一致）。断言前对 renderRegion 侧 `actual.beginPath.slice(1)`，注释说明属区域管理调用而非 view 数据差异。
3. **等价性断言强于计划建议**：计划建议用 `__calls.fillRect` 长度对比，实际用 `__args` 对 8 个绘制方法的完整实参序列做 `toEqual`（drawImage 首参离屏 canvas 替换为 `'<canvas>'` 占位符），证明 view 路径与默认路径逐调用等价。
4. **新增 render 带 view 用例**：计划 Step 1 示例只覆盖 `renderRegion`，实际补充第 3 个用例断言 `render(0, [], 0, viewB)` 接受 view 参数且产生绘制（覆盖 `render` 签名透传）。

---

### Task B3: TrackManager 双玩家重构 + 菜单交互

**Files:**
- Modify: `src/game/track-manager.ts`（双玩家 contexts + selectTrack + 双高亮 + p2TrackName）
- Modify: `src/game/debug-hook.ts`（selectedTrack2 读取器）
- Modify: `index.html`（新增 `#p2-track-name` 元素；确认/补充提示文字元素 id）
- Modify: `src/style.css`（`.selected-p2` 样式 + `#p2-track-name` 样式）
- Modify: `tests/unit/track-manager.test.ts`（重写为双玩家）
- Modify: `tests/unit/game-loop.test.ts` 或 integration（若引用 TrackManager 旧 API）

**Interfaces:**
```typescript
// track-manager.ts
export interface TrackManagerDeps {
  resetRace: () => void
  trackName: HTMLSpanElement            // 显示 P1 赛道名
  p2TrackName?: HTMLSpanElement         // 分屏时显示 P2 赛道名（index.html 新增）
  trackOptions: HTMLDivElement[]
}
export class TrackManager {
  getContext(playerIndex: 0 | 1): TrackContext
  getLapLength(playerIndex: 0 | 1): number
  getTotalLaps(playerIndex: 0 | 1): number
  getTrackId(playerIndex: 0 | 1): string
  /** 切换指定玩家赛道：重建 TrackContext、触发 resetRace 回调、刷新高亮 */
  selectTrack(playerIndex: 0 | 1, trackIndex: number): void
  /** 刷新选单高亮与赛道名（selectTrack 内部调用；也供外部初始化用） */
  updateTrackSelect(): void
}
```
高亮语义：`trackOptions[i].classList.toggle('selected', i === selectedIndexes[0])` + `classList.toggle('selected-p2', i === selectedIndexes[1])`。`trackName.textContent = tracks[0].def.name`；`p2TrackName` 存在时 `textContent = tracks[1].def.name`（P2 为 classic 时显示"经典赛道"，无特殊前缀，配合分屏标题区文字区分即可；若 index.html 该元素自带"P2："前缀文字，则只填赛道名）。

`debug-hook.ts`：`DebugHookSources` 增 `selectedTrack2: () => string`，`__gameDebug` 增 `selectedTrack2` getter（返回 `tracks[1].def.id`）。GameLoop 注入（B4 做）——本 Task 若 GameLoop 未注入则先加 `selectedTrack2: () => this.trackManager.getTrackId(1)`（若 GameLoop 侧本 Task 无法编译，就把 debug-hook 注入放 B4，本 Task 只改类型与 getter 骨架）。

- [x] **Step 1: 写失败测试（track-manager.test.ts 重写）**

```typescript
// 依赖 mock：trackName/p2TrackName/trackOptions 用 { textContent: '', classList: { toggle: vi.fn() } } 或最小 fake
// 用例：
// 1. 默认 P1/P2 均选中 classic，getTrackId(0) === getTrackId(1) === 'classic'，lapLength 一致
// 2. selectTrack(0, 2) 后 getTrackId(0) === 's-curve'、getContext(0).totalLaps === 2，getTrackId(1) 仍 'classic'
// 3. selectTrack(1, 1) 后 getTrackId(1) === 'highway'，P1 不受影响
// 4. 高亮：P1 选中 index2 时 trackOptions[2] 的 selected 为 true；P2 选中 index1 时 trackOptions[1] 的 selected-p2 为 true
// 5. resetRace 回调在 selectTrack 时被调用（vi.fn）
// 6. p2TrackName 文本随 selectTrack(1, i) 更新；未传 p2TrackName 时不抛错
```
（DOM mock 沿用 `tests/unit/track-manager.test.ts` 现有风格；若现有测试用真实 DOM mock，保持一致。）

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/track-manager.test.ts`
Expected: FAIL（旧 API）

- [x] **Step 3: 实现**

- 重写 `track-manager.ts`（删 renderer 依赖与 applyTrack；`applyTrack` 若被测试/旧调用引用则删或改为 `selectTrack(0, i)` 的兼容包装——以 grep 结果为准）
- `index.html`：在 `#track-name` 附近新增 `<span id="p2-track-name"></span>`（初始 hidden 或由 GameLoop 控制；分屏时显示）；确认提示文字元素（"按任意键开始 · 1/2/3 切换赛道"所在元素），若无可定位 id 则补 `id="menu-hint"`（B4 用它更新分屏提示）
- `style.css`：`.track-option.selected-p2 { border-color: #4ade80; }`（绿色系，与 P1 黄色区分）+ `#p2-track-name` 排版（与 #track-name 同行/相邻）

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/track-manager.test.ts` + `npm test`

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run bot`

- [x] **Step 6: 提交**

```bash
git add src/game/track-manager.ts src/game/debug-hook.ts index.html src/style.css tests/unit/track-manager.test.ts
git commit -m "feat(track): per-player track selection with dual highlight"
```

#### 实施偏差

1. **`game-loop.ts` 最小适配（计划 Files 未列，API 重构的连带编译破坏）**：`TrackManagerDeps` 删除 `renderer`、新增 `p2TrackName` 后，`game-loop.ts` 必须同步适配才能通过 typecheck，全部纳入本 Task 提交：① TrackManager 构造删 `renderer: () => this.renderer`、补 `p2TrackName: $('p2-track-name') as HTMLSpanElement`；② renderer 构造参数 `this.trackManager.track` → `this.trackManager.getContext(0).segments`（两处，含 `createRoadsideSprites` 入参）；③ keydown 菜单切换 `applyTrack(index)` → `selectTrack(0, index)`，其后 `previewCameraZ = initialPreviewCameraZ(index, this.trackManager.getLapLength(0))`；④ `loadBestTime(this.trackManager.trackDef.id)` → `loadBestTime(this.trackManager.getTrackId(0))`（构造 L166、resetRace、applyPhase FINISHED 共 3 处）；⑤ 其余 `this.trackManager.lapLength`/`totalLaps` 全部 → `getLapLength(0)`/`getTotalLaps(0)`（值不变，保持单玩家语义，P2 双玩家取值留给 B4）；⑥ `installDebugHook` 调用补 `selectedTrack2: () => this.trackManager.getTrackId(1)`（`DebugHookSources` 新增必选字段，不传 typecheck 失败）。
2. **`game-loop-integration.test.ts` 实际零改动（stub 通配已覆盖）**：任务要求 stubEnvironment 的 `getElementById` 补 `'p2-track-name'` 返回最小 fake span，但该 stub 的 `getElementById` 为通配实现（非 `'game'` 的未知 id 一律创建并返回 `createElementStub()`，含可写 `textContent` 与 `classList.toggle`），已天然覆盖 `p2-track-name`；文件无需改动即通过全部 7 用例（含构造后 TrackManager 写入 P2 赛道名）。提交命令仍按清单执行，git add 该文件无 staged 变更。
3. **`index.html` 新增元素形态**：`#p2-track-name` 用 `<p>`（与 `#track-name` 同为 `<p>`，现有 track-name 声明即 `<p>` 而非 span）并加 `hidden` 属性初始隐藏；提示元素补 `id="menu-hint"`。`#track-name` 排版保持不动，`#p2-track-name` 独立绿色样式（相邻成列，非同行——未改 start-screen 布局容器，避免波及现有布局）。
4. **高亮实现**：`updateTrackSelect` 对每个 option 同时 toggle `selected`（P1）与 `selected-p2`（P2）两个类，互不覆盖（双类并存）；`trackName.textContent` 始终取 `contexts[0].def.name`，`p2TrackName` 存在时取 `contexts[1].def.name`。
5. **`selectTrack` 不做越界 guard**：`TRACK_DEFS[trackIndex]` 直接索引，越界由调用方（keydown 已 `index < TRACK_DEFS.length` guard）保证；测试仅覆盖 0-2。
6. **计划文档不随 commit 提交**：本文档自始 untracked（A/B1/B2 均未入库），checkbox 勾选与本节偏差记录保留在工作区，与既有惯例一致。
7. **`applyTrack` 直接删除**：grep 确认除本测试文件外无任何引用（game-loop.test.ts 仅注释提及），无兼容包装需求。

---

### Task B4: GameLoop 分屏双世界集成

**Files:**
- Modify: `src/game/game-loop.ts`（双 previewCameraZ、双 updateTraffic、双渲染 view、keydown 7/8/9、drawDivider 调用、HUD tracks 参数、resetRace 双 refreshTraffic、菜单提示文本、debug hook 注入）
- Modify: `src/ui/hud.ts`（updateHud 参数 lapLength/totalLaps → tracks: [TrackContext, TrackContext]）
- Modify: `src/ui/screens.ts`（无签名变化；GameLoop 传 `tracks[0].def.id`）
- Modify: `tests/unit/hud.test.ts`（新签名）
- Modify: `tests/unit/game-loop-integration.test.ts`（分屏双赛道按键与渲染断言）

**Interfaces:**
```typescript
// hud.ts
updateHud(
  elements: HudElements, race: RaceState, carConfig: CarConfig, bestTime: number | null,
  splitMode: boolean, tracks: [TrackContext, TrackContext], phase: Phase,
): void
// 内部：P1 圈数 formatLap(lapFromZ(player1.cameraZ, tracks[0].lapLength), tracks[0].totalLaps)
//      P2 圈数 formatLap(lapFromZ(player2.cameraZ, tracks[1].lapLength), tracks[1].totalLaps)
```

- [x] **Step 1: 写失败测试**

`hud.test.ts` 更新：构造 `tracks: [createTrackContext(TRACK_DEFS[0]), createTrackContext(TRACK_DEFS[2])]`，断言分屏时 P1 圈数文本按 classic（1/3）、P2 按 s-curve（1/2）格式化（cameraZ 置 0）。
`game-loop-integration.test.ts` 新增：
- 分屏菜单：注入 `Digit1` 后 `__gameDebug.selectedTrack === 'classic'`（默认即 classic，改用 Digit2 → 'highway'）；注入 `Digit8` 后 `selectedTrack2 === 's-curve'`（index 7-1=6 → TRACK_DEFS[1]？注意映射：Digit7 → index 0、Digit8 → index 1、Digit9 → index 2）
- 分屏比赛：P1 全油门跑 3 圈（classic）进入 finished；P2 静止（不污染判定）——沿用现有 finished 驱动方式
- 单人模式：Digit7 不应改变任何选择（guard 断言 selectedTrack 仍 classic）

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/hud.test.ts tests/unit/game-loop-integration.test.ts`
Expected: FAIL（旧签名/无 selectedTrack2）

- [x] **Step 3: 实现（game-loop.ts 全量改动要点）**

1. **字段**：`private previewCameraZ: [number, number] = [0, 0]`（替换单值）；`private readonly trackManager` 用法全部改双索引（`getLapLength(0)` 等）
2. **构造**：TrackManager deps 加 `p2TrackName: $('p2-track-name')`；`this.bestTime = loadBestTime(this.trackManager.getTrackId(0))`
3. **keydown**（L208-236 改造）：
```typescript
if (this.phase === PHASE_MENU && e.code.startsWith('Digit')) {
  const digit = Number(e.code.slice(5))
  if (digit >= 1 && digit <= 3) {
    this.selectTrackFor(0, digit - 1)
    return
  }
  if (this.splitMode && digit >= 7 && digit <= 9) {
    this.selectTrackFor(1, digit - 7)
    return
  }
}
// selectTrackFor(playerIndex, trackIndex)：
//   this.trackManager.selectTrack(playerIndex, trackIndex)
//   const ctx = this.trackManager.getContext(playerIndex)
//   this.previewCameraZ[playerIndex] = initialPreviewCameraZ(trackIndex, ctx.lapLength)
```
4. **菜单分屏渲染**（L290-292 改造）：
```typescript
this.renderer.renderRegion(this.previewCameraZ[0], 0, w / 2, [], 0, viewFor(this.race.tracks[0]))
this.renderer.renderRegion(this.previewCameraZ[1], w / 2, w / 2, [], 0, viewFor(this.race.tracks[1]))
this.renderer.drawDivider(w / 2)
```
辅助（模块级）：
```typescript
function viewFor(ctx: TrackContext): RenderView {
  return { track: ctx.segments, curvePrefixSum: ctx.curvePrefixSum, spriteIndex: ctx.spriteIndex, traffic: ctx.traffic }
}
```
菜单单屏渲染（L294）：`render(previewCameraZ[0], [], 0, viewFor(this.race.tracks[0]))`；`advancePreviewCameraZ` 用 `tracks[0].lapLength` / `tracks[1].lapLength` 分别推进 `previewCameraZ[0]`、`previewCameraZ[1]`（菜单阶段两玩家预览都滚动）
5. **比赛分屏渲染**（L297-314）：renderRegion 各传对应 view；之后 `drawDivider(w / 2)`；单屏 render 传 `viewFor(tracks[0])`
6. **比赛更新**：`updateTraffic` 双调用（B1 已做）；`updatePlayerFrame` P1 用 `tracks[0].lapLength`、P2 用 `tracks[1].lapLength`；完赛判定 `lapFromZ(player1.cameraZ, tracks[0].lapLength) > tracks[0].totalLaps`（P2 同理）；`updateCollisions(race, dt, splitMode)` 不变
7. **resetRace**：`resetRaceState(this.race)` + `refreshTraffic(tracks[0])` + `refreshTraffic(tracks[1])`；`bestTime = loadBestTime(getTrackId(0))`；删除 `renderer.setTraffic` 调用
8. **HUD 调用**：`updateHud(hudElements, race, carConfig, bestTime, splitMode, this.race.tracks, this.phase)`
9. **applyPhase**：`applyPhaseToScreens(..., this.trackManager.getTrackId(0))`；FINISHED 时 `loadBestTime(getTrackId(0))`
10. **菜单提示文本**：构造时若 splitMode，把 `#menu-hint`（或确认到的提示元素）文本更新为"P1: 1/2/3 选赛道 · P2: 7/8/9 选赛道 · 任意键开始"
11. **debug hook**：`selectedTrack: () => this.trackManager.getTrackId(0)`、`selectedTrack2: () => this.trackManager.getTrackId(1)`、`trafficCount: () => this.race.tracks[0].traffic.length`

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/hud.test.ts tests/unit/game-loop-integration.test.ts tests/unit/game-loop.test.ts tests/unit/track-manager.test.ts tests/unit/renderer-state.test.ts` + `npm test`

- [x] **Step 5: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`

- [x] **Step 6: 提交**

```bash
git add src/game/game-loop.ts src/ui/hud.ts tests/unit/hud.test.ts tests/unit/game-loop-integration.test.ts
git commit -m "feat(split): integrate dual-world rendering, per-player track selection and HUD laps"
```

#### 实施偏差

1. **P2 按键映射以对称映射为准（任务描述内部矛盾）**：任务要点期望 `Digit8 → selectedTrack2 === 's-curve'`，但其同句括号注释（Digit7→index0、Digit8→index1、Digit9→index2）与实现规范 `selectTrackFor(1, digit - 7)` 均为 Digit8 → index1 = highway。按全局约束"P2 用 7/8/9 选赛道"与 P1 的 1/2/3 对称映射为准，测试断言改为 Digit8 → 'highway'、追加 Digit9 → 's-curve' 覆盖 index2 边界。
2. **`selectTrackFor` 额外同步 `race.tracks`（任务清单未列，但逻辑必需）**：`TrackManager.selectTrack` 只重建 `trackManager.contexts`，而 B4 的渲染视图/HUD/`advancePreviewCameraZ` 均取 `race.tracks`（B1 由 `createRaceState` 创建、与 trackManager 无联动）。若不同步，选赛道后渲染画面/圈长/车流仍全部为旧赛道。`selectTrackFor` 在 `selectTrack` 后追加 `this.race.tracks[playerIndex] = this.trackManager.getContext(playerIndex)`（此后二者同对象引用，渲染/HUD/圈长三者一致）。副作用：selectTrack 内部触发的 resetRace 会对旧 context 先刷新一次车流（随即被丢弃），无害。
3. **菜单提示文案以任务指令为准**：任务要求"P1: 1/2/3 选赛道 · P2: 7/8/9 选赛道 · 按任意键开始"（计划 Step 3 第 10 点写作"任意键开始"）；构造时用 `document.getElementById('menu-hint')` 安全判空（index.html 已带该 id，stub 环境通配创建亦覆盖）。
4. **`game-loop.test.ts` 零改动**：`updatePlayerFrame`/`advancePreviewCameraZ`/`initialPreviewCameraZ` 纯函数签名未变，GameLoop 内部变化（previewCameraZ 数组化）不波及该文件，不在提交清单。
5. **integration 测试环境扩展**：`stubEnvironment` 新增 `debugValue(key)` 读取 `window.__gameDebug` 任意字段（现有 `phase()` 仅读 phase），供 `selectedTrack`/`selectedTrack2` 断言；属测试基础设施，非被测实现。
6. **全量验证结果**：`typecheck`/`lint` 通过；全量 32 文件 285 用例通过（含新增 hud 2 用例、integration 3 用例）；`build` 产物 dist/index.html 2.01 kB + js 28.59 kB；`bot` 3 圈 76.017s 0 违规（与基线一致，单人模式无回归）。commit `1152662`。

---

### Task B5: 全量验证 + 浏览器冒烟（双赛道分屏）

**Files:**
- Create: `test-m6.py`（Playwright 冒烟脚本，放项目根目录；参照既有 `test-final.py` 的 chromium executable_path 写法）
- Create: `shots/m6/*.png`（gitignore 已覆盖 shots/，不入库）

- [ ] **Step 1: 全量验证链**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`
Expected: 全绿；bot 3 圈 76.017s 0 违规（与基线一致，验证单人模式无回归）

- [ ] **Step 2: 浏览器冒烟（test-m6.py）**

场景（headless chromium）：
1. 打开 `http://localhost:5175/?split=1`（dev server 先启动）
2. 菜单：注入 `Digit2`（P1 → highway）、`Digit8`（P2 → s-curve）；断言 `__gameDebug.selectedTrack === 'highway'`、`selectedTrack2 === 's-curve'`；截图 `shots/m6/menu-dual-track.png`（左右预览应不同：左直道/右弯道）
3. 开始比赛：注入 Enter/任意键 → racing；P1 按住 W 3 秒、P2 按住 ArrowUp 3 秒；截图 `shots/m6/racing-dual-track.png`；断言 `__gameDebug.phase === 'racing'`
4. 断言 HUD 圈数：P1 `LAP 1/3`、P2 `LAP 1/2`（读取 #hud-lap / #hud-lap-2 文本）
5. 单人模式回归：打开无 `?split` 的页面，菜单注入 `Digit7`，断言 selectedTrack 仍 'classic'（7/8/9 无效）、注入 `Digit3` 后为 's-curve'
6. 截图全部保存后停止 dev server

- [ ] **Step 3: observer 复核截图**

调 observer 分析 `shots/m6/` 截图，重点确认：
- 分隔线存在且交界处无路缘石交错/三角形重叠
- 分屏菜单左右预览明显不同（两赛道）
- 分屏比赛左右画面各自独立滚动、HUD 圈数各自正确（1/3 vs 1/2）
- 单人模式画面无回归（树木/车流尺寸正常）

- [ ] **Step 4: 汇总报告**

向用户汇报：实现内容、验证结果（全量命令输出 + observer 结论）、遗留问题。文档各 Task checkbox 全部勾选 + 实施偏差已记录。若浏览器验证发现问题，按 systematic-debugging 流程定位修复（新增 hotfix Task 追加到本文档末尾）。

---

## 全局文件影响清单（执行顺序依据）

| 文件 | A | B1 | B2 | B3 | B4 |
|---|---|---|---|---|---|
| src/engine/renderer.ts | ✔ | | ✔ | | |
| src/game/game-loop.ts | ✔ | ✔ | | | ✔ |
| src/game/state.ts | | ✔ | | | |
| src/game/collision.ts | | ✔ | | | |
| src/game/track-context.ts（新建） | | ✔ | | | |
| src/engine/sprites.ts | | （仅导入） | | | |
| src/game/track-manager.ts | | | | ✔ | |
| src/game/debug-hook.ts | | | | ✔ | |
| index.html / style.css | | | | ✔ | |
| src/ui/hud.ts | | | | | ✔ |
| tests/*（6 个文件） | ✔ | ✔ | ✔ | ✔ | ✔ |

> 依赖约束：A → B1 → B2 → B3 → B4 → B5 **必须串行**（B1-B4 在 game-loop/renderer/track-manager 上有重叠写入；每个 Task 完成即提交，避免并发中间态）。
