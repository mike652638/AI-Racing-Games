import { createPlayerState, resetPlayerState, type PlayerState } from './player-state'
import type { TrafficCar } from '../engine/traffic'
import { PHASE_MENU, type Phase } from '../ui/gamestate'

/**
 * 对局可变状态容器：集中管理双玩家的独立状态（PlayerState）、碰撞计数、
 * 圈速记录、车流等所有运行时可变数据，便于统一重置与单测。
 */
export interface RaceState {
  /** P1 玩家独立状态（车辆/漂移/相机/计时/冷却） */
  player1: PlayerState
  /** P2 玩家独立状态（分屏时有效） */
  player2: PlayerState
  /** 碰撞总次数（P1/P2 车流碰撞与 P1-P2 互碰共用） */
  collisionCount: number
  /** 每圈累计用时（lapTimes[i] 为第 i+1 圈完成时刻） */
  lapTimes: number[]
  /** 当前已完成圈数（1 基，lapFromZ 推进） */
  lastLap: number
  /** 游戏阶段（菜单/比赛/暂停/结算） */
  phase: Phase
  /** 结算面板是否已填充（避免重复写入记录） */
  finishShown: boolean
  /** 车流数组（环形赛道，in-place 推进） */
  traffic: TrafficCar[]
}

/** 创建初始对局状态（车流由调用方生成后传入） */
export function createRaceState(traffic: TrafficCar[]): RaceState {
  return {
    player1: createPlayerState(),
    player2: createPlayerState(),
    collisionCount: 0,
    lapTimes: [],
    lastLap: 1,
    phase: PHASE_MENU,
    finishShown: false,
    traffic,
  }
}

/**
 * 重置对局状态（in-place）。保留 phase 字段——阶段由屏幕管理负责切换。
 * 车流由调用方重新生成后传入；重置后调用方需同步 renderer.setTraffic。
 */
export function resetRaceState(state: RaceState, traffic: TrafficCar[]): void {
  resetPlayerState(state.player1)
  resetPlayerState(state.player2)
  state.collisionCount = 0
  state.lapTimes = []
  state.lastLap = 1
  state.finishShown = false
  state.traffic = traffic
}
