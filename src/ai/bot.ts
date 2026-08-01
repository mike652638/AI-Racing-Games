import type { Segment } from '../engine/track'
import { SEGMENT_LENGTH, trackIndexForCameraZ } from '../engine/track'
import type { CarInput, CarState } from '../physics/car'

export interface BotConfig {
  /** 中心线纠偏比例增益 */
  steerGain: number
  /** 直道目标速度（世界单位/秒） */
  targetSpeed: number
  /** 弯道目标速度系数（× targetSpeed） */
  cornerSpeedFactor: number
  /** 前瞻段数（提前减速的窗口） */
  lookAheadSegments: number
  /** 前瞻窗口内 |Σcurve| 超过该值视为弯道 */
  cornerCurveThreshold: number
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  steerGain: 1.5,
  targetSpeed: 5400,
  cornerSpeedFactor: 0.55,
  lookAheadSegments: 8,
  cornerCurveThreshold: 0.04,
}

export function createBotConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return { ...DEFAULT_BOT_CONFIG, ...overrides }
}

export interface BotContext {
  track: Segment[]
  config: BotConfig
  /** 车辆最高速度（用于目标速度换算） */
  maxSpeed: number
}

/** 前瞻窗口内曲率绝对值之和（环形安全取模） */
export function aheadCurve(ctx: BotContext, cameraZ: number): number {
  const { track, config } = ctx
  const base = trackIndexForCameraZ(track, cameraZ)
  let sum = 0
  for (let i = 1; i <= config.lookAheadSegments; i++) {
    sum += Math.abs(track[(base + i) % track.length].curve)
  }
  return sum
}

export function decideBotInput(ctx: BotContext, state: CarState, cameraZ: number): CarInput {
  const { config } = ctx
  const rawSteer = -state.position * config.steerGain
  const steer = rawSteer === 0 ? 0 : Math.max(-1, Math.min(1, rawSteer))
  const isCorner = aheadCurve(ctx, cameraZ) > config.cornerCurveThreshold
  const limit = isCorner ? config.targetSpeed * config.cornerSpeedFactor : config.targetSpeed
  return {
    throttle: state.speed < limit * 0.98 ? 1 : 0,
    brake: state.speed > limit * 1.05,
    steer,
  }
}
