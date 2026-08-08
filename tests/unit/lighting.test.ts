import { describe, it, expect } from 'vitest'
import { resolveWeatherPhase, updateLighting, weatherPhaseAt, WEATHER_CYCLE_SECONDS } from '../../src/engine/lighting'

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

  it('raining reuses overcast palette (90s rain skyTop equals overcast)', () => {
    const rain = updateLighting(45 * 2, false, true)
    const over = updateLighting(45 * 2, true, false)
    expect(rain.skyTop).toMatch(/^hsl/)
    expect(rain.skyTop).toBe(over.skyTop)
  })

  it('raining skyTop differs from clear (rain darker/grayer)', () => {
    const rain = updateLighting(45 * 2, false, true)
    const clear = updateLighting(45 * 2, false, false)
    expect(rain.skyTop).not.toBe(clear.skyTop)
  })

  it('night 模式 skyTop 色相 ∈ [200,260] 且亮度低于白天（l < 30）', () => {
    const hslOf = (c: string): { h: number; l: number } => {
      const m = c.match(/^hsl\((\d+(?:\.\d+)?), (\d+(?:\.\d+)?)%, (\d+(?:\.\d+)?)%\)$/)
      return m ? { h: Number(m[1]), l: Number(m[3]) } : { h: -1, l: -1 }
    }
    const night = updateLighting(45, false, false, true)
    const { h, l } = hslOf(night.skyTop)
    expect(h).toBeGreaterThanOrEqual(200)
    expect(h).toBeLessThanOrEqual(260)
    expect(l).toBeLessThan(30)
  })

  it('night 模式与同 timeSec 的 day 输出不同（颜色变暗）', () => {
    const day = updateLighting(45, false, false, false)
    const night = updateLighting(45, false, false, true)
    expect(night.skyTop).not.toBe(day.skyTop)
  })
})

describe('M23 方案 11：resolveWeatherPhase 天气变体覆盖', () => {
  it('auto 回退到时间循环（与 weatherPhaseAt 一致）', () => {
    for (const t of [0, 30, 46, 90, 91, 135, 136, 180]) {
      expect(resolveWeatherPhase('auto', t)).toBe(weatherPhaseAt(t))
    }
  })

  it('sunny 恒晴（phase 0）——覆盖任意时间点', () => {
    for (const t of [0, 46, 90, 136, 180]) {
      expect(resolveWeatherPhase('sunny', t)).toBe(0)
    }
  })

  it('rain 恒雨（phase 2）', () => {
    for (const t of [0, 46, 90, 136, 180]) {
      expect(resolveWeatherPhase('rain', t)).toBe(2)
    }
  })

  it('night 恒无雨（phase 0）', () => {
    for (const t of [0, 46, 90, 136, 180]) {
      expect(resolveWeatherPhase('night', t)).toBe(0)
    }
  })

  it('覆盖后时间循环边界不再影响相位（跨 45s 切换点仍锁定）', () => {
    const boundary = WEATHER_CYCLE_SECONDS * 2 // 恰好雨段开始
    expect(weatherPhaseAt(boundary)).toBe(2)
    expect(resolveWeatherPhase('sunny', boundary)).toBe(0)
    expect(resolveWeatherPhase('night', boundary)).toBe(0)
  })
})
