import { buildRoadStrips } from '../engine/road-strip'
import { SEGMENT_LENGTH } from '../engine/track'
import { buildCurvePrefixSum, buildSpriteIndex, createRoadsideSprites } from '../engine/sprites'
import { createTrackFromDef, type TrackDef } from '../engine/tracks'
import { getEnvironmentProfile } from '../engine/environment'
import { createTraffic } from '../engine/traffic'
import { TRAFFIC_DEFAULT_COUNT } from './constants'
import type { TrackContext } from '../shared/types'

// 类型提升（2026-08-05）：TrackContext 接口唯一真源移至 src/shared/types.ts（解耦 ui→game 类型依赖），
// 本文件保留同名 re-export 兼容层，既有导入路径不变
export type { TrackContext }

/** 按赛道定义创建完整赛道上下文（含渲染预计算与车流） */
export function createTrackContext(def: TrackDef): TrackContext {
  const segments = createTrackFromDef(def)
  // M17：按赛道环境驱动路边景物密度/树色（spacing、treeRatio、treeColor）
  const env = getEnvironmentProfile(def.environment)
  const sprites = createRoadsideSprites(segments, 1234, env.spacing, {
    spriteKind: env.spriteKind,
    treeRatio: env.treeRatio,
    treeColor: env.treeColor,
    treeColorLight: env.treeColorLight,
  })
  // 道路段预计算（按曲率分段，创建时完成，运行时零重建）
  const roadStrips = buildRoadStrips(segments)
  const lapLength = segments.length * SEGMENT_LENGTH
  return {
    def,
    segments,
    lapLength,
    totalLaps: def.laps,
    curvePrefixSum: buildCurvePrefixSum(segments),
    spriteIndex: buildSpriteIndex(sprites, SEGMENT_LENGTH),
    sprites,
    roadStrips,
    traffic: createTraffic(lapLength, 777, def.trafficCount ?? TRAFFIC_DEFAULT_COUNT),
  }
}

/** 重建本世界车流（重置后调用，引用替换；不触碰其它预计算字段） */
export function refreshTraffic(ctx: TrackContext): void {
  ctx.traffic = createTraffic(ctx.lapLength, 777, ctx.def.trafficCount ?? TRAFFIC_DEFAULT_COUNT)
}
