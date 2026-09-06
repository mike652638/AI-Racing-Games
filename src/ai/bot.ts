import type { Segment } from '../engine/track'
import { trackIndexForCameraZ, SEGMENT_LENGTH } from '../engine/track'
import type { TrafficCar } from '../engine/traffic'
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
  /** 车流感知（可选）：车流模式下注入前方车流用于减速避让；默认模式不传，行为与旧版一致 */
  traffic?: readonly TrafficCar[]
}

/** 车流感知纵向触发距离（世界单位）：前方该距离内的同车道车视为碰撞风险 */
const TRAFFIC_AWARE_Z_DIST = 400
/** 车流感知横向接近容差（世界单位） */
const TRAFFIC_AWARE_X_TOL = 1.2
/** 车流感知减速系数（存在碰撞风险车时目标速度 × 该值） */
const TRAFFIC_AWARE_SPEED_FACTOR = 0.6

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
  // NaN 防御（2026-09-06）：position 非有限（NaN/±Infinity）时回退 0 再 clamp，
  // 避免 rawSteer 传播 NaN 导致 bot 转向失控/判定失效
  const pos = Number.isFinite(state.position) ? state.position : 0
  const rawSteer = -pos * config.steerGain
  const steer = rawSteer === 0 ? 0 : Math.max(-1, Math.min(1, rawSteer))
  const isCorner = aheadCurve(ctx, cameraZ) > config.cornerCurveThreshold
  let limit = isCorner ? config.targetSpeed * config.cornerSpeedFactor : config.targetSpeed
  // 车流感知（可选）：前方车流中有碰撞风险车时降低目标速度（环形取模语义，与 traffic.ts 一致；
  // 仅减速不转向，保持实现简单且向后兼容）
  if (ctx.traffic && ctx.traffic.length > 0) {
    const lapLength = ctx.track.length * SEGMENT_LENGTH
    for (const car of ctx.traffic) {
      const d = (car.z - cameraZ + lapLength) % lapLength
      if (d > 0 && d < TRAFFIC_AWARE_Z_DIST && Math.abs(car.offset - state.position) < TRAFFIC_AWARE_X_TOL) {
        limit *= TRAFFIC_AWARE_SPEED_FACTOR
        break
      }
    }
  }
  return {
    throttle: state.speed < limit * 0.98 ? 1 : 0,
    brake: state.speed > limit * 1.05,
    steer,
  }
}
