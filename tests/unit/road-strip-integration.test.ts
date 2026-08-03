import { describe, it, expect } from 'vitest'
import { createTrackContext } from '../../src/game/track-context'
import { TRACK_DEFS } from '../../src/engine/tracks'

describe('TrackContext roadStrips', () => {
  it('should populate roadStrips from track definition', () => {
    const ctx = createTrackContext(TRACK_DEFS[0])
    expect(ctx.roadStrips).toBeDefined()
    expect(Array.isArray(ctx.roadStrips)).toBe(true)
    expect(ctx.roadStrips.length).toBeGreaterThan(0)
  })

  it('should have valid z ranges for each strip', () => {
    const ctx = createTrackContext(TRACK_DEFS[0])
    for (const strip of ctx.roadStrips) {
      expect(strip.startZ).toBeLessThan(strip.endZ)
      expect(strip.startSeg).toBeLessThan(strip.endSeg)
    }
  })
})
