import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { updateFrame, type FrameUpdateContext } from '../../src/game/frame-update'
import { createModeStrategy, type ModeStrategy } from '../../src/game/mode-strategy'
import { PHASE_MENU, PHASE_PAUSED, PHASE_RACING } from '../../src/shared/phase'
import { createRaceState } from '../../src/game/state'
import { createCarConfig, type CarInput } from '../../src/physics/car'
import type { TrackManager } from '../../src/game/track-manager'
import type { DriftSound, TireSound } from '../../src/audio/engine'

const SINGLE = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })

/** 圈长 1000 × 3 圈的 TrackManager 替身 */
const TRACK_MANAGER = {
  getLapLength: () => 1000,
  getTotalLaps: () => 3,
} as unknown as TrackManager

/** document.getElementById 返回 null（RACING 帧块惰性获取 boost-bar 依赖；缺失 id 返回 null） */
function stubDocument(): void {
  vi.stubGlobal('document', {
    getElementById: () => null,
  })
}

/** DriftSound/TireSound 全 vi.fn stub（断言调用次数与参数） */
interface SoundStub {
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  setIntensity: ReturnType<typeof vi.fn>
  setLevel: ReturnType<typeof vi.fn>
}
function makeSoundStub(): SoundStub {
  return { start: vi.fn(), stop: vi.fn(), setIntensity: vi.fn(), setLevel: vi.fn() }
}

/** 全方法 vi.fn 的 stub 模式：默认零输入、false 判定；updatePlayers 默认 noop（漂移状态保持测试预设） */
function makeStubMode(over: Partial<ModeStrategy> = {}): ModeStrategy {
  const zeroInput: CarInput = { throttle: 0, brake: false, steer: 0 }
  return {
    splitMode: false,
    hotseatMode: false,
    challengeMode: false,
    menuHint: '',
    getInputs: vi.fn(() => ({ input1: zeroInput, input2: { ...zeroInput } })),
    updateActivePlayer: vi.fn((_a: CarInput, _b: CarInput, c: 1 | 2) => c),
    shouldUpdateP2Traffic: vi.fn(() => false),
    collisionIncludesP2: vi.fn(() => false),
    updatePlayers: vi.fn(),
    shouldFinish: vi.fn(() => false),
    afterSelectP1Track: vi.fn(),
    ...over,
  } as unknown as ModeStrategy
}

/** 构造完整 FrameUpdateContext（默认单屏、RACING、零输入、onFinish spy；driftSound/tireSound 由用例显式注入） */
function makeCtx(over: Partial<FrameUpdateContext> = {}): FrameUpdateContext {
  return {
    phase: PHASE_RACING,
    race: createRaceState(),
    trackManager: TRACK_MANAGER,
    carConfig: createCarConfig(),
    boostParticles: [],
    mode: SINGLE,
    hotseatPlayer: 1,
    lastActivePlayer: 1,
    boostActive: false,
    lastCollisionCount: 0,
    collisionFlash: 0,
    challengeTimer: null,
    challengeScore: null,
    dailyBadge: null,
    isDailyTrack: false,
    boostBar: null,
    rainSound: null,
    boostSound: null,
    collisionSound: null,
    input: {
      getP1Input: () => ({ throttle: 0, brake: false, steer: 0 }),
      getP2Input: () => ({ throttle: 0, brake: false, steer: 0 }),
    },
    joystick: { isActive: () => false, getInput: () => ({ throttle: 0, brake: false, steer: 0 }) },
    onFinish: vi.fn(),
    ...over,
  }
}

const DT = 0.05

beforeEach(() => {
  stubDocument()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('M15 漂移摩擦胎声接线（driftSound）', () => {
  test('P1 漂移激活：start 一次 + setIntensity 传 (车速比, 转向, wet=false)', () => {
    const mode = makeStubMode({
      getInputs: vi.fn(() => ({
        input1: { throttle: 0, brake: false, steer: 0.8 },
        input2: { throttle: 0, brake: false, steer: 0 },
      })),
      updatePlayers: vi.fn(), // 跳过物理 → driftState 保持测试预设
    })
    const driftSound = makeSoundStub()
    const ctx = makeCtx({
      mode,
      driftSound: driftSound as unknown as DriftSound,
      tireSound: makeSoundStub() as unknown as TireSound,
    })
    ctx.race.player1.driftState.active = true
    ctx.race.player1.carState.speed = 6000 // maxSpeed 6000 → 车速比 1
    updateFrame(DT, ctx)
    expect(driftSound.start).toHaveBeenCalledTimes(1)
    expect(driftSound.setIntensity).toHaveBeenCalledWith(1, 0.8, false)
    expect(driftSound.stop).not.toHaveBeenCalled()
  })

  test('分屏 P2 漂移激活：同样触发，强度取双玩家车速最大值', () => {
    const mode = makeStubMode({
      splitMode: true,
      shouldUpdateP2Traffic: vi.fn(() => true),
    })
    const driftSound = makeSoundStub()
    const ctx = makeCtx({
      mode,
      driftSound: driftSound as unknown as DriftSound,
      tireSound: makeSoundStub() as unknown as TireSound,
    })
    ctx.race.player2.driftState.active = true
    ctx.race.player2.carState.speed = 3000 // max(0, 3000)/6000 = 0.5
    updateFrame(DT, ctx)
    expect(driftSound.start).toHaveBeenCalledTimes(1)
    expect(driftSound.setIntensity).toHaveBeenCalledWith(0.5, 0, false)
  })

  test('漂移未激活：driftSound.stop 调用、不 start', () => {
    const driftSound = makeSoundStub()
    const ctx = makeCtx({
      driftSound: driftSound as unknown as DriftSound,
      tireSound: makeSoundStub() as unknown as TireSound,
    })
    updateFrame(DT, ctx)
    expect(driftSound.stop).toHaveBeenCalled()
    expect(driftSound.start).not.toHaveBeenCalled()
  })

  test('雨天漂移（raceTime=90 → wet=true）：setIntensity/setLevel 携带 wet=true', () => {
    const mode = makeStubMode({
      getInputs: vi.fn(() => ({
        input1: { throttle: 0, brake: false, steer: 1 },
        input2: { throttle: 0, brake: false, steer: 0 },
      })),
    })
    const driftSound = makeSoundStub()
    const tireSound = makeSoundStub()
    const ctx = makeCtx({
      mode,
      driftSound: driftSound as unknown as DriftSound,
      tireSound: tireSound as unknown as TireSound,
    })
    ctx.race.player1.raceTime = 90 // 雨段（phase 2）
    ctx.race.player1.driftState.active = true
    ctx.race.player1.carState.speed = 6000
    updateFrame(DT, ctx)
    expect(driftSound.setIntensity).toHaveBeenCalledWith(1, 1, true)
    expect(tireSound.setLevel).toHaveBeenCalledWith(1, 1, true)
  })
})

describe('M15 胎噪接线（tireSound）', () => {
  test('每帧按 P1 车速比与转向调用 setLevel（0.5 速 + 0.5 转向）', () => {
    const mode = makeStubMode({
      getInputs: vi.fn(() => ({
        input1: { throttle: 0, brake: false, steer: 0.5 },
        input2: { throttle: 0, brake: false, steer: 0 },
      })),
    })
    const tireSound = makeSoundStub()
    const ctx = makeCtx({
      mode,
      driftSound: makeSoundStub() as unknown as DriftSound,
      tireSound: tireSound as unknown as TireSound,
    })
    ctx.race.player1.carState.speed = 3000 // 车速比 0.5
    updateFrame(DT, ctx)
    expect(tireSound.setLevel).toHaveBeenCalledWith(0.5, 0.5, false)
  })

  test('静止无转向：setLevel(0, 0, false)（胎噪静音）', () => {
    const tireSound = makeSoundStub()
    const ctx = makeCtx({
      driftSound: makeSoundStub() as unknown as DriftSound,
      tireSound: tireSound as unknown as TireSound,
    })
    updateFrame(DT, ctx)
    expect(tireSound.setLevel).toHaveBeenCalledWith(0, 0, false)
  })
})

describe('M15 非比赛阶段静音', () => {
  test('菜单/暂停阶段：driftSound.stop + tireSound.setLevel(0)（暂停/结算时无声）', () => {
    for (const phase of [PHASE_MENU, PHASE_PAUSED] as const) {
      const driftSound = makeSoundStub()
      const tireSound = makeSoundStub()
      const ctx = makeCtx({
        phase,
        driftSound: driftSound as unknown as DriftSound,
        tireSound: tireSound as unknown as TireSound,
      })
      updateFrame(DT, ctx)
      expect(driftSound.stop).toHaveBeenCalled()
      expect(tireSound.setLevel).toHaveBeenCalledWith(0, 0, false)
    }
  })
})

describe('M15 音频未创建安全 no-op', () => {
  test('null 注入不抛错（GameLoop 未惰性创建音频时每帧调用路径）', () => {
    const ctx = makeCtx({ driftSound: null, tireSound: null })
    expect(() => updateFrame(DT, ctx)).not.toThrow()
  })

  test('字段缺失（undefined）不抛错（既有 ctx 调用方零改动）', () => {
    expect(() => updateFrame(DT, makeCtx())).not.toThrow()
  })
})
