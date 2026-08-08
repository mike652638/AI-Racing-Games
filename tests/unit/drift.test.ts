import { describe, expect, test } from 'vitest'
import { driftSpeedFactor, effectiveTurnRate, updateDrift, type DriftState } from '../../src/physics/drift'
import { createCarConfig } from '../../src/physics/car'
import {
  DRIFT_SCORE_MAX,
  MINI_TURBO_CHARGE_SHORT,
  MINI_TURBO_LONG_SECONDS,
  MINI_TURBO_SHORT_SECONDS,
} from '../../src/shared/constants'

const DT = 1 / 60

const idleDrift = (): DriftState => ({
  charge: 0,
  active: false,
  lastSmoke: 0,
  smoke: [],
  score: 0,
  combo: 0,
  comboTimer: 0,
  turbo: 0,
  turboLevel: 0,
})

describe('漂移状态机', () => {
  test('高速强转向积累 charge 并激活漂移', () => {
    const cfg = createCarConfig()
    let drift = idleDrift()
    const state = { position: 0, speed: cfg.maxSpeed * 0.8 }
    const input = { throttle: 1, brake: false, steer: 1 }
    for (let i = 0; i < 30; i++) {
      drift = updateDrift(DT, input, state, cfg, drift, 0)
    }
    expect(drift.charge).toBeGreaterThan(0.25)
    expect(drift.active).toBe(true)
  })

  test('低速不激活漂移', () => {
    const cfg = createCarConfig()
    let drift = idleDrift()
    const state = { position: 0, speed: cfg.maxSpeed * 0.3 }
    const input = { throttle: 1, brake: false, steer: 1 }
    for (let i = 0; i < 60; i++) {
      drift = updateDrift(DT, input, state, cfg, drift, 0)
    }
    expect(drift.active).toBe(false)
  })

  test('轻微转向不积累 charge', () => {
    const cfg = createCarConfig()
    let drift = idleDrift()
    const state = { position: 0, speed: cfg.maxSpeed * 0.8 }
    const input = { throttle: 1, brake: false, steer: 0.4 }
    for (let i = 0; i < 60; i++) {
      drift = updateDrift(DT, input, state, cfg, drift, 0)
    }
    expect(drift.charge).toBe(0)
  })

  test('松转向后 charge 快速衰减、active 消失', () => {
    const cfg = createCarConfig()
    let drift = idleDrift()
    const state = { position: 0, speed: cfg.maxSpeed * 0.8 }
    for (let i = 0; i < 30; i++) {
      drift = updateDrift(DT, { throttle: 1, brake: false, steer: 1 }, state, cfg, drift, 0)
    }
    expect(drift.active).toBe(true)
    for (let i = 0; i < 30; i++) {
      drift = updateDrift(DT, { throttle: 1, brake: false, steer: 0 }, state, cfg, drift, 0)
    }
    expect(drift.active).toBe(false)
    expect(drift.charge).toBe(0)
  })

  test('漂移激活后每秒产生烟雾粒子并老化移除', () => {
    const cfg = createCarConfig()
    let drift = idleDrift()
    const state = { position: 0, speed: cfg.maxSpeed * 0.8 }
    const input = { throttle: 1, brake: false, steer: 1 }
    for (let i = 0; i < 60; i++) {
      drift = updateDrift(DT, input, state, cfg, drift, 0)
    }
    expect(drift.smoke.length).toBe(1)
    for (let i = 0; i < 40; i++) {
      drift = updateDrift(DT, input, state, cfg, drift, 0)
    }
    expect(drift.smoke.length).toBe(0)
  })

  test('烟雾粒子记录漂移外侧位置与相机 z', () => {
    const cfg = createCarConfig()
    let drift = idleDrift()
    const state = { position: 0.3, speed: cfg.maxSpeed * 0.8 }
    for (let i = 0; i < 60; i++) {
      drift = updateDrift(DT, { throttle: 1, brake: false, steer: 1 }, state, cfg, drift, 500)
    }
    expect(drift.smoke.length).toBe(1)
    expect(drift.smoke[0].z).toBe(500)
    expect(drift.smoke[0].x).toBeLessThan(state.position)
  })
})

describe('漂移对物理的影响', () => {
  test('active 时转向率提升 1.5 倍', () => {
    const cfg = createCarConfig()
    const active = effectiveTurnRate(cfg, {
      charge: 1,
      active: true,
      lastSmoke: 0,
      smoke: [],
      score: 0,
      combo: 0,
      comboTimer: 0,
      turbo: 0,
      turboLevel: 0,
    })
    expect(active).toBeCloseTo(cfg.turnRate * 1.5, 10)
    const idle = effectiveTurnRate(cfg, {
      charge: 0,
      active: false,
      lastSmoke: 0,
      smoke: [],
      score: 0,
      combo: 0,
      comboTimer: 0,
      turbo: 0,
      turboLevel: 0,
    })
    expect(idle).toBe(cfg.turnRate)
  })

  test('active 时速度有损耗因子', () => {
    expect(
      driftSpeedFactor({
        charge: 1,
        active: true,
        lastSmoke: 0,
        smoke: [],
        score: 0,
        combo: 0,
        comboTimer: 0,
        turbo: 0,
        turboLevel: 0,
      }),
    ).toBeCloseTo(0.985, 10)
    expect(
      driftSpeedFactor({
        charge: 0,
        active: false,
        lastSmoke: 0,
        smoke: [],
        score: 0,
        combo: 0,
        comboTimer: 0,
        turbo: 0,
        turboLevel: 0,
      }),
    ).toBe(1)
  })
})

describe('漂移得分', () => {
  const cfg = createCarConfig({ maxSpeed: 6000 })
  const state = { position: 0.5, speed: 6000 }
  const steerInput = { throttle: 0, brake: false, steer: 1 }
  const idleInput = { throttle: 0, brake: false, steer: 0 }
  const scored = (): DriftState => ({
    charge: 1,
    active: false,
    lastSmoke: 0,
    smoke: [],
    score: 0,
    combo: 0,
    comboTimer: 0,
    turbo: 0,
    turboLevel: 0,
  })

  test('漂移中按速度累计得分', () => {
    const drift = scored()
    const next = updateDrift(1, steerInput, state, cfg, drift, 0)
    expect(next.active).toBe(true)
    expect(next.score).toBeGreaterThan(0)
  })

  test('得分与速度成正比（1.5 倍速度 1.5 倍得分）', () => {
    const a = scored()
    const b = scored()
    const na = updateDrift(1, steerInput, state, cfg, a, 0)
    const nb = updateDrift(1, steerInput, { position: 0.5, speed: 4000 }, cfg, b, 0)
    expect(na.score).toBeCloseTo(nb.score * 1.5, 6)
  })

  test('不漂移不计分', () => {
    const drift = scored()
    const next = updateDrift(1, idleInput, state, cfg, drift, 0)
    expect(next.score).toBe(0)
  })

  test('charge 不足（未激活）不计分', () => {
    const drift = scored()
    drift.charge = 0
    const next = updateDrift(DT, steerInput, state, cfg, drift, 0)
    expect(next.score).toBe(0)
  })
})

describe('updateDrift 纯函数性', () => {
  test('不修改传入的 drift 对象，返回新对象', () => {
    const cfg = createCarConfig()
    const state = { position: 0.5, speed: cfg.maxSpeed * 0.8 }
    const input = { throttle: 1, brake: false, steer: 1 }
    const drift: DriftState = {
      charge: 0.5,
      active: false,
      lastSmoke: 0.9,
      smoke: [{ x: 0.3, z: 100, t: 0.2 }],
      score: 10,
      combo: 0,
      comboTimer: 0,
      turbo: 0,
      turboLevel: 0,
    }
    const before = JSON.parse(JSON.stringify(drift)) as DriftState
    const next = updateDrift(0.1, input, state, cfg, drift, 100)
    // 原对象（含烟雾粒子与数组）完全不变
    expect(drift).toEqual(before)
    // 返回全新对象，且状态正确推进（粒子 t 老化）
    expect(next).not.toBe(drift)
    expect(next.charge).toBeGreaterThan(drift.charge)
    expect(next.active).toBe(true)
    expect(next.smoke[0].t).toBeCloseTo(0.3, 10)
  })
})

describe('漂移连击与得分上限', () => {
  const cfg = createCarConfig({ maxSpeed: 6000 })
  const state = { position: 0.5, speed: 6000 }
  const steerInput = { throttle: 0, brake: false, steer: 1 }
  const idleInput = { throttle: 0, brake: false, steer: 0 }
  /** 已激活（active=true）的漂移态：避免 updateDrift 的新漂移段检测重置 combo */
  const activeDrift = (combo: number): DriftState => ({
    charge: 1,
    active: true,
    lastSmoke: 0,
    smoke: [],
    score: 0,
    combo,
    comboTimer: 0,
    turbo: 0,
    turboLevel: 0,
  })

  /** 持续漂移 frames 帧后返回状态（含 30 帧 charge 激活预热） */
  const driftFor = (frames: number, start: DriftState = idleDrift()): DriftState => {
    let drift = start
    for (let i = 0; i < frames; i++) {
      drift = updateDrift(DT, steerInput, state, cfg, drift, 0)
    }
    return drift
  }

  test('持续漂移 0.6s 后 combo 0→1，1.1s 后 →2', () => {
    // 30 帧激活（charge≈0.5>0.25），随后 active 期间累计 comboTimer
    const activated = driftFor(30)
    expect(activated.active).toBe(true)
    // 0.6s = 36 帧：comboTimer 满 0.5s 窗口 → combo=1
    const at06 = driftFor(36, activated)
    expect(at06.combo).toBe(1)
    // 再 0.5s（累计 1.1s）：第二个 0.5s 窗口 → combo=2
    const at11 = driftFor(30, at06)
    expect(at11.combo).toBe(2)
  })

  test('漂移中断（松转向 active 变 false）后 combo 归 0', () => {
    const activated = driftFor(30)
    const at06 = driftFor(36, activated)
    expect(at06.combo).toBe(1)
    // 松转向 1s：charge 衰减 → active=false → 中断重置 combo/comboTimer
    let drift = at06
    for (let i = 0; i < 60; i++) {
      drift = updateDrift(DT, idleInput, state, cfg, drift, 0)
    }
    expect(drift.active).toBe(false)
    expect(drift.combo).toBe(0)
    expect(drift.comboTimer).toBe(0)
  })

  test('倍率生效：combo=1 时相同 dt/速度得分大于无 combo 基线', () => {
    // 两者均 active=true（跳过新段重置）：combo=1 倍率 1.25，combo=0 倍率 1.0
    const withCombo = updateDrift(1, steerInput, state, cfg, activeDrift(1), 0)
    const noCombo = updateDrift(1, steerInput, state, cfg, activeDrift(0), 0)
    expect(withCombo.score).toBeGreaterThan(noCombo.score)
  })

  test('得分 clamp：score 不超 DRIFT_SCORE_MAX', () => {
    const drift = activeDrift(10)
    drift.score = DRIFT_SCORE_MAX - 1
    // 大 dt 单帧增量远超 1：若无 clamp 必然越界
    const next = updateDrift(10, steerInput, state, cfg, drift, 0)
    expect(next.score).toBeLessThanOrEqual(DRIFT_SCORE_MAX)
    expect(next.score).toBe(DRIFT_SCORE_MAX)
  })
})

describe('scoreMultiplier 加成（H1）', () => {
  const cfg = createCarConfig({ maxSpeed: 6000 })
  const state = { position: 0.5, speed: 6000 }
  const steerInput = { throttle: 0, brake: false, steer: 1 }
  /** 已激活（active=true）漂移态：避免新段重置 combo */
  const activeDrift = (combo: number): DriftState => ({
    charge: 1,
    active: true,
    lastSmoke: 0,
    smoke: [],
    score: 0,
    combo,
    comboTimer: 0,
    turbo: 0,
    turboLevel: 0,
  })

  test('scoreMultiplier=1.5 时得分 = 基准 ×1.5（挑战加成透传）', () => {
    const base = updateDrift(1, steerInput, state, cfg, activeDrift(0), 0)
    const bonus = updateDrift(1, steerInput, state, cfg, activeDrift(0), 0, 1.5)
    // dt=1 单帧：active 期间 combo 0→1（timer 满 0.5s），倍率 1.25，基准 = 6000*1*0.01*1.25 = 75
    expect(base.score).toBeCloseTo(75, 6)
    expect(bonus.score).toBeCloseTo(base.score * 1.5, 6)
  })

  test('默认不传与传 1 得分一致（默认参数保持行为不变）', () => {
    const a = updateDrift(1, steerInput, state, cfg, activeDrift(0), 0)
    const b = updateDrift(1, steerInput, state, cfg, activeDrift(0), 0, 1)
    expect(a.score).toBeCloseTo(b.score, 6)
  })
})

describe('漂移小喷 Mini-Turbo（P0）', () => {
  const cfg = createCarConfig({ maxSpeed: 6000 })
  const state = { position: 0.5, speed: 6000 }
  const steerInput = { throttle: 0, brake: false, steer: 1 }
  const idleInput = { throttle: 0, brake: false, steer: 0 }
  /** 已激活（active=true）漂移态：charge 略高于激活阈值（确保下一帧松转向即释放），peakCharge 记录段内峰值 */
  const nearReleaseDrift = (peak: number): DriftState => ({
    charge: 0.26, // 略高于 DRIFT_CHARGE_THRESHOLD=0.25，松转向一帧衰减（2/s × dt）即跌破 → active 翻转
    active: true,
    lastSmoke: 0,
    smoke: [],
    score: 0,
    combo: 2,
    comboTimer: 0,
    turbo: 0,
    turboLevel: 0,
    peakCharge: peak,
  })

  test('释放漂移且峰值蓄力 ≥ 长喷阈值 → 橙火长喷（turboLevel=2，时长 = MINI_TURBO_LONG_SECONDS）', () => {
    const next = updateDrift(DT, idleInput, state, cfg, nearReleaseDrift(1), 0)
    expect(next.active).toBe(false)
    expect(next.turboLevel).toBe(2)
    expect(next.turbo).toBeCloseTo(MINI_TURBO_LONG_SECONDS, 6)
  })

  test('释放漂移且峰值蓄力仅达短喷阈值 → 蓝火短喷（turboLevel=1，时长 = MINI_TURBO_SHORT_SECONDS）', () => {
    const next = updateDrift(DT, idleInput, state, cfg, nearReleaseDrift(MINI_TURBO_CHARGE_SHORT), 0)
    expect(next.active).toBe(false)
    expect(next.turboLevel).toBe(1)
    expect(next.turbo).toBeCloseTo(MINI_TURBO_SHORT_SECONDS, 6)
  })

  test('峰值蓄力不足短喷阈值 → 不触发小喷（turbo=0）', () => {
    const next = updateDrift(DT, idleInput, state, cfg, nearReleaseDrift(MINI_TURBO_CHARGE_SHORT - 0.01), 0)
    expect(next.active).toBe(false)
    expect(next.turbo).toBe(0)
    expect(next.turboLevel).toBe(0)
  })

  test('漂移继续（active 保持）→ 不触发小喷（turbo 保持 0）', () => {
    const next = updateDrift(DT, steerInput, state, cfg, nearReleaseDrift(1), 0)
    expect(next.active).toBe(true)
    expect(next.turbo).toBe(0)
    expect(next.turboLevel).toBe(0)
  })

  test('小喷时长每帧递减，耗尽后 turboLevel 归零', () => {
    const next = updateDrift(DT, idleInput, state, cfg, nearReleaseDrift(1), 0)
    expect(next.turbo).toBeGreaterThan(0)
    // 连续释放态帧：turbo 递减直至 0
    let drift = next
    for (let i = 0; i < Math.ceil(MINI_TURBO_LONG_SECONDS / DT) + 2; i++) {
      drift = updateDrift(DT, idleInput, state, cfg, drift, 0)
    }
    expect(drift.turbo).toBe(0)
    expect(drift.turboLevel).toBe(0)
  })
})
