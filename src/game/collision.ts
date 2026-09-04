import { COLLISION_COOLDOWN, COLLISION_SPEED_FACTOR, RACE_START_GRACE } from '../shared/constants'
import type { CarState } from '../physics/car'
import { collideWithPlayer, TRAFFIC_X_TOL, TRAFFIC_Z_TOL, type TrafficCar } from '../engine/traffic'
import type { RaceState } from '../shared/types'

/**
 * 单个玩家与车流的碰撞检测 + 惩罚。
 * cooldown 为数字字段（调用方持有的 PlayerState.collisionCooldown）：每帧随 dt 衰减，
 * 命中后重置为 COLLISION_COOLDOWN 并施加速度惩罚；冷却期内不再重复触发。
 * @param maxSpeed 玩家车最大速度（用于碰撞强度归一化，取 carConfig.maxSpeed）
 * @param lapLength 赛道圈长（可选）：传入时车流碰撞启用环形语义，保证多圈场景仍生效。
 *                  缺省时行为与旧版一致（裸差值比较，仅首圈有效）——仅测试/兼容路径使用。
 * @returns 是否发生碰撞（hit）、碰撞强度（impact 0-1 速度比，供声音/视觉分级）、
 *           与衰减/重置后的冷却值（cooldown，由调用方写回）
 */
export function applyTrafficCollision(
  carState: CarState,
  cameraZ: number,
  traffic: TrafficCar[],
  cooldown: number,
  dt: number,
  maxSpeed = 6000,
  lapLength?: number,
): { hit: boolean; impact: number; cooldown: number } {
  cooldown = Math.max(cooldown - dt, 0)
  if (cooldown > 0) {
    return { hit: false, impact: 0, cooldown }
  }
  const collision = collideWithPlayer(traffic, cameraZ, carState.position, TRAFFIC_Z_TOL, TRAFFIC_X_TOL, lapLength)
  if (collision) {
    // M16：碰撞强度 = 碰撞瞬间速度比（0-1），供声音响度与红闪分级（高速撞击更剧烈）
    const impact = Math.max(0, Math.min(1, carState.speed / maxSpeed))
    carState.speed *= COLLISION_SPEED_FACTOR
    // M16：轻微横向弹开（远离碰撞车方向），避免贴车冷却结束后反复触发同一辆 NPC
    if (Math.abs(carState.position - collision.offset) < 0.1) {
      const push = collision.offset >= 0 ? -0.12 : 0.12
      carState.position = Math.max(-1, Math.min(1, carState.position + push))
    }
    cooldown = COLLISION_COOLDOWN
    return { hit: true, impact: Math.max(0, Math.min(1, impact)), cooldown }
  }
  return { hit: false, impact: 0, cooldown }
}

/**
 * 完整碰撞调度（每帧调用一次，结果写回 RaceState）：
 * - P1 与 P1 世界车流碰撞（车流取 tracks[0].traffic，使用 player1.collisionCooldown）
 * - P2 与 P2 世界车流碰撞（分屏时，车流取 tracks[1].traffic，使用独立 player2.collisionCooldown）
 * 分屏语义（分屏升级为两个独立赛道世界后）：P1-P2 互碰已删除——左右画面是各自
 * 独立的赛道世界（各持 TrackContext），跨世界碰撞无意义。PlayerState.collisionCooldown
 * 单一字段仅用于各自世界内的车流碰撞冷却。
 * 起步保护期（2026-08-05）：各玩家个人计时 raceTime < RACE_START_GRACE 时免疫车流碰撞——
 * 环形赛道后方车流会在倒计时期环绕穿越出生点（classic 实测 ≈1.9s），误撞静止玩家（开局即「碰撞 ×1」）；
 * 单测直接驱动碰撞时可显式将 raceTime 置为 ≥ RACE_START_GRACE 跳过保护期。
 */
export function updateCollisions(
  race: RaceState,
  dt: number,
  splitMode: boolean,
  maxSpeed = 6000,
): { hit: boolean; impact: number } {
  let hit = false
  let impact = 0
  if (race.player1.raceTime >= RACE_START_GRACE) {
    const r1 = applyTrafficCollision(
      race.player1.carState,
      race.player1.cameraZ,
      race.tracks[0].traffic,
      race.player1.collisionCooldown,
      dt,
      maxSpeed,
      race.tracks[0].lapLength,
    )
    race.player1.collisionCooldown = r1.cooldown
    if (r1.hit) {
      race.collisionCount++
      hit = true
      impact = Math.max(impact, r1.impact)
    }
  }

  if (splitMode && race.player2.raceTime >= RACE_START_GRACE) {
    const r2 = applyTrafficCollision(
      race.player2.carState,
      race.player2.cameraZ,
      race.tracks[1].traffic,
      race.player2.collisionCooldown,
      dt,
      maxSpeed,
      race.tracks[1].lapLength,
    )
    race.player2.collisionCooldown = r2.cooldown
    if (r2.hit) {
      race.collisionCount++
      hit = true
      impact = Math.max(impact, r2.impact)
    }
  }
  return { hit, impact }
}
