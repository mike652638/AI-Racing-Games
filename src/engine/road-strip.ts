import { SEGMENT_LENGTH } from './track'

export interface RoadStrip {
  /** 起始段索引（含） */
  startSeg: number
  /** 结束段索引（不含） */
  endSeg: number
  /** 起始 z 坐标 */
  startZ: number
  /** 结束 z 坐标 */
  endZ: number
  /** 平均曲率 */
  curveAvg: number
}

export interface RoadStripOptions {
  /** 曲率差阈值，低于此值合并为同一段 */
  curveThreshold?: number
  /** 每段最大段数 */
  maxSegments?: number
  /** 每段最小段数 */
  minSegments?: number
}

const DEFAULT_OPTIONS: Required<RoadStripOptions> = {
  curveThreshold: 0.001,
  maxSegments: 50,
  minSegments: 20,
}

/**
 * 根据赛道曲率变化将道路分为若干"曲率段"。
 * 相邻段曲率差 < 阈值合并为同一段。
 */
export function buildRoadStrips(
  segments: { curve: number }[],
  options?: RoadStripOptions,
): RoadStrip[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const strips: RoadStrip[] = []

  if (segments.length === 0) return strips

  let segStart = 0
  let curveSum = 0

  for (let i = 1; i <= segments.length; i++) {
    const shouldSplit =
      i === segments.length ||
      i - segStart >= opts.maxSegments ||
      (i - segStart >= opts.minSegments &&
        Math.abs(segments[i].curve - segments[i - 1].curve) > opts.curveThreshold)

    if (shouldSplit) {
      const count = i - segStart
      strips.push({
        startSeg: segStart,
        endSeg: i,
        startZ: segStart * SEGMENT_LENGTH,
        endZ: i * SEGMENT_LENGTH,
        curveAvg: curveSum / count,
      })
      segStart = i
      curveSum = 0
    }

    if (i < segments.length) {
      curveSum += segments[i].curve
    }
  }

  return strips
}
