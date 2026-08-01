import { describe, expect, test } from 'vitest'
import {
  driftSpeedFactor,
  effectiveTurnRate,
  updateDrift,
  type DriftState,
} from '../../src/physics/drift'
import { createCarConfig } from '../../src/physics/car'

const DT = 1 / 60

const idleDrift = (): DriftState => ({ charge: 0, active: false, lastSmoke: 0, smoke: [], score: 0 })

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
    const active = effectiveTurnRate(cfg, { charge: 1, active: true, lastSmoke: 0, smoke: [], score: 0 })
    expect(active).toBeCloseTo(cfg.turnRate * 1.5, 10)
    const idle = effectiveTurnRate(cfg, { charge: 0, active: false, lastSmoke: 0, smoke: [], score: 0 })
    expect(idle).toBe(cfg.turnRate)
  })

  test('active 时速度有损耗因子', () => {
    expect(driftSpeedFactor({ charge: 1, active: true, lastSmoke: 0, smoke: [], score: 0 })).toBeCloseTo(0.985, 10)
    expect(driftSpeedFactor({ charge: 0, active: false, lastSmoke: 0, smoke: [], score: 0 })).toBe(1)
  })
})

describe('漂移得分', () => {
  const cfg = createCarConfig({ maxSpeed: 6000 })
  const state = { position: 0.5, speed: 6000 }
  const steerInput = { throttle: 0, brake: false, steer: 1 }
  const idleInput = { throttle: 0, brake: false, steer: 0 }
  const scored = (): DriftState => ({ charge: 1, active: false, lastSmoke: 0, smoke: [], score: 0 })

  test('漂移中按速度累计得分', () => {
    const drift = scored()
    updateDrift(1, steerInput, state, cfg, drift, 0)
    expect(drift.active).toBe(true)
    expect(drift.score).toBeGreaterThan(0)
  })

  test('得分与速度成正比（1.5 倍速度 1.5 倍得分）', () => {
    const a = scored()
    const b = scored()
    updateDrift(1, steerInput, state, cfg, a, 0)
    updateDrift(1, steerInput, { position: 0.5, speed: 4000 }, cfg, b, 0)
    expect(a.score).toBeCloseTo(b.score * 1.5, 6)
  })

  test('不漂移不计分', () => {
    const drift = scored()
    updateDrift(1, idleInput, state, cfg, drift, 0)
    expect(drift.score).toBe(0)
  })

  test('charge 不足（未激活）不计分', () => {
    const drift = scored()
    drift.charge = 0
    updateDrift(DT, steerInput, state, cfg, drift, 0)
    expect(drift.score).toBe(0)
  })
})
