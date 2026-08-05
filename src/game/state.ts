import { createPlayerState, resetPlayerState } from './player-state'
import { TRACK_DEFS } from '../engine/tracks'
import { PHASE_MENU } from './phase'
import { createTrackContext } from './track-context'
import type { RaceState } from '../shared/types'

// 类型提升（2026-08-05）：RaceState 接口唯一真源移至 src/shared/types.ts（解耦 ui→game 类型依赖），
// 本文件保留同名 re-export 兼容层，既有导入路径不变
export type { RaceState }

/** 创建初始对局状态（默认以 TRACK_DEFS[0] 创建双 TrackContext，车流由各自上下文持有） */
export function createRaceState(): RaceState {
  return {
    player1: createPlayerState(),
    player2: createPlayerState(),
    tracks: [createTrackContext(TRACK_DEFS[0]), createTrackContext(TRACK_DEFS[0])],
    collisionCount: 0,
    lapTimes: [],
    lastLap: 1,
    lapTimes2: [],
    lastLap2: 1,
    phase: PHASE_MENU,
    countdownRemaining: 0,
    finishShown: false,
  }
}

/**
 * 重置对局状态（in-place）。保留 phase 字段——阶段由屏幕管理负责切换；
 * 不重建 tracks（赛道上下文由 TrackManager 管理，重置仅清玩家状态与计数）。
 */
export function resetRaceState(state: RaceState): void {
  resetPlayerState(state.player1)
  resetPlayerState(state.player2)
  state.collisionCount = 0
  state.lapTimes = []
  state.lastLap = 1
  state.lapTimes2 = []
  state.lastLap2 = 1
  state.countdownRemaining = 0
  state.finishShown = false
}
