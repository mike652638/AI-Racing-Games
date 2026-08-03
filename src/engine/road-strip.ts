import { SEGMENT_LENGTH } from './track'
import { EDGE_WIDTH, ROAD_HALF_WIDTH } from '../game/constants'
import { roadColors, shouldDrawCenterLine } from './road-geometry'

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
export function buildRoadStrips(segments: { curve: number }[], options?: RoadStripOptions): RoadStrip[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const strips: RoadStrip[] = []

  if (segments.length === 0) return strips

  let segStart = 0
  let curveSum = 0

  for (let i = 1; i <= segments.length; i++) {
    const shouldSplit =
      i === segments.length ||
      i - segStart >= opts.maxSegments ||
      (i - segStart >= opts.minSegments && Math.abs(segments[i].curve - segments[i - 1].curve) > opts.curveThreshold)

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

export interface RoadStripRenderOptions {
  /** 离屏 canvas 宽度（通常 = 视口宽度） */
  width: number
  /** 每段像素高度（默认 4）：纹理总高 = 段数 × pixelsPerSegment */
  pixelsPerSegment?: number
}

/** 路面在道路总宽（2×ROAD_HALF_WIDTH + 2×EDGE_WIDTH）中的比例 */
const ROAD_RATIO = (2 * ROAD_HALF_WIDTH) / (2 * ROAD_HALF_WIDTH + 2 * EDGE_WIDTH)
/** 单侧路缘在道路总宽中的比例 */
const SIDE_RATIO = EDGE_WIDTH / (2 * ROAD_HALF_WIDTH + 2 * EDGE_WIDTH)
/** 中心虚线线宽占路面宽比例（与逐段渲染 (cur.r1.x - cur.l1.x) * 0.06 一致） */
const CENTER_LINE_RATIO = 0.06
/** 中心虚线颜色（与逐段渲染一致） */
const CENTER_LINE_COLOR = '#e8e8e8'

/**
 * 将道路段预渲染到离屏 Canvas（Task A 缓存消费的纹理格式）。
 * 每段 1 行（高 pixelsPerSegment px），行内布局与实际逐段渲染逐像素对齐：
 * - 左/右路缘：roadColors(segIndex).side（红/白按段号奇偶交替），宽 sideHalf
 * - 路面：roadColors(segIndex).road（深/浅灰按段号奇偶交替），宽 roadHalf×2
 * - 中心虚线：仅 shouldDrawCenterLine(segIndex)（偶数段）时绘制，色 #e8e8e8
 * 背景保持透明（OffscreenCanvas 默认），渲染时切片 drawImage 替代逐段 drawQuad。
 */
export function renderRoadStripToCanvas(strip: RoadStrip, options: RoadStripRenderOptions): OffscreenCanvas {
  const { width } = options
  const pixelsPerSegment = options.pixelsPerSegment ?? 4
  const numSegs = strip.endSeg - strip.startSeg
  const canvas = new OffscreenCanvas(width, numSegs * pixelsPerSegment)
  const ctx = canvas.getContext('2d')!

  const centerX = width / 2
  const roadHalf = (width * ROAD_RATIO) / 2
  const sideHalf = width * SIDE_RATIO
  const lineHalf = roadHalf * 2 * CENTER_LINE_RATIO * 0.5

  for (let i = 0; i < numSegs; i++) {
    const segIndex = strip.startSeg + i
    const y = i * pixelsPerSegment
    const colors = roadColors(segIndex)
    // 路面（深/浅灰交替）
    ctx.fillStyle = colors.road
    ctx.fillRect(centerX - roadHalf, y, roadHalf * 2, pixelsPerSegment)
    // 左/右路缘（红/白交替）
    ctx.fillStyle = colors.side
    ctx.fillRect(centerX - roadHalf - sideHalf, y, sideHalf, pixelsPerSegment)
    ctx.fillRect(centerX + roadHalf, y, sideHalf, pixelsPerSegment)
    // 中心虚线（仅偶数段，烘焙进纹理后缓存路径不再单独绘制）
    if (shouldDrawCenterLine(segIndex)) {
      ctx.fillStyle = CENTER_LINE_COLOR
      ctx.fillRect(centerX - lineHalf, y, lineHalf * 2, pixelsPerSegment)
    }
  }

  return canvas
}
