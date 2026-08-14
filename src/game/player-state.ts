import { createDriftState } from '../physics/drift'
import type { PlayerState } from '../shared/types'

/**
 * PlayerState 接口真源已提升至 src/shared/types.ts（2026-08-15 类型提升，
 * 消除 shared → game 的唯一类型反指），本文件保留同名 re-export 兼容层
 * 供 game 内部旧路径与既有测试消费；新代码可直接从 src/shared/types 导入。
 */
export type { PlayerState } from '../shared/types'

/** 创建初始玩家状态 */
export function createPlayerState(): PlayerState {
  return {
    carState: { position: 0, speed: 0 },
    driftState: createDriftState(),
    cameraZ: 0,
    raceTime: 0,
    collisionCooldown: 0,
    boostCharge: 0,
    boostActive: false,
    boostPerfect: false,
    nearMissCooldown: 0,
    nearMissScore: 0,
    boostUsedEver: false,
    perfectBoostUsed: false,
    maxCombo: 0,
    nearMissCount: 0,
    challengeCheckpoints: 0,
    challengeBonus: 0,
    trafficRubber: 1,
    nearMissPulse: 0,
    perfectBoostFlash: 0,
    miniTurboFlash: 0,
    driftPopup: null,
    lastDriftScoreInt: 0,
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
  state.boostActive = false
  state.boostPerfect = false
  state.nearMissCooldown = 0
  state.nearMissScore = 0
  state.boostUsedEver = false
  state.perfectBoostUsed = false
  state.maxCombo = 0
  state.nearMissCount = 0
  state.challengeCheckpoints = 0
  state.challengeBonus = 0
  state.trafficRubber = 1
  state.nearMissPulse = 0
  state.perfectBoostFlash = 0
  state.miniTurboFlash = 0
  state.driftPopup = null
  state.lastDriftScoreInt = 0
}
