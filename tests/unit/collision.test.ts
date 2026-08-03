import { describe, expect, it } from 'vitest'
import { applyTrafficCollision, updateCollisions } from '../../src/game/collision'
import { createRaceState, resetRaceState } from '../../src/game/state'
import type { CarState } from '../../src/physics/car'
import type { TrafficCar } from '../../src/engine/traffic'

/** 构造测试车辆状态 */
function car(position = 0, speed = 100): CarState {
  return { position, speed }
}

/** 构造测试车流车辆（默认与玩家同车道） */
function trafficCar(z: number, offset = 0.5, speed = 2400): TrafficCar {
  return { z, offset, speed, colorIndex: 0 }
}

describe('createRaceState / resetRaceState', () => {
  it('工厂创建默认状态', () => {
    const traffic = [trafficCar(0)]
    const race = createRaceState(traffic)
    expect(race.carState).toEqual({ position: 0, speed: 0 })
    expect(race.carState2).toEqual({ position: 0, speed: 0 })
    expect(race.cameraZ).toBe(0)
    expect(race.cameraZ2).toBe(0)
    expect(race.raceTime).toBe(0)
    expect(race.raceTime2).toBe(0)
    expect(race.collisionCount).toBe(0)
    expect(race.collisionCooldown).toBe(0)
    expect(race.collisionCooldown2).toBe(0)
    expect(race.lapTimes).toEqual([])
    expect(race.lastLap).toBe(1)
    expect(race.phase).toBe('menu')
    expect(race.finishShown).toBe(false)
    expect(race.traffic).toBe(traffic)
  })

  it('重置恢复默认值并替换车流', () => {
    const race = createRaceState([trafficCar(0)])
    race.carState.speed = 500
    race.carState2.position = 0.8
    race.cameraZ = 30000
    race.cameraZ2 = 12000
    race.raceTime = 42
    race.raceTime2 = 30
    race.collisionCount = 5
    race.collisionCooldown = 0.5
    race.collisionCooldown2 = 0.3
    race.lapTimes = [20, 41]
    race.lastLap = 3
    race.finishShown = true

    const newTraffic = [trafficCar(5000)]
    resetRaceState(race, newTraffic)

    expect(race.carState).toEqual({ position: 0, speed: 0 })
    expect(race.carState2).toEqual({ position: 0, speed: 0 })
    expect(race.cameraZ).toBe(0)
    expect(race.cameraZ2).toBe(0)
    expect(race.raceTime).toBe(0)
    expect(race.raceTime2).toBe(0)
    expect(race.collisionCount).toBe(0)
    expect(race.collisionCooldown).toBe(0)
    expect(race.collisionCooldown2).toBe(0)
    expect(race.lapTimes).toEqual([])
    expect(race.lastLap).toBe(1)
    expect(race.finishShown).toBe(false)
    expect(race.traffic).toBe(newTraffic)
  })
})

describe('applyTrafficCollision', () => {
  it('无车流时不碰撞', () => {
    const s = car(0.5, 100)
    const cooldown = { value: 0 }
    expect(applyTrafficCollision(s, 1000, [], cooldown, 0.016)).toBe(false)
    expect(s.speed).toBe(100)
  })

  it('纵向横向均接近时碰撞并减速一半', () => {
    const s = car(0.5, 100)
    const cooldown = { value: 0 }
    expect(applyTrafficCollision(s, 1000, [trafficCar(1040)], cooldown, 0.016)).toBe(true)
    expect(s.speed).toBe(50)
  })

  it('横向错开不碰撞', () => {
    const s = car(0.5, 100)
    const cooldown = { value: 0 }
    expect(applyTrafficCollision(s, 1000, [trafficCar(1040, -0.5)], cooldown, 0.016)).toBe(false)
    expect(s.speed).toBe(100)
  })

  it('纵向错过不碰撞', () => {
    const s = car(0.5, 100)
    const cooldown = { value: 0 }
    expect(applyTrafficCollision(s, 2000, [trafficCar(1040)], cooldown, 0.016)).toBe(false)
    expect(s.speed).toBe(100)
  })

  it('碰撞后进入冷却，冷却期内不再重复命中', () => {
    const s = car(0.5, 100)
    const cooldown = { value: 0 }
    expect(applyTrafficCollision(s, 1000, [trafficCar(1040)], cooldown, 0.016)).toBe(true)
    expect(cooldown.value).toBeGreaterThan(0)
    // 冷却期内仍与车流重叠，但不再次惩罚
    expect(applyTrafficCollision(s, 1000, [trafficCar(1040)], cooldown, 0.016)).toBe(false)
    expect(s.speed).toBe(50)
  })

  it('冷却随时间衰减，衰减结束后可再次碰撞', () => {
    const s = car(0.5, 100)
    const cooldown = { value: 0 }
    expect(applyTrafficCollision(s, 1000, [trafficCar(1040)], cooldown, 0.016)).toBe(true)
    expect(s.speed).toBe(50)
    // dt=1 使冷却归零，本帧立即恢复检测并命中
    expect(applyTrafficCollision(s, 1000, [trafficCar(1040)], cooldown, 1)).toBe(true)
    expect(s.speed).toBe(25)
    expect(cooldown.value).toBeGreaterThan(0)
  })

  it('不同 cooldown 包装对象互不影响（独立冷却）', () => {
    const a = car(0.5, 100)
    const b = car(0.5, 100)
    const cooldownA = { value: 0 }
    const cooldownB = { value: 0 }
    expect(applyTrafficCollision(a, 1000, [trafficCar(1040)], cooldownA, 0.016)).toBe(true)
    expect(applyTrafficCollision(b, 1000, [trafficCar(1040)], cooldownB, 0.016)).toBe(true)
    expect(a.speed).toBe(50)
    expect(b.speed).toBe(50)
  })
})

describe('updateCollisions（P1 车流碰撞）', () => {
  it('P1 车流碰撞：减速并计数', () => {
    const race = createRaceState([trafficCar(1040)])
    race.carState = car(0.5, 100)
    race.cameraZ = 1000
    updateCollisions(race, 0.016, false)
    expect(race.carState.speed).toBe(50)
    expect(race.collisionCount).toBe(1)
  })

  it('P1 冷却期内不重复计数', () => {
    const race = createRaceState([trafficCar(1040)])
    race.carState = car(0.5, 100)
    race.cameraZ = 1000
    updateCollisions(race, 0.016, false)
    updateCollisions(race, 0.016, false)
    expect(race.carState.speed).toBe(50)
    expect(race.collisionCount).toBe(1)
  })
})

describe('updateCollisions（P2 车流碰撞修复）', () => {
  it('分屏模式下 P2 与车流碰撞：减速并计数（修复原缺失功能）', () => {
    const race = createRaceState([trafficCar(1040)])
    race.carState2 = car(0.5, 100)
    race.cameraZ2 = 1000
    updateCollisions(race, 0.016, true)
    expect(race.carState2.speed).toBe(50)
    expect(race.collisionCount).toBe(1)
  })

  it('非分屏模式下 P2 不与车流碰撞', () => {
    const race = createRaceState([trafficCar(1040)])
    race.carState2 = car(0.5, 100)
    race.cameraZ2 = 1000
    updateCollisions(race, 0.016, false)
    expect(race.carState2.speed).toBe(100)
    expect(race.collisionCount).toBe(0)
  })

  it('P2 使用独立冷却：P1 碰撞后 P2 仍可立即碰撞', () => {
    // P1(-0.5) 撞左道车流，P2(0.5) 撞右道车流；横向差 1.0 > 0.9 不互碰
    const race = createRaceState([trafficCar(1040, -0.5), trafficCar(1050, 0.5)])
    race.carState = car(-0.5, 100)
    race.carState2 = car(0.5, 100)
    race.cameraZ = 1000
    race.cameraZ2 = 1000
    updateCollisions(race, 0.016, true)
    expect(race.carState.speed).toBe(50)
    expect(race.carState2.speed).toBe(50)
    expect(race.collisionCount).toBe(2)
    // 第二帧双方均在冷却中，计数不增
    updateCollisions(race, 0.016, true)
    expect(race.collisionCount).toBe(2)
  })
})

describe('updateCollisions（P1-P2 互碰）', () => {
  /** 构造两车完全重叠的分屏对局状态 */
  function makeRaceWithOverlap() {
    const race = createRaceState([])
    race.cameraZ = 100
    race.cameraZ2 = 100
    race.carState.position = 0
    race.carState2.position = 0
    race.carState.speed = 100
    race.carState2.speed = 100
    return race
  }

  it('playerCollisionCooldown 创建与重置时均为 0', () => {
    const race = createRaceState([])
    expect(race.playerCollisionCooldown).toBe(0)
    race.playerCollisionCooldown = 1
    resetRaceState(race, [])
    expect(race.playerCollisionCooldown).toBe(0)
  })

  it('冷却期内连续重叠只罚速一次（修复 P0-1 每帧罚速）', () => {
    const race = makeRaceWithOverlap()
    updateCollisions(race, 0.016, true)
    const afterFirst = race.carState.speed
    expect(afterFirst).toBeLessThan(100)
    // 第二帧仍重叠，但处于冷却期内，不应再次罚速
    updateCollisions(race, 0.016, true)
    expect(race.carState.speed).toBe(afterFirst)
  })

  it('冷却结束后再次重叠可再次罚速', () => {
    const race = makeRaceWithOverlap()
    updateCollisions(race, 0.016, true)
    const afterFirst = race.carState.speed
    // 1.1 秒后冷却结束（本帧仅衰减，不检测）
    updateCollisions(race, 1.1, true)
    expect(race.carState.speed).toBe(afterFirst)
    // 冷却已归零，再次重叠仍罚速
    race.carState.speed = 100
    race.carState2.speed = 100
    updateCollisions(race, 0.016, true)
    expect(race.carState.speed).toBeLessThan(100)
  })

  it('两车同处时互相减速并计数', () => {
    const race = createRaceState([])
    race.carState = car(0, 100)
    race.carState2 = car(0.5, 100)
    race.cameraZ = 1000
    race.cameraZ2 = 1000
    updateCollisions(race, 0.016, true)
    expect(race.carState.speed).toBe(50)
    expect(race.carState2.speed).toBe(50)
    expect(race.collisionCount).toBe(1)
  })

  it('纵向距离超出容差不互碰', () => {
    const race = createRaceState([])
    race.carState = car(0, 100)
    race.carState2 = car(0.5, 100)
    race.cameraZ = 1000
    race.cameraZ2 = 1200
    updateCollisions(race, 0.016, true)
    expect(race.carState.speed).toBe(100)
    expect(race.carState2.speed).toBe(100)
    expect(race.collisionCount).toBe(0)
  })

  it('非分屏模式不进行 P1-P2 互碰', () => {
    const race = createRaceState([])
    race.carState = car(0, 100)
    race.carState2 = car(0.5, 100)
    race.cameraZ = 1000
    race.cameraZ2 = 1000
    updateCollisions(race, 0.016, false)
    expect(race.carState.speed).toBe(100)
    expect(race.carState2.speed).toBe(100)
    expect(race.collisionCount).toBe(0)
  })
})
