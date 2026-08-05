/** BOOST 氮气加速倍率（加速度 ×0.6）与速度上限倍率（1.15×maxSpeed），自 game/constants 导入 */
import { BOOST_ACCEL_MULT, BOOST_MAX_SPEED_MULT, OFF_ROAD_PUSHBACK } from '../shared/constants'

export interface CarConfig {
  maxSpeed: number
  acceleration: number
  braking: number
  deceleration: number
  offRoadDeceleration: number
  roadHalfWidth: number
  turnRate: number
}

export interface CarInput {
  throttle: number
  brake: boolean
  steer: number
  /** BOOST 激活（G4：Space/Enter 按键；可选，旧字面量零破坏） */
  boost?: boolean
}

export interface CarState {
  position: number
  speed: number
}

export const DEFAULT_CAR_CONFIG: CarConfig = {
  maxSpeed: 6000,
  acceleration: 2400,
  braking: 3600,
  deceleration: 1200,
  offRoadDeceleration: 3000,
  roadHalfWidth: 1,
  turnRate: 0.8,
}

export function createCarConfig(overrides: Partial<CarConfig> = {}): CarConfig {
  return { ...DEFAULT_CAR_CONFIG, ...overrides }
}

export function updateCar(
  dt: number,
  input: CarInput,
  state: CarState,
  config: CarConfig,
  turnRateOverride?: number,
  wet = false,
): boolean {
  if (input.throttle > 0) {
    state.speed = Math.min(config.maxSpeed, state.speed + config.acceleration * input.throttle * dt)
  } else if (input.brake) {
    // G3（G3）：雨天制动力降 30%（刹车距离变长）；仅 brake 分支受影响，松油门 deceleration 不变
    state.speed = Math.max(0, state.speed - config.braking * (wet ? 0.7 : 1) * dt)
  } else {
    state.speed = Math.max(0, state.speed - config.deceleration * dt)
  }

  // G4（G4）：BOOST 氮气——与油门叠加但突破 maxSpeed（上限 1.15×maxSpeed）；
  // boost 分支独立 clamp，throttle 分支先执行（maxSpeed 内），boost 在其后突破上限
  if (input.boost === true) {
    state.speed = Math.min(
      state.speed + config.acceleration * BOOST_ACCEL_MULT * dt,
      config.maxSpeed * BOOST_MAX_SPEED_MULT,
    )
  }

  // G3（G3）：雨天抓地力降 15%（有效转向率 ×0.85，转向不足）；wet=false 路径与旧版逐字节一致
  const effectiveTurn = wet ? (turnRateOverride ?? config.turnRate) * 0.85 : (turnRateOverride ?? config.turnRate)
  state.position += input.steer * effectiveTurn * (state.speed / config.maxSpeed) * dt

  if (Math.abs(state.position) > config.roadHalfWidth) {
    state.speed = Math.max(0, state.speed - config.offRoadDeceleration * dt)
    // BUG-2 修复（2026-08-05）：钳制后向内侧推回 OFF_ROAD_PUSHBACK——旧版钳制恰在边缘线，
    // 低速转向率 ∝ speed 使玩家「钉死边缘无法回路面」；推回后脱离出界判定，
    // 恢复加速/转向权限，玩家可正常拐回路面（wet 路径同样生效，不改变减速语义）
    const side = state.position > 0 ? 1 : -1
    state.position = side * (config.roadHalfWidth - OFF_ROAD_PUSHBACK)
    return true
  }
  return false
}
