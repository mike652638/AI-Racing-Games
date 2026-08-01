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
}

/** 新建初始漂移状态（含归零得分） */
export function createDriftState(): DriftState {
  return { charge: 0, active: false, lastSmoke: 0, smoke: [], score: 0 }
}

const STEER_THRESHOLD = 0.7
const SPEED_RATIO_THRESHOLD = 0.5
const CHARGE_THRESHOLD = 0.25
const CHARGE_DECAY = 2
const SMOKE_INTERVAL = 1
const SMOKE_LIFETIME = 0.6
/** 漂移得分速率（得分/秒/单位速度） */
const DRIFT_SCORE_RATE = 0.01

/** 漂移激活时的转向率倍率 */
const DRIFT_TURN_MULTIPLIER = 1.5
/** 漂移激活时的每帧速度损耗因子 */
const DRIFT_SPEED_FACTOR = 0.985

/** 更新漂移状态（in-place 修改并返回） */
export function updateDrift(
  dt: number,
  input: CarInput,
  state: CarState,
  config: CarConfig,
  drift: DriftState,
  cameraZ: number,
): DriftState {
  const charging =
    Math.abs(input.steer) > STEER_THRESHOLD && state.speed > config.maxSpeed * SPEED_RATIO_THRESHOLD

  drift.charge = charging
    ? Math.min(drift.charge + dt, 1)
    : Math.max(drift.charge - dt * CHARGE_DECAY, 0)
  drift.active = drift.charge > CHARGE_THRESHOLD

  if (drift.active) {
    drift.score += state.speed * dt * DRIFT_SCORE_RATE
  }

  drift.lastSmoke += dt
  if (drift.active && drift.lastSmoke >= SMOKE_INTERVAL) {
    drift.smoke.push({
      x: state.position - Math.sign(input.steer) * 0.3,
      z: cameraZ,
      t: 0,
    })
    drift.lastSmoke = 0
  }

  const alive: SmokeParticle[] = []
  for (const particle of drift.smoke) {
    particle.t += dt
    if (particle.t <= SMOKE_LIFETIME) {
      alive.push(particle)
    }
  }
  drift.smoke = alive

  return drift
}

/** 漂移时的有效转向率 */
export function effectiveTurnRate(config: CarConfig, drift: DriftState): number {
  return drift.active ? config.turnRate * DRIFT_TURN_MULTIPLIER : config.turnRate
}

/** 漂移时的每帧速度损耗因子 */
export function driftSpeedFactor(drift: DriftState): number {
  return drift.active ? DRIFT_SPEED_FACTOR : 1
}
