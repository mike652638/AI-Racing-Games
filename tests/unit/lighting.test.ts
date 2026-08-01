import { describe, it, expect } from 'vitest'
import { updateLighting } from '../../src/engine/lighting'

describe('updateLighting', () => {
  it('returns valid hsl colors at time 0 (night)', () => {
    const c = updateLighting(0)
    expect(c.skyTop).toMatch(/^hsl/)
    expect(c.skyBottom).toMatch(/^hsl/)
    expect(c.grass).toMatch(/^hsl/)
  })

  it('returns different colors at sunrise (30s)', () => {
    const night = updateLighting(0)
    const sunrise = updateLighting(30)
    expect(sunrise.skyTop).not.toBe(night.skyTop)
  })

  it('returns different colors at sunset (60s)', () => {
    const sunrise = updateLighting(30)
    const sunset = updateLighting(60)
    expect(sunset.skyTop).not.toBe(sunrise.skyTop)
  })

  it('wraps around after cycle (120s)', () => {
    const c0 = updateLighting(0)
    const c120 = updateLighting(120)
    expect(c120.skyTop).toBe(c0.skyTop)
  })

  it('handles negative time values', () => {
    const c = updateLighting(-30)
    expect(c.skyTop).toMatch(/^hsl/)
  })

  it('all five color channels return valid hsl', () => {
    for (const t of [0, 15, 30, 45, 60, 75, 90, 105, 120]) {
      const c = updateLighting(t)
      for (const val of [c.skyTop, c.skyBottom, c.grass, c.mountainFar, c.mountainNear]) {
        expect(val).toMatch(/^hsl\(\d+(\.\d+)?, \d+(\.\d+)?%, \d+(\.\d+)?%\)$/)
      }
    }
  })
})
