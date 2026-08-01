import { project, type Projected, type ProjectionOptions } from './projection'
import { SEGMENT_LENGTH, trackIndexForCameraZ, type Segment } from './track'
import { generateMountainProfile, parallaxOffset } from './scenery'
import { curveOffsetAtZ, spritesInRange, type Sprite } from './sprites'
import type { SmokeParticle } from '../physics/drift'

/** 路面半宽（世界单位） */
export const ROAD_HALF_WIDTH = 1
/** 路缘宽度（世界单位） */
export const EDGE_WIDTH = 0.15
/** 渲染可视距离（分段数） */
export const DRAW_DISTANCE = 120

const ROAD_COLORS = ['#4a4a4a', '#3c3c3c']
const SIDE_COLORS = ['#d03030', '#e8e8e8']

interface MountainLayer {
  profile: number[]
  factor: number
  color: string
  /** 山峰高度相对 horizon 的比例 */
  peak: number
}

function drawMountainLayer(
  ctx: CanvasRenderingContext2D,
  layer: MountainLayer,
  cameraZ: number,
  opts: ProjectionOptions,
): void {
  const offset = parallaxOffset(cameraZ, layer.factor, layer.profile.length)
  const peakHeight = opts.horizon * layer.peak
  ctx.fillStyle = layer.color
  ctx.beginPath()
  ctx.moveTo(0, opts.horizon)
  for (let x = 0; x <= opts.width; x += 2) {
    const h = layer.profile[(x + offset) % layer.profile.length]
    ctx.lineTo(x, opts.horizon - h * peakHeight)
  }
  ctx.lineTo(opts.width, opts.horizon)
  ctx.closePath()
  ctx.fill()
}

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
  private mountains: MountainLayer[]

  constructor(
    canvas: HTMLCanvasElement,
    private readonly track: Segment[],
    width: number,
    height: number,
    dpr = 1,
    private readonly sprites: Sprite[] = [],
  ) {
    this.ctx = canvas.getContext('2d')!
    this.opts = this.buildOpts(width, height)
    this.mountains = this.buildMountains(width)
    this.applyCanvasSize(canvas, width, height, dpr)
  }

  /** 更新视口尺寸（CSS 像素），并按 devicePixelRatio 缩放画布 */
  setViewport(canvas: HTMLCanvasElement, width: number, height: number, dpr = 1): void {
    this.opts = this.buildOpts(width, height)
    this.mountains = this.buildMountains(width)
    this.applyCanvasSize(canvas, width, height, dpr)
  }

  private buildMountains(width: number): MountainLayer[] {
    return [
      {
        profile: generateMountainProfile(width, 2024),
        factor: 0.02,
        color: '#27425e',
        peak: 0.5,
      },
      {
        profile: generateMountainProfile(width, 77),
        factor: 0.05,
        color: '#1f3046',
        peak: 0.35,
      },
    ]
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

  /** 渲染一帧：天空 + 视差远山 + 草地 + 曲线路面 + 景物 + 漂移烟雾 */
  render(cameraZ: number, smoke: SmokeParticle[] = []): void {
    this.renderWithOpts(cameraZ, this.opts, smoke)
  }

  /** 渲染到指定屏幕区域（分屏用）：viewX 起 viewW 宽，内部裁剪平移 */
  renderRegion(
    cameraZ: number,
    viewX: number,
    viewW: number,
    smoke: SmokeParticle[] = [],
  ): void {
    const { ctx } = this
    const opts = this.buildOpts(viewW, this.opts.height)
    ctx.save()
    ctx.translate(viewX, 0)
    ctx.beginPath()
    ctx.rect(0, 0, viewW, this.opts.height)
    ctx.clip()
    this.renderWithOpts(cameraZ, opts, smoke)
    ctx.restore()
  }

  private renderWithOpts(
    cameraZ: number,
    opts: ProjectionOptions,
    smoke: SmokeParticle[],
  ): void {
    const { ctx } = this
    this.camera.z = cameraZ

    ctx.fillStyle = '#0d1b2a'
    ctx.fillRect(0, 0, opts.width, opts.horizon)
    for (const layer of this.mountains) {
      drawMountainLayer(ctx, layer, cameraZ, opts)
    }
    ctx.fillStyle = '#1e3d2f'
    ctx.fillRect(0, opts.horizon, opts.width, opts.height - opts.horizon)

    const baseIndex = trackIndexForCameraZ(this.track, cameraZ)
    const baseZ = Math.floor(cameraZ / SEGMENT_LENGTH) * SEGMENT_LENGTH

    let curveSum = 0
    for (let k = 0; k < DRAW_DISTANCE; k++) {
      const z = baseZ + k * SEGMENT_LENGTH
      if (z <= cameraZ) {
        continue
      }
      const segment = this.track[(baseIndex + k) % this.track.length]
      const cur = this.projectQuad(z, curveSum, opts)
      const next = this.projectQuad(z + SEGMENT_LENGTH, curveSum + segment.curve, opts)
      if (!cur || !next) {
        continue
      }
      const parity = (baseIndex + k) % 2

      drawQuad(ctx, cur.l1, cur.r1, next.r1, next.l1, ROAD_COLORS[parity])
      drawQuad(ctx, cur.l2, cur.l1, next.l1, next.l2, SIDE_COLORS[parity])
      drawQuad(ctx, cur.r1, cur.r2, next.r2, next.r1, SIDE_COLORS[parity])

      if (k % 2 === 0) {
        const cw = (cur.r1.x - cur.l1.x) * 0.06
        const centerProj = project(opts, this.camera, { x: curveSum, y: 0, z })
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
      curveSum += segment.curve
    }
    this.drawSprites(cameraZ, opts)
    this.drawSmoke(smoke, cameraZ, opts)
  }

  /** 绘制漂移烟雾（近大远小，透明度随存活衰减） */
  private drawSmoke(smoke: SmokeParticle[], cameraZ: number, opts: ProjectionOptions): void {
    const { ctx } = this
    for (const particle of smoke) {
      const dz = particle.z - cameraZ
      if (dz <= 0) {
        continue
      }
      const proj = project(opts, this.camera, {
        x: particle.x - this.camera.x,
        y: 0,
        z: particle.z,
      })
      if (!proj) {
        continue
      }
      const radius = Math.max(proj.scale * opts.height * 0.06, 2)
      const alpha = Math.max(1 - particle.t / 0.6, 0) * 0.4
      ctx.fillStyle = `rgba(200, 200, 210, ${alpha.toFixed(3)})`
      ctx.beginPath()
      ctx.arc(proj.x, proj.y - radius * 0.5, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** 绘制路边景物（远→近） */
  private drawSprites(cameraZ: number, opts: ProjectionOptions): void {
    const seen = spritesInRange(
      this.sprites,
      this.track,
      cameraZ,
      DRAW_DISTANCE * SEGMENT_LENGTH,
    )
    seen.sort((a, b) => b.z - a.z)
    for (const sprite of seen) {
      const centerX = curveOffsetAtZ(this.track, sprite.z)
      const cx = centerX - this.camera.x
      const bottom = project(opts, this.camera, {
        x: cx + sprite.offset,
        y: 0,
        z: sprite.z,
      })
      if (!bottom) {
        continue
      }
      const hpx = sprite.height * bottom.scale * opts.height * 0.5
      if (sprite.kind === 'tree') {
        this.drawTree(bottom.x, bottom.y, hpx)
      } else {
        this.drawLamp(bottom.x, bottom.y, hpx)
      }
    }
  }

  /** 树：树干 + 两层三角树冠 */
  private drawTree(x: number, y: number, hpx: number): void {
    const { ctx } = this
    const trunkW = Math.max(hpx * 0.12, 2)
    const trunkH = hpx * 0.35
    ctx.fillStyle = '#5a3a22'
    ctx.fillRect(x - trunkW / 2, y - trunkH, trunkW, trunkH)
    ctx.fillStyle = '#2d5a27'
    const crownBase = y - trunkH
    const crownW = hpx * 0.9
    ctx.beginPath()
    ctx.moveTo(x, crownBase - hpx * 0.85)
    ctx.lineTo(x - crownW / 2, crownBase)
    ctx.lineTo(x + crownW / 2, crownBase)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#3a7a35'
    ctx.beginPath()
    ctx.moveTo(x, crownBase - hpx * 0.55)
    ctx.lineTo(x - crownW * 0.62, crownBase)
    ctx.lineTo(x + crownW * 0.62, crownBase)
    ctx.closePath()
    ctx.fill()
  }

  /** 路灯：灯杆 + 发光灯头 */
  private drawLamp(x: number, y: number, hpx: number): void {
    const { ctx } = this
    const poleW = Math.max(hpx * 0.06, 2)
    ctx.fillStyle = '#8a8a8a'
    ctx.fillRect(x - poleW / 2, y - hpx, poleW, hpx)
    const r = Math.max(hpx * 0.14, 2)
    ctx.fillStyle = '#ffe08a'
    ctx.beginPath()
    ctx.arc(x, y - hpx, r * 1.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffd75e'
    ctx.beginPath()
    ctx.arc(x, y - hpx, r, 0, Math.PI * 2)
    ctx.fill()
  }

  private projectQuad(z: number, centerX: number, opts: ProjectionOptions): Quad | null {
    const { camera } = this
    const cx = centerX - camera.x
    const l1 = project(opts, camera, { x: cx - ROAD_HALF_WIDTH, y: 0, z })
    const l2 = project(opts, camera, {
      x: cx - ROAD_HALF_WIDTH - EDGE_WIDTH,
      y: 0,
      z,
    })
    const r1 = project(opts, camera, { x: cx + ROAD_HALF_WIDTH, y: 0, z })
    const r2 = project(opts, camera, {
      x: cx + ROAD_HALF_WIDTH + EDGE_WIDTH,
      y: 0,
      z,
    })
    if (!l1 || !l2 || !r1 || !r2) {
      return null
    }
    return { l1, l2, r1, r2 }
  }
}
