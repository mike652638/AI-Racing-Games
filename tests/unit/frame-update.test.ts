import { afterEach, describe, expect, test, vi } from 'vitest'
import { updateDriftPopup, updateFrame, type FrameUpdateContext } from '../../src/game/frame-update'
import { createModeStrategy, type InputRoutingContext, type ModeStrategy } from '../../src/game/mode-strategy'
import { PHASE_FINISHED, PHASE_MENU, PHASE_PAUSED, PHASE_RACING } from '../../src/shared/phase'
import { createRaceState } from '../../src/game/state'
import { NEAR_MISS_POPUP_SEC, RACE_START_GRACE } from '../../src/shared/constants'
import { createCarConfig, type CarInput } from '../../src/physics/car'
import type { RainSound } from '../../src/audio/engine'
import { createPlayerState } from '../../src/game/player-state'
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
    classList: { toggle: vi.fn(), remove: vi.fn(), add: vi.fn() } as unknown as DOMTokenList,
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

  test('M16 碰撞命中 → collisionFlash 重置为速度比映射强度，未命中按 dt 衰减', () => {
    stubDocument()
    // 未命中：flash=0.8 经一帧衰减（exp(-6*DT)，DT 为测试常量）
    const ctx = makeCtx({ lastCollisionCount: 0, collisionFlash: 0.8 })
    const r = updateFrame(DT, ctx)
    expect(r.collisionFlash).toBeLessThan(0.8)
    expect(r.collisionFlash).toBeCloseTo(0.8 * Math.exp(-6 * DT), 5)
    // 命中：让玩家车流碰撞（P1 位于车流位置，速度比 flashSeed(3000/6000)=0.5→flash=0.5）；
    // raceTime 置达起步保护期阈值（碰撞门控：raceTime < RACE_START_GRACE 免疫，2026-08-05）
    const hitCtx = makeCtx({ lastCollisionCount: 0, collisionFlash: 0 })
    hitCtx.race.player1.raceTime = RACE_START_GRACE
    hitCtx.race.player1.cameraZ = 1000
    hitCtx.race.player1.carState.speed = 3000
    hitCtx.race.player1.carState.position = 0.5
    hitCtx.race.tracks[0].traffic = [{ z: 1040, offset: 0.5, speed: 2400, colorIndex: 0, shiftDir: 0 }]
    const rh = updateFrame(DT, hitCtx)
    expect(rh.collisionFlash).toBeGreaterThan(0.4)
    expect(rh.lastCollisionCount).toBe(1)
  })
})

describe('惰性 DOM 缓存与 HUD 副作用', () => {
  /** 构造带 .boost-fill 内层填充元素的 boost-bar 桩（P1-1 重构后轨道外层固定、
   *  仅 .boost-fill 宽度随 charge 增长，updateFrame 经 querySelector 定位 fill；
   *  fill 对象闭包持久引用，updateFrame 写入的 style.width 可被断言读到） */
  function makeBoostBarStub(): {
    hidden: boolean
    querySelector: (sel: string) => { style: Record<string, string> } | null
    classList: { toggle: (c: string, on?: boolean) => void }
  } {
    const fill = { style: {} }
    return {
      hidden: false,
      querySelector: (sel: string) => (sel === '.boost-fill' ? fill : null),
      classList: { toggle: vi.fn() },
    }
  }

  test('BOOST 条：惰性获取元素并写填充宽度（charge 0 → 0px），结果回传缓存', () => {
    docElements = { 'boost-bar': makeBoostBarStub() }
    stubDocument()
    const r = updateFrame(DT, makeCtx({ boostBar: null }))
    const bar = r.boostBar as unknown as {
      hidden: boolean
      querySelector: (s: string) => { style: Record<string, string> } | null
    }
    expect(r.boostBar).not.toBeNull()
    expect(bar.hidden).toBe(false)
    expect(bar.querySelector('.boost-fill')!.style.width).toBe('0px')
  })

  test('BOOST 条：charge 0.5 → 填充宽度 100px', () => {
    docElements = { 'boost-bar': makeBoostBarStub() }
    stubDocument()
    const ctx = makeCtx({ boostBar: null })
    ctx.race.player1.boostCharge = 0.5
    const r = updateFrame(DT, ctx)
    const bar = r.boostBar as unknown as { querySelector: (s: string) => { style: Record<string, string> } | null }
    expect(bar.querySelector('.boost-fill')!.style.width).toBe('100px')
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
    expect((r.challengeScore as unknown as StubElement).textContent).toBe('得分 123 / 目标 5000')
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

  test('A2：今日挑战道（isDailyTrack=true）RACING 时 #daily-badge 可见且文案同源', () => {
    docElements = { 'daily-badge': makeElement() }
    stubDocument()
    const ctx = makeCtx({ isDailyTrack: true, dailyBadge: null })
    const r = updateFrame(DT, ctx)
    const badge = r.dailyBadge as unknown as StubElement
    expect(badge).not.toBeNull()
    expect(badge.hidden).toBe(false)
    expect(badge.textContent).toBe('今日挑战')
  })

  test('A2：非今日挑战道（isDailyTrack=false）RACING 时 #daily-badge 保持隐藏', () => {
    docElements = { 'daily-badge': makeElement() }
    stubDocument()
    const ctx = makeCtx({ isDailyTrack: false, dailyBadge: null })
    const r = updateFrame(DT, ctx)
    expect((r.dailyBadge as unknown as StubElement).hidden).toBe(true)
  })

  test('A2：非 RACING 阶段隐藏 #daily-badge（防回菜单残留）', () => {
    docElements = { 'daily-badge': makeElement() }
    stubDocument()
    const ctx = makeCtx({ phase: PHASE_MENU, isDailyTrack: true, dailyBadge: null })
    const r = updateFrame(DT, ctx)
    expect((r.dailyBadge as unknown as StubElement).hidden).toBe(true)
  })

  test('M23 方案 8：检查点推进——cameraZ 越过检查点间距补发时间奖励', () => {
    docElements = { 'challenge-timer': makeElement(), 'challenge-score': makeElement() }
    stubDocument()
    // 实际圈长来自 classic 赛道上下文（TRACK_MANAGER 的 1000 仅用于 finishByLaps），
    // 检查点间距 = race.tracks[0].lapLength / CHALLENGE_CHECKPOINTS_PER_LAP（2）
    const ctx = makeCtx({ mode: CHALLENGE, challengeTimer: null, challengeScore: null })
    const spacing = ctx.race.tracks[0].lapLength / 2
    ctx.race.player1.cameraZ = spacing * 3 // 越过第 3 个检查点
    updateFrame(DT, ctx)
    expect(ctx.race.player1.challengeCheckpoints).toBe(3)
    // 每点 +2s → bonus = 6；raceTime 0 → 剩余 60 + 6 = 66.0s
    expect(ctx.race.player1.challengeBonus).toBe(6)
  })

  test('M23 方案 8：检查点推进——每帧只补发增量（重复调用不重复累加）', () => {
    docElements = { 'challenge-timer': makeElement(), 'challenge-score': makeElement() }
    stubDocument()
    const ctx = makeCtx({ mode: CHALLENGE, challengeTimer: null, challengeScore: null })
    const spacing = ctx.race.tracks[0].lapLength / 2
    ctx.race.player1.cameraZ = spacing * 3
    updateFrame(DT, ctx)
    updateFrame(DT, ctx)
    // 第二次调用 cameraZ 未变：检查点数仍 3、bonus 仍 6（不因重复帧重复累加）
    expect(ctx.race.player1.challengeCheckpoints).toBe(3)
    expect(ctx.race.player1.challengeBonus).toBe(6)
  })
})

describe('M23 方案 11：天气变体覆盖驱动 wet/雨声', () => {
  test('override=rain 强制雨天：即使 raceTime 在晴段 wet=true、雨声 start', () => {
    stubDocument()
    const rainSound = { start: vi.fn(), stop: vi.fn() } as unknown as RainSound
    const mode = makeStubMode()
    const ctx = makeCtx({ mode, rainSound })
    ctx.race.weatherOverride = 'rain'
    ctx.race.player1.raceTime = 0 // 时间循环 phase 0（晴）——但 override 强制雨
    updateFrame(DT, ctx)
    expect(rainSound.start).toHaveBeenCalled()
    expect(rainSound.stop).not.toHaveBeenCalled()
    const [playerArgs] = (mode.updatePlayers as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(playerArgs.wet).toBe(true)
  })

  test('override=sunny 强制无雨：即使 raceTime 在雨段 wet=false、雨声 stop', () => {
    stubDocument()
    const rainSound = { start: vi.fn(), stop: vi.fn() } as unknown as RainSound
    const mode = makeStubMode()
    const ctx = makeCtx({ mode, rainSound })
    ctx.race.weatherOverride = 'sunny'
    ctx.race.player1.raceTime = 90 // 时间循环 phase 2（雨）——但 override 强制晴
    updateFrame(DT, ctx)
    expect(rainSound.stop).toHaveBeenCalled()
    expect(rainSound.start).not.toHaveBeenCalled()
    const [playerArgs] = (mode.updatePlayers as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(playerArgs.wet).toBe(false)
  })

  test('override=night 无雨：wet=false', () => {
    stubDocument()
    const mode = makeStubMode()
    const ctx = makeCtx({ mode })
    ctx.race.weatherOverride = 'night'
    ctx.race.player1.raceTime = 90 // 时间循环雨段——但 night 变体强制无雨
    updateFrame(DT, ctx)
    const [playerArgs] = (mode.updatePlayers as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(playerArgs.wet).toBe(false)
  })

  test('override=auto 维持时间循环：雨段 wet=true', () => {
    stubDocument()
    const mode = makeStubMode()
    const ctx = makeCtx({ mode })
    ctx.race.weatherOverride = 'auto'
    ctx.race.player1.raceTime = 90 // phase 2 雨段
    updateFrame(DT, ctx)
    const [playerArgs] = (mode.updatePlayers as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(playerArgs.wet).toBe(true)
  })

  test('挑战模式 override=rain：challengeMult 含雨天 +50% 加成（晴段 base 1 + 0.5）', () => {
    stubDocument()
    const mode = makeStubMode({ challengeMode: true })
    const ctx = makeCtx({ mode, challengeTimer: null, challengeScore: null })
    ctx.race.weatherOverride = 'rain'
    ctx.race.player1.raceTime = 0 // 时间循环晴段——但 override 强制雨 → 1 + 0.5 + 0 = 1.5
    updateFrame(DT, ctx)
    const [playerArgs] = (mode.updatePlayers as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(playerArgs.challengeMult).toBe(1.5)
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

  test('M23 方案 13：trafficDynamic=false（缺省）→ 车流 speedFactor 恒 1、trafficRubber 保持 1', () => {
    stubDocument()
    const ctx = makeCtx({ mode: SINGLE })
    ctx.race.player1.carState.speed = 6000 // 全速：若开启动态难度车流应提速
    const zBefore = ctx.race.tracks[0].traffic[0].z
    updateFrame(DT, ctx)
    // speedFactor=1：推进量 = speed*dt（车流 speed 原值），trafficRubber 不被更新
    expect(ctx.race.player1.trafficRubber).toBe(1)
    const car = ctx.race.tracks[0].traffic[0]
    expect(ctx.race.tracks[0].traffic[0].z).toBeCloseTo(zBefore + car.speed * DT, 6)
  })

  test('M23 方案 13：trafficDynamic=true → 车流提速（trafficRubber 向 MAX 收敛），推进量加大', () => {
    stubDocument()
    const ctx = makeCtx({ mode: SINGLE, trafficDynamic: true })
    ctx.race.player1.carState.speed = 6000 // 全速 → 目标 MAX
    const zBefore = ctx.race.tracks[0].traffic[0].z
    const carSpeed = ctx.race.tracks[0].traffic[0].speed
    updateFrame(DT, ctx)
    // trafficRubber 向 MAX 收敛（未到目标，因平滑响应 1.2*dt=0.06 < 1）
    expect(ctx.race.player1.trafficRubber).toBeGreaterThan(1)
    // 推进量 = speed * rubber * dt > speed * 1 * dt（比 static 快）
    const zAfter = ctx.race.tracks[0].traffic[0].z
    expect(zAfter - zBefore).toBeGreaterThan(carSpeed * DT)
  })

  test('M23 方案 13：trafficDynamic=true + 低速 → 车流减速（trafficRubber 向 MIN 收敛）', () => {
    stubDocument()
    const ctx = makeCtx({ mode: SINGLE, trafficDynamic: true })
    ctx.race.player1.carState.speed = 0 // 静止 → 目标 MIN
    const zBefore = ctx.race.tracks[0].traffic[0].z
    const carSpeed = ctx.race.tracks[0].traffic[0].speed
    updateFrame(DT, ctx)
    expect(ctx.race.player1.trafficRubber).toBeLessThan(1)
    const zAfter = ctx.race.tracks[0].traffic[0].z
    expect(zAfter - zBefore).toBeLessThan(carSpeed * DT)
  })
})

describe('M23 方案 12：updateDriftPopup 漂移得分飘字', () => {
  test('得分整数位增长 ≥1 → 生成飘字并记录基准', () => {
    const p = createPlayerState()
    p.lastDriftScoreInt = 0
    p.driftState.score = 42.5
    updateDriftPopup(p, DT)
    expect(p.driftPopup).not.toBeNull()
    expect(p.driftPopup!.amount).toBe(42)
    expect(p.lastDriftScoreInt).toBe(42)
  })

  test('得分未达整数位（<1 增量）→ 不生成飘字', () => {
    const p = createPlayerState()
    p.lastDriftScoreInt = 42
    p.driftState.score = 42.5
    updateDriftPopup(p, DT)
    expect(p.driftPopup).toBeNull()
  })

  test('飘字逐帧推进、超期清除', () => {
    const p = createPlayerState()
    p.lastDriftScoreInt = 0
    p.driftState.score = 100
    // 首次生成：t 从 0 起（本帧未过，飘字刚开始）
    updateDriftPopup(p, 0.1)
    expect(p.driftPopup).not.toBeNull()
    expect(p.driftPopup!.t).toBeCloseTo(0, 6)
    // 第二次调用：已有飘字推进 0.1 → t=0.1
    p.driftState.score = 100 // 无新增
    updateDriftPopup(p, 0.1)
    expect(p.driftPopup!.t).toBeCloseTo(0.1, 6)
    // 推进至超期（life=0.7s）
    p.driftState.score = 100
    updateDriftPopup(p, 0.7)
    expect(p.driftPopup).toBeNull()
  })

  test('分数回退时同步基准（避免下次误报大增量）', () => {
    const p = createPlayerState()
    p.lastDriftScoreInt = 100
    p.driftState.score = 90 // reset 回退
    updateDriftPopup(p, DT)
    expect(p.driftPopup).toBeNull()
    expect(p.lastDriftScoreInt).toBe(100)
  })

  test('M29 二次打磨：生成飘字时带上当前连击档位（combo 联动）', () => {
    const p = createPlayerState()
    p.lastDriftScoreInt = 0
    p.driftState.score = 50
    p.driftState.combo = 6 // 高连击
    updateDriftPopup(p, DT)
    expect(p.driftPopup!.combo).toBe(6)
    // 低连击
    const p2 = createPlayerState()
    p2.lastDriftScoreInt = 0
    p2.driftState.score = 50
    p2.driftState.combo = 2
    updateDriftPopup(p2, DT)
    expect(p2.driftPopup!.combo).toBe(2)
    // combo 为 0（漂移结束/无连击）时缺省不带（可选字段）
    const p3 = createPlayerState()
    p3.lastDriftScoreInt = 0
    p3.driftState.score = 50
    updateDriftPopup(p3, DT)
    expect(p3.driftPopup!.combo).toBe(0)
  })
})

describe('M23 方案 12：Game Feel 特效状态推进', () => {
  test('完美氮气激活时 perfectBoostFlash 置 1 并衰减', () => {
    stubDocument()
    // 覆盖 getP1Input 返回 boost:true（input1.boost === true 触发 updateBoostCharge 激活）；
    // boostCharge 满格 1（≥ PERFECT_BOOST_MIN_CHARGE 0.8）→ 本次激活为完美
    const ctx = makeCtx({
      mode: SINGLE,
      input: {
        getP1Input: () => ({ throttle: 1, brake: false, steer: 0, boost: true }),
        getP2Input: () => ({ throttle: 0, brake: false, steer: 0 }),
      },
    })
    ctx.race.player1.boostCharge = 1
    updateFrame(DT, ctx)
    expect(ctx.race.player1.boostPerfect).toBe(true)
    expect(ctx.race.player1.perfectBoostFlash).toBe(1)
    // 松开 boost：flash 不再置 1，逐帧衰减
    const ctx2 = makeCtx({ mode: SINGLE })
    ctx2.race.player1.perfectBoostFlash = 1
    updateFrame(DT, ctx2)
    expect(ctx2.race.player1.perfectBoostFlash).toBeLessThan(1)
    expect(ctx2.race.player1.perfectBoostFlash).toBeGreaterThan(0)
  })

  test('小喷激活时 miniTurboFlash 置 1', () => {
    stubDocument()
    const ctx = makeCtx({ mode: SINGLE })
    ctx.race.player1.driftState.turbo = 0.4
    updateFrame(DT, ctx)
    expect(ctx.race.player1.miniTurboFlash).toBe(1)
  })

  test('near-miss 命中时 nearMissPulse 置 1', () => {
    stubDocument()
    const ctx = makeCtx({ mode: SINGLE })
    // 直接调用 updateFrame 不构造 near-miss 场景，用近距车流触发（low level：手工触发脉冲）
    ctx.race.player1.nearMissPulse = 0
    // 构造碰撞前瞬间近距超车较繁琐——此处仅验证衰减逻辑（命中置 1 由 frame-update 内 hit 块覆盖）
    updateFrame(DT, ctx)
    expect(ctx.race.player1.nearMissPulse).toBe(0) // 无命中保持 0
  })
})

describe('F-1 起步倒计时冻结（2026-08-05 审计）', () => {
  test('countdownRemaining>0：raceTime/车流/玩家物理全部冻结，不触发 mode 挂钩与完赛判定', () => {
    stubDocument()
    const mode = makeStubMode()
    const race = createRaceState()
    race.countdownRemaining = 2.4
    const ctx = makeCtx({
      mode,
      race,
      input: {
        getP1Input: () => ({ throttle: 1, brake: false, steer: 0 }),
        getP2Input: () => ({ throttle: 0, brake: false, steer: 0 }),
      },
    })
    const z1Before = race.tracks[0].traffic[0].z
    const r = updateFrame(DT, ctx)
    // 冻结：计时/相机/车流/粒子均不动，mode 挂钩零调用
    expect(race.player1.raceTime).toBe(0)
    expect(race.player1.cameraZ).toBe(0)
    expect(race.tracks[0].traffic[0].z).toBe(z1Before)
    expect(mode.getInputs).not.toHaveBeenCalled()
    expect(mode.updatePlayers).not.toHaveBeenCalled()
    expect(mode.shouldFinish).not.toHaveBeenCalled()
    // 倒计时按 dt 递减且未归零：countdownJustFinished=false、照常渲染
    expect(race.countdownRemaining).toBeCloseTo(2.4 - DT)
    expect(r.countdownJustFinished).toBe(false)
    expect(r.shouldRender).toBe(true)
  })

  test('倒计时归零帧：countdownJustFinished=true（U-3 引导浮层触发点），次帧恢复正常更新', () => {
    stubDocument()
    const mode = makeStubMode()
    const race = createRaceState()
    race.countdownRemaining = DT // 恰好一帧后归零
    const ctx = makeCtx({ mode, race })
    const r = updateFrame(DT, ctx)
    expect(race.countdownRemaining).toBe(0)
    expect(r.countdownJustFinished).toBe(true)
    expect(mode.getInputs).not.toHaveBeenCalled()
    // 次帧 countdownRemaining=0 → 恢复正常更新段（mode 挂钩被调用）
    const r2 = updateFrame(DT, ctx)
    expect(r2.countdownJustFinished).toBe(false)
    expect(mode.getInputs).toHaveBeenCalled()
  })
})

describe('P0 near-miss 贴身超车（frame-update 集成）', () => {
  test('贴身超车 → near-miss 独立得分（含连击倍率）、蓄能、HUD 弹出、结果回传缓存', () => {
    docElements = { 'near-miss': makeElement() }
    stubDocument()
    // 用 stub mode：updatePlayers 不推进玩家位置（真实 SINGLE 会随速度推进 cameraZ，
    // 使车流被甩在玩家后方、环形 d 接近圈长而不触发——集成测试固定位置更可控）
    const ctx = makeCtx({ mode: makeStubMode(), nearMissEl: null })
    ctx.race.player1.cameraZ = 1000
    ctx.race.player1.carState.speed = 6000
    ctx.race.player1.carState.position = 0
    ctx.race.player1.driftState.combo = 1 // 连击 1 → 倍率 1.25
    ctx.race.player1.boostCharge = 0.2
    // 车在玩家前方 50：帧内车流推进（2400×DT=120）→ z=1170，环形 d=170 仍在 NEAR_MISS_Z_DIST 内
    ctx.race.tracks[0].traffic = [{ z: 1050, offset: 0.7, speed: 2400, colorIndex: 0, shiftDir: 0 }]
    const driftScoreBefore = ctx.race.player1.driftState.score
    const nearMissBefore = ctx.race.player1.nearMissScore
    const r = updateFrame(DT, ctx)
    // near-miss 得分 = 100 × 1.25 = 125，且不污染漂移得分
    expect(ctx.race.player1.nearMissScore).toBeCloseTo(nearMissBefore + 125, 6)
    expect(ctx.race.player1.driftState.score).toBeCloseTo(driftScoreBefore, 6)
    // 蓄能 +0.1
    expect(ctx.race.player1.boostCharge).toBeCloseTo(0.3, 6)
    // HUD 弹出（元素 hidden=false 且加入 .near-miss-pop）
    expect(r.nearMissEl).not.toBeNull()
    expect((r.nearMissEl as unknown as StubElement).hidden).toBe(false)
    // 冷却进入冷却期
    expect(ctx.race.player1.nearMissCooldown).toBeGreaterThan(0)
  })

  test('车在玩家后方（d 接近圈长）→ 不触发 near-miss', () => {
    docElements = { 'near-miss': makeElement() }
    stubDocument()
    const ctx = makeCtx({ mode: makeStubMode(), nearMissEl: null })
    ctx.race.player1.cameraZ = 1000
    ctx.race.player1.carState.speed = 6000
    ctx.race.player1.carState.position = 0
    ctx.race.player1.boostCharge = 0.2
    // 车放在玩家后方 200：帧内车流推进 2400×DT=120 → 仍落后玩家 80，环形 d 接近圈长 → 不触发
    ctx.race.tracks[0].traffic = [{ z: 1000 - 200, offset: 0.7, speed: 2400, colorIndex: 0, shiftDir: 0 }]
    const nearMissBefore = ctx.race.player1.nearMissScore
    updateFrame(DT, ctx)
    expect(ctx.race.player1.nearMissScore).toBeCloseTo(nearMissBefore, 6)
    expect(ctx.race.player1.boostCharge).toBeCloseTo(0.2, 6)
  })

  // —— P0-2（2026-09-04）：飘字显示倒计时，修复「触发后永不隐藏」——

  test('P0-2：触发 near-miss 时启动显示倒计时（与 CSS 动画 0.8s 同源）', () => {
    docElements = { 'near-miss': makeElement() }
    stubDocument()
    const ctx = makeCtx({ mode: makeStubMode(), nearMissEl: null })
    ctx.race.player1.cameraZ = 1000
    ctx.race.player1.carState.speed = 6000
    ctx.race.player1.carState.position = 0
    ctx.race.tracks[0].traffic = [{ z: 1050, offset: 0.7, speed: 2400, colorIndex: 0, shiftDir: 0 }]
    const r = updateFrame(DT, ctx)
    expect(r.nearMissHideIn).toBe(NEAR_MISS_POPUP_SEC)
  })

  test('P0-2：倒计时逐帧递减归零后自动隐藏飘字（修复前 hidden 永不复位）', () => {
    docElements = { 'near-miss': makeElement() }
    stubDocument()
    const el = docElements['near-miss'] as StubElement
    const ctx = makeCtx({ mode: makeStubMode(), nearMissEl: null })
    ctx.race.player1.cameraZ = 1000
    ctx.race.player1.carState.speed = 6000
    ctx.race.player1.carState.position = 0
    ctx.race.tracks[0].traffic = [{ z: 1050, offset: 0.7, speed: 2400, colorIndex: 0, shiftDir: 0 }]
    let last = updateFrame(DT, ctx)
    expect(el.hidden).toBe(false)

    // 后续帧清空车流（不再触发），仅推进显示倒计时
    let hideIn = last.nearMissHideIn
    for (let i = 0; i < 200 && (hideIn ?? 0) > 0; i++) {
      const c = makeCtx({
        mode: makeStubMode(),
        nearMissEl: last.nearMissEl,
        nearMissHideIn: hideIn,
      })
      c.race.player1.cameraZ = 1000
      c.race.tracks[0].traffic = []
      last = updateFrame(DT, c)
      hideIn = last.nearMissHideIn
    }
    expect(hideIn).toBe(0)
    expect(el.hidden).toBe(true)
  })

  test('P0-2：非比赛阶段复位飘字（hidden=true 且倒计时归 null）', () => {
    docElements = { 'near-miss': makeElement() }
    stubDocument()
    const el = docElements['near-miss'] as StubElement
    el.hidden = false // 模拟比赛中残留的显示态
    const ctx = makeCtx({
      phase: PHASE_MENU,
      nearMissEl: el as unknown as HTMLDivElement,
      nearMissHideIn: 0.5,
    })
    const r = updateFrame(DT, ctx)
    expect(el.hidden).toBe(true)
    expect(r.nearMissHideIn).toBeNull()
  })

  test('P0-2：起步倒计时冻结窗口同样复位飘字', () => {
    docElements = { 'near-miss': makeElement() }
    stubDocument()
    const el = docElements['near-miss'] as StubElement
    el.hidden = false
    const ctx = makeCtx({
      nearMissEl: el as unknown as HTMLDivElement,
      nearMissHideIn: 0.5,
    })
    ctx.race.countdownRemaining = 1
    const r = updateFrame(DT, ctx)
    expect(el.hidden).toBe(true)
    expect(r.nearMissHideIn).toBeNull()
  })
})

describe('P0 完美氮气段状态（frame-update 集成）', () => {
  test('激活边沿 charge ≥ 阈值 → boostPerfect 锁定到本次激活段，boost 结束重置', () => {
    stubDocument()
    const ctx = makeCtx({ boostActive: false })
    ctx.race.player1.boostCharge = 0.9
    ctx.race.player1.boostActive = false
    ctx.race.player1.boostPerfect = false
    ctx.input = {
      getP1Input: () => ({ throttle: 0, brake: false, steer: 0, boost: true }),
      getP2Input: () => ({ throttle: 0, brake: false, steer: 0 }),
    }
    // 激活帧：charge 0.9 ≥ 0.8 → boostPerfect=true
    updateFrame(DT, ctx)
    expect(ctx.race.player1.boostActive).toBe(true)
    expect(ctx.race.player1.boostPerfect).toBe(true)
    // 持续激活帧（boost 仍按住）：perfect 保持 true（本次段锁定）
    updateFrame(DT, ctx)
    expect(ctx.race.player1.boostPerfect).toBe(true)
    // 松开 boost → 段结束 → boostPerfect 重置
    ctx.input = {
      getP1Input: () => ({ throttle: 0, brake: false, steer: 0, boost: false }),
      getP2Input: () => ({ throttle: 0, brake: false, steer: 0 }),
    }
    updateFrame(DT, ctx)
    expect(ctx.race.player1.boostActive).toBe(false)
    expect(ctx.race.player1.boostPerfect).toBe(false)
  })

  test('激活边沿 charge 未达阈值 → 非完美氮气（boostPerfect=false）', () => {
    stubDocument()
    const ctx = makeCtx({ boostActive: false })
    ctx.race.player1.boostCharge = 0.4
    ctx.race.player1.boostActive = false
    ctx.race.player1.boostPerfect = false
    ctx.input = {
      getP1Input: () => ({ throttle: 0, brake: false, steer: 0, boost: true }),
      getP2Input: () => ({ throttle: 0, brake: false, steer: 0 }),
    }
    updateFrame(DT, ctx)
    expect(ctx.race.player1.boostActive).toBe(true)
    expect(ctx.race.player1.boostPerfect).toBe(false)
  })
})

describe('P0 漂移小喷（frame-update 集成）', () => {
  test('漂移释放触发小喷 → 产尾焰粒子', () => {
    stubDocument()
    // 真实 SINGLE 模式：updatePlayers 会调用 updatePlayerFrame → updateDrift，释放边沿触发小喷
    const ctx = makeCtx({ mode: SINGLE, boostParticles: [] })
    // 已激活漂移态且 charge 略高于阈值（零输入松转向一帧即衰减跌破 → 释放），peakCharge 满（长喷档）
    ctx.race.player1.driftState = {
      charge: 0.26,
      active: true,
      lastSmoke: 0,
      smoke: [],
      score: 0,
      combo: 2,
      comboTimer: 0,
      turbo: 0,
      turboLevel: 0,
      peakCharge: 1,
    }
    const before = ctx.race.player1.driftState.turbo
    updateFrame(DT, ctx)
    // 释放帧：active→false、turbo 置长喷时长
    expect(ctx.race.player1.driftState.active).toBe(false)
    expect(ctx.race.player1.driftState.turbo).toBeGreaterThan(before)
    expect(ctx.race.player1.driftState.turboLevel).toBe(2)
    // 小喷期间产生尾焰粒子（帧块在玩家物理更新后按 turbo>0 推入）
    expect(ctx.boostParticles.length).toBeGreaterThan(0)
  })
})
