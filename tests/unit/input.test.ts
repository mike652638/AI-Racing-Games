import { describe, expect, test } from 'vitest'
import { inputFromKeys, mergeCarInputs, PLAYER1_MAPPING, PLAYER2_MAPPING } from '../../src/physics/input'

describe('双人按键映射', () => {
  test('P1 WASD 映射到油门/刹车/转向', () => {
    const pressed = new Set(['KeyW', 'KeyD'])
    expect(inputFromKeys(pressed, PLAYER1_MAPPING)).toEqual({ throttle: 1, brake: false, steer: 1 })
    const brakeLeft = new Set(['KeyS', 'KeyA'])
    expect(inputFromKeys(brakeLeft, PLAYER1_MAPPING)).toEqual({ throttle: 0, brake: true, steer: -1 })
  })

  test('P2 方向键映射', () => {
    const pressed = new Set(['ArrowUp', 'ArrowRight'])
    expect(inputFromKeys(pressed, PLAYER2_MAPPING)).toEqual({ throttle: 1, brake: false, steer: 1 })
  })

  test('左右同按抵消为零', () => {
    const pressed = new Set(['ArrowLeft', 'ArrowRight'])
    expect(inputFromKeys(pressed, PLAYER2_MAPPING).steer).toBe(0)
  })

  test('无键输入全零', () => {
    expect(inputFromKeys(new Set(), PLAYER2_MAPPING)).toEqual({ throttle: 0, brake: false, steer: 0 })
  })

  test('其他玩家按键不互相干扰', () => {
    // P1 的按键不应影响 P2 的输入
    const pressed = new Set(['KeyW', 'KeyA'])
    expect(inputFromKeys(pressed, PLAYER2_MAPPING)).toEqual({ throttle: 0, brake: false, steer: 0 })
  })

  test('G4（G4）：P1 按 Space 时 boost 激活（mapping.boost=Space 产出 boost:true）', () => {
    const pressed = new Set(['KeyW', 'Space'])
    const input = inputFromKeys(pressed, PLAYER1_MAPPING)
    expect(input.boost).toBe(true)
  })

  test('G4（G4）：未按 boost 键时 boost 为 undefined（条件产出，既有三字段 toEqual 零改动）', () => {
    const input = inputFromKeys(new Set(['KeyW']), PLAYER1_MAPPING)
    expect(input.boost).toBeUndefined()
  })

  test('mergeCarInputs：单屏 P1 WASD + P2 方向键合并（油门取大、刹车或、转向相加 clamp）', () => {
    // WASD 油门 + 方向键转向：合并后两者同时生效
    const wasd = inputFromKeys(new Set(['KeyW', 'KeyD']), PLAYER1_MAPPING)
    const arrows = inputFromKeys(new Set(['ArrowRight']), PLAYER2_MAPPING)
    expect(mergeCarInputs(wasd, arrows)).toEqual({ throttle: 1, brake: false, steer: 1 })
  })

  test('mergeCarInputs：同向转向相加 clamp 到 ±1、反向抵消', () => {
    const right1 = inputFromKeys(new Set(['KeyD']), PLAYER1_MAPPING)
    const right2 = inputFromKeys(new Set(['ArrowRight']), PLAYER2_MAPPING)
    expect(mergeCarInputs(right1, right2).steer).toBe(1) // 1+1 → clamp 1
    const left = inputFromKeys(new Set(['KeyA']), PLAYER1_MAPPING)
    expect(mergeCarInputs(left, right2).steer).toBe(0) // -1+1 → 0
  })

  test('mergeCarInputs：刹车任一激活即刹车；boost 任一激活即产出', () => {
    const brake = inputFromKeys(new Set(['KeyS']), PLAYER1_MAPPING)
    const idle = inputFromKeys(new Set([]), PLAYER2_MAPPING)
    expect(mergeCarInputs(brake, idle)).toEqual({ throttle: 0, brake: true, steer: 0 })
    const boost1 = inputFromKeys(new Set(['Space']), PLAYER1_MAPPING)
    const boost2 = inputFromKeys(new Set(['Enter']), PLAYER2_MAPPING)
    expect(mergeCarInputs(boost1, idle).boost).toBe(true)
    expect(mergeCarInputs(idle, boost2).boost).toBe(true)
    expect(mergeCarInputs(idle, idle).boost).toBeUndefined()
  })
})
