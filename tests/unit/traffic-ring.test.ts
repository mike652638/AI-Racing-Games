import { describe, expect, test } from 'vitest'
import {
  collideWithPlayer,
  ringDelta,
  ringForwardDistance,
  TRAFFIC_CRUISE_SPEED,
  updateTraffic,
  type TrafficCar,
} from '../../src/engine/traffic'
import { projectTraffic } from '../../src/engine/traffic-render'
import { updateNearMiss } from '../../src/game/near-miss'
import { DRAW_DISTANCE } from '../../src/engine/road-geometry'
import { SEGMENT_LENGTH } from '../../src/engine/track'
import type { Camera3D, ProjectionOptions } from '../../src/engine/projection'

/**
 * 车流环形语义回归（2026-09-04 P0-1 修复）。
 *
 * 背景：玩家 cameraZ 单调累加从不取模（frame-pure / simulate），而 TrafficCar.z 每帧
 * `% lapLength`。碰撞、投影、避让、near-miss 四处原本各写各的裸差值/半环形表达式，
 * 导致第二圈起车流既不渲染也不碰撞。本文件锁定"多圈场景下四处均生效"这一契约。
 *
 * 圈长取 60000 >> 视距 24000，以便构造"只有前方一段可见"的真实场景。
 */
const L = 60000
/** 可见视距（世界单位）= DRAW_DISTANCE × SEGMENT_LENGTH */
const FAR = DRAW_DISTANCE * SEGMENT_LENGTH

const OPTS: ProjectionOptions = { width: 800, height: 600, horizon: 210, depth: 672 }

function cameraAt(z: number): Camera3D {
  return { x: 0, y: 1, z }
}

function carAt(z: number, offset = 0, speed = TRAFFIC_CRUISE_SPEED): TrafficCar {
  return { z, offset, cruiseOffset: offset, speed, colorIndex: 0, shiftDir: 0 }
}

describe('ringForwardDistance（环形前向距离）', () => {
  test('同圈内前向：from < to 时返回差值', () => {
    expect(ringForwardDistance(0, 100, 1000)).toBe(100)
  })

  test('跨圈回绕：from 在圈末、to 在圈首时正确绕回', () => {
    expect(ringForwardDistance(900, 100, 1000)).toBe(200)
  })

  test('from 已跑过一圈：等价位置正确参与计算', () => {
    // 1500 ≡ 500（mod 1000），从 500 前进到 100 需 600
    expect(ringForwardDistance(1500, 100, 1000)).toBe(600)
  })

  test('第三圈起仍正确（旧表达式 `(to-from+L)%L` 在此返回负数）', () => {
    // 旧式：(100 - 2500 + 1000) % 1000 = (-1400) % 1000 = -400（JS 负数取模）→ 判定 d>0 失败
    expect((100 - 2500 + 1000) % 1000).toBe(-400)
    // 新式：2500 ≡ 500，从 500 前进到 100 需 600
    expect(ringForwardDistance(2500, 100, 1000)).toBe(600)
  })

  test('结果恒在 [0, lapLength) 区间内（任意大小的 from/to）', () => {
    for (const from of [0, 999.5, 1000, 12345.6, 1e7]) {
      for (const to of [0, 0.1, 500, 999.9, 1e7]) {
        const d = ringForwardDistance(from, to, 1000)
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThan(1000)
      }
    }
  })
})

describe('ringDelta（环形最短带符号距离）', () => {
  test('正前方近距离返回正值', () => {
    expect(ringDelta(0, 50, 1000)).toBe(50)
  })

  test('正后方近距离返回负值（绝对值即最短距离）', () => {
    expect(ringDelta(0, 950, 1000)).toBe(-50)
  })

  test('恰好半圈取正值（边界归前向）', () => {
    expect(ringDelta(0, 500, 1000)).toBe(500)
  })
})

describe('collideWithPlayer 跨圈碰撞', () => {
  test('首圈（裸比较即可命中）：两种情况一致', () => {
    const traffic = [carAt(5000)]
    expect(collideWithPlayer(traffic, 5000, 0)).not.toBeNull()
    expect(collideWithPlayer(traffic, 5000, 0, undefined, undefined, L)).not.toBeNull()
  })

  test('第二圈：不传 lapLength 时旧行为失效（锁定 bug 原貌），传入后命中', () => {
    // 玩家已跑一整圈回到同一位置（cameraZ = 5000 + L），车静止在 z=5000 → 实际贴身
    const traffic = [carAt(5000)]
    const playerZ = 5000 + L
    expect(collideWithPlayer(traffic, playerZ, 0)).toBeNull()
    expect(collideWithPlayer(traffic, playerZ, 0, undefined, undefined, L)).not.toBeNull()
  })

  test('第三圈：环形语义仍命中（不因累加圈数退化）', () => {
    const traffic = [carAt(5000)]
    for (const lap of [0, 1, 2, 5, 20]) {
      expect(collideWithPlayer(traffic, 5000 + lap * L, 0, undefined, undefined, L)).not.toBeNull()
    }
  })

  test('跨圈边界：玩家在圈末、车在圈首（环形相邻）也算碰撞', () => {
    const traffic = [carAt(10)]
    const playerZ = L - 10 // 距圈末 10，跨圈到 z=10 共 20 < TRAFFIC_Z_TOL(80)
    expect(collideWithPlayer(traffic, playerZ, 0, undefined, undefined, L)).not.toBeNull()
  })

  test('横向超出容差不碰撞（环形判定不放宽横向语义）', () => {
    const traffic = [carAt(5000, 0.9)]
    expect(collideWithPlayer(traffic, 5000 + L, 0, undefined, undefined, L)).toBeNull()
  })
})

describe('projectTraffic 跨圈投影', () => {
  test('首圈：前方车可见、后方车不可见', () => {
    const traffic = [carAt(5000), carAt(5000 - FAR - 500)]
    const cars = projectTraffic(traffic, 1000, 0, OPTS, cameraAt(1000), L)
    expect(cars).toHaveLength(1)
    expect(cars[0].car.z).toBe(5000)
  })

  test('第二圈：修复前车流完全不渲染，修复后正常投影', () => {
    // 玩家跑完一圈回到 cameraZ = L + 1000，车静止在 z=5000（前方 4000）
    const cameraZ = L + 1000
    const traffic = [carAt(5000)]
    expect(projectTraffic(traffic, cameraZ, 0, OPTS, cameraAt(cameraZ))).toHaveLength(0)
    const cars = projectTraffic(traffic, cameraZ, 0, OPTS, cameraAt(cameraZ), L)
    expect(cars).toHaveLength(1)
  })

  test('返回的 z 是绝对化坐标（cameraZ + 环形前向距离），与景物 sprite 同坐标系', () => {
    const cameraZ = L + 1000
    const cars = projectTraffic([carAt(5000)], cameraZ, 0, OPTS, cameraAt(cameraZ), L)
    expect(cars[0].z).toBeCloseTo(cameraZ + 4000, 6)
    // car.z 本体仍是 [0, lapLength) 内的真实环形位置
    expect(cars[0].car.z).toBe(5000)
  })

  test('投影结果按远→近排序（画家算法归并依赖此顺序）', () => {
    const cameraZ = L + 1000
    const traffic = [carAt(3000), carAt(9000), carAt(6000)]
    const cars = projectTraffic(traffic, cameraZ, 0, OPTS, cameraAt(cameraZ), L)
    expect(cars).toHaveLength(3)
    expect(cars[0].z).toBeGreaterThan(cars[1].z)
    expect(cars[1].z).toBeGreaterThan(cars[2].z)
  })

  test('超出视距的车不投影（环形语义下同样生效）', () => {
    const cameraZ = L + 1000
    // 环形前向距离 = FAR + 1000 > FAR
    const traffic = [carAt((cameraZ + FAR + 1000) % L)]
    expect(projectTraffic(traffic, cameraZ, 0, OPTS, cameraAt(cameraZ), L)).toHaveLength(0)
  })
})

describe('updateTraffic 避让跨圈生效', () => {
  test('第三圈玩家逼近同车道车辆时仍触发变道（旧表达式在此得到负 d 而静默失效）', () => {
    const playerZ = 2.5 * L // ≡ 30000
    const traffic = [carAt(30100, 0)] // 玩家正前方 100，同车道
    // 旧式：(30100 - 150000 + 60000) % 60000 = -59900 → 不触发
    expect((30100 - playerZ + L) % L).toBeLessThan(0)
    updateTraffic(traffic, 1 / 60, L, { z: playerZ, x: 0 })
    // 修复后：触发避让，车辆横向偏移离开玩家所在车道（x=0 → 向一侧渐变）
    expect(Math.abs(traffic[0].offset)).toBeGreaterThan(0)
    expect(traffic[0].shiftDir).not.toBe(0)
  })
})

describe('updateNearMiss 跨圈生效', () => {
  test('第三圈擦身超车仍触发（旧表达式在此得到负 d）', () => {
    const playerZ = 2.5 * L
    const traffic = [carAt(30100, 0.7)] // 横向 0.7：大于碰撞容差 0.55、小于 near-miss 容差 0.9
    expect((30100 - playerZ + L) % L).toBeLessThan(0)
    const r = updateNearMiss(traffic, playerZ, 0, TRAFFIC_CRUISE_SPEED * 2, 0, 1 / 60, L)
    expect(r.hit).toBe(true)
  })
})
