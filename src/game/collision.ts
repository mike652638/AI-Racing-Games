import { COLLISION_COOLDOWN, COLLISION_SPEED_FACTOR } from './constants'
import type { CarState } from '../physics/car'
import { collideWithPlayer, type TrafficCar } from '../engine/traffic'
import type { RaceState } from './state'

/**
 * 单个玩家与车流的碰撞检测 + 惩罚。
 * cooldown 为数字字段（调用方持有的 PlayerState.collisionCooldown）：每帧随 dt 衰减，
 * 命中后重置为 COLLISION_COOLDOWN 并施加速度惩罚；冷却期内不再重复触发。
 * @returns 是否发生碰撞（hit）与衰减/重置后的冷却值（cooldown，由调用方写回）
 */
export function applyTrafficCollision(
  carState: CarState,
  cameraZ: number,
  traffic: TrafficCar[],
  cooldown: number,
  dt: number,
): { hit: boolean; cooldown: number } {
  cooldown = Math.max(cooldown - dt, 0)
  if (cooldown > 0) {
    return { hit: false, cooldown }
  }
  const collision = collideWithPlayer(traffic, cameraZ, carState.position)
  if (collision) {
    carState.speed *= COLLISION_SPEED_FACTOR
    cooldown = COLLISION_COOLDOWN
    return { hit: true, cooldown }
  }
  return { hit: false, cooldown }
}

/**
 * 完整碰撞调度（每帧调用一次，结果写回 RaceState）：
 * - P1 与 P1 世界车流碰撞（车流取 tracks[0].traffic，使用 player1.collisionCooldown）
 * - P2 与 P2 世界车流碰撞（分屏时，车流取 tracks[1].traffic，使用独立 player2.collisionCooldown）
 * 分屏语义（分屏升级为两个独立赛道世界后）：P1-P2 互碰已删除——左右画面是各自
 * 独立的赛道世界（各持 TrackContext），跨世界碰撞无意义。PlayerState.collisionCooldown
 * 单一字段仅用于各自世界内的车流碰撞冷却。
 */
export function updateCollisions(race: RaceState, dt: number, splitMode: boolean): void {
  const r1 = applyTrafficCollision(
    race.player1.carState,
    race.player1.cameraZ,
    race.tracks[0].traffic,
    race.player1.collisionCooldown,
    dt,
  )
  race.player1.collisionCooldown = r1.cooldown
  if (r1.hit) {
    race.collisionCount++
  }

  if (splitMode) {
    const r2 = applyTrafficCollision(
      race.player2.carState,
      race.player2.cameraZ,
      race.tracks[1].traffic,
      race.player2.collisionCooldown,
      dt,
    )
    race.player2.collisionCooldown = r2.cooldown
    if (r2.hit) {
      race.collisionCount++
    }
  }
}
