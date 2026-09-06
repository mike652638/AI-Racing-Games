import { createPlayerState, resetPlayerState } from './player-state'
import { TRACK_DEFS } from '../engine/tracks'
import { createTrackContext } from './track-context'
import type { RaceState } from '../shared/types'

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
    countdownRemaining: 0,
    finishShown: false,
    weatherOverride: 'auto',
    routeStageId: null,
    routeCumulativeTime: 0,
    routeCumulativeDriftScore: 0,
    routeStageCount: 0,
    routeStageIndex: 0,
    routeIsFinish: false,
  }
}

/**
 * 重置对局状态（in-place）。阶段由 GameLoop 实例字段管理（race.phase 死字段已于
 * 2026-09-06 删除——原热座交棒处 `this.race.phase = PHASE_RACING` 冗余写入已移除）；
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
  // M28 方案 9：路线模式六字段重置为创建初始值（此前缺失，热座交棒/重开对局会残留上局阶段）
  state.routeStageId = null
  state.routeCumulativeTime = 0
  state.routeCumulativeDriftScore = 0
  state.routeStageCount = 0
  state.routeStageIndex = 0
  state.routeIsFinish = false
}
