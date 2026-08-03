import { collidePlayers, type CarState } from '../physics/car'
import { collideWithPlayer, type TrafficCar } from '../engine/traffic'
import type { RaceState } from './state'

/** 碰撞速度惩罚因子（速度 ×0.5） */
const COLLISION_SPEED_FACTOR = 0.5
/** 碰撞冷却时长（秒），冷却期内不重复触发 */
const COLLISION_COOLDOWN = 1

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
 * - P1 与车流碰撞（使用 player1.collisionCooldown）
 * - P2 与车流碰撞（分屏时，使用独立 player2.collisionCooldown）
 * - P1-P2 互碰（分屏时，两车同罚；命中后双方进入 1 秒冷却，冷却期内不重复触发）
 * 冷却迁移说明：原 playerCollisionCooldown（互碰冷却）与 collisionCooldown / collisionCooldown2
 * （车流冷却）合并为每个 PlayerState.collisionCooldown 单一字段。互碰命中时同时设置
 * 双方冷却，因此互碰后 1 秒内车流碰撞与互碰均不重复罚速。
 */
export function updateCollisions(race: RaceState, dt: number, splitMode: boolean): void {
  const r1 = applyTrafficCollision(
    race.player1.carState,
    race.player1.cameraZ,
    race.traffic,
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
      race.traffic,
      race.player2.collisionCooldown,
      dt,
    )
    race.player2.collisionCooldown = r2.cooldown
    if (r2.hit) {
      race.collisionCount++
    }

    // P1-P2 互碰：任一方处于冷却期（含车流碰撞冷却）则不检测、不罚速，
    // 避免重叠期间每帧重复罚速（速度指数衰减）。冷却在车流检测中已随 dt 衰减。
    if (race.player1.collisionCooldown > 0 || race.player2.collisionCooldown > 0) {
      return
    }
    if (
      collidePlayers(
        race.player1.cameraZ,
        race.player1.carState.position,
        race.player2.cameraZ,
        race.player2.carState.position,
      )
    ) {
      race.player1.carState.speed *= COLLISION_SPEED_FACTOR
      race.player2.carState.speed *= COLLISION_SPEED_FACTOR
      race.collisionCount++
      race.player1.collisionCooldown = COLLISION_COOLDOWN
      race.player2.collisionCooldown = COLLISION_COOLDOWN
    }
  }
}
