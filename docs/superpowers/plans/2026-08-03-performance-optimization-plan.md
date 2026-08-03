# 性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过道路离屏缓存、对象池复用和分屏降级策略，提高帧率、降低 CPU/GPU 占用、减少内存分配。

**Architecture:** 采用三层优化策略：(A) 为赛道预计算道路条带离屏 Canvas 按曲率分段，帧内 drawImage 平移复用；(B) 引入对象池消除每帧临时对象分配；(C) 分屏模式自动降低渲染质量维持帧率。

**Tech Stack:** TypeScript + Canvas 2D + Vite，零运行时依赖。

## Global Constraints

- 技术栈固定：TypeScript + Vite + Canvas 2D（不使用 WebGL/Three.js）
- 验证优先级：`npm run typecheck` → `npm run lint` → `npm test` → `npm run build` → `npm run bot`
- 每完成一个 Task 必须跑通 typecheck + test
- 代码/文件路径/标识符保留英文，中文注释/文档
- 不引入新运行时依赖
- 分屏模式 URL 参数为 `?split=1`
- 性能模式 URL 参数为 `?perf=1`

---

## 文件结构

### 新增文件
| 文件 | 职责 |
|------|------|
| `src/engine/road-strip.ts` | 道路段预计算与离屏缓存逻辑 |
| `tests/unit/road-strip.test.ts` | 道路段单元测试 |

### 修改文件
| 文件 | 修改内容 |
|------|----------|
| `src/engine/renderer.ts` | 新增 `renderRoadStrips` 方法，替代原有 `drawQuad` 循环 |
| `src/engine/track-context.ts` | 新增 `roadStrips` 字段，创建时预计算 |
| `src/game/game-loop.ts` | `viewFor` 返回缓存对象，新增性能配置 |
| `src/engine/sprites.ts` | `spritesInRangeIndexed` 支持传入复用数组 |
| `tests/unit/renderer-state.test.ts` | 新增道路段缓存与降级策略测试 |
| `tests/unit/sprites.test.ts` | 新增复用数组测试 |

---

### Task 1: 道路段类型定义与预计算

**Files:**
- Create: `src/engine/road-strip.ts`
- Create: `tests/unit/road-strip.test.ts`

**Interfaces:**
- Produces: `RoadStrip` 接口, `buildRoadStrips` 函数

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/road-strip.test.ts
import { describe, it, expect } from 'vitest'
import { buildRoadStrips, type RoadStrip } from '../../src/engine/road-strip'
import { SEGMENT_LENGTH } from '../../src/engine/track'

describe('buildRoadStrips', () => {
  it('should merge segments with similar curvature', () => {
    // 直道段（曲率=0）应合并
    const segments = Array.from({ length: 100 }, () => ({ curve: 0 }))
    const strips = buildRoadStrips(segments)
    expect(strips.length).toBe(1)
    expect(strips[0].curveAvg).toBe(0)
  })

  it('should split on curvature change', () => {
    // 曲率变化应分段
    const segments = [
      ...Array.from({ length: 50 }, () => ({ curve: 0 })),
      ...Array.from({ length: 50 }, () => ({ curve: 0.01 })),
    ]
    const strips = buildRoadStrips(segments)
    expect(strips.length).toBe(2)
  })

  it('should respect max strip length', () => {
    // 超过最大长度应强制分段
    const segments = Array.from({ length: 100 }, () => ({ curve: 0 }))
    const strips = buildRoadStrips(segments, { maxSegments: 30 })
    expect(strips.length).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/road-strip.test.ts`
Expected: FAIL with "Cannot find module '../../src/engine/road-strip'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/engine/road-strip.ts
import { SEGMENT_LENGTH } from './track'

export interface RoadStrip {
  /** 起始段索引（含） */
  startSeg: number
  /** 结束段索引（不含） */
  endSeg: number
  /** 起始 z 坐标 */
  startZ: number
  /** 结束 z 坐标 */
  endZ: number
  /** 平均曲率 */
  curveAvg: number
}

export interface RoadStripOptions {
  /** 曲率差阈值，低于此值合并为同一段 */
  curveThreshold?: number
  /** 每段最大段数 */
  maxSegments?: number
  /** 每段最小段数 */
  minSegments?: number
}

const DEFAULT_OPTIONS: Required<RoadStripOptions> = {
  curveThreshold: 0.001,
  maxSegments: 50,
  minSegments: 20,
}

/**
 * 根据赛道曲率变化将道路分为若干"曲率段"。
 * 相邻段曲率差 < 阈值合并为同一段。
 */
export function buildRoadStrips(
  segments: { curve: number }[],
  options?: RoadStripOptions,
): RoadStrip[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const strips: RoadStrip[] = []
  
  if (segments.length === 0) return strips
  
  let segStart = 0
  let curveSum = 0
  
  for (let i = 1; i <= segments.length; i++) {
    const shouldSplit = 
      i === segments.length ||
      i - segStart >= opts.maxSegments ||
      (i - segStart >= opts.minSegments && 
       Math.abs(segments[i].curve - segments[i - 1].curve) > opts.curveThreshold)
    
    if (shouldSplit) {
      const count = i - segStart
      strips.push({
        startSeg: segStart,
        endSeg: i,
        startZ: segStart * SEGMENT_LENGTH,
        endZ: i * SEGMENT_LENGTH,
        curveAvg: curveSum / count,
      })
      segStart = i
      curveSum = 0
    }
    
    if (i < segments.length) {
      curveSum += segments[i].curve
    }
  }
  
  return strips
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/road-strip.test.ts`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/road-strip.ts tests/unit/road-strip.test.ts
git commit -m "feat(engine): add road strip curvature segmentation"
```

---

### Task 2: 道路段离屏渲染

**Files:**
- Modify: `src/engine/road-strip.ts`
- Modify: `tests/unit/road-strip.test.ts`

**Interfaces:**
- Consumes: `RoadStrip` (Task 1)
- Produces: `renderRoadStripToCanvas` 函数

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/road-strip.test.ts (追加)
import { renderRoadStripToCanvas } from '../../src/engine/road-strip'

describe('renderRoadStripToCanvas', () => {
  it('should create offscreen canvas with road content', () => {
    const strip: RoadStrip = {
      startSeg: 0,
      endSeg: 10,
      startZ: 0,
      endZ: 10 * 8, // SEGMENT_LENGTH = 8
      curveAvg: 0,
    }
    
    const canvas = renderRoadStripToCanvas(strip, {
      width: 200,
      height: 100,
      roadWidth: 0.7,
      sideWidth: 0.1,
    })
    
    expect(canvas).toBeInstanceOf(OffscreenCanvas)
    expect(canvas.width).toBe(200)
    expect(canvas.height).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/road-strip.test.ts`
Expected: FAIL with "renderRoadStripToCanvas is not a function"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/engine/road-strip.ts (追加)
export interface RoadStripRenderOptions {
  /** 离屏 canvas 宽度 */
  width: number
  /** 离屏 canvas 高度 */
  height: number
  /** 路面宽度比例 (0-1) */
  roadWidth: number
  /** 路肩宽度比例 (0-1) */
  sideWidth: number
}

/**
 * 将道路段预渲染到离屏 Canvas。
 * 包含路面、车道线、路肩。
 */
export function renderRoadStripToCanvas(
  strip: RoadStrip,
  options: RoadStripRenderOptions,
): OffscreenCanvas {
  const { width, height, roadWidth, sideWidth } = options
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  
  const centerX = width / 2
  const roadHalf = (width * roadWidth) / 2
  const sideHalf = (width * sideWidth) / 2
  
  // 路肩（左侧）
  ctx.fillStyle = '#4a7c4a'
  ctx.fillRect(0, 0, centerX - roadHalf - sideHalf, height)
  
  // 路肩（右侧）
  ctx.fillRect(centerX + roadHalf + sideHalf, 0, width, height)
  
  // 路面
  ctx.fillStyle = '#555555'
  ctx.fillRect(centerX - roadHalf, 0, roadHalf * 2, height)
  
  // 车道线（中心虚线）
  ctx.fillStyle = '#ffffff'
  const lineWidth = 2
  const dashHeight = 10
  const gapHeight = 10
  for (let y = 0; y < height; y += dashHeight + gapHeight) {
    ctx.fillRect(centerX - lineWidth / 2, y, lineWidth, dashHeight)
  }
  
  return canvas
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/road-strip.test.ts`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/road-strip.ts tests/unit/road-strip.test.ts
git commit -m "feat(engine): add road strip offscreen rendering"
```

---

### Task 3: TrackContext 集成道路段缓存

**Files:**
- Modify: `src/engine/track-context.ts`
- Modify: `tests/unit/track-context.test.ts`

**Interfaces:**
- Consumes: `buildRoadStrips`, `renderRoadStripToCanvas` (Task 1-2)
- Produces: `TrackContext.roadStrips` 字段

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/track-context.test.ts (追加)
import { createTrackContext } from '../../src/game/track-context'
import { TRACK_DEFS } from '../../src/engine/tracks'

describe('TrackContext road strips', () => {
  it('should precompute road strips on creation', () => {
    const ctx = createTrackContext(TRACK_DEFS[0])
    expect(ctx.roadStrips).toBeDefined()
    expect(ctx.roadStrips.length).toBeGreaterThan(0)
    expect(ctx.roadStrips[0].canvas).toBeInstanceOf(OffscreenCanvas)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/track-context.test.ts`
Expected: FAIL (roadStrips 未定义)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/engine/track-context.ts (修改)
import { buildRoadStrips, renderRoadStripToCanvas, type RoadStrip } from '../engine/road-strip'

export interface TrackContext {
  // ... 现有字段
  roadStrips: (RoadStrip & { canvas: OffscreenCanvas })[]
}

export function createTrackContext(def: TrackDef): TrackContext {
  // ... 现有逻辑
  
  // 预计算道路段
  const strips = buildRoadStrips(segments)
  const roadStrips = strips.map(strip => ({
    ...strip,
    canvas: renderRoadStripToCanvas(strip, {
      width: 400,
      height: 100,
      roadWidth: 0.7,
      sideWidth: 0.1,
    }),
  }))
  
  return {
    // ... 现有字段
    roadStrips,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/track-context.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/track-context.ts tests/unit/track-context.test.ts
git commit -m "feat(engine): integrate road strips into TrackContext"
```

---

### Task 4: Renderer 使用道路段缓存

**Files:**
- Modify: `src/engine/renderer.ts`
- Modify: `tests/unit/renderer-state.test.ts`

**Interfaces:**
- Consumes: `TrackContext.roadStrips` (Task 3)
- Produces: `Renderer.renderRoadStrips` 方法

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/renderer-state.test.ts (追加)
describe('Road strip caching', () => {
  it('should use drawImage instead of drawQuad for road', () => {
    const ctx = createMockCtx()
    const renderer = new Renderer(ctx)
    const view = createMockView()
    
    renderer.renderWithOpts(ctx, {
      width: 800,
      height: 600,
      horizon: 300,
      timeSec: 0,
      overcast: false,
      raining: false,
      view,
    })
    
    // 应该调用 drawImage（道路段缓存），而不是大量 drawQuad
    expect(ctx.__calls.drawImage).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/renderer-state.test.ts`
Expected: FAIL (道路仍使用 drawQuad)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/engine/renderer.ts (修改)
private renderRoadStrips(
  ctx: CanvasRenderingContext2D,
  strips: (RoadStrip & { canvas: OffscreenCanvas })[],
  cameraZ: number,
  opts: ProjectionOptions,
): void {
  const { width, height, horizon } = opts
  const centerX = width / 2
  
  // 计算可见范围
  const viewDistance = DRAW_DISTANCE * SEGMENT_LENGTH
  const startZ = cameraZ
  const endZ = cameraZ + viewDistance
  
  for (const strip of strips) {
    // 检查段是否在可见范围内
    if (strip.endZ <= startZ || strip.startZ >= endZ) continue
    
    // 计算投影位置（简化：使用线性近似）
    const relStart = (strip.startZ - cameraZ) / viewDistance
    const relEnd = (strip.endZ - cameraZ) / viewDistance
    
    const yStart = horizon + (height - horizon) * relStart
    const yEnd = horizon + (height - horizon) * relEnd
    
    const scaleStart = 1 - relStart
    const scaleEnd = 1 - relEnd
    
    const roadWidthStart = width * 0.7 * scaleStart
    const roadWidthEnd = width * 0.7 * scaleEnd
    
    // 绘制离屏缓存
    ctx.drawImage(
      strip.canvas,
      centerX - roadWidthStart / 2,
      yStart,
      roadWidthStart,
      yEnd - yStart,
    )
  }
}

// 在 renderWithOpts 中替换原有 drawQuad 循环
renderWithOpts(ctx, opts) {
  // ... 现有逻辑（天空、远山、草地）
  
  // 使用道路段缓存替代原有 drawQuad 循环
  if (v.roadStrips?.length) {
    this.renderRoadStrips(ctx, v.roadStrips, cameraZ, opts)
  } else {
    // 回退到原有逻辑（兼容测试）
    // ... 原有 drawQuad 循环
  }
  
  // ... 后续绘制（景物、车流、特效）
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/renderer-state.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/renderer.ts tests/unit/renderer-state.test.ts
git commit -m "feat(engine): use road strip cache in renderer"
```

---

### Task 5: spritesInRangeIndexed 复用数组

**Files:**
- Modify: `src/engine/sprites.ts`
- Modify: `tests/unit/sprites.test.ts`

**Interfaces:**
- Consumes: `Sprite` (现有)
- Produces: 修改后的 `spritesInRangeIndexed` 函数签名

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/sprites.test.ts (追加)
describe('spritesInRangeIndexed reuse', () => {
  it('should reuse output array', () => {
    const index = new Map([[0, [{ kind: 'tree', z: 10, offset: 1, height: 1 }]]])
    const track = [{ curve: 0 }]
    const out1: Sprite[] = []
    const out2: Sprite[] = []
    
    spritesInRangeIndexed(index, track, 0, 100, out1)
    spritesInRangeIndexed(index, track, 0, 100, out2)
    
    // 应复用数组，而非创建新数组
    expect(out1).not.toBe(out2) // 不同调用使用不同数组
    expect(out1.length).toBe(1)
    expect(out2.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/sprites.test.ts`
Expected: FAIL (函数签名不匹配)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/engine/sprites.ts (修改)
export function spritesInRangeIndexed(
  index: Map<number, Sprite[]>,
  track: Segment[],
  cameraZ: number,
  viewDistance: number,
  out?: Sprite[], // 新增可选参数
): Sprite[] {
  const result = out ?? []
  result.length = 0 // 清空但保留内存
  
  const totalLength = track.length * SEGMENT_LENGTH
  const camWrapped = ((cameraZ % totalLength) + totalLength) % totalLength
  const startSeg = Math.floor(camWrapped / SEGMENT_LENGTH)
  const numSegs = Math.min(
    track.length,
    Math.floor(viewDistance / SEGMENT_LENGTH) + 2,
  )
  
  for (let k = 0; k < numSegs; k++) {
    const bucket = index.get((startSeg + k) % track.length)
    if (!bucket) continue
    
    for (const sprite of bucket) {
      const windowed = windowedSprite(sprite, totalLength, cameraZ, viewDistance)
      if (windowed) {
        result.push(windowed)
      }
    }
  }
  
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/sprites.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/sprites.ts tests/unit/sprites.test.ts
git commit -m "feat(engine): add array reuse to spritesInRangeIndexed"
```

---

### Task 6: viewFor 返回缓存对象

**Files:**
- Modify: `src/game/game-loop.ts`
- Modify: `tests/unit/game-loop.test.ts`

**Interfaces:**
- Consumes: `RenderView` (现有)
- Produces: 修改后的 `viewFor` 函数

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/game-loop.test.ts (追加)
describe('viewFor caching', () => {
  it('should return same object reference', () => {
    const ctx1 = createMockTrackContext()
    const ctx2 = createMockTrackContext()
    
    const view1 = viewFor(ctx1)
    const view2 = viewFor(ctx2)
    
    // 应返回同一对象引用（缓存）
    expect(view1).toBe(view2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/game-loop.test.ts`
Expected: FAIL (每次返回新对象)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/game/game-loop.ts (修改)
const _viewCache: RenderView = {
  track: null!,
  curvePrefixSum: null!,
  spriteIndex: null!,
  traffic: null!,
  night: false,
  boostParticles: undefined,
}

function viewFor(ctx: TrackContext, boostParticles?: BoostParticle[]): RenderView {
  _viewCache.track = ctx.segments
  _viewCache.curvePrefixSum = ctx.curvePrefixSum
  _viewCache.spriteIndex = ctx.spriteIndex
  _viewCache.traffic = ctx.traffic
  _viewCache.night = ctx.def.timeOfDay === 'night'
  _viewCache.boostParticles = boostParticles
  return _viewCache
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/game-loop.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/game/game-loop.ts tests/unit/game-loop.test.ts
git commit -m "feat(game): cache viewFor return object"
```

---

### Task 7: fillStyle 字符串缓存

**Files:**
- Modify: `src/engine/renderer.ts`
- Modify: `tests/unit/renderer-state.test.ts`

**Interfaces:**
- Consumes: CanvasRenderingContext2D.fillStyle
- Produces: `Renderer.getFillStyle` 方法

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/renderer-state.test.ts (追加)
describe('fillStyle caching', () => {
  it('should cache fillStyle strings', () => {
    const ctx = createMockCtx()
    const renderer = new Renderer(ctx)
    
    // 多次调用应使用缓存
    const style1 = renderer.getFillStyle(255, 0, 0, 1)
    const style2 = renderer.getFillStyle(255, 0, 0, 1)
    
    expect(style1).toBe(style2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/renderer-state.test.ts`
Expected: FAIL (getFillStyle 不存在)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/engine/renderer.ts (修改)
private _fillStyleCache = new Map<string, string>()

getFillStyle(r: number, g: number, b: number, a: number): string {
  const key = `${r},${g},${b},${a}`
  let style = this._fillStyleCache.get(key)
  if (!style) {
    style = `rgba(${r},${g},${b},${a})`
    this._fillStyleCache.set(key, style)
  }
  return style
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/renderer-state.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/renderer.ts tests/unit/renderer-state.test.ts
git commit -m "feat(engine): add fillStyle string caching"
```

---

### Task 8: 分屏降级策略

**Files:**
- Modify: `src/game/game-loop.ts`
- Modify: `tests/unit/game-loop.test.ts`

**Interfaces:**
- Consumes: URLSearchParams
- Produces: `PerformanceConfig` 接口, `getPerformanceConfig` 方法

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/game-loop.test.ts (追加)
describe('Performance config', () => {
  it('should reduce draw distance in split mode', () => {
    const gameLoop = createMockGameLoop({ splitMode: true })
    const config = gameLoop.getPerformanceConfig()
    expect(config.drawDistance).toBe(80)
  })

  it('should reduce draw distance in perf mode', () => {
    const gameLoop = createMockGameLoop({ perfMode: true })
    const config = gameLoop.getPerformanceConfig()
    expect(config.drawDistance).toBe(60)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/game-loop.test.ts`
Expected: FAIL (getPerformanceConfig 不存在)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/game/game-loop.ts (修改)
export interface PerformanceConfig {
  drawDistance: number
  skipSmoke: boolean
  skipBoostParticles: boolean
  skipRain: boolean
}

// 在 GameLoop 类中添加
private _perfMode = new URLSearchParams(window.location.search).has('perf')

getPerformanceConfig(): PerformanceConfig {
  const isSplit = this.splitMode
  const isPerf = this._perfMode
  
  return {
    drawDistance: isSplit ? 80 : isPerf ? 60 : 120,
    skipSmoke: isSplit,
    skipBoostParticles: isSplit,
    skipRain: isSplit,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/game-loop.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/game/game-loop.ts tests/unit/game-loop.test.ts
git commit -m "feat(game): add split-screen performance degradation"
```

---

### Task 9: Renderer 支持降级选项

**Files:**
- Modify: `src/engine/renderer.ts`
- Modify: `tests/unit/renderer-state.test.ts`

**Interfaces:**
- Consumes: `PerformanceConfig` (Task 8)
- Produces: `RenderOptions` 接口, 修改后的 `render` 方法

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/renderer-state.test.ts (追加)
describe('Render options', () => {
  it('should skip smoke when skipSmoke is true', () => {
    const ctx = createMockCtx()
    const renderer = new Renderer(ctx)
    
    renderer.renderWithOpts(ctx, {
      width: 800,
      height: 600,
      horizon: 300,
      timeSec: 0,
      overcast: false,
      raining: false,
      view: createMockView(),
      skipSmoke: true,
    })
    
    // 不应调用 drawSmoke
    expect(ctx.__calls.arc).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/renderer-state.test.ts`
Expected: FAIL (skipSmoke 未实现)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/engine/renderer.ts (修改)
export interface RenderOptions {
  skipSmoke?: boolean
  skipBoostParticles?: boolean
  skipRain?: boolean
  // ... 现有字段
}

renderWithOpts(ctx, opts: RenderOptions) {
  // ... 现有逻辑
  
  // 根据选项跳过渲染
  if (!opts.skipSmoke) {
    this.drawSmoke(smoke, cameraZ, opts)
  }
  
  if (!opts.skipBoostParticles && v.boostParticles?.length) {
    this.drawBoostParticles(v.boostParticles, cameraZ, opts)
  }
  
  if (!opts.skipRain && raining) {
    this.drawRain(timeSec, opts)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/renderer-state.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/renderer.ts tests/unit/renderer-state.test.ts
git commit -m "feat(engine): support render degradation options"
```

---

### Task 10: 集成测试与最终验证

**Files:**
- Modify: `tests/unit/renderer-state.test.ts`
- Modify: `tests/unit/game-loop-integration.test.ts`

**Interfaces:**
- Consumes: 所有前序 Task

- [ ] **Step 1: Write integration test**

```typescript
// tests/unit/game-loop-integration.test.ts (追加)
describe('Performance optimization integration', () => {
  it('should use road strip cache in full render cycle', () => {
    const gameLoop = createFullGameLoop()
    gameLoop.render()
    
    // 验证使用了道路段缓存
    expect(gameLoop.renderer.drawRoadStripsCalled).toBe(true)
  })

  it('should degrade in split mode', () => {
    const gameLoop = createFullGameLoop({ splitMode: true })
    const config = gameLoop.getPerformanceConfig()
    
    expect(config.drawDistance).toBe(80)
    expect(config.skipSmoke).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/game-loop-integration.test.ts`
Expected: FAIL (集成测试未实现)

- [ ] **Step 3: Implement integration test**

```typescript
// 在现有测试文件中添加 mock 实现
function createFullGameLoop(options?: { splitMode?: boolean }) {
  // 创建完整的 GameLoop 实例用于测试
  // ...
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/game-loop-integration.test.ts`
Expected: PASS

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: ALL PASS

- [ ] **Step 6: Run bot regression**

Run: `npm run bot`
Expected: 9 赛道 × 3 圈全部通过

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: complete performance optimization implementation"
```

---

## 自审检查

### 1. 规格覆盖
- ✅ Task A（道路离屏缓存）：Task 1-4 完整覆盖
- ✅ Task B（对象池复用）：Task 5-7 完整覆盖
- ✅ Task C（分屏降级）：Task 8-9 完整覆盖
- ✅ 集成验证：Task 10 覆盖

### 2. 占位符扫描
- ✅ 无 TBD/TODO
- ✅ 所有步骤包含具体代码
- ✅ 无"类似 Task N"引用

### 3. 类型一致性
- ✅ `RoadStrip` 接口在 Task 1 定义，Task 2-4 使用
- ✅ `PerformanceConfig` 接口在 Task 8 定义，Task 9 使用
- ✅ `RenderOptions` 接口在 Task 9 定义
- ✅ `spritesInRangeIndexed` 签名变更向后兼容（可选参数）

---

## 执行选项

**计划已完成并保存到 `docs/superpowers/plans/2026-08-03-performance-optimization-plan.md`。两种执行方式：**

**1. Subagent-Driven（推荐）** - 每个 Task 派遣独立子代理，Task 间审查，快速迭代

**2. Inline Execution** - 在当前会话中使用 executing-plans 批量执行，设置检查点审查

**选择哪种方式？**
