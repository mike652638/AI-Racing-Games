import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildRoadStrips,
  renderRoadStripToCanvas,
  type RoadStrip,
} from '../../src/engine/road-strip'

// node 测试环境无 OffscreenCanvas，提供最小 mock
class MockOffscreenCanvas {
  width: number
  height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  getContext() {
    return {
      fillStyle: '',
      fillRect: vi.fn(),
    }
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
  it('should create offscreen canvas with road content', () => {
    const strip: RoadStrip = {
      startSeg: 0,
      endSeg: 10,
      startZ: 0,
      endZ: 10 * 200, // SEGMENT_LENGTH = 200
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
