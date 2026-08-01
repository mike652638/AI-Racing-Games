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
): boolean {
  if (input.throttle > 0) {
    state.speed = Math.min(config.maxSpeed, state.speed + config.acceleration * input.throttle * dt)
  }
  else if (input.brake) {
    state.speed = Math.max(0, state.speed - config.braking * dt)
  }
  else {
    state.speed = Math.max(0, state.speed - config.deceleration * dt)
  }

  state.position +=
    input.steer * (turnRateOverride ?? config.turnRate) * (state.speed / config.maxSpeed) * dt

  if (Math.abs(state.position) > config.roadHalfWidth) {
    state.speed = Math.max(0, state.speed - config.offRoadDeceleration * dt)
    state.position = Math.max(-config.roadHalfWidth, Math.min(config.roadHalfWidth, state.position))
    return true
  }
  return false
}

/** 两玩家碰撞检测：返回 true 表示碰撞 */
export function collidePlayers(
  z1: number, x1: number,
  z2: number, x2: number,
  zTol = 80, xTol = 0.9,
): boolean {
  return Math.abs(z1 - z2) <= zTol && Math.abs(x1 - x2) <= xTol
}
