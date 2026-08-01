import { describe, expect, test } from 'vitest'
import { decideBotInput, createBotConfig, DEFAULT_BOT_CONFIG, type BotContext } from '../../src/ai/bot'
import { createStraightTrack, createTrack, SEGMENT_LENGTH } from '../../src/engine/track'
import type { CarState } from '../../src/physics/car'

const MAX_SPEED = 6000

function straightCtx(overrides: Partial<typeof DEFAULT_BOT_CONFIG> = {}): BotContext {
  return { track: createStraightTrack(200), config: createBotConfig(overrides), maxSpeed: MAX_SPEED }
}

describe('decideBotInput', () => {
  test('直道静止起步：全油门、不刹车、不转向', () => {
    const input = decideBotInput(straightCtx(), { position: 0, speed: 0 }, 0)
    expect(input.throttle).toBe(1)
    expect(input.brake).toBe(false)
    expect(input.steer).toBe(0)
  })

  test('达到目标速度后松油门巡航', () => {
    const input = decideBotInput(straightCtx(), { position: 0, speed: DEFAULT_BOT_CONFIG.targetSpeed }, 0)
    expect(input.throttle).toBe(0)
    expect(input.brake).toBe(false)
  })

  test('弯道前超速时刹车（前瞻窗口内曲率超阈值）', () => {
    const track = createTrack([
      { curve: 0, count: 30 },
      { curve: 0.03, count: 40 },
      { curve: -0.03, count: 40 },
      { curve: 0, count: 30 },
    ])
    const ctx = { track, config: createBotConfig(), maxSpeed: MAX_SPEED }
    const bendStart = 30 * SEGMENT_LENGTH
    const input = decideBotInput(ctx, { position: 0, speed: MAX_SPEED }, bendStart)
    expect(input.brake).toBe(true)
  })

  test('弯道限速内给油（不会永远刹车）', () => {
    const track = createTrack([
      { curve: 0, count: 30 },
      { curve: 0.03, count: 40 },
      { curve: -0.03, count: 40 },
      { curve: 0, count: 30 },
    ])
    const ctx = { track, config: createBotConfig(), maxSpeed: MAX_SPEED }
    const limit = DEFAULT_BOT_CONFIG.targetSpeed * DEFAULT_BOT_CONFIG.cornerSpeedFactor
    const input = decideBotInput(ctx, { position: 0, speed: limit * 0.5 }, 30 * SEGMENT_LENGTH)
    expect(input.throttle).toBe(1)
  })

  test('偏右回中：steer 为负', () => {
    const input = decideBotInput(straightCtx(), { position: 0.5, speed: 3000 }, 0)
    expect(input.steer).toBeLessThan(0)
  })

  test('偏左回中：steer 为正', () => {
    const input = decideBotInput(straightCtx(), { position: -0.5, speed: 3000 }, 0)
    expect(input.steer).toBeGreaterThan(0)
  })

  test('steer 输出限幅在 [-1, 1]', () => {
    const input = decideBotInput(straightCtx(), { position: 10, speed: 3000 }, 0)
    expect(input.steer).toBe(-1)
  })

  test('环形赛道边界：cameraZ 超过总长后仍能正确前瞻', () => {
    const track = createTrack([{ curve: 0, count: 20 }])
    const ctx = { track, config: createBotConfig(), maxSpeed: MAX_SPEED }
    const input = decideBotInput(ctx, { position: 0, speed: 1000 }, 3900)
    expect(input.steer).toBe(0)
    expect(input.throttle).toBe(1)
  })
})
