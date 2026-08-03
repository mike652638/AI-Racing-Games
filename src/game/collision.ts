import { collidePlayers, type CarState } from '../physics/car'
import { collideWithPlayer, type TrafficCar } from '../engine/traffic'
import type { RaceState } from './state'

/** 碰撞速度惩罚因子（速度 ×0.5） */
const COLLISION_SPEED_FACTOR = 0.5
/** 碰撞冷却时长（秒），冷却期内不重复触发 */
const COLLISION_COOLDOWN = 1

/**
 * 单个玩家与车流的碰撞检测 + 惩罚。
 * cooldown 为可变包装对象（{ value }）：冷却随时间衰减，命中后重置并施加速度惩罚。
 * @returns 是否发生碰撞
 */
export function applyTrafficCollision(
  carState: CarState,
  cameraZ: number,
  traffic: TrafficCar[],
  cooldown: { value: number },
  dt: number,
): boolean {
  cooldown.value = Math.max(cooldown.value - dt, 0)
  if (cooldown.value > 0) {
    return false
  }
  const hit = collideWithPlayer(traffic, cameraZ, carState.position)
  if (hit) {
    carState.speed *= COLLISION_SPEED_FACTOR
    cooldown.value = COLLISION_COOLDOWN
    return true
  }
  return false
}

/**
 * 完整碰撞调度（每帧调用一次，结果写回 RaceState）：
 * - P1 与车流碰撞（使用 collisionCooldown）
 * - P2 与车流碰撞（分屏时，使用独立 collisionCooldown2——修复原缺失功能）
 * - P1-P2 互碰（分屏时，两车同罚；使用 playerCollisionCooldown 冷却 1 秒）
 */
export function updateCollisions(race: RaceState, dt: number, splitMode: boolean): void {
  const cooldown1 = { value: race.collisionCooldown }
  if (applyTrafficCollision(race.carState, race.cameraZ, race.traffic, cooldown1, dt)) {
    race.collisionCount++
  }
  race.collisionCooldown = cooldown1.value

  if (splitMode) {
    const cooldown2 = { value: race.collisionCooldown2 }
    if (applyTrafficCollision(race.carState2, race.cameraZ2, race.traffic, cooldown2, dt)) {
      race.collisionCount++
    }
    race.collisionCooldown2 = cooldown2.value

    // P1-P2 互碰：命中后进入 1 秒冷却（playerCollisionCooldown）。
    // 冷却期内仅衰减、不检测；冷却归零当帧跳过，下一帧恢复检测，
    // 保证冷却完整持续 1 秒（修复 P0-1：原实现每帧重叠每帧罚速，速度指数衰减）
    if (race.playerCollisionCooldown > 0) {
      race.playerCollisionCooldown = Math.max(race.playerCollisionCooldown - dt, 0)
    }
    else if (
      collidePlayers(
        race.cameraZ,
        race.carState.position,
        race.cameraZ2,
        race.carState2.position,
      )
    ) {
      race.carState.speed *= COLLISION_SPEED_FACTOR
      race.carState2.speed *= COLLISION_SPEED_FACTOR
      race.collisionCount++
      race.playerCollisionCooldown = COLLISION_COOLDOWN
    }
  }
}
