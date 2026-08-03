import { describe, expect, test } from 'vitest'
import {
  collideWithPlayer,
  createTraffic,
  updateTraffic,
  type TrafficCar,
} from '../../src/engine/traffic'

describe('createTraffic', () => {
  test('生成指定数量且确定性（同 seed 同结果）', () => {
    const a = createTraffic(20000, 777, 8)
    const b = createTraffic(20000, 777, 8)
    expect(a).toHaveLength(8)
    expect(a).toEqual(b)
  })
  test('车辆均匀分布（间隔≈lapLength/count）', () => {
    const traffic = createTraffic(20000, 777, 8)
    const sorted = [...traffic].sort((x, y) => x.z - y.z)
    const gaps = sorted.map((c, i) => (sorted[(i + 1) % sorted.length].z - c.z + 20000) % 20000)
    gaps.forEach((g) => expect(g).toBeGreaterThan(1800))
    gaps.forEach((g) => expect(g).toBeLessThan(3200))
  })
  test('offset 在 ±1 内（不骑中央线）', () => {
    const traffic = createTraffic(20000, 777, 8)
    traffic.forEach((c) => expect(Math.abs(c.offset)).toBeLessThan(1))
  })
  test('count 参数自定义车流数量', () => {
    expect(createTraffic(20000, 777, 3)).toHaveLength(3)
  })
  test('speed 为正', () => {
    const traffic = createTraffic(20000, 777, 8)
    traffic.forEach((c) => expect(c.speed).toBeGreaterThan(0))
  })
})

describe('updateTraffic', () => {
  test('按速度推进 z', () => {
    const car: TrafficCar = { z: 100, offset: 0.7, speed: 1200, colorIndex: 0 }
    updateTraffic([car], 0.5, 20000)
    expect(car.z).toBeCloseTo(700, 6)
  })
  test('超过 lapLength 环形回绕', () => {
    const car: TrafficCar = { z: 19800, offset: 0.7, speed: 1200, colorIndex: 0 }
    updateTraffic([car], 1, 20000)
    expect(car.z).toBeCloseTo(1000, 6)
  })
})

describe('collideWithPlayer', () => {
  test('纵向横向均接近时命中', () => {
    const car: TrafficCar = { z: 1000, offset: 0.7, speed: 1200, colorIndex: 0 }
    expect(collideWithPlayer([car], 1050, 0.7)).toBe(car)
  })
  test('横向错开（offset 差 > xTol）不命中', () => {
    const car: TrafficCar = { z: 1000, offset: -0.7, speed: 1200, colorIndex: 0 }
    expect(collideWithPlayer([car], 1050, 0.7)).toBeNull()
  })
  test('纵向错过（|dz| > zTol）不命中', () => {
    const car: TrafficCar = { z: 1000, offset: 0.7, speed: 1200, colorIndex: 0 }
    expect(collideWithPlayer([car], 2000, 0.7)).toBeNull()
  })
  test('无车不命中', () => {
    expect(collideWithPlayer([], 1000, 0)).toBeNull()
  })
})
