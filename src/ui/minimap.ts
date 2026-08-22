import type { TrackContext } from '../shared/types'
import { SEGMENT_LENGTH } from '../engine/track'

/**
 * 小地图 / 赛道进度指示器（Batch 6 UI 优化）。
 * 构造时按赛道分段预计算轨迹折线：每 10 段取一个点，累计 curve 转角积分出
 * 环形轮廓（任意世界坐标尺度），再整体归一化缩放/居中到画布内（四周留 12px padding）。
 * update(cameraZ) 每帧重绘半透明圆角背景、赛道轨迹线、起点标记与玩家位置点；
 * 玩家点按 cameraZ % lapLength 映射到最近轨迹点，晚于轨迹线绘制（在上层）。
 * 不依赖任何游戏模块以外的全局状态，不引入新依赖。
 */
export class Minimap {
  /** 预计算时的赛道上下文（GameLoop 据此在赛道切换后重建轨迹折线） */
  readonly trackContext: TrackContext
  /** 归一化后的轨迹点（画布坐标系，已含 padding 与居中） */
  private readonly points: [number, number][]
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly lapLength: number
  /** 取点步长：每 10 个赛道分段取一个轨迹点 */
  private static readonly POINT_STEP = 10
  /** 画布四周留白（px） */
  private static readonly PADDING = 12

  constructor(
    trackContext: TrackContext,
    readonly canvas: HTMLCanvasElement,
  ) {
    this.trackContext = trackContext
    this.lapLength = trackContext.lapLength
    this.ctx = canvas.getContext('2d')
    this.points = this.buildPoints(trackContext)
  }

  /** 预计算轨迹点：每 POINT_STEP 段取一点，步进角度 += 该段曲率，位置 += (sin/cos) × 步长 */
  private buildPoints(trackContext: TrackContext): [number, number][] {
    const step = Minimap.POINT_STEP
    const stepZ = SEGMENT_LENGTH * step
    const raw: [number, number][] = []
    let x = 0
    let y = 0
    let angle = 0
    for (let i = 0; i < trackContext.segments.length; i += step) {
      raw.push([x, y])
      angle += trackContext.segments[i].curve
      x += Math.sin(angle) * stepZ
      y += Math.cos(angle) * stepZ
    }
    return this.fitToCanvas(raw)
  }

  /** 归一化缩放 + 居中到画布内（保持纵横比，四周留 PADDING） */
  private fitToCanvas(raw: [number, number][]): [number, number][] {
    if (raw.length === 0) {
      return []
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [px, py] of raw) {
      if (px < minX) minX = px
      if (py < minY) minY = py
      if (px > maxX) maxX = px
      if (py > maxY) maxY = py
    }
    const pad = Minimap.PADDING
    const availW = Math.max(1, this.canvas.width - pad * 2)
    const availH = Math.max(1, this.canvas.height - pad * 2)
    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    const scale = Math.min(availW / spanX, availH / spanY)
    const cx = this.canvas.width / 2
    const cy = this.canvas.height / 2
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    return raw.map(([px, py]): [number, number] => [cx + (px - midX) * scale, cy + (py - midY) * scale])
  }

  /** 按相机位置（环形累计距离）找最近轨迹点索引：取模回绕后经段索引换算为取点索引 */
  private indexForZ(cameraZ: number): number {
    const z = ((cameraZ % this.lapLength) + this.lapLength) % this.lapLength
    const segIndex = Math.floor(z / SEGMENT_LENGTH)
    const idx = Math.round(segIndex / Minimap.POINT_STEP)
    return Math.min(idx, this.points.length - 1)
  }

  /** 重绘一帧：圆角背景 → 轨迹线 → 起点标记 → 玩家位置点（玩家点最后绘制，在上层） */
  update(cameraZ: number): void {
    const ctx = this.ctx
    if (!ctx || this.points.length === 0) {
      return
    }
    const w = this.canvas.width
    const h = this.canvas.height
    ctx.clearRect(0, 0, w, h)

    // 半透明深色圆角背景（C5：alpha 0.72→0.6 更透明，让被叠的路灯光晕隐约可见）
    ctx.fillStyle = 'rgba(8, 10, 24, 0.6)'
    this.roundRectPath(ctx, 0, 0, w, h, 10)
    ctx.fill()

    // 赛道轨迹线（半透明白；M20 验证后从 0.35 提升到 0.45，改善暗色环境可见度）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < this.points.length; i++) {
      const [px, py] = this.points[i]
      if (i === 0) {
        ctx.moveTo(px, py)
      } else {
        ctx.lineTo(px, py)
      }
    }
    ctx.stroke()

    // 起点标记：第一个点画小方块（金色）
    const start = this.points[0]
    ctx.fillStyle = '#fde047'
    ctx.fillRect(start[0] - 3.5, start[1] - 3.5, 7, 7)

    // 玩家位置点：亮色圆点 + 外圈发光（在轨迹线上层）
    const pos = this.points[this.indexForZ(cameraZ)]
    ctx.beginPath()
    ctx.arc(pos[0], pos[1], 5, 0, Math.PI * 2)
    ctx.fillStyle = '#fde047'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(pos[0], pos[1], 9, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.45)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  /** 圆角矩形路径（手动 arcTo 实现，避免依赖 roundRect 的 lib 类型覆盖） */
  private roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}
