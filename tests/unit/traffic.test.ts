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
    const car: TrafficCar = { z: 100, offset: 0.7, speed: 1200, colorIndex: 0, shiftDir: 0 }
    updateTraffic([car], 0.5, 20000)
    expect(car.z).toBeCloseTo(700, 6)
  })
  test('超过 lapLength 环形回绕', () => {
    const car: TrafficCar = { z: 19800, offset: 0.7, speed: 1200, colorIndex: 0, shiftDir: 0 }
    updateTraffic([car], 1, 20000)
    expect(car.z).toBeCloseTo(1000, 6)
  })
})

describe('collideWithPlayer', () => {
  test('纵向横向均接近时命中', () => {
    const car: TrafficCar = { z: 1000, offset: 0.7, speed: 1200, colorIndex: 0, shiftDir: 0 }
    expect(collideWithPlayer([car], 1050, 0.7)).toBe(car)
  })
  test('横向错开（offset 差 > xTol）不命中', () => {
    const car: TrafficCar = { z: 1000, offset: -0.7, speed: 1200, colorIndex: 0, shiftDir: 0 }
    expect(collideWithPlayer([car], 1050, 0.7)).toBeNull()
  })
  test('纵向错过（|dz| > zTol）不命中', () => {
    const car: TrafficCar = { z: 1000, offset: 0.7, speed: 1200, colorIndex: 0, shiftDir: 0 }
    expect(collideWithPlayer([car], 2000, 0.7)).toBeNull()
  })
  test('无车不命中', () => {
    expect(collideWithPlayer([], 1000, 0)).toBeNull()
  })
})

describe('车流避让', () => {
  /** 避让逻辑参数镜像 traffic.ts 私有常量（防魔法数字漂移；dt=0.05 → 单帧步进 0.8*0.05=0.04） */
  const DT = 0.05

  /** 构造单辆静止车流（speed=0 让 z 不随帧推进，d 保持恒定便于断言） */
  const stillCar = (z: number, offset: number): TrafficCar => ({ z, offset, speed: 0, colorIndex: 0, shiftDir: 0 })

  test('玩家逼近同车道车流时 offset 朝远离侧渐变（player.x>0 → 负方向）', () => {
    const car = stillCar(100, 0.6)
    const player = { z: 0, x: 0.5 }
    // 车在玩家前方 d=100 < 350，|0.6-0.5|=0.1 < 1.2 → 避让；target=-0.85，步进 0.8*0.05=0.04/帧
    updateTraffic([car], DT, 20000, player)
    updateTraffic([car], DT, 20000, player)
    expect(car.offset).toBeCloseTo(0.6 - 0.08, 6)
    // 两次调用后仍未越过中线（0.08 步进远小于目标距离）
    expect(car.offset).toBeGreaterThan(0)
  })

  test('车在玩家前方 2000（远超触发距离）时 offset 不变', () => {
    const car = stillCar(2000, 0.6)
    const player = { z: 0, x: 0.5 }
    updateTraffic([car], DT, 20000, player)
    updateTraffic([car], DT, 20000, player)
    expect(car.offset).toBe(0.6)
  })

  test('异车道边界（|offset 差| = 1.2 不 < 1.2）不触发避让', () => {
    const car = stillCar(100, -0.7)
    const player = { z: 0, x: 0.5 }
    // 纵向 d=100 满足、横向 |-0.7-0.5|=1.2 恰好等于容差 → 不触发（严格小于）
    updateTraffic([car], DT, 20000, player)
    updateTraffic([car], DT, 20000, player)
    expect(car.offset).toBe(-0.7)
  })

  test('不带 player 参数时行为与旧版一致（offset 恒等、z 正常推进）', () => {
    const car: TrafficCar = { z: 100, offset: 0.6, speed: 1200, colorIndex: 0, shiftDir: 0 }
    updateTraffic([car], 0.5, 20000)
    expect(car.z).toBeCloseTo(700, 6)
    expect(car.offset).toBe(0.6)
  })

  test('玩家逼近同车道时 shiftDir 记录远离侧（player.x>0 → -1）', () => {
    const car = stillCar(100, 0.6)
    const player = { z: 0, x: 0.5 }
    updateTraffic([car], DT, 20000, player)
    expect(car.shiftDir).toBe(-1)
  })

  test('车远离（d=2000）时 shiftDir 保持 0（车灯回中）', () => {
    const car = stillCar(2000, 0.6)
    const player = { z: 0, x: 0.5 }
    updateTraffic([car], DT, 20000, player)
    expect(car.shiftDir).toBe(0)
  })
})
