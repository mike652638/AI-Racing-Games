import { project, type Projected, type ProjectionOptions } from './projection'
import { SEGMENT_LENGTH, trackIndexForCameraZ, type Segment } from './track'

/** 路面半宽（世界单位） */
export const ROAD_HALF_WIDTH = 1
/** 路缘宽度（世界单位） */
export const EDGE_WIDTH = 0.15
/** 渲染可视距离（分段数） */
export const DRAW_DISTANCE = 120

const ROAD_COLORS = ['#4a4a4a', '#3c3c3c']
const SIDE_COLORS = ['#d03030', '#e8e8e8']

interface Quad {
  l1: Projected
  l2: Projected
  r1: Projected
  r2: Projected
}

function drawQuad(
  ctx: CanvasRenderingContext2D,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineTo(c.x, c.y)
  ctx.lineTo(d.x, d.y)
  ctx.closePath()
  ctx.fill()
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private opts: ProjectionOptions
  private camera = { x: 0, y: 1, z: 0 }

  constructor(
    canvas: HTMLCanvasElement,
    private readonly track: Segment[],
    width: number,
    height: number,
    dpr = 1,
  ) {
    this.ctx = canvas.getContext('2d')!
    this.opts = this.buildOpts(width, height)
    this.applyCanvasSize(canvas, width, height, dpr)
  }

  /** 更新视口尺寸（CSS 像素），并按 devicePixelRatio 缩放画布 */
  setViewport(canvas: HTMLCanvasElement, width: number, height: number, dpr = 1): void {
    this.opts = this.buildOpts(width, height)
    this.applyCanvasSize(canvas, width, height, dpr)
  }

  private applyCanvasSize(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    dpr: number,
  ): void {
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private buildOpts(width: number, height: number): ProjectionOptions {
    return { width, height, horizon: height * 0.35, depth: width * 0.84 }
  }

  /** 设置相机横向偏移（跟随车辆位置） */
  setCameraX(x: number): void {
    this.camera.x = x
  }

  /** 渲染一帧直道滚动画面 */
  render(cameraZ: number): void {
    const { ctx, opts } = this

    ctx.fillStyle = '#0d1b2a'
    ctx.fillRect(0, 0, opts.width, opts.horizon)
    ctx.fillStyle = '#1e3d2f'
    ctx.fillRect(0, opts.horizon, opts.width, opts.height - opts.horizon)

    const baseIndex = trackIndexForCameraZ(this.track, cameraZ)
    const baseZ = Math.floor(cameraZ / SEGMENT_LENGTH) * SEGMENT_LENGTH

    for (let k = 0; k < DRAW_DISTANCE; k++) {
      const z = baseZ + k * SEGMENT_LENGTH
      if (z <= cameraZ) {
        continue
      }
      const cur = this.projectQuad(z)
      const next = this.projectQuad(z + SEGMENT_LENGTH)
      if (!cur || !next) {
        continue
      }
      const parity = (baseIndex + k) % 2

      drawQuad(ctx, cur.l1, cur.r1, next.r1, next.l1, ROAD_COLORS[parity])
      drawQuad(ctx, cur.l2, cur.l1, next.l1, next.l2, SIDE_COLORS[parity])
      drawQuad(ctx, cur.r1, cur.r2, next.r2, next.r1, SIDE_COLORS[parity])

      if (k % 2 === 0) {
        const cw = (cur.r1.x - cur.l1.x) * 0.06
        const centerProj = project(this.opts, this.camera, { x: 0, y: 0, z })
        const centerX = centerProj ? centerProj.x : opts.width / 2
        drawQuad(
          ctx,
          { x: centerX - cw, y: cur.l1.y, scale: 1 },
          { x: centerX + cw, y: cur.r1.y, scale: 1 },
          { x: centerX + cw, y: next.r1.y, scale: 1 },
          { x: centerX - cw, y: next.l1.y, scale: 1 },
          '#e8e8e8',
        )
      }
    }
  }

  private projectQuad(z: number): Quad | null {
    const { camera } = this
    const l1 = project(this.opts, camera, { x: -ROAD_HALF_WIDTH, y: 0, z })
    const l2 = project(this.opts, camera, {
      x: -ROAD_HALF_WIDTH - EDGE_WIDTH,
      y: 0,
      z,
    })
    const r1 = project(this.opts, camera, { x: ROAD_HALF_WIDTH, y: 0, z })
    const r2 = project(this.opts, camera, {
      x: ROAD_HALF_WIDTH + EDGE_WIDTH,
      y: 0,
      z,
    })
    if (!l1 || !l2 || !r1 || !r2) {
      return null
    }
    return { l1, l2, r1, r2 }
  }
}
