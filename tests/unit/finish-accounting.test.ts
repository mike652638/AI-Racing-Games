import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { accountFinish, type FinishAccountingResult } from '../../src/game/finish-accounting'
import { createModeStrategy, type ModeStrategy } from '../../src/game/mode-strategy'
import { createRaceState } from '../../src/game/state'
import type { RaceState } from '../../src/shared/types'
import { addDriftScore, addMatchResult, loadDaily, recordWin, saveDaily } from '../../src/ui/save'
import type { TrackManager } from '../../src/game/track-manager'

// 记账写入全部替换为 vi.fn（真实实现会写 localStorage）：断言"是否调用/调用参数"，
// 不触碰存储副作用；recordWin 返回固定统计供 winStats 透传断言；
// addDriftScore 默认返回本条入榜首位（F-3 起 accountFinish 消费返回的 { top, entered }）
vi.mock('../../src/ui/save', () => ({
  recordWin: vi.fn(() => ({ p1: 1, p2: 0, streak: 1, streakPlayer: 'P1' })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addDriftScore: vi.fn((entry: any) => ({ top: [entry], entered: true })),
  addMatchResult: vi.fn(),
  // M23 方案 7：奖牌存档 mock（真实实现会写 localStorage）
  saveMedal: vi.fn(() => true),
  // M23 方案 6：成就存档 mock（真实实现会写 localStorage）
  loadAchievements: vi.fn(() => new Set<string>()),
  unlockAchievement: vi.fn(() => true),
  // M28 方案 14：每日挑战存档 mock（真实实现会写 localStorage）；默认返回今日未完成状态
  loadDaily: vi.fn(() => null),
  saveDaily: vi.fn(),
}))

/** 圈长 1000 × 3 圈、P1 赛道 classic / P2 赛道 highway 的 TrackManager 替身 */
function mockTrackManager(): TrackManager {
  return {
    getLapLength: () => 1000,
    getTotalLaps: () => 3,
    getTrackId: (i: 0 | 1) => (i === 0 ? 'classic' : 'highway'),
  } as unknown as TrackManager
}

/** 构造指定完赛/得分/计时的 RaceState（cameraZ=4000 → lap 5 > 3 完赛；2999 → 未完赛） */
interface RaceOver {
  p1CameraZ?: number
  p2CameraZ?: number
  p1Score?: number
  p2Score?: number
  p1RaceTime?: number
  p2RaceTime?: number
  p1Combo?: number
  p2Combo?: number
}
function makeRace(over: RaceOver = {}): RaceState {
  const race = createRaceState()
  race.player1.cameraZ = over.p1CameraZ ?? 0
  race.player2.cameraZ = over.p2CameraZ ?? 0
  race.player1.driftState.score = over.p1Score ?? 0
  race.player2.driftState.score = over.p2Score ?? 0
  race.player1.raceTime = over.p1RaceTime ?? 0
  race.player2.raceTime = over.p2RaceTime ?? 0
  race.player1.driftState.combo = over.p1Combo ?? 0
  race.player2.driftState.combo = over.p2Combo ?? 0
  return race
}

/** 便捷调用：默认单屏、hotseatPlayer=1、prevP1Time=null、record=false */
function call(
  race: RaceState,
  mode: ModeStrategy,
  over: { hotseatPlayer?: 1 | 2; prevP1Time?: number | null; record?: boolean } = {},
): FinishAccountingResult {
  return accountFinish({
    race,
    trackManager: mockTrackManager(),
    mode,
    hotseatPlayer: over.hotseatPlayer ?? 1,
    prevP1Time: over.prevP1Time ?? null,
    record: over.record ?? false,
  })
}

const SINGLE = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })
const SPLIT = createModeStrategy({ splitMode: true, hotseatMode: false, challengeMode: false })
const HOTSEAT = createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: false })
const CHALLENGE = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: true })

// 每个用例前清空写入函数的调用记录（保留 mock 实现）
beforeEach(() => {
  vi.clearAllMocks()
})

/** vi.mock 注入的写入函数（类型标注为 mocked 以访问 .mock） */
const mockedRecordWin = vi.mocked(recordWin)
const mockedAddDriftScore = vi.mocked(addDriftScore)
const mockedAddMatchResult = vi.mocked(addMatchResult)
/** M28 方案 14：每日挑战存档 mock（测试内可注入可控状态） */
const mockedLoadDaily = vi.mocked(loadDaily)
const mockedSaveDaily = vi.mocked(saveDaily)

describe('完赛标记 finishedP1/finishedP2', () => {
  test('SINGLE：P1 超圈完赛、P2 恒未完赛（即便 P2 cameraZ 超圈）', () => {
    const r = call(makeRace({ p1CameraZ: 4000, p2CameraZ: 4000 }), SINGLE)
    expect(r.finishedP1).toBe(true)
    expect(r.finishedP2).toBe(false)
  })

  test('SINGLE：P1 未超圈（第 3 圈内）未完赛', () => {
    const r = call(makeRace({ p1CameraZ: 2999 }), SINGLE)
    expect(r.finishedP1).toBe(false)
  })

  test('恰好第 4 圈起点视为完赛（cameraZ=3000 边界）', () => {
    const r = call(makeRace({ p1CameraZ: 3000 }), SINGLE)
    expect(r.finishedP1).toBe(true)
  })

  test('SPLIT：P2 超圈参与判定', () => {
    const r = call(makeRace({ p2CameraZ: 4000 }), SPLIT)
    expect(r.finishedP2).toBe(true)
  })

  test('HOTSEAT：P2 超圈参与判定（热座共用 finishedP2）', () => {
    const r = call(makeRace({ p2CameraZ: 4000 }), HOTSEAT, { hotseatPlayer: 2 })
    expect(r.finishedP2).toBe(true)
  })
})

describe('driftWinner 分屏漂移竞速胜者', () => {
  const DUAL = { p1CameraZ: 4000, p2CameraZ: 4000 }

  test('分屏双完赛：P1 得分更高归 P1', () => {
    const r = call(makeRace({ ...DUAL, p1Score: 100, p2Score: 80 }), SPLIT)
    expect(r.driftWinner).toBe('P1')
  })

  test('分屏双完赛：P2 得分更高归 P2', () => {
    const r = call(makeRace({ ...DUAL, p1Score: 80, p2Score: 100 }), SPLIT)
    expect(r.driftWinner).toBe('P2')
  })

  test('分屏双完赛：得分平局归 P1', () => {
    const r = call(makeRace({ ...DUAL, p1Score: 100, p2Score: 100 }), SPLIT)
    expect(r.driftWinner).toBe('P1')
  })

  test('按 Math.round 后比较（100.4 vs 100.6 → P2）', () => {
    const r = call(makeRace({ ...DUAL, p1Score: 100.4, p2Score: 100.6 }), SPLIT)
    expect(r.driftWinner).toBe('P2')
  })

  test('分屏未双完赛（P2 未完赛）→ null', () => {
    const r = call(makeRace({ p1CameraZ: 4000, p1Score: 100, p2Score: 0 }), SPLIT)
    expect(r.driftWinner).toBeNull()
  })

  test('热座双完赛 → null（driftWinner 仅分屏计算）', () => {
    const r = call(makeRace({ ...DUAL, p1Score: 100, p2Score: 80 }), HOTSEAT, { hotseatPlayer: 2 })
    expect(r.driftWinner).toBeNull()
  })

  test('单屏 → 恒 null', () => {
    const r = call(makeRace({ ...DUAL, p1Score: 100, p2Score: 80 }), SINGLE)
    expect(r.driftWinner).toBeNull()
  })
})

describe('record=false：只计算不写入', () => {
  test('分屏双完赛 + 双方正分：三个写入函数均不被调用，标记仍正确计算', () => {
    const race = makeRace({ p1CameraZ: 4000, p2CameraZ: 4000, p1Score: 100, p2Score: 80 })
    const r = call(race, SPLIT, { record: false })
    expect(mockedRecordWin).not.toHaveBeenCalled()
    expect(mockedAddDriftScore).not.toHaveBeenCalled()
    expect(mockedAddMatchResult).not.toHaveBeenCalled()
    expect(r.finishedP1).toBe(true)
    expect(r.finishedP2).toBe(true)
    expect(r.driftWinner).toBe('P1')
    expect(r.winStats).toBeNull()
  })
})

describe('record=true：按模式记账', () => {
  test('SINGLE 完赛正分：addDriftScore(P1) 参数正确（player/trackId/score/time/combo），无胜场记录', () => {
    const r = call(makeRace({ p1CameraZ: 4000, p1Score: 50, p1RaceTime: 30, p1Combo: 4 }), SINGLE, { record: true })
    expect(mockedAddDriftScore).toHaveBeenCalledTimes(1)
    expect(mockedAddDriftScore).toHaveBeenCalledWith({
      player: 'P1',
      trackId: 'classic',
      score: 50,
      time: 30,
      combo: 4,
    })
    expect(mockedRecordWin).not.toHaveBeenCalled()
    expect(r.winStats).toBeNull()
  })

  test('SINGLE 未完赛正分：不记分（非挑战无放宽条件）', () => {
    call(makeRace({ p1Score: 50 }), SINGLE, { record: true })
    expect(mockedAddDriftScore).not.toHaveBeenCalled()
  })

  test('SINGLE 完赛零分：不记分（score > 0 条件）', () => {
    call(makeRace({ p1CameraZ: 4000, p1Score: 0 }), SINGLE, { record: true })
    expect(mockedAddDriftScore).not.toHaveBeenCalled()
  })

  test('CHALLENGE 未完赛正分：挑战模式放宽条件仍记 P1（限时刷分场景）', () => {
    const r = call(makeRace({ p1CameraZ: 0, p1Score: 50 }), CHALLENGE, { record: true })
    expect(mockedAddDriftScore).toHaveBeenCalledTimes(1)
    expect(mockedAddDriftScore).toHaveBeenCalledWith(expect.objectContaining({ player: 'P1', score: 50 }))
    // 挑战为单屏：P2 恒不参与记分
    expect(mockedAddDriftScore.mock.calls[0][0].player).toBe('P1')
    expect(r.driftWinner).toBeNull()
  })

  test('CHALLENGE 未完赛零分：不记分', () => {
    call(makeRace({ p1Score: 0 }), CHALLENGE, { record: true })
    expect(mockedAddDriftScore).not.toHaveBeenCalled()
  })

  test('SPLIT 双完赛正分：recordWin(split) + addDriftScore ×2（P1/P2 各自） + addMatchResult 1 次', () => {
    const race = makeRace({ p1CameraZ: 4000, p2CameraZ: 4000, p1Score: 100, p2Score: 80 })
    const r = call(race, SPLIT, { record: true })
    expect(mockedRecordWin).toHaveBeenCalledWith('split', 'P1')
    expect(r.winStats).toEqual({ p1: 1, p2: 0, streak: 1, streakPlayer: 'P1' }) // mock 返回值透传
    expect(mockedAddDriftScore).toHaveBeenCalledTimes(2)
    expect(mockedAddDriftScore).toHaveBeenCalledWith(expect.objectContaining({ player: 'P1', score: 100 }))
    expect(mockedAddDriftScore).toHaveBeenCalledWith(expect.objectContaining({ player: 'P2', score: 80 }))
    expect(mockedAddMatchResult).toHaveBeenCalledWith({ winner: 'P1', p1Score: 100, p2Score: 80, trackId: 'classic' })
  })

  test('HOTSEAT round2：P1 更快记 recordWin(hotseat, P1)', () => {
    const race = makeRace({ p2CameraZ: 4000, p2Score: 10, p2RaceTime: 35 })
    const r = call(race, HOTSEAT, { record: true, hotseatPlayer: 2, prevP1Time: 30 })
    expect(mockedRecordWin).toHaveBeenCalledWith('hotseat', 'P1')
    expect(r.winStats).not.toBeNull()
  })

  test('HOTSEAT round2：P2 更快记 recordWin(hotseat, P2)', () => {
    const race = makeRace({ p2CameraZ: 4000, p2Score: 10, p2RaceTime: 25 })
    call(race, HOTSEAT, { record: true, hotseatPlayer: 2, prevP1Time: 30 })
    expect(mockedRecordWin).toHaveBeenCalledWith('hotseat', 'P2')
  })

  test('HOTSEAT round2 平手：不记胜场、winStats null', () => {
    const race = makeRace({ p2CameraZ: 4000, p2Score: 10, p2RaceTime: 30 })
    const r = call(race, HOTSEAT, { record: true, hotseatPlayer: 2, prevP1Time: 30 })
    expect(mockedRecordWin).not.toHaveBeenCalled()
    expect(r.winStats).toBeNull()
  })

  test('HOTSEAT round1：不按用时比较胜负（hotseatPlayer=1 时 winner 条件不成立）', () => {
    const race = makeRace({ p1CameraZ: 4000, p1Score: 10, p1RaceTime: 30 })
    call(race, HOTSEAT, { record: true, hotseatPlayer: 1, prevP1Time: null })
    expect(mockedRecordWin).not.toHaveBeenCalled()
  })

  test('SPLIT 未双完赛：不记胜场、不记对局（winner/addMatchResult 均需双完赛）', () => {
    const race = makeRace({ p1CameraZ: 4000, p1Score: 100, p2Score: 80 })
    call(race, SPLIT, { record: true })
    expect(mockedRecordWin).not.toHaveBeenCalled()
    expect(mockedAddMatchResult).not.toHaveBeenCalled()
    // P1 已完赛且正分仍记漂移榜
    expect(mockedAddDriftScore).toHaveBeenCalledWith(expect.objectContaining({ player: 'P1' }))
  })

  test('HOTSEAT 双完赛：不记对局（addMatchResult 仅分屏）', () => {
    const race = makeRace({ p1CameraZ: 4000, p2CameraZ: 4000, p1Score: 100, p2Score: 80, p2RaceTime: 35 })
    call(race, HOTSEAT, { record: true, hotseatPlayer: 2, prevP1Time: 30 })
    expect(mockedAddMatchResult).not.toHaveBeenCalled()
    // 热座 round2 仍按用时记胜场与双方漂移分
    expect(mockedRecordWin).toHaveBeenCalledWith('hotseat', 'P1')
    expect(mockedAddDriftScore).toHaveBeenCalledTimes(2)
  })

  test('SINGLE：P2 正分不记漂移榜（finishedP2 恒 false）', () => {
    call(makeRace({ p1CameraZ: 4000, p2CameraZ: 4000, p1Score: 10, p2Score: 50 }), SINGLE, { record: true })
    expect(mockedAddDriftScore).toHaveBeenCalledTimes(1)
    expect(mockedAddDriftScore).toHaveBeenCalledWith(expect.objectContaining({ player: 'P1' }))
  })
})

describe('F-3 driftRankP1 漂移榜名次（2026-08-05 审计）', () => {
  test('record=true 且入榜：名次 = addDriftScore 返回 top 中本条引用位置 + 1', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAddDriftScore.mockImplementationOnce((entry: any) => ({ top: [{}, entry, {}], entered: true }))
    const r = call(makeRace({ p1CameraZ: 4000, p1Score: 100 }), SINGLE, { record: true })
    expect(r.driftRankP1).toBe(2)
  })

  test('record=true 但被挤出 TOP10（entered=false）：名次 0（结算面板显示「未进 TOP10」）', () => {
    mockedAddDriftScore.mockImplementationOnce(() => ({ top: [], entered: false }))
    const r = call(makeRace({ p1CameraZ: 4000, p1Score: 1 }), SINGLE, { record: true })
    expect(r.driftRankP1).toBe(0)
  })

  test('record=false 或零分：未记账名次恒 0', () => {
    expect(call(makeRace({ p1CameraZ: 4000, p1Score: 100 }), SINGLE, { record: false }).driftRankP1).toBe(0)
    expect(call(makeRace({ p1CameraZ: 4000, p1Score: 0 }), SINGLE, { record: true }).driftRankP1).toBe(0)
  })

  test('同分早条已在榜：名次按本条引用位置而非分数匹配（旧 findIndex 同分高估回归锚点）', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAddDriftScore.mockImplementationOnce((entry: any) => ({
      top: [{ score: 100, player: 'P2' }, entry],
      entered: true,
    }))
    const r = call(makeRace({ p1CameraZ: 4000, p1Score: 100 }), SINGLE, { record: true })
    expect(r.driftRankP1).toBe(2)
  })
})

describe('M28 方案 9：路线模式完赛判定与记账', () => {
  const ROUTE = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false, routeMode: true })

  test('终点段跑满 1 圈（routeIsFinish + lap>1）→ finishedP1=true；非终点段 → false', () => {
    const finish = makeRace({ p1CameraZ: 1500 }) // lap 2 > 1
    finish.routeStageId = 'c1'
    finish.routeIsFinish = true
    finish.routeStageCount = 4
    finish.routeStageIndex = 4
    expect(call(finish, ROUTE).finishedP1).toBe(true)

    const mid = makeRace({ p1CameraZ: 1500 })
    mid.routeStageId = 'a1'
    mid.routeIsFinish = false
    expect(call(mid, ROUTE).finishedP1).toBe(false)
  })

  test('非终点段即便 lap 超 1 圈也不完赛（段切换由 GameLoop 驱动）', () => {
    const mid = makeRace({ p1CameraZ: 99999 })
    mid.routeStageId = 'a1'
    mid.routeIsFinish = false
    expect(call(mid, ROUTE).finishedP1).toBe(false)
  })

  test('终点段但未跑满 1 圈 → 未完赛', () => {
    const finish = makeRace({ p1CameraZ: 999 }) // lap 1 未完
    finish.routeStageId = 'c1'
    finish.routeIsFinish = true
    expect(call(finish, ROUTE).finishedP1).toBe(false)
  })

  test('record=true 时累计跨段时间/得分，且不写漂移榜/奖牌/胜场', () => {
    const race = makeRace({ p1CameraZ: 1500, p1Score: 200, p1RaceTime: 30 })
    race.player1.nearMissScore = 50
    race.routeStageId = 'c1'
    race.routeIsFinish = true
    race.routeCumulativeTime = 60 // 前段累计
    race.routeCumulativeDriftScore = 100
    const r = call(race, ROUTE, { record: true })
    // 累计：前段 60 + 本段 30 = 90；得分 100 + (200 + 50) = 350
    expect(race.routeCumulativeTime).toBe(90)
    expect(race.routeCumulativeDriftScore).toBe(350)
    expect(r.driftRankP1).toBe(0)
    expect(r.winStats).toBeNull()
    expect(mockedAddDriftScore).not.toHaveBeenCalled()
    expect(mockedAddMatchResult).not.toHaveBeenCalled()
  })
})

describe('M28 方案 14：每日挑战完成判定', () => {
  /**
   * 日期敏感修复（2026-08-15）：accountFinish 内部用 todayDateString()（真实系统时钟）roll 每日状态，
   * 本组 fixture 日期硬编码 2026-08-08——系统日期 ≠ 2026-08-08 时每日赛道被滚动为当天赛道，
   * 「今日赛道」匹配必然失败。冻结系统时钟使"今天"恒为 fixture 日期，跨日 CI 稳定。
   */
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-08T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** 注入 daily 存档 mock 返回可控状态 */
  const withDaily = (daily: { date: string; trackId: string; done: boolean; streak: number }): void => {
    mockedLoadDaily.mockReturnValue(daily)
  }

  test('今日赛道 + P1 完赛 + record=true → dailyDoneToday=true', () => {
    withDaily({ date: '2026-08-08', trackId: 'classic', done: false, streak: 0 })
    const race = makeRace({ p1CameraZ: 4000 }) // 完赛
    const r = call(race, SINGLE, { record: true })
    expect(r.dailyDoneToday).toBe(true)
    expect(mockedSaveDaily).toHaveBeenCalled()
  })

  test('赛道不匹配 → dailyDoneToday=false', () => {
    withDaily({ date: '2026-08-08', trackId: 'highway', done: false, streak: 0 })
    const race = makeRace({ p1CameraZ: 4000 }) // P1 赛道 classic ≠ 今日 highway
    const r = call(race, SINGLE, { record: true })
    expect(r.dailyDoneToday).toBe(false)
  })

  test('未完赛 → dailyDoneToday=false', () => {
    withDaily({ date: '2026-08-08', trackId: 'classic', done: false, streak: 0 })
    const race = makeRace({ p1CameraZ: 2999 }) // 未完赛
    const r = call(race, SINGLE, { record: true })
    expect(r.dailyDoneToday).toBe(false)
  })

  test('已完成的今日挑战 → 不再重复完成（幂等）', () => {
    withDaily({ date: '2026-08-08', trackId: 'classic', done: true, streak: 4 })
    const race = makeRace({ p1CameraZ: 4000 })
    const r = call(race, SINGLE, { record: true })
    expect(r.dailyDoneToday).toBe(false)
    expect(mockedSaveDaily).not.toHaveBeenCalledWith(expect.objectContaining({ done: false }))
  })

  test('record=false → 不执行 daily 判定（纯展示调用）', () => {
    withDaily({ date: '2026-08-08', trackId: 'classic', done: false, streak: 0 })
    const race = makeRace({ p1CameraZ: 4000 })
    const r = call(race, SINGLE, { record: false })
    expect(r.dailyDoneToday).toBe(false)
    expect(mockedSaveDaily).not.toHaveBeenCalled()
  })
})
