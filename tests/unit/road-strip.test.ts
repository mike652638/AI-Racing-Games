import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildRoadStrips, renderRoadStripToCanvas, type RoadStrip } from '../../src/engine/road-strip'
import { EDGE_WIDTH, ROAD_HALF_WIDTH } from '../../src/game/constants'

// node 测试环境无 OffscreenCanvas，提供最小 mock（记录 fillRect 调用序列供纹理布局断言）
interface MockFillRect {
  fillStyle: string
  x: number
  y: number
  w: number
  h: number
}

/** 按部分字段匹配查找矩形（数值字段容差 1e-6，规避 ROAD_RATIO/SIDE_RATIO 浮点误差） */
function findRect(canvas: MockOffscreenCanvas, match: Partial<MockFillRect>): MockFillRect | undefined {
  return canvas.fillRects.find((r) =>
    (Object.keys(match) as (keyof MockFillRect)[]).every((k) => {
      const v = match[k]
      if (typeof v === 'number') return Math.abs((r[k] as number) - v) < 1e-6
      return r[k] === v
    }),
  )
}

class MockOffscreenCanvas {
  width: number
  height: number
  /** getContext().fillRect 的调用序列（含 fillStyle 快照） */
  fillRects: MockFillRect[] = []

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  getContext() {
    const ctx: {
      fillStyle: string
      fillRect: (x: number, y: number, w: number, h: number) => void
    } = { fillStyle: '', fillRect: () => undefined }
    // 箭头函数词法捕获 getContext 的 this（= canvas 实例），无需 this 别名
    ctx.fillRect = (x, y, w, h) => {
      this.fillRects.push({ fillStyle: ctx.fillStyle, x, y, w, h })
    }
    return ctx
  }
}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas)
})

describe('buildRoadStrips', () => {
  it('should merge segments with similar curvature', () => {
    // 直道段（曲率=0）应合并（传足够大的 maxSegments 排除强制上限干扰）
    const segments = Array.from({ length: 100 }, () => ({ curve: 0 }))
    const strips = buildRoadStrips(segments, { maxSegments: 1000 })
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

describe('renderRoadStripToCanvas', () => {
  const strip04: RoadStrip = {
    startSeg: 0,
    endSeg: 4,
    startZ: 0,
    endZ: 4 * 200, // SEGMENT_LENGTH = 200
    curveAvg: 0,
  }
  // width=230 使各比例换算为整数：TOTAL=2×1+2×0.15=2.3 → roadHalf=100、sideHalf=15
  const WIDTH = 230

  it('should create offscreen canvas with per-segment texture rows', () => {
    const strip: RoadStrip = {
      startSeg: 0,
      endSeg: 10,
      startZ: 0,
      endZ: 10 * 200, // SEGMENT_LENGTH = 200
      curveAvg: 0,
    }

    const canvas = renderRoadStripToCanvas(strip, { width: 200 })

    expect(canvas).toBeInstanceOf(OffscreenCanvas)
    expect(canvas.width).toBe(200)
    // 纹理高度 = 段数 × 每段像素（默认 4px/段）
    expect(canvas.height).toBe(10 * 4)
  })

  it('should respect custom pixelsPerSegment', () => {
    const canvas = renderRoadStripToCanvas(strip04, { width: 200, pixelsPerSegment: 8 })
    expect(canvas.height).toBe(4 * 8)
  })

  it('should alternate road/side colors by segment parity (与逐段渲染 roadColors 一致)', () => {
    const canvas = renderRoadStripToCanvas(strip04, { width: WIDTH }) as unknown as MockOffscreenCanvas
    const total = 2 * ROAD_HALF_WIDTH + 2 * EDGE_WIDTH
    const roadHalf = (WIDTH * ((2 * ROAD_HALF_WIDTH) / total)) / 2

    // 段 0（偶）：深灰路面 + 红路缘；段 1（奇）：浅灰路面 + 白路缘
    expect(findRect(canvas, { y: 0, x: WIDTH / 2 - roadHalf })?.fillStyle).toBe('#4a4a4a')
    expect(findRect(canvas, { y: 4, x: WIDTH / 2 - roadHalf })?.fillStyle).toBe('#3c3c3c')
    expect(findRect(canvas, { y: 0, x: 0 })?.fillStyle).toBe('#d03030')
    expect(findRect(canvas, { y: 4, x: 0 })?.fillStyle).toBe('#e8e8e8')
    // 右路缘同样交替
    expect(findRect(canvas, { y: 0, x: WIDTH / 2 + roadHalf })?.fillStyle).toBe('#d03030')
  })

  it('should draw center line only on even segments (烘焙进纹理)', () => {
    const canvas = renderRoadStripToCanvas(strip04, { width: WIDTH }) as unknown as MockOffscreenCanvas
    const total = 2 * ROAD_HALF_WIDTH + 2 * EDGE_WIDTH
    const roadHalf = (WIDTH * ((2 * ROAD_HALF_WIDTH) / total)) / 2
    // 线宽 = 路面宽 × 0.06（与逐段渲染 (cur.r1.x - cur.l1.x) * 0.06 一致）
    const lineHalf = roadHalf * 2 * 0.06 * 0.5
    const lineRect0 = findRect(canvas, { y: 0, w: lineHalf * 2, fillStyle: '#e8e8e8' })
    expect(lineRect0).toBeDefined()
    expect(lineRect0?.x).toBeCloseTo(WIDTH / 2 - lineHalf)
    // 奇数段无中心线
    expect(findRect(canvas, { y: 4, w: lineHalf * 2, fillStyle: '#e8e8e8' })).toBeUndefined()
    // 段 2（偶）恢复虚线
    expect(findRect(canvas, { y: 8, w: lineHalf * 2, fillStyle: '#e8e8e8' })).toBeDefined()
  })

  it('should keep road shoulders within side width (路面/路缘比例正确、无越界)', () => {
    const canvas = renderRoadStripToCanvas(strip04, { width: WIDTH }) as unknown as MockOffscreenCanvas
    const total = 2 * ROAD_HALF_WIDTH + 2 * EDGE_WIDTH
    const roadHalf = (WIDTH * ((2 * ROAD_HALF_WIDTH) / total)) / 2
    const sideHalf = WIDTH * (EDGE_WIDTH / total)

    // 段 0 的矩形精确覆盖 [0, sideHalf] + [sideHalf, WIDTH - sideHalf] + [WIDTH - sideHalf, WIDTH]
    const rowRects = canvas.fillRects.filter((r) => Math.abs(r.y - 0) < 1e-6)
    expect(rowRects.length).toBe(4) // 左路缘 + 路面 + 右路缘 + 中心虚线
    const roadRect = findRect(canvas, { y: 0, w: roadHalf * 2 })
    expect(roadRect?.x).toBeCloseTo(WIDTH / 2 - roadHalf)
    const leftSide = findRect(canvas, { y: 0, x: 0 })
    expect(leftSide?.w).toBeCloseTo(sideHalf)
    const rightSide = findRect(canvas, { y: 0, x: WIDTH / 2 + roadHalf })
    expect(rightSide?.w).toBeCloseTo(sideHalf)
    // 路面 + 双路缘恰好铺满整行，路缘不侵入路面
    expect(sideHalf + roadHalf * 2 + sideHalf).toBeCloseTo(WIDTH)
    // 无任何矩形越出纹理宽度（数值容差 1e-6 容忍比例换算的浮点误差）
    for (const r of canvas.fillRects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-6)
      expect(r.x + r.w).toBeLessThanOrEqual(WIDTH + 1e-6)
      expect(r.y).toBeGreaterThanOrEqual(-1e-6)
      expect(r.y + r.h).toBeLessThanOrEqual(canvas.height + 1e-6)
    }
  })
})
