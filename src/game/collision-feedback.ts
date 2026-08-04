/**
 * 碰撞反馈纯函数（M16 优化）：
 * - CollisionFlashState：碰撞后红闪强度（0-1）随时间指数衰减，驱动屏幕红色 vignette 与车身边框闪白。
 * - 纯函数管理（输入状态、返回新状态），与 frame-update/frame-render 组合：
 *   碰撞命中时以强度 seed（速度比）重置 flash，未命中时按 dt 指数衰减。
 * - 单值状态避免引入可变类，与项目"纯函数领域层 + 测试锚定"模式一致。
 */

/** 碰撞红闪持续时长（秒） */
export const COLLISION_FLASH_DURATION = 0.35

/** 红闪强度衰减速率（/秒，指数衰减：flash *= exp(-rate*dt)） */
export const COLLISION_FLASH_DECAY = 6

/** 最小可感知强度（低于此值视为结束） */
export const COLLISION_FLASH_EPSILON = 0.02

/** 碰撞红闪状态：0 = 无反馈；>0 为当前强度（0-1，随碰撞速度比 seed） */
export type CollisionFlashState = number

/**
 * 单帧推进碰撞反馈状态。
 * @param flash 当前强度（0-1，0 表示无反馈）
 * @param hitSeed 本帧是否命中碰撞 + 碰撞强度（0-1 速度比；undefined/null = 未命中）
 * @param dt 帧时长（秒）
 * @returns 新状态：命中时重置为 max(flash, hitSeed)，否则按指数衰减；低于 EPSILON 归零
 */
export function updateCollisionFlash(
  flash: CollisionFlashState,
  hitSeed: number | null | undefined,
  dt: number,
): CollisionFlashState {
  if (hitSeed != null && hitSeed > 0) {
    // 命中：红闪强度取本帧强度与当前强度较大者（连续碰撞不减弱）
    return Math.min(1, Math.max(flash, hitSeed))
  }
  if (flash <= 0) return 0
  const next = flash * Math.exp(-COLLISION_FLASH_DECAY * dt)
  return next < COLLISION_FLASH_EPSILON ? 0 : next
}

/**
 * 将碰撞速度比映射为红闪强度 seed：低速碰撞（<0.15）轻微反馈，
 * 高速碰撞（≥0.6）满强度——与 CollisionSound 音量曲线一致（同源于速度比）。
 */
export function flashSeedFromSpeedRatio(speedRatio: number): number {
  if (speedRatio <= 0) return 0
  if (speedRatio >= 0.6) return 1
  return speedRatio / 0.6
}
