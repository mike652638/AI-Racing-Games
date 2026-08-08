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
  /** 上一帧该玩家 boost 是否激活（边沿检测：本帧激活且上帧未激活 → 完美氮气判定，P0） */
  boostActive: boolean
  /** 本次 BOOST 激活段是否为完美氮气（激活边沿 charge ≥ 阈值锁定，boost 结束后重置，P0） */
  boostPerfect: boolean
  /** near-miss 冷却（秒，P0：贴身超车触发后冷却防刷） */
  nearMissCooldown: number
  /** near-miss 累计得分（P0：独立于漂移得分——不污染漂移 TOP10 语义；挑战 HUD 实时总分 = 漂移 + near-miss） */
  nearMissScore: number
  /** M23 方案 6：本局是否使用过 BOOST（对局内统计，成就「首次氮气」检测） */
  boostUsedEver: boolean
  /** M23 方案 6：本局是否触发过完美氮气（成就「完美爆发」检测） */
  perfectBoostUsed: boolean
  /** M23 方案 6：本局最高连击档位（对局内统计，成就「连击大师」检测；driftState.combo 会因断连归零） */
  maxCombo: number
  /** M23 方案 6：本局 near-miss 累计次数（对局内统计，成就「贴地飞行」检测） */
  nearMissCount: number
  /** M23 方案 8：挑战模式已通过检查点数（cameraZ / 检查点间距取整，frame-update 推进） */
  challengeCheckpoints: number
  /** M23 方案 8：挑战模式检查点累计奖励时长（秒，每过 1 个检查点 +CHALLENGE_CHECKPOINT_BONUS） */
  challengeBonus: number
  /** M23 方案 13：车流橡皮筋动态系数（当前玩家世界 speedFactor，frame-update 平滑收敛；初始 1） */
  trafficRubber: number
  /** M23 方案 12：near-miss 速度线脉冲强度（0-1 指数衰减，触发后逐帧衰减；0 = 无脉冲） */
  nearMissPulse: number
  /** M23 方案 12：完美氮气金色闪光强度（0-1 指数衰减；0 = 无闪光） */
  perfectBoostFlash: number
  /** M23 方案 12：漂移小喷蓝色闪光强度（0-1 指数衰减；0 = 无闪光） */
  miniTurboFlash: number
  /** M23 方案 12：漂移得分浮动飘字（得分累积到整数位变化时生成；非空时逐帧推进/超期清除）。
   *  M29 方案 12 二次打磨：combo 字段为生成时连击档位（≥5 时飘字放大+橙色高亮） */
  driftPopup: { t: number; amount: number; combo?: number } | null
  /** M23 方案 12：上次漂移得分整数位（帧间 diff 判定生成飘字，避免每帧重复生成） */
  lastDriftScoreInt: number
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
