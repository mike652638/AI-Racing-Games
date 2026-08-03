import { SEGMENT_LENGTH, type Segment } from '../engine/track'
import {
  buildCurvePrefixSum,
  buildSpriteIndex,
  createRoadsideSprites,
  type Sprite,
} from '../engine/sprites'
import { createTrackFromDef, type TrackDef } from '../engine/tracks'
import { createTraffic, type TrafficCar } from '../engine/traffic'
import { TRAFFIC_DEFAULT_COUNT } from './constants'

/**
 * 单个玩家的完整赛道世界上下文：赛道定义、分段数据、圈长/圈数、
 * 渲染用预计算（曲率前缀和/景物段索引/景物列表）与运行时车流。
 * 分屏模式下 P1/P2 各持一份（互不共享，车流独立推进与碰撞）；
 * 单人模式仅 [0] 生效。预计算在创建时完成，运行时零重建。
 */
export interface TrackContext {
  /** 赛道定义（来源 src/engine/tracks） */
  def: TrackDef
  /** 赛道分段数据（createTrackFromDef(def)） */
  segments: Segment[]
  /** 单圈长度（世界单位）= segments.length * SEGMENT_LENGTH */
  lapLength: number
  /** 总圈数 = def.laps */
  totalLaps: number
  /** 曲率前缀和（渲染 O(1) 查询累计曲率） */
  curvePrefixSum: Float64Array
  /** 景物段索引（键 = floor(z / SEGMENT_LENGTH)） */
  spriteIndex: Map<number, Sprite[]>
  /** 路边景物列表（道路两侧树木/路灯） */
  sprites: Sprite[]
  /** 本世界车流（in-place 推进） */
  traffic: TrafficCar[]
}

/** 按赛道定义创建完整赛道上下文（含渲染预计算与车流） */
export function createTrackContext(def: TrackDef): TrackContext {
  const segments = createTrackFromDef(def)
  const sprites = createRoadsideSprites(segments)
  const lapLength = segments.length * SEGMENT_LENGTH
  return {
    def,
    segments,
    lapLength,
    totalLaps: def.laps,
    curvePrefixSum: buildCurvePrefixSum(segments),
    spriteIndex: buildSpriteIndex(sprites, SEGMENT_LENGTH),
    sprites,
    traffic: createTraffic(lapLength, 777, def.trafficCount ?? TRAFFIC_DEFAULT_COUNT),
  }
}

/** 重建本世界车流（重置后调用，引用替换；不触碰其它预计算字段） */
export function refreshTraffic(ctx: TrackContext): void {
  ctx.traffic = createTraffic(ctx.lapLength, 777, ctx.def.trafficCount ?? TRAFFIC_DEFAULT_COUNT)
}
