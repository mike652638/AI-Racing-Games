import {
  DRIFT_CHARGE_THRESHOLD,
  DRIFT_SCORE_MAX,
  DRIFT_SPEED_FACTOR,
  DRIFT_STEER_THRESHOLD,
} from '../game/constants'
import type { CarConfig, CarInput, CarState } from './car'

export interface SmokeParticle {
  /** 世界 x（漂移外侧） */
  x: number
  /** 相机 z（生成时刻） */
  z: number
  /** 存活时间（秒） */
  t: number
}

export interface DriftState {
  /** 漂移蓄力值（秒） */
  charge: number
  active: boolean
  /** 距上次生成烟雾的时间（秒） */
  lastSmoke: number
  smoke: SmokeParticle[]
  /** 漂移累计得分 */
  score: number
  /** 连击数：连续漂移每满 COMBO_WINDOW_SECONDS 秒 +1，中断归零 */
  combo: number
  /** 连击计时器（秒，仅 active 期间累积） */
  comboTimer: number
}

/** 新建初始漂移状态（含归零得分） */
export function createDriftState(): DriftState {
  return { charge: 0, active: false, lastSmoke: 0, smoke: [], score: 0, combo: 0, comboTimer: 0 }
}

const SPEED_RATIO_THRESHOLD = 0.5
const CHARGE_DECAY = 2
const SMOKE_INTERVAL = 1
const SMOKE_LIFETIME = 0.6
/** 漂移得分速率（得分/秒/单位速度） */
const DRIFT_SCORE_RATE = 0.01

/** 连击窗口（秒）：连续漂移每满该时长 combo+1 */
const COMBO_WINDOW_SECONDS = 2
/** 连击上限：倍率封顶 1 + 10 * 0.25 = 3.5x */
const COMBO_MAX = 10
/** 每级连击的倍率步进 */
const COMBO_MULTIPLIER_STEP = 0.25

/** 漂移激活时的转向率倍率 */
const DRIFT_TURN_MULTIPLIER = 1.5

/**
 * 更新漂移状态（纯函数：不修改入参 drift/carState/config，基于它们计算并返回新对象）。
 * 注意 smoke 数组与粒子均以复制方式推进，原对象（含粒子 t）保持不变。
 */
export function updateDrift(
  dt: number,
  input: CarInput,
  state: CarState,
  config: CarConfig,
  drift: DriftState,
  cameraZ: number,
): DriftState {
  const next: DriftState = { ...drift, smoke: [...drift.smoke] }
  const charging =
    Math.abs(input.steer) > DRIFT_STEER_THRESHOLD && state.speed > config.maxSpeed * SPEED_RATIO_THRESHOLD

  next.charge = charging
    ? Math.min(next.charge + dt, 1)
    : Math.max(next.charge - dt * CHARGE_DECAY, 0)
  next.active = next.charge > DRIFT_CHARGE_THRESHOLD

  // 连击：仅 active 期间累积 comboTimer，满窗口 combo+1；得分按倍率 1+combo*0.25 累计并 clamp
  if (next.active) {
    next.comboTimer += dt
    if (next.comboTimer >= COMBO_WINDOW_SECONDS) {
      next.comboTimer = 0
      next.combo = Math.min(next.combo + 1, COMBO_MAX)
    }
    const multiplier = 1 + next.combo * COMBO_MULTIPLIER_STEP
    next.score = Math.min(
      next.score + state.speed * dt * DRIFT_SCORE_RATE * multiplier,
      DRIFT_SCORE_MAX,
    )
  }
  // 中断/新漂移段检测：active 翻转即重置连击与计时（漂移中断断连击）
  if (next.active && !drift.active) {
    next.combo = 0
    next.comboTimer = 0
  }
  if (!next.active && drift.active) {
    next.combo = 0
    next.comboTimer = 0
  }

  next.lastSmoke += dt
  if (next.active && next.lastSmoke >= SMOKE_INTERVAL) {
    next.smoke.push({
      x: state.position - Math.sign(input.steer) * 0.3,
      z: cameraZ,
      t: 0,
    })
    next.lastSmoke = 0
  }

  const alive: SmokeParticle[] = []
  for (const particle of next.smoke) {
    if (particle.t + dt <= SMOKE_LIFETIME) {
      alive.push({ ...particle, t: particle.t + dt })
    }
  }
  next.smoke = alive

  return next
}

/** 漂移时的有效转向率 */
export function effectiveTurnRate(config: CarConfig, drift: DriftState): number {
  return drift.active ? config.turnRate * DRIFT_TURN_MULTIPLIER : config.turnRate
}

/** 漂移时的每帧速度损耗因子 */
export function driftSpeedFactor(drift: DriftState): number {
  return drift.active ? DRIFT_SPEED_FACTOR : 1
}
