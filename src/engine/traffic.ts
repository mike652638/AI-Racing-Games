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

/** 车流沿赛道推进（in-place，环形回绕） */
export function updateTraffic(traffic: TrafficCar[], dt: number, lapLength: number): void {
  for (const car of traffic) {
    car.z = (car.z + car.speed * dt) % lapLength
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
