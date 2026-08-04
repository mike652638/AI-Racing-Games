import { describe, expect, test, vi } from 'vitest'
import {
  createModeStrategy,
  type InputRoutingContext,
  type ModeStrategy,
  type PlayerUpdateArgs,
  type SelectTrackArgs,
} from '../../src/game/mode-strategy'
import { initialPreviewCameraZ } from '../../src/game/frame-pure'
import { createRaceState } from '../../src/game/state'
import { createCarConfig, type CarInput } from '../../src/physics/car'
import type { TrackManager } from '../../src/game/track-manager'

/** 圈长/总圈数固定的 TrackManager 替身（shouldFinish/updatePlayers 仅依赖这两个方法） */
function mockTrackManager(lapLength = 1000, totalLaps = 3): TrackManager {
  return {
    getLapLength: () => lapLength,
    getTotalLaps: () => totalLaps,
  } as unknown as TrackManager
}

/** 输入路由上下文：P1 全油门、P2 右转（便于断言合并/独立路由差异） */
function routingCtx(over: Partial<InputRoutingContext> = {}): InputRoutingContext {
  return {
    joystickActive: false,
    joystickInput: { throttle: 0, brake: false, steer: 0 },
    p1Input: { throttle: 1, brake: false, steer: 0 },
    p2Input: { throttle: 0, brake: false, steer: 1 },
    ...over,
  }
}

/** 玩家更新参数：全油门输入 + 真实 RaceState（验证热座回合路由的实际物理效果） */
function playerArgs(race = createRaceState(), over: Partial<PlayerUpdateArgs> = {}): PlayerUpdateArgs {
  return {
    dt: 1,
    effInput1: { throttle: 1, brake: false, steer: 0 },
    effInput2: { throttle: 0, brake: false, steer: 0 },
    race,
    carConfig: createCarConfig(),
    trackManager: mockTrackManager(),
    wet: false,
    challengeMult: undefined,
    ...over,
  }
}

/** 选赛道同步参数（默认 trackIndex=2，热座同步时 P2 世界圈长 9000） */
function selectArgs(over: Partial<SelectTrackArgs> = {}): SelectTrackArgs {
  return {
    trackIndex: 2,
    race: createRaceState(),
    trackManager: mockTrackManager(),
    previewCameraZ: [100, 200],
    ...over,
  }
}

describe('createModeStrategy 工厂', () => {
  test('全 false 返回单屏（SINGLE）', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })
    expect(mode.splitMode).toBe(false)
    expect(mode.hotseatMode).toBe(false)
    expect(mode.challengeMode).toBe(false)
  })

  test('split 优先：即使 hotseat/challenge 同时为 true 也返回分屏', () => {
    const mode = createModeStrategy({ splitMode: true, hotseatMode: true, challengeMode: true })
    expect(mode.splitMode).toBe(true)
    expect(mode.hotseatMode).toBe(false)
    expect(mode.challengeMode).toBe(false)
  })

  test('仅 hotseat 返回热座', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: true })
    expect(mode.hotseatMode).toBe(true)
    expect(mode.splitMode).toBe(false)
    expect(mode.challengeMode).toBe(false)
  })

  test('仅 challenge 返回挑战', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: true })
    expect(mode.challengeMode).toBe(true)
    expect(mode.splitMode).toBe(false)
    expect(mode.hotseatMode).toBe(false)
  })
})

describe('getInputs 输入路由', () => {
  test('SINGLE 合并双键盘：input1 为 merge 结果、input2 恒零输入', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })
    const { input1, input2 } = mode.getInputs(routingCtx())
    // mergeCarInputs：throttle 取大、steer 相加（0+1=1）、无 boost 不产出字段
    expect(input1).toEqual({ throttle: 1, brake: false, steer: 1 })
    expect(input2).toEqual({ throttle: 0, brake: false, steer: 0 })
  })

  test('HOTSEAT/CHALLENGE 与 SINGLE 同路由：合并双键盘且 input2 零输入', () => {
    const hotseat = createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: false })
    const challenge = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: true })
    expect(hotseat.getInputs(routingCtx()).input1).toEqual({ throttle: 1, brake: false, steer: 1 })
    expect(hotseat.getInputs(routingCtx()).input2).toEqual({ throttle: 0, brake: false, steer: 0 })
    expect(challenge.getInputs(routingCtx()).input1).toEqual({ throttle: 1, brake: false, steer: 1 })
    expect(challenge.getInputs(routingCtx()).input2).toEqual({ throttle: 0, brake: false, steer: 0 })
  })

  test('SPLIT 独立路由：input1 原样 P1、input2 原样 P2', () => {
    const mode = createModeStrategy({ splitMode: true, hotseatMode: false, challengeMode: false })
    const { input1, input2 } = mode.getInputs(routingCtx())
    expect(input1).toEqual({ throttle: 1, brake: false, steer: 0 })
    expect(input2).toEqual({ throttle: 0, brake: false, steer: 1 })
  })

  test('摇杆 active 优先：input1 取摇杆输入（单屏与分屏一致）', () => {
    const joystickInput: CarInput = { throttle: 0, brake: true, steer: -1 }
    const single = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })
    const split = createModeStrategy({ splitMode: true, hotseatMode: false, challengeMode: false })
    expect(single.getInputs(routingCtx({ joystickActive: true, joystickInput })).input1).toBe(joystickInput)
    // 摇杆 active 时单屏 input2 仍零输入、分屏 input2 仍取 P2
    expect(single.getInputs(routingCtx({ joystickActive: true, joystickInput })).input2).toEqual({
      throttle: 0,
      brake: false,
      steer: 0,
    })
    expect(split.getInputs(routingCtx({ joystickActive: true, joystickInput })).input1).toBe(joystickInput)
    expect(split.getInputs(routingCtx({ joystickActive: true, joystickInput })).input2).toEqual({
      throttle: 0,
      brake: false,
      steer: 1,
    })
  })

  test('单屏合并时任一 BOOST 键激活即产出 boost:true（input2 零输入无 boost 字段）', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })
    const { input1, input2 } = mode.getInputs(
      routingCtx({ p2Input: { throttle: 0, brake: false, steer: 0, boost: true } }),
    )
    expect(input1.boost).toBe(true)
    expect(input2.boost).toBeUndefined()
  })
})

describe('updateActivePlayer 分屏最近活跃玩家', () => {
  const split = createModeStrategy({ splitMode: true, hotseatMode: false, challengeMode: false })
  const input1: CarInput = { throttle: 0, brake: false, steer: 0 }
  const input2: CarInput = { throttle: 0, brake: false, steer: 0 }

  test('P1 有输入归 P1（双人同时活跃时 P1 优先）', () => {
    expect(split.updateActivePlayer({ ...input1, steer: 1 }, input2, 1)).toBe(1)
    expect(split.updateActivePlayer({ ...input1, throttle: 1 }, { ...input2, throttle: 1 }, 2)).toBe(1)
    expect(split.updateActivePlayer({ ...input1, brake: true }, input2, 2)).toBe(1)
  })

  test('仅 P2 有输入归 P2', () => {
    expect(split.updateActivePlayer(input1, { ...input2, steer: -1 }, 1)).toBe(2)
    expect(split.updateActivePlayer(input1, { ...input2, throttle: 1 }, 1)).toBe(2)
  })

  test('双方均无输入保持 current', () => {
    expect(split.updateActivePlayer(input1, input2, 1)).toBe(1)
    expect(split.updateActivePlayer(input1, input2, 2)).toBe(2)
  })

  test('SINGLE/HOTSEAT/CHALLENGE 原样返回 current（不参与活跃玩家标注）', () => {
    const modes = [
      createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false }),
      createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: false }),
      createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: true }),
    ]
    for (const mode of modes) {
      expect(mode.updateActivePlayer({ ...input1, throttle: 1 }, { ...input2, steer: 1 }, 1)).toBe(1)
      expect(mode.updateActivePlayer({ ...input1, throttle: 1 }, { ...input2, steer: 1 }, 2)).toBe(2)
    }
  })
})

describe('shouldUpdateP2Traffic / collisionIncludesP2', () => {
  test('HOTSEAT 按当前回合：P1 回合 false、P2 回合 true', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: false })
    expect(mode.shouldUpdateP2Traffic(1)).toBe(false)
    expect(mode.shouldUpdateP2Traffic(2)).toBe(true)
    expect(mode.collisionIncludesP2(1)).toBe(false)
    expect(mode.collisionIncludesP2(2)).toBe(true)
  })

  test('SINGLE/CHALLENGE 恒 false', () => {
    const single = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })
    const challenge = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: true })
    expect(single.shouldUpdateP2Traffic(1)).toBe(false)
    expect(single.shouldUpdateP2Traffic(2)).toBe(false)
    expect(single.collisionIncludesP2(1)).toBe(false)
    expect(single.collisionIncludesP2(2)).toBe(false)
    expect(challenge.shouldUpdateP2Traffic(1)).toBe(false)
    expect(challenge.shouldUpdateP2Traffic(2)).toBe(false)
    expect(challenge.collisionIncludesP2(1)).toBe(false)
    expect(challenge.collisionIncludesP2(2)).toBe(false)
  })

  test('SPLIT 恒 true', () => {
    const mode = createModeStrategy({ splitMode: true, hotseatMode: false, challengeMode: false })
    expect(mode.shouldUpdateP2Traffic(1)).toBe(true)
    expect(mode.shouldUpdateP2Traffic(2)).toBe(true)
    expect(mode.collisionIncludesP2(1)).toBe(true)
    expect(mode.collisionIncludesP2(2)).toBe(true)
  })
})

describe('updatePlayers 玩家更新路由', () => {
  test('HOTSEAT 回合 1：仅推进 player1（相机/计时/圈速），player2 完全静止', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: false })
    const args = playerArgs()
    mode.updatePlayers(args, 1)
    expect(args.race.player1.cameraZ).toBe(2400) // 0 + 2400*1
    expect(args.race.player1.raceTime).toBe(1)
    expect(args.race.player2.cameraZ).toBe(0)
    expect(args.race.player2.raceTime).toBe(0)
    // 圈长 1000：一帧 2400 单位跨 3 圈 → lapTimes 记录 1 条、lastLap=3
    expect(args.race.lapTimes).toEqual([1])
    expect(args.race.lastLap).toBe(3)
    expect(args.race.lapTimes2).toEqual([])
  })

  test('HOTSEAT 回合 2：仅推进 player2（记 lapTimes2），player1 完全静止', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: false })
    const args = playerArgs()
    mode.updatePlayers(args, 2)
    expect(args.race.player2.cameraZ).toBe(2400)
    expect(args.race.player2.raceTime).toBe(1)
    expect(args.race.player1.cameraZ).toBe(0)
    expect(args.race.player1.raceTime).toBe(0)
    expect(args.race.lapTimes2).toEqual([1])
    expect(args.race.lastLap2).toBe(3)
    expect(args.race.lapTimes).toEqual([])
  })

  test('SINGLE：P1 全油门推进、P2 零输入仅计时递增（双人各自独立）', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })
    const args = playerArgs()
    mode.updatePlayers(args, 1)
    expect(args.race.player1.cameraZ).toBe(2400)
    expect(args.race.lastLap).toBe(3)
    // 零输入：speed 恒 0 → cameraZ 不变，但 raceTime 随帧推进
    expect(args.race.player2.cameraZ).toBe(0)
    expect(args.race.player2.raceTime).toBe(1)
    expect(args.race.lastLap2).toBe(1)
  })
})

describe('shouldFinish 完赛判定', () => {
  function raceWith(p1CameraZ: number, p2CameraZ = 0, p1RaceTime = 0): ReturnType<typeof createRaceState> {
    const race = createRaceState()
    race.player1.cameraZ = p1CameraZ
    race.player2.cameraZ = p2CameraZ
    race.player1.raceTime = p1RaceTime
    return race
  }

  test('SINGLE：P1 超圈（圈长 1000 × 3 圈）即完赛，未超圈未完赛', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })
    const tm = mockTrackManager(1000, 3)
    expect(mode.shouldFinish(raceWith(4000), tm, 1)).toBe(true) // lap 5 > 3
    expect(mode.shouldFinish(raceWith(3000), tm, 1)).toBe(true) // 恰好第 4 圈起点
    expect(mode.shouldFinish(raceWith(2999), tm, 1)).toBe(false) // 第 3 圈未完
  })

  test('SINGLE：P2 恒不参与判定（即便 P2 超圈）', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })
    const tm = mockTrackManager(1000, 3)
    expect(mode.shouldFinish(raceWith(0, 4000), tm, 1)).toBe(false)
  })

  test('SPLIT/HOTSEAT：P2 超圈参与判定', () => {
    const split = createModeStrategy({ splitMode: true, hotseatMode: false, challengeMode: false })
    const hotseat = createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: false })
    const tm = mockTrackManager(1000, 3)
    expect(split.shouldFinish(raceWith(0, 4000), tm, 1)).toBe(true)
    expect(hotseat.shouldFinish(raceWith(0, 4000), tm, 2)).toBe(true)
  })

  test('CHALLENGE：限时优先——raceTime 达 60s 即完赛，即便圈数远未超', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: true })
    const tm = mockTrackManager(1000, 3)
    expect(mode.shouldFinish(raceWith(0, 0, 60), tm, 1)).toBe(true)
    expect(mode.shouldFinish(raceWith(0, 0, 60.001), tm, 1)).toBe(true)
    // 未达限时且未超圈 → 未完赛；未达限时但已超圈 → 完赛（圈数路径仍有效）
    expect(mode.shouldFinish(raceWith(0, 0, 59.9), tm, 1)).toBe(false)
    expect(mode.shouldFinish(raceWith(4000, 0, 59.9), tm, 1)).toBe(true)
  })
})

describe('afterSelectP1Track 选赛道同步', () => {
  test('HOTSEAT：P1 选赛道后同步 P2 世界（selectTrack(1, index) + race.tracks[1] + 预览起点）', () => {
    const mode = createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: false })
    const selectTrack = vi.fn()
    const fakeP2Context = { lapLength: 9000 }
    const getContext = vi.fn(() => fakeP2Context)
    const args = selectArgs({
      trackIndex: 2,
      trackManager: { selectTrack, getContext } as unknown as TrackManager,
    })
    mode.afterSelectP1Track(args)
    expect(selectTrack).toHaveBeenCalledWith(1, 2)
    expect(args.race.tracks[1]).toBe(fakeP2Context)
    expect(args.previewCameraZ[1]).toBe(initialPreviewCameraZ(2, 9000))
  })

  test('SINGLE/SPLIT/CHALLENGE：无操作（不选赛道、不同步 P2、不改预览起点）', () => {
    const selectTrack = vi.fn()
    const getContext = vi.fn()
    const modes: ModeStrategy[] = [
      createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false }),
      createModeStrategy({ splitMode: true, hotseatMode: false, challengeMode: false }),
      createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: true }),
    ]
    for (const mode of modes) {
      const race = createRaceState()
      const tracks1Before = race.tracks[1]
      const preview: [number, number] = [100, 200]
      mode.afterSelectP1Track({
        trackIndex: 2,
        race,
        trackManager: { selectTrack, getContext } as unknown as TrackManager,
        previewCameraZ: preview,
      })
      expect(selectTrack).not.toHaveBeenCalled()
      expect(race.tracks[1]).toBe(tracks1Before)
      expect(preview[1]).toBe(200)
    }
  })
})

describe('menuHint 菜单提示文案', () => {
  test('四模式文案均非空且互不相同', () => {
    const hints = [
      createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false }).menuHint,
      createModeStrategy({ splitMode: true, hotseatMode: false, challengeMode: false }).menuHint,
      createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: false }).menuHint,
      createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: true }).menuHint,
    ]
    for (const hint of hints) {
      expect(hint.length).toBeGreaterThan(0)
    }
    expect(new Set(hints).size).toBe(4)
  })
})
