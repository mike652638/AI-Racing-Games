import { decideBotInput, type BotConfig } from './bot'
import { updateCar, type CarConfig, type CarState } from '../physics/car'
import type { Segment } from '../engine/track'
import { SEGMENT_LENGTH } from '../engine/track'

export interface LapOptions {
  /** 模拟步长（秒），默认 1/60 */
  dt?: number
  /** 目标圈数，默认 1 */
  laps?: number
  /** 步数上限（防死循环），默认 1e6 */
  maxSteps?: number
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

  const state: CarState = { position: 0, speed: 0 }
  let cameraZ = 0
  let distance = 0
  let timeSec = 0
  let violations = 0
  let offRoadTimeSec = 0
  let inOffRoad = false
  const lapTimes: number[] = []
  let nextLap = lapLength

  const botCtx = { track, config: botConfig, maxSpeed: carConfig.maxSpeed }

  for (let step = 0; step < maxSteps; step++) {
    const input = decideBotInput(botCtx, state, cameraZ)
    const clipped = updateCar(dt, input, state, carConfig)
    cameraZ += state.speed * dt
    distance += state.speed * dt
    timeSec += dt

    if (clipped) {
      offRoadTimeSec += dt
      if (!inOffRoad) violations++
      inOffRoad = true
    }
    else {
      inOffRoad = false
    }

    if (distance >= nextLap) {
      lapTimes.push(timeSec)
      if (lapTimes.length >= laps) {
        return { finished: true, distance, timeSec, violations, offRoadTimeSec, lapTimes }
      }
      nextLap += lapLength
    }
  }
  return { finished: false, distance, timeSec, violations, offRoadTimeSec, lapTimes }
}
