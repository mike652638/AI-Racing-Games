import { describe, expect, test } from 'vitest'
import { simulateLaps } from '../../src/ai/simulate'
import { createBotConfig } from '../../src/ai/bot'
import { createCarConfig, updateCar, DEFAULT_CAR_CONFIG } from '../../src/physics/car'
import { createStraightTrack, createTrack } from '../../src/engine/track'

describe('updateCar 出界标记', () => {
  test('不出界时返回 false', () => {
    const state = { position: 0.5, speed: 1000 }
    const clipped = updateCar(1 / 60, { throttle: 0, brake: false, steer: 0 }, state, createCarConfig())
    expect(clipped).toBe(false)
  })

  test('强转向冲出路面时返回 true 且位置被钳制', () => {
    const state = { position: 0.9, speed: DEFAULT_CAR_CONFIG.maxSpeed }
    const clipped = updateCar(1, { throttle: 0, brake: false, steer: 1 }, state, createCarConfig())
    expect(clipped).toBe(true)
    expect(state.position).toBe(DEFAULT_CAR_CONFIG.roadHalfWidth)
  })
})

describe('simulateLaps', () => {
  test('直线赛道 200 段完成 1 圈：无违规、圈速>0', () => {
    const result = simulateLaps(createStraightTrack(200), createCarConfig(), createBotConfig(), { laps: 1 })
    expect(result.finished).toBe(true)
    expect(result.lapTimes).toHaveLength(1)
    expect(result.lapTimes[0]).toBeGreaterThan(0)
    expect(result.violations).toBe(0)
  })

  test('环形弯道赛道完成 1 圈且无出界违规', () => {
    const track = createTrack([
      { curve: 0, count: 60 },
      { curve: 0.02, count: 50 },
      { curve: 0, count: 40 },
      { curve: -0.02, count: 50 },
      { curve: 0, count: 60 },
      { curve: 0.01, count: 50 },
      { curve: 0, count: 40 },
      { curve: -0.01, count: 50 },
      { curve: 0, count: 60 },
    ])
    const result = simulateLaps(track, createCarConfig(), createBotConfig(), { laps: 1 })
    expect(result.finished).toBe(true)
    expect(result.violations).toBe(0)
  })

  test('3 圈时 lapTimes 长度 3 且逐圈递增', () => {
    const result = simulateLaps(createStraightTrack(200), createCarConfig(), createBotConfig(), { laps: 3 })
    expect(result.finished).toBe(true)
    expect(result.lapTimes).toHaveLength(3)
    expect(result.lapTimes[1]).toBeGreaterThan(result.lapTimes[0])
    expect(result.lapTimes[2]).toBeGreaterThan(result.lapTimes[1])
  })

  test('圈速对步长不敏感（dt=1/60 vs 1/120 差异 < 5%）', () => {
    const track = createStraightTrack(200)
    const a = simulateLaps(track, createCarConfig(), createBotConfig(), { laps: 1, dt: 1 / 60 })
    const b = simulateLaps(track, createCarConfig(), createBotConfig(), { laps: 1, dt: 1 / 120 })
    const diff = Math.abs(a.lapTimes[0] - b.lapTimes[0]) / a.lapTimes[0]
    expect(diff).toBeLessThan(0.05)
  })

  test('达到 maxSteps 仍未完成时 finished=false', () => {
    const result = simulateLaps(createStraightTrack(200), createCarConfig(), createBotConfig(), { laps: 3, maxSteps: 10 })
    expect(result.finished).toBe(false)
  })
})
