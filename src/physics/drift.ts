import {
  COMBO_MULTIPLIER_STEP,
  DRIFT_CHARGE_THRESHOLD,
  DRIFT_SCORE_MAX,
  DRIFT_SPEED_FACTOR,
  DRIFT_STEER_THRESHOLD,
  SMOKE_LIFETIME,
} from '../shared/constants'
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
/** 漂移得分速率（得分/秒/单位速度） */
const DRIFT_SCORE_RATE = 0.01

/**
 * 连击窗口（秒）：连续漂移每满该时长 combo+1。
 * P7 冒烟修复：原 2s 在真实物理下不可达——active 期间速度按 DRIFT_SPEED_FACTOR=0.985 每帧衰减，
 * 从满速跌到 0.5*maxSpeed 阈值仅约 0.8s（0.985^n=0.5 → n≈46 帧），连续 active 窗口最多 ~0.8s，
 * 永远达不到 2s（浏览器实测 COMBO 永不显示）。0.5s 内 active 仍高于速度阈值，可叠 1 级 combo。
 */
const COMBO_WINDOW_SECONDS = 0.5
/** 连击上限：倍率封顶 1 + 10 * COMBO_MULTIPLIER_STEP = 3.5x */
const COMBO_MAX = 10

/** 漂移激活时的转向率倍率 */
const DRIFT_TURN_MULTIPLIER = 1.5

/**
 * 更新漂移状态（纯函数：不修改入参 drift/carState/config，基于它们计算并返回新对象）。
 * 注意 smoke 数组与粒子均以复制方式推进，原对象（含粒子 t）保持不变。
 * S 修复（分配优化）：当无存活烟雾且本帧不产生新烟雾时复用入参数组引用（空数组无内容，
 * 不违反纯函数契约）；需复制时采用「写回原槽位 + 截断」替代临时 alive 数组，减少每帧分配。
 * 实测烟雾粒子上限 ≤2（SMOKE_INTERVAL=1s / SMOKE_LIFETIME=0.6s），收益有限，纯保守优化。
 */
export function updateDrift(
  dt: number,
  input: CarInput,
  state: CarState,
  config: CarConfig,
  drift: DriftState,
  cameraZ: number,
  scoreMultiplier = 1,
): DriftState {
  const next: DriftState = { ...drift }
  const charging =
    Math.abs(input.steer) > DRIFT_STEER_THRESHOLD && state.speed > config.maxSpeed * SPEED_RATIO_THRESHOLD

  next.charge = charging ? Math.min(next.charge + dt, 1) : Math.max(next.charge - dt * CHARGE_DECAY, 0)
  next.active = next.charge > DRIFT_CHARGE_THRESHOLD

  // 连击：仅 active 期间累积 comboTimer，满窗口 combo+1；得分按倍率 1+combo*COMBO_MULTIPLIER_STEP 累计并 clamp
  if (next.active) {
    next.comboTimer += dt
    if (next.comboTimer >= COMBO_WINDOW_SECONDS) {
      next.comboTimer = 0
      next.combo = Math.min(next.combo + 1, COMBO_MAX)
    }
    const multiplier = 1 + next.combo * COMBO_MULTIPLIER_STEP
    // H1（H1）：挑战加成——scoreMultiplier 额外乘入得分（默认 1 时与现状逐字节一致）
    next.score = Math.min(
      next.score + state.speed * dt * DRIFT_SCORE_RATE * multiplier * scoreMultiplier,
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
  const emitSmoke = next.active && next.lastSmoke >= SMOKE_INTERVAL
  if (emitSmoke) {
    next.lastSmoke = 0
  }

  // 仅当需要修改烟雾数组（有存活粒子需老化 / 本帧产生新粒子）时才复制：
  // 两者皆无时直接复用入参空数组引用（零分配，且不触碰入参数据）。
  if (drift.smoke.length > 0 || emitSmoke) {
    const smoke: SmokeParticle[] = [...drift.smoke]
    if (emitSmoke) {
      smoke.push({
        x: state.position - Math.sign(input.steer) * 0.3,
        z: cameraZ,
        t: 0,
      })
    }
    // 老化写回原槽位并截断（替代临时 alive 数组）：粒子对象仍新建（纯函数契约：入参粒子 t 不可变）
    let w = 0
    for (let i = 0; i < smoke.length; i++) {
      const particle = smoke[i]
      if (particle.t + dt <= SMOKE_LIFETIME) {
        smoke[w++] = { ...particle, t: particle.t + dt }
      }
    }
    smoke.length = w
    next.smoke = smoke
  }

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
