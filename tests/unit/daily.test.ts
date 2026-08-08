/**
 * M28 方案 14：每日挑战纯函数单测。
 * 覆盖：今日赛道确定性选择（同日期恒定、跨日期可能变化）、date 字符串生成/昨日计算、
 * 初始状态创建（streak 继承/重置）、完成判定（赛道匹配+完赛+开关）、标记完成（幂等 + streak 累计）、
 * 跨日滚动（同日期不变、跨日重建）。
 */
import { describe, expect, test } from 'vitest'
import {
  createDailyState,
  dailyTrackIdFor,
  markDailyFinished,
  previousDateString,
  rollDailyToToday,
  shouldCompleteDaily,
  todayDateString,
} from '../../src/game/daily'
import { TRACK_DEFS } from '../../src/engine/tracks'

describe('M28 方案 14：每日赛道确定性选择', () => {
  test('同日期恒定返回同一赛道（确定性）', () => {
    const a = dailyTrackIdFor('2026-08-08')
    const b = dailyTrackIdFor('2026-08-08')
    expect(a).toBe(b)
    expect(TRACK_DEFS.some((d) => d.id === a)).toBe(true)
  })

  test('跨日期大概率不同赛道（轮换）', () => {
    const set = new Set<string>()
    for (let day = 1; day <= 9; day++) {
      set.add(dailyTrackIdFor(`2026-08-${String(day).padStart(2, '0')}`))
    }
    // 9 天内至少覆盖 3 条不同赛道（哈希分散性）
    expect(set.size).toBeGreaterThanOrEqual(3)
  })

  test('所有赛道池 id 均为正式赛道', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      const id = dailyTrackIdFor(day)
      expect(TRACK_DEFS.some((d) => d.id === id)).toBe(true)
    }
  })
})

describe('M28 方案 14：日期工具', () => {
  test('todayDateString 生成 YYYY-MM-DD（含补零）', () => {
    expect(todayDateString(new Date(2026, 7, 8))).toBe('2026-08-08')
    expect(todayDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  test('previousDateString 跨月/跨年正确', () => {
    expect(previousDateString('2026-08-08')).toBe('2026-08-07')
    expect(previousDateString('2026-03-01')).toBe('2026-02-28')
    expect(previousDateString('2026-01-01')).toBe('2025-12-31')
  })
})

describe('M28 方案 14：状态创建与滚动', () => {
  test('createDailyState：新日开始（done=false，streak=0）', () => {
    const s = createDailyState('2026-08-08', null)
    expect(s.date).toBe('2026-08-08')
    expect(s.trackId).toBe(dailyTrackIdFor('2026-08-08'))
    expect(s.done).toBe(false)
    expect(s.streak).toBe(0)
  })

  test('createDailyState：昨日完成且日期连续 → streak 继承', () => {
    const prev = { date: '2026-08-07', trackId: dailyTrackIdFor('2026-08-07'), done: true, streak: 3 }
    const s = createDailyState('2026-08-08', prev)
    expect(s.streak).toBe(3) // 继承，完成时 +1
    expect(s.done).toBe(false)
  })

  test('createDailyState：断签（非连续日期）→ streak 归 0', () => {
    const prev = { date: '2026-08-01', trackId: 'x', done: true, streak: 5 }
    const s = createDailyState('2026-08-08', prev)
    expect(s.streak).toBe(0)
  })

  test('rollDailyToToday：同日期返回原状态', () => {
    const s = createDailyState('2026-08-08', null)
    expect(rollDailyToToday(s, '2026-08-08')).toBe(s)
  })

  test('rollDailyToToday：跨日重建为新日状态（继承连续 streak）', () => {
    const prev = { date: '2026-08-07', trackId: dailyTrackIdFor('2026-08-07'), done: true, streak: 2 }
    const s = rollDailyToToday(prev, '2026-08-08')
    expect(s.date).toBe('2026-08-08')
    expect(s.done).toBe(false)
    expect(s.streak).toBe(2)
  })
})

describe('M28 方案 14：完成判定与标记', () => {
  const state = (over: Partial<ReturnType<typeof createDailyState>> = {}) =>
    createDailyState('2026-08-08', null) && { date: '2026-08-08', trackId: 'classic', done: false, streak: 0, ...over }

  test('shouldCompleteDaily：今日赛道 + 完赛 + 模式开启 → true', () => {
    expect(shouldCompleteDaily(state(), true, 'classic', true)).toBe(true)
  })

  test('shouldCompleteDaily：赛道不匹配 → false', () => {
    expect(shouldCompleteDaily(state(), true, 'highway', true)).toBe(false)
  })

  test('shouldCompleteDaily：未完赛 → false', () => {
    expect(shouldCompleteDaily(state(), false, 'classic', true)).toBe(false)
  })

  test('shouldCompleteDaily：模式关闭 → false', () => {
    expect(shouldCompleteDaily(state(), true, 'classic', false)).toBe(false)
  })

  test('shouldCompleteDaily：已完成 → false（幂等）', () => {
    expect(shouldCompleteDaily(state({ done: true }), true, 'classic', true)).toBe(false)
  })

  test('markDailyFinished：标记完成并 streak+1', () => {
    const s = state()
    const done = markDailyFinished(s)
    expect(done.done).toBe(true)
    expect(done.streak).toBe(1)
  })

  test('markDailyFinished：幂等（已完成不重复累加）', () => {
    const s = state({ done: true, streak: 4 })
    expect(markDailyFinished(s)).toBe(s)
  })
})
