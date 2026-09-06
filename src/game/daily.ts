import { TRACK_DEFS } from '../engine/tracks'
import type { DailyState } from '../shared/types'

/**
 * M28 方案 14：每日挑战（轻量 live-ops，PWA 离线可用）——
 * 基于日期确定性选择「今日赛道」（同一天所有玩家看到同一挑战，无需网络）；
 * 玩家在该赛道完赛（normal 完赛）即完成今日挑战，记连续签到天数 streak（断签归 1）。
 * 纯函数：无 DOM/localStorage 副作用（存档 API 在 ui/save.ts），输入状态、输出状态。
 */

/** 今日赛道候选集：全部正式赛道（确定性哈希取模，保证覆盖所有赛道轮换） */
const DAILY_TRACK_POOL = TRACK_DEFS.map((def) => def.id)

/** DailyState 类型真源已提升至 shared/types（2026-09-06）；此处 re-export 防外部破坏 */
export type { DailyState } from '../shared/types'

/** 生成本地日期字符串 YYYY-MM-DD（每日挑战按日轮换，本地时区语义） */
export function todayDateString(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 基于日期确定性选择今日赛道：对 date 字符串逐字符 hash 后取模赛道池。
 * 同一天恒定返回同一赛道；跨赛道轮换由日期差异驱动（相邻两天 hash 不同 → 大概率换赛道）。
 */
export function dailyTrackIdFor(date: string): string {
  let h = 0
  for (let i = 0; i < date.length; i++) {
    h = (h * 31 + date.charCodeAt(i)) | 0
  }
  return DAILY_TRACK_POOL[Math.abs(h) % DAILY_TRACK_POOL.length]
}

/** 昨日日期字符串（YYYY-MM-DD）：streak 连续性判定（今天是否昨天+1） */
export function previousDateString(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const prev = new Date(y, m - 1, d - 1)
  return todayDateString(prev)
}

/** 创建今日初始状态（date/trackId/done=false）；streak 继承自上次连续（date=昨天时保持 +1 语义，否则归 1） */
export function createDailyState(date: string, prev: DailyState | null): DailyState {
  return {
    date,
    trackId: dailyTrackIdFor(date),
    done: false,
    // 昨日完成 → streak 延续（具体 +1 由 markDailyFinished 在完成时执行）；非连续（今天≠昨天+1）→ 归 1
    streak: prev !== null && prev.date === previousDateString(date) && prev.done ? prev.streak : 0,
  }
}

/**
 * 判定今日挑战是否可完成（纯函数）：当前赛道 == 今日赛道，且（normal/挑战/路线）完赛。
 * 单屏/分屏 P1 用 P1 赛道；热座/挑战 P1 恒为主。
 */
export function shouldCompleteDaily(
  state: DailyState,
  finishedP1: boolean,
  trackIdP1: string,
  dailyModeEnabled: boolean,
): boolean {
  if (!dailyModeEnabled || state.done) {
    return false
  }
  return finishedP1 && trackIdP1 === state.trackId
}

/** 标记今日挑战完成并累计 streak（幂等：已完成返回原状态；断签日期变更时 streak 从 1 起） */
export function markDailyFinished(state: DailyState): DailyState {
  if (state.done) {
    return state
  }
  return { ...state, done: true, streak: state.streak + 1 }
}

/** 若日期已变更则重置为新日状态（返回新状态；同日期返回原状态） */
export function rollDailyToToday(state: DailyState | null, today: string): DailyState {
  if (state !== null && state.date === today) {
    return state
  }
  return createDailyState(today, state)
}
