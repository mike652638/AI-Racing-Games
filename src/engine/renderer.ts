import { RENDER_DEPTH_RATIO, RENDER_HORIZON_RATIO } from '../game/constants'
import { project, type Projected, type ProjectionOptions } from './projection'
import { SEGMENT_LENGTH, trackIndexForCameraZ, type Segment } from './track'
import { generateMountainProfile, parallaxOffset } from './scenery'
import {
  buildCurvePrefixSum,
  buildSpriteIndex,
  curveOffsetAtZ,
  spritesInRangeIndexed,
  type Sprite,
} from './sprites'
import type { TrafficCar } from './traffic'
import type { SmokeParticle } from '../physics/drift'
import { updateLighting, WEATHER_CYCLE_SECONDS } from './lighting'
import { mulberry32 } from './scenery'
import {
  DRAW_DISTANCE,
  projectSegmentQuad,
  roadColors,
  shouldDrawCenterLine,
} from './road-geometry'
import { projectTraffic } from './traffic-render'
import { projectSmoke } from './smoke-render'

export { DRAW_DISTANCE, EDGE_WIDTH, ROAD_HALF_WIDTH } from './road-geometry'

/** 一次渲染所需的完整赛道数据（分屏双世界各持一份，避免每帧重建）。
 *  不传 view 时回退到 Renderer 自身字段（setTrack/setTraffic 设置的默认视图）。 */
export interface RenderView {
  track: Segment[]
  curvePrefixSum: Float64Array
  spriteIndex: Map<number, Sprite[]>
  traffic: TrafficCar[]
  /** 夜晚模式（赛道级，F1）：切换夜晚色板 / 深色远山 / 车灯光晕 */
  night?: boolean
}

interface MountainLayer {
  profile: number[]
  factor: number
  color: string
  peak: number
  /** 离屏预渲染的山形位图 */
  offscreen: HTMLCanvasElement
}

/** 雨滴数量（确定性生成，渲染时按 timeSec 下落） */
const RAIN_DROPS = 80

/** 雨滴数据：x 为宽度归一化坐标（0-1，绘制时乘宽度自适应视口），y0 为下落相位，len 为雨丝长度 */
interface RainDrop {
  x: number
  y0: number
  len: number
}

function renderMountainOffscreen(layer: MountainLayer, width: number): HTMLCanvasElement {
  const height = Math.floor(width * layer.peak)
  const canvas = document.createElement('canvas')
  canvas.width = layer.profile.length
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = layer.color
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let x = 0; x < layer.profile.length; x++) {
    ctx.lineTo(x, height - layer.profile[x] * height)
  }
  ctx.lineTo(layer.profile.length, height)
  ctx.closePath()
  ctx.fill()
  return canvas
}

function drawMountainLayerCached(
  ctx: CanvasRenderingContext2D,
  layer: MountainLayer,
  cameraZ: number,
  opts: ProjectionOptions,
): void {
  const offset = parallaxOffset(cameraZ, layer.factor, layer.offscreen.width)
  const y = opts.horizon - layer.offscreen.height
  ctx.drawImage(layer.offscreen, -offset, y)
  ctx.drawImage(layer.offscreen, layer.offscreen.width - offset, y)
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
  /** 夜晚模式的深色远山缓存（night 赛道用，避免每帧重建离屏位图） */
  private mountainsNight: MountainLayer[]
  /** 赛道曲率前缀和，用于 O(1) 查询累计曲率 */
  private curvePrefixSum: Float64Array
  /** 路边景物段索引（键 = floor(z / SEGMENT_LENGTH)），drawSprites 用 O(候选段数) 查询替代线性扫描 */
  private spriteIndex = new Map<number, Sprite[]>()
  /** 雨滴数据（构造时确定性生成，x 归一化 0-1） */
  private rainDrops: RainDrop[]

  constructor(
    canvas: HTMLCanvasElement,
    private track: Segment[],
    width: number,
    height: number,
    dpr = 1,
    sprites: Sprite[] = [],
    private traffic: TrafficCar[] = [],
  ) {
    this.ctx = canvas.getContext('2d')!
    this.opts = this.buildOpts(width, height)
    this.mountains = this.buildMountains(width, '#27425e', '#1f3046')
    this.mountainsNight = this.buildMountains(width, '#101a2a', '#0a1220')
    this.curvePrefixSum = buildCurvePrefixSum(track)
    this.spriteIndex = buildSpriteIndex(sprites, SEGMENT_LENGTH)
    this.rainDrops = this.buildRainDrops()
    this.applyCanvasSize(canvas, width, height, dpr)
  }

  /** 更新视口尺寸（CSS 像素），并按 devicePixelRatio 缩放画布 */
  setViewport(canvas: HTMLCanvasElement, width: number, height: number, dpr = 1): void {
    this.opts = this.buildOpts(width, height)
    this.mountains = this.buildMountains(width, '#27425e', '#1f3046')
    this.mountainsNight = this.buildMountains(width, '#101a2a', '#0a1220')
    this.applyCanvasSize(canvas, width, height, dpr)
  }

  /** 构建两层视差远山离屏位图（night 时用深色配色，见 mountainsNight） */
  private buildMountains(width: number, colorFar: string, colorNear: string): MountainLayer[] {
    const layerDefs = [
      { profile: generateMountainProfile(width, 2024), factor: 0.02, color: colorFar, peak: 0.5 },
      { profile: generateMountainProfile(width, 77), factor: 0.05, color: colorNear, peak: 0.35 },
    ]
    return layerDefs.map((def) => ({
      ...def,
      offscreen: renderMountainOffscreen(def as MountainLayer, width),
    }))
  }

  /** 确定性生成雨滴数据（种子 2026；x 归一化 0-1，setViewport 改变画布尺寸时无需重算） */
  private buildRainDrops(): RainDrop[] {
    const rnd = mulberry32(2026)
    const drops: RainDrop[] = []
    for (let i = 0; i < RAIN_DROPS; i++) {
      drops.push({ x: rnd(), y0: rnd(), len: 8 + rnd() * 6 })
    }
    return drops
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
    return { width, height, horizon: height * RENDER_HORIZON_RATIO, depth: width * RENDER_DEPTH_RATIO }
  }

  /** 设置相机横向偏移（跟随车辆位置） */
  setCameraX(x: number): void {
    this.camera.x = x
  }

  /** 更新车流引用（赛道切换/重置时调用） */
  setTraffic(traffic: TrafficCar[]): void {
    this.traffic = traffic
  }

  /** 切换赛道数据与路边景物（关卡选单用），同时重建曲率前缀和与景物段索引 */
  setTrack(track: Segment[], sprites: Sprite[]): void {
    this.track = track
    this.curvePrefixSum = buildCurvePrefixSum(track)
    this.spriteIndex = buildSpriteIndex(sprites, SEGMENT_LENGTH)
  }

  /** 渲染一帧：天空 + 视差远山 + 草地 + 曲线路面 + 景物 + 漂移烟雾。
   *  view 可选：缺省用 Renderer 自身字段（setTrack/setTraffic 设置的默认视图）。 */
  render(cameraZ: number, smoke: SmokeParticle[] = [], timeSec = 0, view?: RenderView): void {
    this.renderWithOpts(cameraZ, this.opts, smoke, timeSec, view)
  }

  /** 渲染到指定屏幕区域（分屏用）：viewX 起 viewW 宽，内部裁剪平移。
   *  viewX/viewW 先做整数像素对齐（Math.round）：窗口宽为奇数时 w/2 是 x.5，
   *  半像素 translate/clip 会导致交界处 1px 级重叠/缝隙，近处路缘石斜边交错成
   *  "三角形重叠/撕裂"。view 可选，语义同 render。
   */
  renderRegion(
    cameraZ: number,
    viewX: number,
    viewW: number,
    smoke: SmokeParticle[] = [],
    timeSec = 0,
    view?: RenderView,
  ): void {
    const { ctx } = this
    const opts = this.buildOpts(viewW, this.opts.height)
    const ox = Math.round(viewX)
    const ow = Math.round(viewW)
    ctx.save()
    ctx.translate(ox, 0)
    ctx.beginPath()
    ctx.rect(0, 0, ow, this.opts.height)
    ctx.clip()
    this.renderWithOpts(cameraZ, opts, smoke, timeSec, view)
    ctx.restore()
  }

  /** 分屏交界分隔线：全高深色竖线，覆盖两区域近处路缘石交错瑕疵。
   *  必须在 renderRegion 的 ctx.restore() 之后调用（transform 已复位，用全屏坐标）。
   */
  drawDivider(x: number, width = 2): void {
    const { ctx } = this
    ctx.fillStyle = '#000'
    ctx.fillRect(Math.round(x - width / 2), 0, width, this.opts.height)
  }

  private renderWithOpts(
    cameraZ: number,
    opts: ProjectionOptions,
    smoke: SmokeParticle[],
    timeSec: number,
    view?: RenderView,
  ): void {
    const { ctx } = this
    // 视图数据：显式传入的 RenderView 优先；缺省回退到 this 字段（setTrack/setTraffic 的默认视图）。
    // 注：计划原案 `view ?? this` 因 track/curvePrefixSum 等为 private 字段无法做结构兼容赋值，
    // 改为类内显式对象构造（语义完全一致，见计划 Task B2 实施偏差）。
    const v: RenderView =
      view ?? {
        track: this.track,
        curvePrefixSum: this.curvePrefixSum,
        spriteIndex: this.spriteIndex,
        traffic: this.traffic,
      }
    this.camera.z = cameraZ
    // 天气循环：晴/阴/雨三态各 45 秒循环（phase 0 晴 / 1 阴 / 2 雨，timeSec 为渲染用累计时间）
    const phase = Math.floor(timeSec / WEATHER_CYCLE_SECONDS) % 3
    const overcast = phase === 1
    const raining = phase === 2
    // 夜晚模式（赛道级）：view.night 缺省 false；夜晚锁定色板 + 深色远山 + 车灯
    const night = view?.night ?? false
    const colors = updateLighting(timeSec, overcast, raining, night)

    ctx.fillStyle = colors.skyTop
    ctx.fillRect(0, 0, opts.width, opts.horizon)
    for (const layer of night ? this.mountainsNight : this.mountains) {
      drawMountainLayerCached(ctx, layer, cameraZ, opts)
    }
    ctx.fillStyle = colors.grass
    ctx.fillRect(0, opts.horizon, opts.width, opts.height - opts.horizon)

    const baseIndex = trackIndexForCameraZ(v.track, cameraZ)
    const baseZ = Math.floor(cameraZ / SEGMENT_LENGTH) * SEGMENT_LENGTH

    let curveSum = 0
    for (let k = 0; k < DRAW_DISTANCE; k++) {
      const z = baseZ + k * SEGMENT_LENGTH
      if (z <= cameraZ) {
        continue
      }
      const segment = v.track[(baseIndex + k) % v.track.length]
      const cur = projectSegmentQuad(opts, this.camera, z, curveSum)
      const next = projectSegmentQuad(
        opts,
        this.camera,
        z + SEGMENT_LENGTH,
        curveSum + segment.curve,
      )
      if (!cur || !next) {
        continue
      }
      const colors = roadColors(baseIndex + k)

      drawQuad(ctx, cur.l1, cur.r1, next.r1, next.l1, colors.road)
      drawQuad(ctx, cur.l2, cur.l1, next.l1, next.l2, colors.side)
      drawQuad(ctx, cur.r1, cur.r2, next.r2, next.r1, colors.side)

      if (shouldDrawCenterLine(k)) {
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
    this.drawSprites(cameraZ, opts, v)
    this.drawTraffic(cameraZ, opts, v, night)
    this.drawSmoke(smoke, cameraZ, opts)
    if (raining) {
      this.drawRain(timeSec, opts)
    }
  }

  /** 雨滴 overlay：全屏斜线雨丝（最上层特效，忽略投影；y 随 timeSec 以 600px/s 下落并环形回绕） */
  private drawRain(timeSec: number, opts: ProjectionOptions): void {
    const { ctx } = this
    const { width, height } = opts
    ctx.strokeStyle = 'rgba(180, 200, 220, 0.35)'
    ctx.lineWidth = 1
    try {
      ctx.beginPath()
      for (const drop of this.rainDrops) {
        const y = (drop.y0 * (height + 20) + timeSec * 600) % (height + 20) - 10
        const x = drop.x * width
        ctx.moveTo(x, y)
        ctx.lineTo(x - 3, y + drop.len)
      }
    } finally {
      ctx.stroke()
    }
  }

  /** 绘制车流（车身 + 车窗，远→近）；数据取自视图 v；night 时加车前灯光晕 */
  private drawTraffic(
    cameraZ: number,
    opts: ProjectionOptions,
    v: RenderView,
    night: boolean,
  ): void {
    const { ctx } = this
    for (const car of projectTraffic(v.traffic, cameraZ, this.camera.x, opts, this.camera)) {
      ctx.fillStyle = car.color
      ctx.fillRect(car.bottom.x - car.width / 2, car.top.y, car.width, car.height)
      ctx.fillStyle = '#1b2430'
      ctx.fillRect(
        car.bottom.x - car.width / 4,
        car.top.y + car.height * 0.3,
        car.width / 2,
        car.height * 0.4,
      )
      if (night) {
        this.drawHeadlight(car.bottom.x, car.top.y, car.width, car.height)
      }
    }
  }

  /** 车前灯光晕（night 专用）：参考 drawLamp 双弧模式——外层半透明光晕 + 核心灯，位置在车头（画面上方） */
  private drawHeadlight(cx: number, topY: number, width: number, height: number): void {
    const { ctx } = this
    // 车头 = 车身上部（行驶方向朝画面上方），半径随投影宽（scale）缩放
    const hx = cx
    const hy = topY + height * 0.25
    const r = Math.max(width * 0.5, 2.5)
    ctx.fillStyle = 'rgba(255, 235, 180, 0.35)'
    ctx.beginPath()
    ctx.arc(hx, hy, r * 1.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffe08a'
    ctx.beginPath()
    ctx.arc(hx, hy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 绘制漂移烟雾（近大远小，透明度随存活衰减） */
  private drawSmoke(smoke: SmokeParticle[], cameraZ: number, opts: ProjectionOptions): void {
    const { ctx } = this
    for (const p of projectSmoke(smoke, cameraZ, this.camera.x, opts, this.camera)) {
      ctx.fillStyle = `rgba(200, 200, 210, ${p.alpha.toFixed(3)})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** 绘制路边景物（远→近）；数据取自视图 v */
  private drawSprites(cameraZ: number, opts: ProjectionOptions, v: RenderView): void {
    const seen = spritesInRangeIndexed(
      v.spriteIndex,
      v.track,
      cameraZ,
      DRAW_DISTANCE * SEGMENT_LENGTH,
    )
    for (let i = seen.length - 1; i >= 0; i--) {
      const sprite = seen[i]
      const centerX = curveOffsetAtZ(v.track, v.curvePrefixSum, sprite.z)
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
}
