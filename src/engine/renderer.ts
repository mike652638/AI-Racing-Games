import { RENDER_DEPTH_RATIO, RENDER_HORIZON_RATIO } from '../game/constants'
import { project, type Projected, type ProjectionOptions } from './projection'
import { SEGMENT_LENGTH, trackIndexForCameraZ, type Segment } from './track'
import { generateMountainProfile, parallaxOffset } from './scenery'
import { buildCurvePrefixSum, buildSpriteIndex, curveOffsetAtZ, spritesInRangeIndexed, type Sprite } from './sprites'
import type { TrafficCar } from './traffic'
import type { SmokeParticle } from '../physics/drift'
import { updateLighting, WEATHER_CYCLE_SECONDS } from './lighting'
import { mulberry32 } from './scenery'
import { DRAW_DISTANCE, projectSegmentQuad, roadColors, shouldDrawCenterLine, type Quad } from './road-geometry'
import { projectTraffic } from './traffic-render'
import { projectSmoke } from './smoke-render'
import { renderRoadStripToCanvas, type RoadStrip } from './road-strip'

export { DRAW_DISTANCE, EDGE_WIDTH, ROAD_HALF_WIDTH } from './road-geometry'

/** BOOST 尾焰粒子（纯数据：x 横向偏移 / z 世界位置 / t 存活时间，game 层维护、renderer 投影绘制；
 *  与渲染相关故定义于此，audio 层不依赖） */
export interface BoostParticle {
  x: number
  z: number
  t: number
}

/** 渲染降级选项（Task 9 性能优化）：调用方可按需跳过非关键渲染层（漂移烟雾 / BOOST 尾焰粒子 / 雨丝）
 *  并覆盖默认 DRAW_DISTANCE。所有字段可选，缺省（undefined）时与既有渲染行为完全一致（零回归）。 */
export interface RenderOptions {
  /** 覆盖默认 DRAW_DISTANCE（可选）：控制可视道路段数（渲染深度），缺省 120 */
  drawDistance?: number
  /** 跳过漂移烟雾渲染 */
  skipSmoke?: boolean
  /** 跳过 BOOST 尾焰粒子渲染 */
  skipBoostParticles?: boolean
  /** 跳过雨丝渲染 */
  skipRain?: boolean
}

/** 一次渲染所需的完整赛道数据（分屏双世界各持一份，避免每帧重建）。
 *  不传 view 时回退到 Renderer 自身字段（setTrack/setTraffic 设置的默认视图）。 */
export interface RenderView {
  track: Segment[]
  curvePrefixSum: Float64Array
  spriteIndex: Map<number, Sprite[]>
  traffic: TrafficCar[]
  /** 夜晚模式（赛道级，F1）：切换夜晚色板 / 深色远山 / 车灯光晕 */
  night?: boolean
  /** BOOST 尾焰粒子（H2：game 层维护、渲染层投影，缺省无粒子） */
  boostParticles?: BoostParticle[]
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

/** 雨丝倾斜角（B7 天气交互化）：固定 15° 风向感（弧度），预计算 sin/cos 供离屏预渲染复用 */
const RAIN_TILT = (15 * Math.PI) / 180
const RAIN_TILT_SIN = Math.sin(RAIN_TILT)
const RAIN_TILT_COS = Math.cos(RAIN_TILT)

/** B7 雨天湿滑路面：整段暗色压暗叠加色 + 近处中心高光反光条（路面宽 35% 的半宽系数 0.175） */
const WET_OVERLAY_COLOR = 'rgba(10, 15, 30, 0.15)'
const WET_HIGHLIGHT_COLOR = 'rgba(180, 200, 230, 0.08)'
const WET_HIGHLIGHT_MAX_K = 30

/** B7 起终点线：赛道起点段（wrappedIndex === 0）近处（k < 40）绘制 16 列 × 2 行黑白棋盘格横条 */
const START_GRID_COLS = 16
const START_LINE_MAX_K = 40
const START_GRID_BLACK = '#000000'
const START_GRID_WHITE = '#ffffff'

/** stripForSegment 的"无映射"哨兵（Uint16Array 默认值 0 可能被误判为 strip 0，故用 0xFFFF） */
const NO_STRIP = 0xffff

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

/** 以纯坐标绘制填充四边形（零对象分配：起终点线棋盘格逐格、雨天湿滑叠加层复用）。
 *  与 drawQuad 的绘制调用序列完全一致（fillStyle → beginPath → moveTo → 3×lineTo → closePath → fill）。 */
function fillQuadCoords(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.closePath()
  ctx.fill()
}

function drawQuad(
  ctx: CanvasRenderingContext2D,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected,
  color: string,
): void {
  fillQuadCoords(ctx, a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y, color)
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
  /** 雨丝离屏缓存（F5）：预渲染全部 80 条雨丝，帧内双幅 drawImage 平铺替代逐段绘制 */
  private rainCanvas: HTMLCanvasElement | null = null
  /** 道路段离屏缓存：strip index → 预渲染 canvas（Task A 已激活：setTrack 预热，
   *  帧内以 drawImage 切片替代逐段 drawQuad） */
  private roadStripCache = new Map<number, OffscreenCanvas>()
  /** 缓存消费对应的赛道引用（setTrack 时赋值；视图 track 与之同引用且缓存非空才走缓存路径） */
  private cachedTrack: Segment[] | null = null
  /** 段索引 → strip 索引映射（buildRoadStripCache 构建；NO_STRIP 哨兵 = 无映射；
   *  长度与缓存赛道段数一致，用作缓存有效性判定） */
  private stripForSegment = new Uint16Array(0)
  /** 最近一次 setTrack 传入的道路段列表（renderRoadSurface 缓存路径的 strip 数据源） */
  private roadStrips: RoadStrip[] = []
  /** spritesInRangeIndexed 的复用输出数组（Task 5：每帧清空重填，避免帧内新建数组） */
  private spriteScratch: Sprite[] = []
  /** fillStyle 字符串缓存（Task B7）：key = 归一化后的 rgba 分量，命中复用同一字符串，
   *  避免每帧为烟雾/尾焰粒子用模板字符串重建；超过上限清空防内存泄漏 */
  private _fillStyleCache = new Map<string, string>()

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
    this.buildRainCanvas(this.opts)
    this.applyCanvasSize(canvas, width, height, dpr)
  }

  /** 更新视口尺寸（CSS 像素），并按 devicePixelRatio 缩放画布 */
  setViewport(canvas: HTMLCanvasElement, width: number, height: number, dpr = 1): void {
    this.opts = this.buildOpts(width, height)
    this.mountains = this.buildMountains(width, '#27425e', '#1f3046')
    this.mountainsNight = this.buildMountains(width, '#101a2a', '#0a1220')
    this.buildRainCanvas(this.opts)
    this.applyCanvasSize(canvas, width, height, dpr)
    // 视口变化后重建道路段缓存：纹理宽度 = 视口宽度，旧纹理直接缩放会拉伸失真
    if (this.roadStrips.length > 0) {
      this.buildRoadStripCache(this.roadStrips, width)
    }
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

  /** 确定性生成雨滴数据（种子 2026；x 归一化 0-1，setViewport 改变画布尺寸时无需重算）。
   *  B7：雨丝加长（12-24，原 8-14）以减弱倾斜后垂直平铺接缝的可见性 */
  private buildRainDrops(): RainDrop[] {
    const rnd = mulberry32(2026)
    const drops: RainDrop[] = []
    for (let i = 0; i < RAIN_DROPS; i++) {
      drops.push({ x: rnd(), y0: rnd(), len: 12 + rnd() * 12 })
    }
    return drops
  }

  /** 预渲染全部雨丝到离屏 canvas（宽 = opts.width、高 = opts.height + 20，与 drawRain 的 y 环形范围一致）；
   *  帧内双幅 drawImage 平铺替代每帧 80 段线段逐段绘制（F5 性能优化）。
   *  B7：雨丝固定 15° 倾斜（风向感）：短线段从 (x, y) 到 (x + sin(15°)×len, y + cos(15°)×len)，
   *  线宽 1px、透明度提至 0.5；仍为确定性预渲染，主 ctx 帧内零 stroke。 */
  private buildRainCanvas(opts: ProjectionOptions): void {
    const width = opts.width
    const height = opts.height + 20
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = 'rgba(180, 200, 220, 0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const drop of this.rainDrops) {
      const x = drop.x * width
      const y = drop.y0 * height
      ctx.moveTo(x, y)
      ctx.lineTo(x + RAIN_TILT_SIN * drop.len, y + RAIN_TILT_COS * drop.len)
    }
    ctx.stroke()
    this.rainCanvas = canvas
  }

  private applyCanvasSize(canvas: HTMLCanvasElement, width: number, height: number, dpr: number): void {
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

  /** 切换赛道数据与路边景物（关卡选单用），同时重建曲率前缀和与景物段索引；
   *  roadStrips（TrackContext 预计算的曲率段）可选传入，提供时预热道路段离屏缓存并激活缓存消费 */
  setTrack(track: Segment[], sprites: Sprite[], roadStrips?: RoadStrip[]): void {
    this.track = track
    this.cachedTrack = track
    this.curvePrefixSum = buildCurvePrefixSum(track)
    this.spriteIndex = buildSpriteIndex(sprites, SEGMENT_LENGTH)
    if (roadStrips) {
      this.roadStrips = roadStrips
      this.buildRoadStripCache(roadStrips, this.opts.width)
    } else {
      // 无 roadStrips：缓存消费停用（段映射作废；roadStripCache 引用保留以满足
      // "不传 roadStrips 的 setTrack 不清空既有缓存"契约，useCache 判定会拦截）
      this.stripForSegment = new Uint16Array(0)
    }
  }

  /** 预热道路段离屏缓存：按 TrackContext.roadStrips 将全部曲率段预渲染为离屏 canvas
   *  （每段 1 行纹理，宽 = 视口宽），同时构建段索引 → strip 索引映射（帧内 O(1) 查询）。 */
  private buildRoadStripCache(strips: RoadStrip[], width: number): void {
    this.roadStripCache.clear()
    this.stripForSegment = new Uint16Array(this.track.length)
    this.stripForSegment.fill(NO_STRIP)
    strips.forEach((strip, i) => {
      const start = Math.max(strip.startSeg, 0)
      const end = Math.min(strip.endSeg, this.track.length)
      for (let s = start; s < end; s++) {
        this.stripForSegment[s] = i
      }
      const canvas = renderRoadStripToCanvas(strip, { width })
      this.roadStripCache.set(i, canvas)
    })
  }

  /** 渲染一帧：天空 + 视差远山 + 草地 + 曲线路面 + 景物 + 漂移烟雾。
   *  view 可选：缺省用 Renderer 自身字段（setTrack/setTraffic 设置的默认视图）。
   *  renderOpts 可选（Task 9 渲染降级）：drawDistance 覆盖可视段数、skip* 跳过对应特效层，缺省全效。 */
  render(
    cameraZ: number,
    smoke: SmokeParticle[] = [],
    timeSec = 0,
    view?: RenderView,
    renderOpts?: RenderOptions,
  ): void {
    this.renderWithOpts(cameraZ, this.opts, smoke, timeSec, view, renderOpts)
  }

  /** 渲染到指定屏幕区域（分屏用）：viewX 起 viewW 宽，内部裁剪平移。
   *  viewX/viewW 先做整数像素对齐（Math.round）：窗口宽为奇数时 w/2 是 x.5，
   *  半像素 translate/clip 会导致交界处 1px 级重叠/缝隙，近处路缘石斜边交错成
   *  "三角形重叠/撕裂"。view 可选，语义同 render；renderOpts 可选（Task 9 渲染降级）。
   */
  renderRegion(
    cameraZ: number,
    viewX: number,
    viewW: number,
    smoke: SmokeParticle[] = [],
    timeSec = 0,
    view?: RenderView,
    renderOpts?: RenderOptions,
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
    this.renderWithOpts(cameraZ, opts, smoke, timeSec, view, renderOpts)
    ctx.restore()
  }

  /** 分屏交界分隔线：全高半透明白竖线，覆盖两区域近处路缘石交错瑕疵。
   *  必须在 renderRegion 的 ctx.restore() 之后调用（transform 已复位，用全屏坐标）。
   *  （Batch 3：3px 宽 + 半透明白，比原 2px 纯黑更醒目）
   */
  drawDivider(x: number, width = 3): void {
    const { ctx } = this
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.fillRect(Math.round(x - width / 2), 0, width, this.opts.height)
  }

  private renderWithOpts(
    cameraZ: number,
    opts: ProjectionOptions,
    smoke: SmokeParticle[],
    timeSec: number,
    view?: RenderView,
    renderOpts?: RenderOptions,
  ): void {
    const { ctx } = this
    // 渲染降级（Task 9）：drawDistance 覆盖默认 DRAW_DISTANCE（undefined 回退常量，零回归）
    const maxK = renderOpts?.drawDistance ?? DRAW_DISTANCE
    // 视图数据：显式传入的 RenderView 优先；缺省回退到 this 字段（setTrack/setTraffic 的默认视图）。
    // 注：计划原案 `view ?? this` 因 track/curvePrefixSum 等为 private 字段无法做结构兼容赋值，
    // 改为类内显式对象构造（语义完全一致，见计划 Task B2 实施偏差）。
    const v: RenderView = view ?? {
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
    // 道路层：优先消费 roadStrip 离屏缓存（Task A 激活：每段切片 drawImage），
    // 缓存不可用时回退逐段 drawQuad；雨天 overlay / 起终点线 / 曲率累计两条路径共享
    this.renderRoadSurface(ctx, opts, v, baseIndex, baseZ, cameraZ, maxK, raining)
    this.drawSprites(cameraZ, opts, v, maxK)
    this.drawTraffic(cameraZ, opts, v, night)
    if (!renderOpts?.skipSmoke) {
      this.drawSmoke(smoke, cameraZ, opts)
    }
    if (!renderOpts?.skipBoostParticles && v.boostParticles?.length) {
      this.drawBoostParticles(v.boostParticles, cameraZ, opts)
    }
    if (raining && !renderOpts?.skipRain) {
      this.drawRain(timeSec, opts)
    }
  }

  /** 道路层渲染（Task A 激活缓存消费）：优先消费 roadStrip 离屏缓存（每段切片 drawImage，
   *  中心虚线已烘焙进纹理），缓存不可用时回退逐段 drawQuad（路面 + 双路缘 + 中心虚线）。
   *  雨天湿滑 overlay、起终点线、曲率累计为两条路径共享，保持原渲染顺序不变。
   *  帧内零新建数组。 */
  private renderRoadSurface(
    ctx: CanvasRenderingContext2D,
    opts: ProjectionOptions,
    v: RenderView,
    baseIndex: number,
    baseZ: number,
    cameraZ: number,
    maxK: number,
    raining: boolean,
  ): void {
    // 缓存消费激活条件：视图赛道与缓存赛道同引用、缓存非空、段映射长度匹配
    // （setTrack 不带 roadStrips 时映射置空作废，避免误用旧赛道缓存）
    const useCache =
      v.track === this.cachedTrack && this.roadStripCache.size > 0 && this.stripForSegment.length === v.track.length
    let curveSum = 0
    for (let k = 0; k < maxK; k++) {
      const z = baseZ + k * SEGMENT_LENGTH
      if (z <= cameraZ) {
        continue
      }
      const wrappedIndex = (baseIndex + k) % v.track.length
      const segment = v.track[wrappedIndex]
      const cur = projectSegmentQuad(opts, this.camera, z, curveSum)
      const next = projectSegmentQuad(opts, this.camera, z + SEGMENT_LENGTH, curveSum + segment.curve)
      if (!cur || !next) {
        continue
      }
      const colors = roadColors(baseIndex + k)

      // 缓存路径：段级切片 drawImage（路面/路缘/中心虚线已烘焙）；miss/无映射时回退逐段 drawQuad
      let drawn = false
      if (useCache && wrappedIndex < this.stripForSegment.length) {
        const stripIdx = this.stripForSegment[wrappedIndex]
        const cached = stripIdx === NO_STRIP ? undefined : this.roadStripCache.get(stripIdx)
        if (cached) {
          const strip = this.roadStrips[stripIdx]
          // 防御性校验：映射段必须落在 strip 段范围内（stripForSegment 按 min(endSeg, length) 填充，正常必然成立）
          if (wrappedIndex >= strip.startSeg && wrappedIndex < strip.endSeg) {
            this.drawCachedSegment(ctx, cached, cur, next, wrappedIndex - strip.startSeg, strip.endSeg - strip.startSeg)
            drawn = true
          }
        }
      }
      if (!drawn) {
        this.drawFallbackSegment(ctx, cur, next, colors)
      }

      // B7 雨天湿滑路面（两条路径共享）：整段叠加暗色压暗（复用 cur/next 投影结果，零新增对象分配）；
      // 近处段（k < 30）再叠加半透明白色中心高光条（路面宽 35%，湿滑反光）
      if (raining) {
        drawQuad(ctx, cur.l1, cur.r1, next.r1, next.l1, WET_OVERLAY_COLOR)
        if (k < WET_HIGHLIGHT_MAX_K) {
          const cx = (cur.l1.x + cur.r1.x) * 0.5
          const nx = (next.l1.x + next.r1.x) * 0.5
          const halfW = (cur.r1.x - cur.l1.x) * 0.175
          const nHalfW = (next.r1.x - next.l1.x) * 0.175
          fillQuadCoords(
            ctx,
            cx - halfW,
            cur.l1.y,
            cx + halfW,
            cur.r1.y,
            nx + nHalfW,
            next.r1.y,
            nx - nHalfW,
            next.l1.y,
            WET_HIGHLIGHT_COLOR,
          )
        }
      }

      // 中心虚线：缓存路径已烘焙进纹理；fallback 路径保留逐段绘制（与原行为一致）
      if (!useCache && shouldDrawCenterLine(k)) {
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
      // B7 起终点线（两条路径共享）：赛道起点段（wrappedIndex === 0，世界 z 起于每圈 0 处）且近处（k < 40）时，
      // 绘制黑白棋盘格横条——画在路面与中心虚线之上（后画覆盖），沿 z 方向覆盖约 1 个段长（200 单位）
      if (wrappedIndex === 0 && k < START_LINE_MAX_K) {
        this.drawStartLine(ctx, cur, next)
      }
      curveSum += segment.curve
    }
  }

  /** 缓存段绘制：按条带内段偏移切片 drawImage。drawImage 无透视变换，直道 strip 的横向截面
   *  不随 z 变化，以条带内插值近似透视即可还原逐段视觉；curve 仅造成中心线横向偏移
   *  （已由 cur/next 的横向插值体现），不扭曲横截面。近处大段细分 4 bands 缓解拉伸伪影。 */
  private drawCachedSegment(
    ctx: CanvasRenderingContext2D,
    cached: OffscreenCanvas,
    cur: Quad,
    next: Quad,
    segInStrip: number,
    stripLen: number,
  ): void {
    if (stripLen <= 0) {
      return
    }
    // 纹理中本段所在源矩形（每段固定像素高度，等比缩放至条带总高）
    const srcSegY = segInStrip * (cached.height / stripLen)
    const srcSegH = cached.height / stripLen
    // 投影中近处 y 更大（屏幕下方）、远处 y 更小，段高取正向差值
    const yNear = cur.l1.y
    const yFar = next.l1.y
    const segH = yNear - yFar
    if (segH <= 0) {
      return
    }
    // 近处大段细分绘制以缓解单段拉伸伪影，远处合并为单次 drawImage
    const bands = segH < 4 ? 1 : segH < 12 ? 2 : 4
    const wNear = cur.r2.x - cur.l2.x
    const wFar = next.r2.x - next.l2.x
    const cxNear = (cur.l2.x + cur.r2.x) * 0.5
    const cxFar = (next.l2.x + next.r2.x) * 0.5
    for (let b = 0; b < bands; b++) {
      const t0 = b / bands
      const t1 = (b + 1) / bands
      const tMid = (t0 + t1) * 0.5
      const y0 = yNear + segH * t0
      const y1 = yNear + segH * t1
      const w = wNear + (wFar - wNear) * tMid
      const cx = cxNear + (cxFar - cxNear) * tMid
      ctx.drawImage(cached, 0, srcSegY + srcSegH * t0, cached.width, srcSegH * (t1 - t0), cx - w * 0.5, y0, w, y1 - y0)
    }
  }

  /** 回退段绘制：路面 + 左右路缘三连 drawQuad（与原逐段绘制调用序列一致） */
  private drawFallbackSegment(
    ctx: CanvasRenderingContext2D,
    cur: Quad,
    next: Quad,
    colors: { road: string; side: string },
  ): void {
    drawQuad(ctx, cur.l1, cur.r1, next.r1, next.l1, colors.road)
    drawQuad(ctx, cur.l2, cur.l1, next.l1, next.l2, colors.side)
    drawQuad(ctx, cur.r1, cur.r2, next.r2, next.r1, colors.side)
  }

  /** 起终点线：黑白棋盘格横条（16 列 × 2 行，B7）。覆盖当前段整个路面宽度（l1↔r1）、
   *  沿 z 方向从近缘（cur）到远缘（next）1 个段长；全部由现有投影点线性插值得到，
   *  帧内零对象分配。画在路面与中心虚线之后（覆盖其上）。 */
  private drawStartLine(ctx: CanvasRenderingContext2D, cur: Quad, next: Quad): void {
    // 三条横向边界（近缘 / 中缝 / 远缘）的 y 与左/右 x（插值现有投影点）
    const y0 = cur.l1.y
    const y1 = (cur.l1.y + next.l1.y) * 0.5
    const y2 = next.l1.y
    const l0 = cur.l1.x
    const r0 = cur.r1.x
    const lm = (cur.l1.x + next.l1.x) * 0.5
    const rm = (cur.r1.x + next.r1.x) * 0.5
    const l2 = next.l1.x
    const r2 = next.r1.x
    for (let i = 0; i < START_GRID_COLS; i++) {
      const t0 = i / START_GRID_COLS
      const t1 = (i + 1) / START_GRID_COLS
      // 行 0（近半段）：近缘 ↔ 中缝
      const xL0 = l0 + (r0 - l0) * t0
      const xR0 = l0 + (r0 - l0) * t1
      const xLm = lm + (rm - lm) * t0
      const xRm = lm + (rm - lm) * t1
      fillQuadCoords(ctx, xL0, y0, xR0, y0, xRm, y1, xLm, y1, (i & 1) === 0 ? START_GRID_BLACK : START_GRID_WHITE)
      // 行 1（远半段）：中缝 ↔ 远缘（黑白反相，构成棋盘格）
      const xL2 = l2 + (r2 - l2) * t0
      const xR2 = l2 + (r2 - l2) * t1
      fillQuadCoords(ctx, xLm, y1, xRm, y1, xR2, y2, xL2, y2, (i & 1) === 0 ? START_GRID_WHITE : START_GRID_BLACK)
    }
  }

  /** 雨滴 overlay：双幅 drawImage 平铺离屏雨丝（最上层特效，忽略投影；
   *  yOffset 随 timeSec 以 600px/s 下落并环形回绕，保留原 -10 上移视觉语义） */
  private drawRain(timeSec: number, opts: ProjectionOptions): void {
    const { ctx } = this
    const rain = this.rainCanvas
    if (!rain) return
    const h = opts.height + 20
    const yOffset = ((timeSec * 600) % h) - 10
    // 双幅平铺覆盖 [yOffset - h, yOffset + h)，屏幕 [0, height] 恒被覆盖（环形回绕无缝）
    ctx.drawImage(rain, 0, yOffset - h)
    ctx.drawImage(rain, 0, yOffset)
  }

  /** 绘制车流（车身 + 车窗，远→近）；数据取自视图 v；night 时加车前灯光晕 */
  private drawTraffic(cameraZ: number, opts: ProjectionOptions, v: RenderView, night: boolean): void {
    const { ctx } = this
    for (const car of projectTraffic(v.traffic, cameraZ, this.camera.x, opts, this.camera)) {
      ctx.fillStyle = car.color
      ctx.fillRect(car.bottom.x - car.width / 2, car.top.y, car.width, car.height)
      ctx.fillStyle = '#1b2430'
      ctx.fillRect(car.bottom.x - car.width / 4, car.top.y + car.height * 0.3, car.width / 2, car.height * 0.4)
      if (night) {
        // 红色尾灯：车身下部（车头朝画面上方，车尾在下）双灯——cx ± width*0.3、宽 width*0.2、
        // 从 car.top.y + height*0.7 起高 height*0.25；day 渲染零新增
        ctx.fillStyle = '#ff3b30'
        ctx.fillRect(car.bottom.x - car.width * 0.3, car.top.y + car.height * 0.7, car.width * 0.2, car.height * 0.25)
        ctx.fillRect(car.bottom.x + car.width * 0.3, car.top.y + car.height * 0.7, car.width * 0.2, car.height * 0.25)
        // car 为 TrafficProjection（含原始车数据字段 car.car），shiftDir 取自车数据
        this.drawHeadlight(car.bottom.x, car.top.y, car.width, car.height, car.car.shiftDir)
      }
    }
  }

  /** 车前灯光晕（night 专用）：参考 drawLamp 双弧模式——外层半透明光晕 + 核心灯，位置在车头（画面上方）；
   *  steerDir 为车流避让变道方向（-1/0/1），核心灯与光晕随其横向偏移（模拟光束朝向变道侧，0 时与旧版逐字节一致） */
  private drawHeadlight(cx: number, topY: number, width: number, height: number, steerDir: -1 | 0 | 1): void {
    const { ctx } = this
    // 车头 = 车身上部（行驶方向朝画面上方），半径随投影宽（scale）缩放
    const hy = topY + height * 0.25
    const r = Math.max(width * 0.5, 2.5)
    // 核心灯偏移幅 0.35、外层光晕偏移幅 0.18（光晕扩散方向与核心一致、幅度更小）
    const coreX = cx + steerDir * width * 0.35
    const haloX = cx + steerDir * width * 0.18
    ctx.fillStyle = 'rgba(255, 235, 180, 0.35)'
    ctx.beginPath()
    ctx.arc(haloX, hy, r * 1.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffe08a'
    ctx.beginPath()
    ctx.arc(coreX, hy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 获取 rgba fillStyle 字符串：按 (r,g,b,a) 归一化键缓存。
   *  a 内部先 toFixed(3) 归一化：既与原模板字符串 `rgba(...)` 的渲染输出逐字节一致，
   *  又让连续浮点 alpha（每帧每粒子都不同）落入有限键空间，缓存才能真正命中。 */
  private getFillStyle(r: number, g: number, b: number, a: number): string {
    const aStr = a.toFixed(3)
    const key = `${r},${g},${b},${aStr}`
    let style = this._fillStyleCache.get(key)
    if (!style) {
      style = `rgba(${r}, ${g}, ${b}, ${aStr})`
      this._fillStyleCache.set(key, style)
      // 防止内存泄漏：限制缓存大小
      if (this._fillStyleCache.size > 1024) {
        this._fillStyleCache.clear()
      }
    }
    return style
  }

  /** 绘制漂移烟雾（近大远小，透明度随存活衰减） */
  private drawSmoke(smoke: SmokeParticle[], cameraZ: number, opts: ProjectionOptions): void {
    const { ctx } = this
    for (const p of projectSmoke(smoke, cameraZ, this.camera.x, opts, this.camera)) {
      ctx.fillStyle = this.getFillStyle(200, 200, 210, p.alpha)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** 绘制 BOOST 尾焰粒子（橙色系，透明度随存活 t/0.6 衰减；仿 smoke 投影，忽略横向偏移的相机对齐细节） */
  private drawBoostParticles(particles: BoostParticle[], cameraZ: number, opts: ProjectionOptions): void {
    const { ctx } = this
    for (const p of particles) {
      const dz = p.z - cameraZ
      if (dz <= 0) {
        continue
      }
      const proj = project(opts, this.camera, { x: p.x - this.camera.x, y: 0, z: p.z })
      if (!proj) {
        continue
      }
      const radius = Math.max(proj.scale * opts.height * 0.15, 2)
      const alpha = Math.max(1 - p.t / 0.6, 0)
      ctx.fillStyle = this.getFillStyle(255, 180, 80, alpha)
      ctx.beginPath()
      ctx.arc(proj.x, proj.y - radius * 0.5, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** 绘制路边景物（远→近）；数据取自视图 v；maxK 为降级后的可视段数（Task 9，视距 = maxK × SEGMENT_LENGTH） */
  private drawSprites(cameraZ: number, opts: ProjectionOptions, v: RenderView, maxK: number): void {
    const count = spritesInRangeIndexed(
      v.spriteIndex,
      v.track,
      cameraZ,
      maxK * SEGMENT_LENGTH,
      this.spriteScratch, // 复用数组：返回匹配数量，数组内容在下一次调用前有效
    )
    for (let i = count - 1; i >= 0; i--) {
      const sprite = this.spriteScratch[i]
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
