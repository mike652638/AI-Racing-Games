import { describe, expect, it } from 'vitest'
import { type CarConfig, type CarInput, type CarState, createCarConfig, updateCar } from '../../src/physics/car'

const config: CarConfig = createCarConfig({
  maxSpeed: 100,
  acceleration: 50,
  braking: 80,
  deceleration: 20,
  offRoadDeceleration: 40,
  roadHalfWidth: 1,
  turnRate: 0.5,
})

const idle: CarInput = { throttle: 0, brake: false, steer: 0 }

function state(position = 0, speed = 0): CarState {
  return { position, speed }
}

describe('速度模型', () => {
  it('全油门按加速度提速', () => {
    const s = state()
    updateCar(1, { ...idle, throttle: 1 }, s, config)
    expect(s.speed).toBe(50)
  })

  it('部分油门按比例提速', () => {
    const s = state()
    updateCar(1, { ...idle, throttle: 0.5 }, s, config)
    expect(s.speed).toBe(25)
  })

  it('速度不超过最高速度', () => {
    const s = state(0, 95)
    updateCar(1, { ...idle, throttle: 1 }, s, config)
    expect(s.speed).toBe(100)
  })

  it('刹车使速度下降', () => {
    const s = state(0, 100)
    updateCar(1, { ...idle, brake: true }, s, config)
    expect(s.speed).toBe(20)
  })

  it('松油门自然减速', () => {
    const s = state(0, 100)
    updateCar(1, idle, s, config)
    expect(s.speed).toBe(80)
  })

  it('速度不会减为负值', () => {
    const s = state(0, 10)
    updateCar(1, idle, s, config)
    expect(s.speed).toBe(0)
  })
})

describe('转向模型', () => {
  it('右转使横向位置右移', () => {
    const s = state(0, 100)
    updateCar(1, { ...idle, steer: 1 }, s, config)
    expect(s.position).toBeCloseTo(0.4)
  })

  it('左转使横向位置左移', () => {
    const s = state(0, 100)
    updateCar(1, { ...idle, steer: -1 }, s, config)
    expect(s.position).toBeCloseTo(-0.4)
  })

  it('静止时转向无效', () => {
    const s = state(0, 0)
    updateCar(1, { ...idle, steer: 1 }, s, config)
    expect(s.position).toBe(0)
  })

  it('速度越高转向越快', () => {
    const slow = state(0, 50)
    const fast = state(0, 100)
    updateCar(1, { ...idle, steer: 1 }, slow, config)
    updateCar(1, { ...idle, steer: 1 }, fast, config)
    expect(fast.position).toBeGreaterThan(slow.position)
  })
})

describe('路缘限制与出界减速', () => {
  it('出界后横向位置被限制在路面内', () => {
    const s = state(1.5, 100)
    updateCar(1, idle, s, config)
    expect(s.position).toBe(1)
  })

  it('出界时速度被额外衰减（自然减速+出界衰减）', () => {
    const s = state(1.5, 100)
    updateCar(1, idle, s, config)
    expect(s.speed).toBe(40)
  })

  it('出界减速不会产生负速度', () => {
    const s = state(1.5, 30)
    updateCar(1, idle, s, config)
    expect(s.speed).toBe(0)
  })

  it('转向冲出路面同样触发路缘限制', () => {
    const s = state(0.8, 100)
    updateCar(1, { ...idle, steer: 1 }, s, config)
    expect(s.position).toBe(1)
    expect(s.speed).toBe(40)
  })

  it('路面内正常行驶不受路缘影响', () => {
    const s = state(0.5, 100)
    updateCar(1, idle, s, config)
    expect(s.speed).toBe(80)
    expect(s.position).toBe(0.5)
  })
})
