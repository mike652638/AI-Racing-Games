import type { TrafficCar } from '../engine/traffic'
import { TRAFFIC_X_TOL } from '../engine/traffic'
import { NEAR_MISS_COOLDOWN, NEAR_MISS_X_TOL, NEAR_MISS_Z_DIST } from '../shared/constants'

/**
 * near-miss 贴身超车检测（P0 可玩性，纯函数）：
 * 玩家以高于车流巡航速度从横向近处擦身超车（未碰撞）时触发——
 * 车在玩家前方近处（环形语义 d ∈ (0, NEAR_MISS_Z_DIST)）、横向间距大于碰撞容差
 * （否则会先触发碰撞检测）但小于 near-miss 近身容差、且玩家速度高于该车（正在超越）。
 * 触发后进入 NEAR_MISS_COOLDOWN 冷却，防同辆车连续触发刷分。
 * 得分/蓄能/反馈由调用方（frame-update）基于返回的 hit 处理。
 */
export interface NearMissResult {
  /** 本帧是否触发 near-miss */
  hit: boolean
  /** 衰减/重置后的冷却值（调用方写回） */
  cooldown: number
}

export function updateNearMiss(
  traffic: TrafficCar[],
  playerZ: number,
  playerX: number,
  playerSpeed: number,
  cooldown: number,
  dt: number,
  lapLength: number,
): NearMissResult {
  cooldown = Math.max(cooldown - dt, 0)
  if (cooldown > 0) {
    return { hit: false, cooldown }
  }
  for (const car of traffic) {
    // 环形前方距离：车在玩家后方时接近 lapLength，天然不触发；d 很小时即"在正前方/刚被超过"
    const d = (car.z - playerZ + lapLength) % lapLength
    const dx = Math.abs(car.offset - playerX)
    if (d > 0 && d < NEAR_MISS_Z_DIST && dx > TRAFFIC_X_TOL && dx < NEAR_MISS_X_TOL && playerSpeed > car.speed) {
      return { hit: true, cooldown: NEAR_MISS_COOLDOWN }
    }
  }
  return { hit: false, cooldown }
}
