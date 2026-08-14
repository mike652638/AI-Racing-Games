import { PHASE_RACING, type Phase } from '../shared/phase'
import { unrefSafeTimeout } from '../shared/timer'

/**
 * BOOST 未蓄能红闪反馈（M34 拆分自 game-loop.ts frame 内联块）：
 * 键盘按下 Space/Enter 且 charge<=0 且未激活时，#boost-bar 红闪 300ms。
 * 纯状态机：返回新的 lastDeniedAt（冷却窗口内返回原值，防每帧重复触发）。
 */

/** 红闪冷却窗口（毫秒；原 frame 内联常量 300，锁定供测试） */
export const BOOST_DENIED_COOLDOWN_MS = 300

export interface BoostDeniedFlashArgs {
  phase: Phase
  /** 当前帧时间戳（performance.now 域） */
  now: number
  /** 本帧 P1 是否按下 BOOST 键 */
  inputBoost: boolean
  boostCharge: number
  boostActive: boolean
  lastDeniedAt: number
  /** #boost-bar（null 时仅更新冷却、不闪） */
  boostBar: HTMLElement | null
}

export function maybeTriggerBoostDeniedFlash(args: BoostDeniedFlashArgs): number {
  const { phase, now, inputBoost, boostCharge, boostActive, lastDeniedAt, boostBar } = args
  if (phase !== PHASE_RACING || !inputBoost || boostCharge > 0 || boostActive) {
    return lastDeniedAt
  }
  if (now - lastDeniedAt <= BOOST_DENIED_COOLDOWN_MS) {
    return lastDeniedAt
  }
  if (boostBar) {
    boostBar.classList.add('no-charge')
    unrefSafeTimeout(() => boostBar.classList.remove('no-charge'), BOOST_DENIED_COOLDOWN_MS)
  }
  return now
}
