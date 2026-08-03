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

  it('returns different skyTop when overcast vs clear at same time', () => {
    const clear = updateLighting(30, false)
    const over = updateLighting(30, true)
    expect(over.skyTop).not.toBe(clear.skyTop)
  })

  it('reduces skyTop saturation when overcast (gray sky)', () => {
    const saturationOf = (c: string): number => {
      const m = c.match(/^hsl\([^,]+, (\d+(?:\.\d+)?)%,/)
      return m ? Number(m[1]) : -1
    }
    const clear = updateLighting(30, false)
    const over = updateLighting(30, true)
    expect(saturationOf(over.skyTop)).toBeLessThan(saturationOf(clear.skyTop))
  })

  it('keeps skyTop blue at daytime noon (45s, clear)', () => {
    // 修复前 hue=lerp(210,25,0.5)=117（绿色）；修复后应恒为 210（蓝色调）
    const hueOf = (c: string): number => {
      const m = c.match(/^hsl\((\d+(?:\.\d+)?),/)
      return m ? Number(m[1]) : -1
    }
    const c = updateLighting(45, false)
    const hue = hueOf(c.skyTop)
    expect(hue).toBeGreaterThanOrEqual(180)
    expect(hue).toBeLessThanOrEqual(260)
  })

  it('keeps skyTop blue at daytime noon (45s, overcast)', () => {
    const hueOf = (c: string): number => {
      const m = c.match(/^hsl\((\d+(?:\.\d+)?),/)
      return m ? Number(m[1]) : -1
    }
    const c = updateLighting(45, true)
    const hue = hueOf(c.skyTop)
    expect(hue).toBeGreaterThanOrEqual(180)
    expect(hue).toBeLessThanOrEqual(260)
  })
})
