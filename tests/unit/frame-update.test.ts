import { afterEach, describe, expect, test, vi } from 'vitest'
import { updateFrame, type FrameUpdateContext } from '../../src/game/frame-update'
import { createModeStrategy, type InputRoutingContext, type ModeStrategy } from '../../src/game/mode-strategy'
import { PHASE_FINISHED, PHASE_MENU, PHASE_PAUSED, PHASE_RACING } from '../../src/game/phase'
import { createRaceState } from '../../src/game/state'
import { createCarConfig, type CarInput } from '../../src/physics/car'
import type { TrackManager } from '../../src/game/track-manager'

const SINGLE = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })
const CHALLENGE = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: true })

/** 圈长 1000 × 3 圈的 TrackManager 替身 */
const TRACK_MANAGER = {
  getLapLength: () => 1000,
  getTotalLaps: () => 3,
} as unknown as TrackManager

/** 惰性 DOM 元素替身（challenge-timer/challenge-score/boost-bar） */
interface StubElement {
  hidden: boolean
  textContent: string
  style: Record<string, string>
  classList: DOMTokenList
}
function makeElement(): StubElement {
  return {
    hidden: false,
    textContent: '',
    style: {},
    classList: { toggle: vi.fn() } as unknown as DOMTokenList,
  }
}

/** document.getElementById 返回指定元素（缺失 id 返回 null）；updateFrame 惰性获取依赖 */
let docElements: Record<string, unknown> = {}
function stubDocument(): void {
  vi.stubGlobal('document', {
    getElementById: (id: string) => docElements[id] ?? null,
  })
}

/** 构造完整 FrameUpdateContext（默认单屏、RACING、零输入、无 DOM 缓存、onFinish spy） */
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
    challengeTimer: null,
    challengeScore: null,
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

/** 全方法 vi.fn 的 stub 模式：默认零输入、false 判定；getInputs/updateActivePlayer 可覆盖 */
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

const DT = 0.05

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('非比赛阶段跳过更新段', () => {
  test('菜单阶段：透传帧间状态、不触发任何 mode 方法、不触发 onFinish、shouldRender=true', () => {
    stubDocument()
    const mode = makeStubMode()
    const onFinish = vi.fn()
    const r = updateFrame(
      DT,
      makeCtx({ phase: PHASE_MENU, mode, onFinish, lastActivePlayer: 2, boostActive: true, lastCollisionCount: 5 }),
    )
    expect(r.shouldRender).toBe(true)
    expect(r.lastActivePlayer).toBe(2)
    expect(r.boostActive).toBe(true)
    expect(r.lastCollisionCount).toBe(5)
    expect(onFinish).not.toHaveBeenCalled()
    expect(mode.shouldUpdateP2Traffic).not.toHaveBeenCalled()
    expect(mode.getInputs).not.toHaveBeenCalled()
    expect(mode.updatePlayers).not.toHaveBeenCalled()
    expect(mode.shouldFinish).not.toHaveBeenCalled()
  })

  test('暂停/结算阶段同样跳过更新段', () => {
    stubDocument()
    for (const phase of [PHASE_PAUSED, PHASE_FINISHED] as const) {
      const r = updateFrame(DT, makeCtx({ phase }))
      expect(r.shouldRender).toBe(true)
    }
  })
})

describe('mode 挂钩：方法调用与参数透传', () => {
  test('RACING 帧按序调用 mode 各方法，hotseatPlayer 与输入源正确透传', () => {
    stubDocument()
    const mode = makeStubMode()
    const ctx = makeCtx({ mode, hotseatPlayer: 2 })
    const race = ctx.race
    const trackManager = ctx.trackManager
    updateFrame(DT, ctx)

    // 车流推进条件：传入当前回合玩家
    expect(mode.shouldUpdateP2Traffic).toHaveBeenCalledWith(2)
    // 输入路由：摇杆 inactive + 双键盘输入源聚合
    expect(mode.getInputs).toHaveBeenCalledTimes(1)
    const routingArg = (mode.getInputs as ReturnType<typeof vi.fn>).mock.calls[0][0] as InputRoutingContext
    expect(routingArg.joystickActive).toBe(false)
    expect(routingArg.joystickInput).toEqual({ throttle: 0, brake: false, steer: 0 })
    expect(routingArg.p1Input).toEqual({ throttle: 0, brake: false, steer: 0 })
    expect(routingArg.p2Input).toEqual({ throttle: 0, brake: false, steer: 0 })
    // 玩家更新：参数对象 + 当前回合玩家
    expect(mode.updatePlayers).toHaveBeenCalledTimes(1)
    const [playerArgs, playerIdx] = (mode.updatePlayers as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(playerArgs.dt).toBe(DT)
    expect(playerArgs.race).toBe(race)
    expect(playerArgs.carConfig).toBe(ctx.carConfig)
    expect(playerArgs.trackManager).toBe(trackManager)
    expect(playerArgs.wet).toBe(false) // raceTime 0 → 非雨段
    expect(playerArgs.challengeMult).toBeUndefined() // 非挑战模式
    expect(playerIdx).toBe(2)
    // 碰撞范围：传入当前回合玩家
    expect(mode.collisionIncludesP2).toHaveBeenCalledWith(2)
    // 完赛判定：race/trackManager/hotseatPlayer 三参
    expect(mode.shouldFinish).toHaveBeenCalledWith(race, trackManager, 2)
  })

  test('挑战模式：challengeMult 按雨天/难度计算（非雨段 → 1 + (难度-1)*0.25）', () => {
    stubDocument()
    const mode = makeStubMode({ challengeMode: true })
    const ctx = makeCtx({ mode, challengeTimer: null, challengeScore: null })
    // classic 难度 1 → 加成 1；雨天（raceTime=90 → phase 2）→ 1 + 0.5 + 0 = 1.5
    ctx.race.player1.raceTime = 90
    updateFrame(DT, ctx)
    const playerArgs = (mode.updatePlayers as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(playerArgs.wet).toBe(true)
    expect(playerArgs.challengeMult).toBe(1.5)
  })
})

describe('完赛触发与 onFinish 回调', () => {
  test('shouldFinish=true：调用 onFinish 一次并返回 shouldRender=false', () => {
    stubDocument()
    const onFinish = vi.fn()
    const mode = makeStubMode({ shouldFinish: vi.fn(() => true) })
    const r = updateFrame(DT, makeCtx({ mode, onFinish }))
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(r.shouldRender).toBe(false)
  })

  test('shouldFinish=false：不触发 onFinish、shouldRender=true', () => {
    stubDocument()
    const onFinish = vi.fn()
    const r = updateFrame(DT, makeCtx({ onFinish }))
    expect(onFinish).not.toHaveBeenCalled()
    expect(r.shouldRender).toBe(true)
  })
})

describe('帧间状态写回', () => {
  test('lastActivePlayer 取 mode.updateActivePlayer 返回值', () => {
    stubDocument()
    const mode = makeStubMode({ updateActivePlayer: vi.fn(() => 2 as const) })
    const r = updateFrame(DT, makeCtx({ mode, lastActivePlayer: 1 }))
    expect(r.lastActivePlayer).toBe(2)
  })

  test('BOOST 激活边沿：本帧 boost 激活 → 返回 boostActive=true', () => {
    stubDocument()
    const ctx = makeCtx({ boostActive: false })
    ctx.race.player1.boostCharge = 0.5
    ctx.input = {
      getP1Input: () => ({ throttle: 0, brake: false, steer: 0, boost: true }),
      getP2Input: () => ({ throttle: 0, brake: false, steer: 0 }),
    }
    const r = updateFrame(DT, ctx)
    expect(r.boostActive).toBe(true)
  })

  test('碰撞计数增长 → 返回快照更新（1 > 0）', () => {
    stubDocument()
    const ctx = makeCtx({ lastCollisionCount: 0 })
    ctx.race.collisionCount = 1
    const r = updateFrame(DT, ctx)
    expect(r.lastCollisionCount).toBe(1)
  })
})

describe('惰性 DOM 缓存与 HUD 副作用', () => {
  test('BOOST 条：惰性获取元素并写宽度（charge 0 → 0px），结果回传缓存', () => {
    docElements = { 'boost-bar': makeElement() }
    stubDocument()
    const r = updateFrame(DT, makeCtx({ boostBar: null }))
    const bar = r.boostBar as unknown as StubElement
    expect(r.boostBar).not.toBeNull()
    expect(bar.hidden).toBe(false)
    expect(bar.style.width).toBe('0px')
  })

  test('BOOST 条：charge 0.5 → 宽度 100px', () => {
    docElements = { 'boost-bar': makeElement() }
    stubDocument()
    const ctx = makeCtx({ boostBar: null })
    ctx.race.player1.boostCharge = 0.5
    const r = updateFrame(DT, ctx)
    expect((r.boostBar as unknown as StubElement).style.width).toBe('100px')
  })

  test('挑战模式：倒计时与实时得分 HUD 惰性获取并填充文本（raceTime 0 → 剩余 60.0s）', () => {
    docElements = { 'challenge-timer': makeElement(), 'challenge-score': makeElement() }
    stubDocument()
    const ctx = makeCtx({ mode: CHALLENGE, challengeTimer: null, challengeScore: null })
    ctx.race.player1.driftState.score = 123
    const r = updateFrame(DT, ctx)
    expect(r.challengeTimer).not.toBeNull()
    expect(r.challengeScore).not.toBeNull()
    expect((r.challengeTimer as unknown as StubElement).textContent).toBe('剩余 60.0s')
    expect((r.challengeScore as unknown as StubElement).textContent).toBe('得分 123')
  })

  test('挑战模式：已缓存元素不重新获取（原引用透传）', () => {
    docElements = {}
    stubDocument()
    const timer = makeElement()
    const score = makeElement()
    const r = updateFrame(
      DT,
      makeCtx({
        mode: CHALLENGE,
        challengeTimer: timer as unknown as HTMLDivElement,
        challengeScore: score as unknown as HTMLDivElement,
      }),
    )
    expect(r.challengeTimer).toBe(timer)
    expect(r.challengeScore).toBe(score)
  })

  test('非挑战模式：不获取挑战 HUD 元素', () => {
    docElements = {}
    const getElementById = vi.fn(() => null)
    vi.stubGlobal('document', { getElementById })
    updateFrame(DT, makeCtx({ mode: SINGLE }))
    expect(getElementById).not.toHaveBeenCalledWith('challenge-timer')
    expect(getElementById).not.toHaveBeenCalledWith('challenge-score')
  })
})

describe('BOOST 尾焰粒子', () => {
  test('P1 boost 激活：每帧至多推入 1 粒并推进 t', () => {
    stubDocument()
    const ctx = makeCtx({ boostParticles: [] })
    ctx.race.player1.boostCharge = 0.5
    // 粒子 z 取相机前方 +2 的时刻是 push 时（玩家更新在其后），故用 push 前 cameraZ 推算
    const cameraZAtPush = ctx.race.player1.cameraZ
    ctx.input = {
      getP1Input: () => ({ throttle: 0, brake: false, steer: 0, boost: true }),
      getP2Input: () => ({ throttle: 0, brake: false, steer: 0 }),
    }
    updateFrame(DT, ctx)
    expect(ctx.boostParticles).toHaveLength(1)
    expect(ctx.boostParticles[0].t).toBeCloseTo(DT)
    expect(ctx.boostParticles[0].z).toBe(cameraZAtPush + 2)
  })

  test('无 boost：粒子数组保持为空', () => {
    stubDocument()
    const ctx = makeCtx({ boostParticles: [] })
    updateFrame(DT, ctx)
    expect(ctx.boostParticles).toHaveLength(0)
  })
})

describe('双世界车流推进', () => {
  test('单屏（shouldUpdateP2Traffic=false）：P1 世界车流推进、P2 世界静止', () => {
    stubDocument()
    const ctx = makeCtx({ mode: SINGLE })
    const z1Before = ctx.race.tracks[0].traffic[0].z
    const z2Before = ctx.race.tracks[1].traffic[0].z
    updateFrame(DT, ctx)
    // 一帧推进量 = speed*dt（speed 1920-3360 → 96-168 单位，圈长内不回绕）
    expect(ctx.race.tracks[0].traffic[0].z).toBeGreaterThan(z1Before)
    expect(ctx.race.tracks[1].traffic[0].z).toBe(z2Before)
  })

  test('热座 P2 回合（shouldUpdateP2Traffic=true）：P2 世界车流随帧推进', () => {
    stubDocument()
    const mode = makeStubMode({ shouldUpdateP2Traffic: vi.fn(() => true) })
    const ctx = makeCtx({ mode, hotseatPlayer: 2 })
    const z2Before = ctx.race.tracks[1].traffic[0].z
    updateFrame(DT, ctx)
    expect(ctx.race.tracks[1].traffic[0].z).toBeGreaterThan(z2Before)
  })
})
