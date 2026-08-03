import { createDriftState, type DriftState } from '../physics/drift'
import type { CarState } from '../physics/car'
import type { TrafficCar } from '../engine/traffic'
import { PHASE_MENU, type Phase } from '../ui/gamestate'

/**
 * 对局可变状态容器：集中管理单人/分屏双玩家的车辆、漂移、计时、
 * 碰撞冷却、圈速记录、车流等所有运行时可变数据，便于统一重置与单测。
 */
export interface RaceState {
  /** P1 车辆状态（横向位置 + 速度） */
  carState: CarState
  /** P2 车辆状态（分屏时有效） */
  carState2: CarState
  /** P1 漂移状态 */
  driftState: DriftState
  /** P2 漂移状态 */
  driftState2: DriftState
  /** P1 相机 z（沿赛道累计距离） */
  cameraZ: number
  /** P2 相机 z */
  cameraZ2: number
  /** P1 比赛用时（秒） */
  raceTime: number
  /** P2 比赛用时（秒） */
  raceTime2: number
  /** 碰撞总次数（P1/P2 车流碰撞与 P1-P2 互碰共用） */
  collisionCount: number
  /** P1 与车流碰撞冷却（秒），冷却期内不重复触发 */
  collisionCooldown: number
  /** P2 与车流碰撞冷却（秒），独立于 P1 */
  collisionCooldown2: number
  /** P1-P2 互碰冷却（秒），互碰命中后 1 秒内不重复触发 */
  playerCollisionCooldown: number
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
    carState: { position: 0, speed: 0 },
    carState2: { position: 0, speed: 0 },
    driftState: createDriftState(),
    driftState2: createDriftState(),
    cameraZ: 0,
    cameraZ2: 0,
    raceTime: 0,
    raceTime2: 0,
    collisionCount: 0,
    collisionCooldown: 0,
    collisionCooldown2: 0,
    playerCollisionCooldown: 0,
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
  state.carState.position = 0
  state.carState.speed = 0
  state.carState2.position = 0
  state.carState2.speed = 0
  state.driftState = createDriftState()
  state.driftState2 = createDriftState()
  state.cameraZ = 0
  state.cameraZ2 = 0
  state.raceTime = 0
  state.raceTime2 = 0
  state.collisionCount = 0
  state.collisionCooldown = 0
  state.collisionCooldown2 = 0
  state.playerCollisionCooldown = 0
  state.lapTimes = []
  state.lastLap = 1
  state.finishShown = false
  state.traffic = traffic
}
