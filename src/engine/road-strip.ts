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

export interface RoadStripRenderOptions {
  /** 离屏 canvas 宽度 */
  width: number
  /** 离屏 canvas 高度 */
  height: number
  /** 路面宽度比例 (0-1) */
  roadWidth: number
  /** 路肩宽度比例 (0-1) */
  sideWidth: number
}

/**
 * 将道路段预渲染到离屏 Canvas。
 * 包含路面、车道线、路肩。
 */
export function renderRoadStripToCanvas(
  strip: RoadStrip,
  options: RoadStripRenderOptions,
): OffscreenCanvas {
  const { width, height, roadWidth, sideWidth } = options
  // strip 预留给按段信息（曲率等）差异化渲染，当前实现为整段统一绘制
  void strip
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!

  const centerX = width / 2
  const roadHalf = (width * roadWidth) / 2
  const sideHalf = (width * sideWidth) / 2

  // 路肩（左侧）
  ctx.fillStyle = '#4a7c4a'
  ctx.fillRect(0, 0, centerX - roadHalf - sideHalf, height)

  // 路肩（右侧）
  ctx.fillRect(centerX + roadHalf + sideHalf, 0, width, height)

  // 路面
  ctx.fillStyle = '#555555'
  ctx.fillRect(centerX - roadHalf, 0, roadHalf * 2, height)

  // 车道线（中心虚线）
  ctx.fillStyle = '#ffffff'
  const lineWidth = 2
  const dashHeight = 10
  const gapHeight = 10
  for (let y = 0; y < height; y += dashHeight + gapHeight) {
    ctx.fillRect(centerX - lineWidth / 2, y, lineWidth, dashHeight)
  }

  return canvas
}
