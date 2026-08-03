import type { CarState } from '../physics/car'
import type { DriftState } from '../physics/drift'
import { createDriftState } from '../physics/drift'

/**
 * 单个玩家的独立对局状态：车辆、漂移、相机进度、个人计时与碰撞冷却。
 * 分屏模式下 P1/P2 各持有一份实例，主循环分别更新，互不影响。
 * 碰撞冷却由车流碰撞与 P1-P2 互碰共用（迁移自原 collisionCooldown / collisionCooldown2 /
 * playerCollisionCooldown 三个字段）。
 */
export interface PlayerState {
  /** 车辆状态（横向位置 + 速度） */
  carState: CarState
  /** 漂移状态（含烟雾粒子数组） */
  driftState: DriftState
  /** 相机 z（沿赛道累计距离） */
  cameraZ: number
  /** 个人比赛用时（秒） */
  raceTime: number
  /** 碰撞冷却（秒），冷却期内不重复触发碰撞惩罚 */
  collisionCooldown: number
  /** BOOST 蓄力值（0-1，漂移激活期间累积，按键消耗，G4） */
  boostCharge: number
}

/** 创建初始玩家状态 */
export function createPlayerState(): PlayerState {
  return {
    carState: { position: 0, speed: 0 },
    driftState: createDriftState(),
    cameraZ: 0,
    raceTime: 0,
    collisionCooldown: 0,
    boostCharge: 0,
  }
}

/** 重置玩家状态（in-place，重建漂移状态以清空烟雾与得分） */
export function resetPlayerState(state: PlayerState): void {
  state.carState.position = 0
  state.carState.speed = 0
  state.driftState = createDriftState()
  state.cameraZ = 0
  state.raceTime = 0
  state.collisionCooldown = 0
  state.boostCharge = 0
}
