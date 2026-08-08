import { describe, expect, test } from 'vitest'
import type { TrafficCar } from '../../src/engine/traffic'
import { updateNearMiss } from '../../src/game/near-miss'
import { NEAR_MISS_COOLDOWN, NEAR_MISS_Z_DIST } from '../../src/shared/constants'

const DT = 1 / 60
const LAP = 10000

/** 构造一辆车：z（玩家前方距离 d 则 z = playerZ + d）、offset、speed */
function car(z: number, offset: number, speed = 2400): TrafficCar {
  return { z, offset, speed, colorIndex: 0, shiftDir: 0 }
}

describe('near-miss 贴身超车检测（P0）', () => {
  const playerZ = 1000
  const playerX = 0
  const playerSpeed = 6000

  test('车在玩家前方近处且横向贴近（未碰撞）→ hit', () => {
    // 车 offset 0.7：|0.7 - 0| = 0.7 ∈ (TRAFFIC_X_TOL 0.55, NEAR_MISS_X_TOL 0.9)
    const r = updateNearMiss([car(playerZ + 50, 0.7)], playerZ, playerX, playerSpeed, 0, DT, LAP)
    expect(r.hit).toBe(true)
    // 触发后冷却重置为 NEAR_MISS_COOLDOWN
    expect(r.cooldown).toBe(NEAR_MISS_COOLDOWN)
  })

  test('横向距离过远（≥ NEAR_MISS_X_TOL）不触发', () => {
    const r = updateNearMiss([car(playerZ + 50, 1.1)], playerZ, playerX, playerSpeed, 0, DT, LAP)
    expect(r.hit).toBe(false)
    expect(r.cooldown).toBe(0)
  })

  test('横向距离进入碰撞区（≤ TRAFFIC_X_TOL）不触发（碰撞会先触发并弹开）', () => {
    const r = updateNearMiss([car(playerZ + 50, 0.3)], playerZ, playerX, playerSpeed, 0, DT, LAP)
    expect(r.hit).toBe(false)
  })

  test('车在玩家后方（环形语义 d 接近 lapLength）不触发', () => {
    // 车 z = playerZ - 50 → 环形 d = (950 - 1000 + 10000) % 10000 = 9950，远超 NEAR_MISS_Z_DIST
    const r = updateNearMiss([car(playerZ - 50, 0.7)], playerZ, playerX, playerSpeed, 0, DT, LAP)
    expect(r.hit).toBe(false)
  })

  test('纵向距离超出 NEAR_MISS_Z_DIST 不触发', () => {
    const r = updateNearMiss([car(playerZ + NEAR_MISS_Z_DIST + 10, 0.7)], playerZ, playerX, playerSpeed, 0, DT, LAP)
    expect(r.hit).toBe(false)
  })

  test('玩家速度不高于车流速度（未超越）不触发', () => {
    const r = updateNearMiss([car(playerZ + 50, 0.7)], playerZ, playerX, 2400, 0, DT, LAP)
    expect(r.hit).toBe(false)
  })

  test('冷却期内不触发，冷却按 dt 衰减', () => {
    // 第一帧触发 → cooldown = NEAR_MISS_COOLDOWN
    const r1 = updateNearMiss([car(playerZ + 50, 0.7)], playerZ, playerX, playerSpeed, 0, DT, LAP)
    expect(r1.hit).toBe(true)
    // 下一帧冷却中，即使条件满足也不触发；cooldown 衰减一帧
    const r2 = updateNearMiss([car(playerZ + 50, 0.7)], playerZ, playerX, playerSpeed, r1.cooldown, DT, LAP)
    expect(r2.hit).toBe(false)
    expect(r2.cooldown).toBeCloseTo(NEAR_MISS_COOLDOWN - DT, 6)
  })

  test('多辆车：任一满足即触发（扫描全部）', () => {
    const cars = [car(playerZ + 300, 1.2), car(playerZ + 30, 0.8), car(playerZ + 200, 0.6)]
    const r = updateNearMiss(cars, playerZ, playerX, playerSpeed, 0, DT, LAP)
    expect(r.hit).toBe(true)
  })

  test('无车流不触发', () => {
    const r = updateNearMiss([], playerZ, playerX, playerSpeed, 0, DT, LAP)
    expect(r.hit).toBe(false)
  })
})
