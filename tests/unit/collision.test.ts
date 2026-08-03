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
  it('工厂创建默认状态（双 TrackContext，各带独立车流）', () => {
    const race = createRaceState()
    expect(race.player1.carState).toEqual({ position: 0, speed: 0 })
    expect(race.player2.carState).toEqual({ position: 0, speed: 0 })
    expect(race.player1.cameraZ).toBe(0)
    expect(race.player2.cameraZ).toBe(0)
    expect(race.player1.raceTime).toBe(0)
    expect(race.player2.raceTime).toBe(0)
    expect(race.collisionCount).toBe(0)
    expect(race.player1.collisionCooldown).toBe(0)
    expect(race.player2.collisionCooldown).toBe(0)
    expect(race.lapTimes).toEqual([])
    expect(race.lastLap).toBe(1)
    expect(race.phase).toBe('menu')
    expect(race.finishShown).toBe(false)
    // 双玩家各持独立赛道上下文与独立车流数组（分屏各用其一）
    expect(race.tracks).toHaveLength(2)
    expect(race.tracks[0].traffic).not.toBe(race.tracks[1].traffic)
    expect(race.tracks[0].lapLength).toBeGreaterThan(0)
    expect(race.tracks[0].totalLaps).toBeGreaterThan(0)
  })

  it('重置恢复默认值且不重建 tracks（保留赛道上下文引用）', () => {
    const race = createRaceState()
    const tracks0 = race.tracks[0]
    const tracks1 = race.tracks[1]
    race.player1.carState.speed = 500
    race.player2.carState.position = 0.8
    race.player1.cameraZ = 30000
    race.player2.cameraZ = 12000
    race.player1.raceTime = 42
    race.player2.raceTime = 30
    race.collisionCount = 5
    race.player1.collisionCooldown = 0.5
    race.player2.collisionCooldown = 0.3
    race.lapTimes = [20, 41]
    race.lastLap = 3
    race.finishShown = true

    resetRaceState(race)

    expect(race.player1.carState).toEqual({ position: 0, speed: 0 })
    expect(race.player2.carState).toEqual({ position: 0, speed: 0 })
    expect(race.player1.cameraZ).toBe(0)
    expect(race.player2.cameraZ).toBe(0)
    expect(race.player1.raceTime).toBe(0)
    expect(race.player2.raceTime).toBe(0)
    expect(race.collisionCount).toBe(0)
    expect(race.player1.collisionCooldown).toBe(0)
    expect(race.player2.collisionCooldown).toBe(0)
    expect(race.lapTimes).toEqual([])
    expect(race.lastLap).toBe(1)
    expect(race.finishShown).toBe(false)
    // 重置不重建赛道上下文（由 TrackManager 管理），只清玩家状态与计数
    expect(race.tracks[0]).toBe(tracks0)
    expect(race.tracks[1]).toBe(tracks1)
  })

  it('双玩家碰撞冷却创建与重置时均为 0', () => {
    const race = createRaceState()
    expect(race.player1.collisionCooldown).toBe(0)
    expect(race.player2.collisionCooldown).toBe(0)
    race.player1.collisionCooldown = 1
    race.player2.collisionCooldown = 1
    resetRaceState(race)
    expect(race.player1.collisionCooldown).toBe(0)
    expect(race.player2.collisionCooldown).toBe(0)
  })
})

describe('applyTrafficCollision', () => {
  it('无车流时不碰撞', () => {
    const s = car(0.5, 100)
    const r = applyTrafficCollision(s, 1000, [], 0, 0.016)
    expect(r.hit).toBe(false)
    expect(r.cooldown).toBe(0)
    expect(s.speed).toBe(100)
  })

  it('纵向横向均接近时碰撞并减速一半', () => {
    const s = car(0.5, 100)
    const r = applyTrafficCollision(s, 1000, [trafficCar(1040)], 0, 0.016)
    expect(r.hit).toBe(true)
    expect(r.cooldown).toBeGreaterThan(0)
    expect(s.speed).toBe(50)
  })

  it('横向错开不碰撞', () => {
    const s = car(0.5, 100)
    const r = applyTrafficCollision(s, 1000, [trafficCar(1040, -0.5)], 0, 0.016)
    expect(r.hit).toBe(false)
    expect(r.cooldown).toBe(0)
    expect(s.speed).toBe(100)
  })

  it('纵向错过不碰撞', () => {
    const s = car(0.5, 100)
    const r = applyTrafficCollision(s, 2000, [trafficCar(1040)], 0, 0.016)
    expect(r.hit).toBe(false)
    expect(r.cooldown).toBe(0)
    expect(s.speed).toBe(100)
  })

  it('碰撞后进入冷却，冷却期内不再重复命中', () => {
    const s = car(0.5, 100)
    const first = applyTrafficCollision(s, 1000, [trafficCar(1040)], 0, 0.016)
    expect(first.hit).toBe(true)
    expect(first.cooldown).toBeGreaterThan(0)
    // 冷却期内仍与车流重叠，但不再次惩罚
    const second = applyTrafficCollision(s, 1000, [trafficCar(1040)], first.cooldown, 0.016)
    expect(second.hit).toBe(false)
    expect(second.cooldown).toBeLessThan(first.cooldown)
    expect(s.speed).toBe(50)
  })

  it('冷却随时间衰减，衰减结束后可再次碰撞', () => {
    const s = car(0.5, 100)
    const first = applyTrafficCollision(s, 1000, [trafficCar(1040)], 0, 0.016)
    expect(first.hit).toBe(true)
    expect(s.speed).toBe(50)
    // dt=1 使冷却归零，本帧立即恢复检测并命中
    const second = applyTrafficCollision(s, 1000, [trafficCar(1040)], first.cooldown, 1)
    expect(second.hit).toBe(true)
    expect(s.speed).toBe(25)
    expect(second.cooldown).toBeGreaterThan(0)
  })

  it('不同冷却值互不影响（独立冷却）', () => {
    const a = car(0.5, 100)
    const b = car(0.5, 100)
    const ra = applyTrafficCollision(a, 1000, [trafficCar(1040)], 0, 0.016)
    const rb = applyTrafficCollision(b, 1000, [trafficCar(1040)], 0, 0.016)
    expect(ra.hit).toBe(true)
    expect(rb.hit).toBe(true)
    expect(a.speed).toBe(50)
    expect(b.speed).toBe(50)
  })
})

describe('updateCollisions（P1 车流碰撞）', () => {
  it('P1 车流碰撞：减速并计数', () => {
    const race = createRaceState()
    race.tracks[0].traffic = [trafficCar(1040)]
    race.player1.carState = car(0.5, 100)
    race.player1.cameraZ = 1000
    updateCollisions(race, 0.016, false)
    expect(race.player1.carState.speed).toBe(50)
    expect(race.collisionCount).toBe(1)
  })

  it('P1 冷却期内不重复计数', () => {
    const race = createRaceState()
    race.tracks[0].traffic = [trafficCar(1040)]
    race.player1.carState = car(0.5, 100)
    race.player1.cameraZ = 1000
    updateCollisions(race, 0.016, false)
    updateCollisions(race, 0.016, false)
    expect(race.player1.carState.speed).toBe(50)
    expect(race.collisionCount).toBe(1)
  })
})

describe('updateCollisions（P2 车流碰撞修复）', () => {
  it('分屏模式下 P2 与车流碰撞：减速并计数（修复原缺失功能）', () => {
    const race = createRaceState()
    race.tracks[1].traffic = [trafficCar(1040)]
    race.player2.carState = car(0.5, 100)
    race.player2.cameraZ = 1000
    updateCollisions(race, 0.016, true)
    expect(race.player2.carState.speed).toBe(50)
    expect(race.collisionCount).toBe(1)
  })

  it('非分屏模式下 P2 不与车流碰撞', () => {
    const race = createRaceState()
    race.tracks[1].traffic = [trafficCar(1040)]
    race.player2.carState = car(0.5, 100)
    race.player2.cameraZ = 1000
    updateCollisions(race, 0.016, false)
    expect(race.player2.carState.speed).toBe(100)
    expect(race.collisionCount).toBe(0)
  })

  it('P1/P2 各自独立冷却：一方碰撞不影响另一方立即碰撞', () => {
    // 两个独立赛道世界：P1 世界左道车流撞 P1（position -0.5），P2 世界右道车流撞 P2（position 0.5）
    const race = createRaceState()
    race.tracks[0].traffic = [trafficCar(1040, -0.5)]
    race.tracks[1].traffic = [trafficCar(1050, 0.5)]
    race.player1.carState = car(-0.5, 100)
    race.player2.carState = car(0.5, 100)
    race.player1.cameraZ = 1000
    race.player2.cameraZ = 1000
    updateCollisions(race, 0.016, true)
    expect(race.player1.carState.speed).toBe(50)
    expect(race.player2.carState.speed).toBe(50)
    expect(race.collisionCount).toBe(2)
    // 第二帧双方均在冷却中，计数不增
    updateCollisions(race, 0.016, true)
    expect(race.collisionCount).toBe(2)
  })
})

describe('updateCollisions（分屏双世界车流独立）', () => {
  it('P1 车流有车而 P2 车流为空：仅 P1 被罚速，计数只 +1', () => {
    const race = createRaceState()
    race.tracks[0].traffic = [trafficCar(1040)]
    race.tracks[1].traffic = []
    race.player1.carState = car(0.5, 100)
    race.player2.carState = car(0.5, 100)
    race.player1.cameraZ = 1000
    race.player2.cameraZ = 1000
    updateCollisions(race, 0.016, true)
    expect(race.player1.carState.speed).toBe(50)
    expect(race.player2.carState.speed).toBe(100)
    expect(race.collisionCount).toBe(1)
  })

  it('P1 车流为空而 P2 车流有车：仅 P2 被罚速，计数只 +1', () => {
    const race = createRaceState()
    race.tracks[0].traffic = []
    race.tracks[1].traffic = [trafficCar(1040)]
    race.player1.carState = car(0.5, 100)
    race.player2.carState = car(0.5, 100)
    race.player1.cameraZ = 1000
    race.player2.cameraZ = 1000
    updateCollisions(race, 0.016, true)
    expect(race.player1.carState.speed).toBe(100)
    expect(race.player2.carState.speed).toBe(50)
    expect(race.collisionCount).toBe(1)
  })
})
