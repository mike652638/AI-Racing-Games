import { SEGMENT_LENGTH } from './track'
import { EDGE_WIDTH, ROAD_HALF_WIDTH } from '../shared/constants'
import { mulberry32 } from './scenery'
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

/** M16 路面颗粒噪点密度（每段横向撒点数；确定性 PRNG，纹理烘焙一次，帧内零成本）。
 *  M20 P2-5：14→10 且 alpha 下调（0.12-0.22→0.08-0.15），降低静态画面对比度斑驳感 */
const ROAD_NOISE_PER_SEG = 10
/** M16 颗粒噪点 seed 偏移（确定性：不同 strip 用不同 offset 避免噪点跨段重复） */
const ROAD_NOISE_SEED_BASE = 0x9e3779b9

/** M16 扩展：路面按 5 段横向渐变亮度（中央 +2.5%、次中 +1.5%、近缘 -1.5%、边缘 -3%），
 *  消除"平板纯色"条带感；亮度因子作用于深/浅灰基色，strip 内相邻段保持交替辨识度。 */
const ROAD_LIGHTNESS_FACTORS = [0.975, 0.985, 1.0, 1.015, 1.025, 1.015, 1.0, 0.985, 0.975]

/**
 * 将道路段预渲染到离屏 Canvas（Task A 缓存消费的纹理格式）。
 * 每段 1 行（高 pixelsPerSegment px），行内布局与实际逐段渲染逐像素对齐：
 * - 左/右路缘：roadColors(segIndex).side（红/白按段号奇偶交替），宽 sideHalf
 * - 路面：roadColors(segIndex).road（深/浅灰按段号奇偶交替），宽 roadHalf×2
 *   —— 额外叠加中央亮/边缘暗的横向渐变（ROAD_LIGHTNESS_FACTORS 分带）与确定性颗粒噪点
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
  // 路面渐变分带宽度（9 带均匀铺满路面）
  const bandW = (roadHalf * 2) / ROAD_LIGHTNESS_FACTORS.length
  // 确定性噪点：按 strip 起始段 seed 偏移，保证相邻 strip 噪点不同、同 strip 稳定
  const noise = mulberry32(ROAD_NOISE_SEED_BASE + strip.startSeg * 7919)

  for (let i = 0; i < numSegs; i++) {
    const segIndex = strip.startSeg + i
    const y = i * pixelsPerSegment
    const colors = roadColors(segIndex)
    // 路面：先按 9 带横向渐变填充（中央亮/边缘暗），再叠颗粒噪点
    for (let b = 0; b < ROAD_LIGHTNESS_FACTORS.length; b++) {
      ctx.fillStyle = shadeColor(colors.road, ROAD_LIGHTNESS_FACTORS[b])
      ctx.fillRect(centerX - roadHalf + b * bandW, y, bandW + 1, pixelsPerSegment)
    }
    // 左/右路缘（红/白交替）
    ctx.fillStyle = colors.side
    ctx.fillRect(centerX - roadHalf - sideHalf, y, sideHalf, pixelsPerSegment)
    ctx.fillRect(centerX + roadHalf, y, sideHalf, pixelsPerSegment)
    // 中心虚线（仅偶数段，烘焙进纹理后缓存路径不再单独绘制）
    if (shouldDrawCenterLine(segIndex)) {
      ctx.fillStyle = CENTER_LINE_COLOR
      ctx.fillRect(centerX - lineHalf, y, lineHalf * 2, pixelsPerSegment)
    }
    // 颗粒噪点：路面范围内撒暗点（模拟沥青颗粒，2px 小矩形；不覆盖路缘/虚线；
    //   x/y 收窄到路面内边界（1.5px 矩形 + 安全余量），保证不越出纹理宽度）
    for (let n = 0; n < ROAD_NOISE_PER_SEG; n++) {
      const nx = centerX - roadHalf + 2 + noise() * (roadHalf * 2 - 4)
      const ny = y + 0.25 + noise() * (pixelsPerSegment - 2)
      // 跳过中心虚线带（±lineHalf 内不撒点，避免覆盖白线）
      if (Math.abs(nx - centerX) < lineHalf) continue
      const alpha = 0.08 + noise() * 0.07
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha.toFixed(3)})`
      ctx.fillRect(nx, ny, 1.5, 1.5)
    }
  }

  return canvas
}

/**
 * M16 辅助：按亮度因子（1=原色，<1 变暗，>1 变亮）调整十六进制颜色。
 * 仅支持 #rrggbb 格式（roadColors 输出格式）；非 7 位格式原样返回（防御）。
 * 用于路面横向渐变分带，让"中央亮/边缘暗"有连续过渡。
 */
export function shadeColor(color: string, factor: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color
  const num = parseInt(color.slice(1), 16)
  const r = Math.min(255, Math.max(0, Math.round(((num >> 16) & 255) * factor)))
  const g = Math.min(255, Math.max(0, Math.round(((num >> 8) & 255) * factor)))
  const b = Math.min(255, Math.max(0, Math.round((num & 255) * factor)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
