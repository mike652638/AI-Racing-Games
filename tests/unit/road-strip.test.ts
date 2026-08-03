import { describe, it, expect } from 'vitest'
import { buildRoadStrips } from '../../src/engine/road-strip'

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
