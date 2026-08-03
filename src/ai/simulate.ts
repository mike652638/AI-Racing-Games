import { decideBotInput, type BotConfig, type BotContext } from './bot'
import { updateCar, type CarConfig, type CarState } from '../physics/car'
import type { Segment } from '../engine/track'
import { SEGMENT_LENGTH } from '../engine/track'
import { createTraffic, updateTraffic, collideWithPlayer, type TrafficCar } from '../engine/traffic'

/** 车流碰撞速度惩罚系数（语义等价 game 层 COLLISION_SPEED_FACTOR，避免反向依赖） */
const COLLISION_SPEED_FACTOR = 0.5
/** 碰撞车重置到玩家后方的距离（世界单位），确保其退出玩家前进路径 */
const COLLISION_RESET_DIST = 2500

export interface LapOptions {
  /** 模拟步长（秒），默认 1/60 */
  dt?: number
  /** 目标圈数，默认 1 */
  laps?: number
  /** 步数上限（防死循环），默认 1e6 */
  maxSteps?: number
  /** 是否启用车流模式，默认 false（行为与旧版完全一致） */
  withTraffic?: boolean
  /** 车流随机种子（确定性生成），默认 777 */
  trafficSeed?: number
  /** 车流数量，默认 8 */
  trafficCount?: number
}

export interface LapResult {
  finished: boolean
  /** 累计行驶距离（世界单位） */
  distance: number
  timeSec: number
  /** 出界违规次数（连续出界合并为一次） */
  violations: number
  /** 出界总时长（秒） */
  offRoadTimeSec: number
  /** 每圈用时（秒），第 i 圈完成时 push */
  lapTimes: number[]
  /** 车流碰撞次数（车流模式返回实际计数；默认模式为 0，向后兼容） */
  collisions?: number
}

export function simulateLaps(
  track: Segment[],
  carConfig: CarConfig,
  botConfig: BotConfig,
  opts: LapOptions = {},
): LapResult {
  const dt = opts.dt ?? 1 / 60
  const laps = opts.laps ?? 1
  const maxSteps = opts.maxSteps ?? 1_000_000
  const lapLength = track.length * SEGMENT_LENGTH
  const withTraffic = opts.withTraffic ?? false

  const state: CarState = { position: 0, speed: 0 }
  let cameraZ = 0
  let distance = 0
  let timeSec = 0
  let violations = 0
  let offRoadTimeSec = 0
  let inOffRoad = false
  let collisions = 0
  const lapTimes: number[] = []
  let nextLap = lapLength

  // 车流模式：按种子确定性生成车流（分布均匀，与赛道长度耦合）
  const traffic: TrafficCar[] | undefined = withTraffic
    ? createTraffic(lapLength, opts.trafficSeed ?? 777, opts.trafficCount ?? 8)
    : undefined

  const botCtx: BotContext = { track, config: botConfig, maxSpeed: carConfig.maxSpeed }
  if (traffic) {
    botCtx.traffic = traffic
  }

  for (let step = 0; step < maxSteps; step++) {
    const input = decideBotInput(botCtx, state, cameraZ)
    const clipped = updateCar(dt, input, state, carConfig)
    cameraZ += state.speed * dt
    distance += state.speed * dt
    timeSec += dt

    if (traffic) {
      // 车流推进 + 对逼近的同车道车辆避让（以更新后的玩家位置为基准）
      updateTraffic(traffic, dt, lapLength, { z: cameraZ, x: state.position })
      // 碰撞判定：命中车重置到玩家后方远处（移出前进路径），并施加速度惩罚
      const hit = collideWithPlayer(traffic, cameraZ, state.position)
      if (hit) {
        collisions++
        state.speed *= COLLISION_SPEED_FACTOR
        hit.z = (cameraZ - COLLISION_RESET_DIST + lapLength) % lapLength
      }
    }

    if (clipped) {
      offRoadTimeSec += dt
      if (!inOffRoad) violations++
      inOffRoad = true
    } else {
      inOffRoad = false
    }

    if (distance >= nextLap) {
      lapTimes.push(timeSec)
      if (lapTimes.length >= laps) {
        return { finished: true, distance, timeSec, violations, offRoadTimeSec, lapTimes, collisions }
      }
      nextLap += lapLength
    }
  }
  return { finished: false, distance, timeSec, violations, offRoadTimeSec, lapTimes, collisions }
}
