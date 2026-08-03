import { createPlayerState, resetPlayerState, type PlayerState } from './player-state'
import { TRACK_DEFS } from '../engine/tracks'
import { PHASE_MENU, type Phase } from './phase'
import { createTrackContext, type TrackContext } from './track-context'

/**
 * 对局可变状态容器：集中管理双玩家的独立状态（PlayerState）、碰撞计数、
 * 圈速记录、双赛道上下文（TrackContext）等所有运行时可变数据，
 * 便于统一重置与单测。
 */
export interface RaceState {
  /** P1 玩家独立状态（车辆/漂移/相机/计时/冷却） */
  player1: PlayerState
  /** P2 玩家独立状态（分屏时有效） */
  player2: PlayerState
  /** 双玩家赛道上下文（分屏各用其一；单人模式仅 [0] 生效） */
  tracks: [TrackContext, TrackContext]
  /** 碰撞总次数（P1/P2 各自世界内的车流碰撞累计） */
  collisionCount: number
  /** 每圈累计用时（lapTimes[i] 为第 i+1 圈完成时刻） */
  lapTimes: number[]
  /** 当前已完成圈数（1 基，lapFromZ 推进） */
  lastLap: number
  /** 游戏阶段（菜单/比赛/暂停/结算） */
  phase: Phase
  /** 结算面板是否已填充（避免重复写入记录） */
  finishShown: boolean
}

/** 创建初始对局状态（默认以 TRACK_DEFS[0] 创建双 TrackContext，车流由各自上下文持有） */
export function createRaceState(): RaceState {
  return {
    player1: createPlayerState(),
    player2: createPlayerState(),
    tracks: [
      createTrackContext(TRACK_DEFS[0]),
      createTrackContext(TRACK_DEFS[0]),
    ],
    collisionCount: 0,
    lapTimes: [],
    lastLap: 1,
    phase: PHASE_MENU,
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
  state.finishShown = false
}
