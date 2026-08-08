/**
 * M23 方案 6：成就判定纯函数单测。
 * evaluateAchievements 输入对局结算数据 + 已解锁集合，返回本局新解锁成就 id。
 */
import { describe, expect, it } from 'vitest'
import { evaluateAchievements, type AchievementContext } from '../../src/game/achievements'
import { createRaceState } from '../../src/game/state'
import { TRACK_DEFS } from '../../src/engine/tracks'
import { createTrackContext } from '../../src/game/track-context'
import type { TrackManager } from '../../src/game/track-manager'
import { MEDAL_BASE_SEC } from '../../src/shared/constants'
import { isOfficialTrack } from '../../src/game/achievements'

/** 构造最简 AchievementContext（可选覆盖各字段） */
function makeCtx(over: Partial<AchievementContext> = {}): AchievementContext {
  const race = createRaceState()
  // 默认以 classic 赛道上下文（白天环境）
  race.tracks[0] = createTrackContext(TRACK_DEFS[0])
  race.tracks[1] = createTrackContext(TRACK_DEFS[0])
  const trackManager = {
    getLapLength: () => race.tracks[0].lapLength,
    getTotalLaps: () => race.tracks[0].totalLaps,
    getTrackId: (i: 0 | 1) => race.tracks[i].def.id,
  } as unknown as TrackManager
  return {
    race,
    trackManager,
    medalP1: null,
    finishedP1: false,
    wet: false,
    ...over,
  }
}

describe('evaluateAchievements 成就判定', () => {
  it('无任何达成条件 → 空列表', () => {
    expect(evaluateAchievements(makeCtx(), new Set())).toEqual([])
  })

  it('使用过 BOOST → first-boost', () => {
    const ctx = makeCtx()
    ctx.race.player1.boostUsedEver = true
    expect(evaluateAchievements(ctx, new Set())).toContain('first-boost')
  })

  it('触发完美氮气 → perfect-boost', () => {
    const ctx = makeCtx()
    ctx.race.player1.perfectBoostUsed = true
    expect(evaluateAchievements(ctx, new Set())).toContain('perfect-boost')
  })

  it('最高连击 ≥5 → combo-5', () => {
    const ctx = makeCtx()
    ctx.race.player1.maxCombo = 5
    expect(evaluateAchievements(ctx, new Set())).toContain('combo-5')
  })

  it('连击 <5 不触发 combo-5', () => {
    const ctx = makeCtx()
    ctx.race.player1.maxCombo = 4
    expect(evaluateAchievements(ctx, new Set())).not.toContain('combo-5')
  })

  it('near-miss ≥3 次 → near-miss-3', () => {
    const ctx = makeCtx()
    ctx.race.player1.nearMissCount = 3
    expect(evaluateAchievements(ctx, new Set())).toContain('near-miss-3')
  })

  it('S 奖牌 → medal-s（A/B 不触发）', () => {
    const s = makeCtx()
    s.medalP1 = 'S'
    expect(evaluateAchievements(s, new Set())).toContain('medal-s')
    const a = makeCtx()
    a.medalP1 = 'A'
    expect(evaluateAchievements(a, new Set())).not.toContain('medal-s')
  })

  it('雨天 + 完赛 → rain-finish（非完赛不触发）', () => {
    const ctx = makeCtx({ finishedP1: true, wet: true })
    expect(evaluateAchievements(ctx, new Set())).toContain('rain-finish')
    const noFinish = makeCtx({ finishedP1: false, wet: true })
    expect(evaluateAchievements(noFinish, new Set())).not.toContain('rain-finish')
  })

  it('夜晚赛道 + 完赛 → night-finish', () => {
    const ctx = makeCtx({ finishedP1: true })
    const canyon = TRACK_DEFS.find((t) => t.id === 'canyon')
    if (!canyon) throw new Error('canyon track missing')
    ctx.race.tracks[0] = createTrackContext(canyon)
    expect(evaluateAchievements(ctx, new Set())).toContain('night-finish')
  })

  it('M23 方案 11：普通赛道 + 天气变体 night + 完赛 → night-finish（与渲染 night 语义一致）', () => {
    const ctx = makeCtx({ finishedP1: true })
    ctx.race.weatherOverride = 'night'
    expect(evaluateAchievements(ctx, new Set())).toContain('night-finish')
  })

  it('M23 方案 11：普通赛道 + 天气变体 night + 未完赛 → 不触发 night-finish', () => {
    const ctx = makeCtx({ finishedP1: false })
    ctx.race.weatherOverride = 'night'
    expect(evaluateAchievements(ctx, new Set())).not.toContain('night-finish')
  })

  it('漂移总分 ≥2000 → drift-score-2000（含 near-miss 总分）', () => {
    const ctx = makeCtx()
    ctx.race.player1.driftState.score = 1800
    ctx.race.player1.nearMissScore = 300
    expect(evaluateAchievements(ctx, new Set())).toContain('drift-score-2000')
  })

  it('已解锁的成就不再返回（去重）', () => {
    const ctx = makeCtx()
    ctx.race.player1.boostUsedEver = true
    const unlocked = new Set(['first-boost'])
    expect(evaluateAchievements(ctx, unlocked)).not.toContain('first-boost')
  })
})

describe('isOfficialTrack 赛道校验', () => {
  it('9 条正式赛道均在 MEDAL_BASE_SEC 中', () => {
    for (const def of TRACK_DEFS) {
      expect(isOfficialTrack(def.id)).toBe(true)
    }
    expect(Object.keys(MEDAL_BASE_SEC).length).toBeGreaterThanOrEqual(9)
  })

  it('未知赛道返回 false', () => {
    expect(isOfficialTrack('not-a-track')).toBe(false)
  })
})
