import { mulberry32 } from './scenery'

export interface TrafficCar {
  /** 世界 z（沿赛道位置） */
  z: number
  /** 横向偏移（相对中心线，±1 内） */
  offset: number
  /** 巡航速度（世界单位/秒） */
  speed: number
  /** 车身配色索引 */
  colorIndex: number
}

/** 碰撞纵向容差（世界单位） */
export const TRAFFIC_Z_TOL = 80
/** 碰撞横向容差（世界单位） */
export const TRAFFIC_X_TOL = 0.9
/** 车流基础巡航速度 */
export const TRAFFIC_CRUISE_SPEED = 2400

/** 避让触发纵向距离（世界单位）：车在玩家前方该距离内视为逼近 */
const AVOID_Z_DIST = 350
/** 避让触发横向容差：|车 offset - 玩家 x| 小于该值视为同车道/近车道 */
const AVOID_X_TOL = 1.2
/** 避让变道步进速率（offset/秒） */
const AVOID_STEP = 0.8
/** 避让变道目标 offset 幅度（clamp |offset| ≤ 该值） */
const AVOID_LANE_EDGE = 0.85

/** 按种子确定性生成均匀分布的环形车流 */
export function createTraffic(
  lapLength: number,
  seed = 777,
  count = 8,
): TrafficCar[] {
  const rnd = mulberry32(seed)
  const cars: TrafficCar[] = []
  for (let i = 0; i < count; i++) {
    cars.push({
      z: ((i * lapLength) / count + rnd() * 200) % lapLength,
      offset: (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.4),
      speed: TRAFFIC_CRUISE_SPEED * (0.8 + rnd() * 0.4),
      colorIndex: Math.floor(rnd() * 4),
    })
  }
  return cars
}

/**
 * 车流沿赛道推进（in-place，环形回绕）。
 * player 可选尾参：传入玩家位置时对逼近的同车道车辆执行避让变道——
 * 车在玩家前方 d ∈ (0, AVOID_Z_DIST) 且横向接近时，向远离玩家的一侧渐变 offset
 * （步进 AVOID_STEP*dt，clamp |offset| ≤ AVOID_LANE_EDGE）；变道是永久性的（无恢复逻辑）。
 * 不传 player 时行为与旧版完全一致（traffic 既有调用零改动）。
 */
export function updateTraffic(
  traffic: TrafficCar[],
  dt: number,
  lapLength: number,
  player?: { z: number; x: number },
): void {
  for (const car of traffic) {
    car.z = (car.z + car.speed * dt) % lapLength
    if (!player) {
      continue
    }
    // 车相对玩家前方距离（环形语义：车在玩家后方时该值接近 lapLength，天然不触发；
    // d === 0 视为恰好相遇/已超过，严格 > 0 不触发）
    const d = (car.z - player.z + lapLength) % lapLength
    if (d > 0 && d < AVOID_Z_DIST && Math.abs(car.offset - player.x) < AVOID_X_TOL) {
      const target = player.x > 0 ? -AVOID_LANE_EDGE : AVOID_LANE_EDGE
      const step = AVOID_STEP * dt
      const delta =
        target > car.offset
          ? Math.min(step, target - car.offset)
          : Math.max(-step, target - car.offset)
      car.offset += delta
      car.offset = Math.max(-AVOID_LANE_EDGE, Math.min(AVOID_LANE_EDGE, car.offset))
    }
  }
}

/** 玩家与车流碰撞检测：返回碰撞车辆或 null */
export function collideWithPlayer(
  traffic: TrafficCar[],
  playerZ: number,
  playerX: number,
  zTol = TRAFFIC_Z_TOL,
  xTol = TRAFFIC_X_TOL,
): TrafficCar | null {
  for (const car of traffic) {
    if (Math.abs(car.z - playerZ) < zTol && Math.abs(car.offset - playerX) < xTol) {
      return car
    }
  }
  return null
}
