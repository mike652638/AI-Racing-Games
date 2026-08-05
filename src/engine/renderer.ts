import { BOOST_PARTICLE_LIFETIME, RENDER_DEPTH_RATIO, RENDER_HORIZON_RATIO } from '../shared/constants'
import { clampSpriteScale, project, type Projected, type ProjectionOptions } from './projection'
import { SEGMENT_LENGTH, trackIndexForCameraZ, type Segment } from './track'
import { generateMountainProfile, parallaxOffset } from './scenery'
import {
  buildCurvePrefixSum,
  buildSpriteIndex,
  clampSpriteHeight,
  curveOffsetAtZ,
  spritesInRangeIndexed,
  type Sprite,
} from './sprites'
import { drawPlayerCar } from './player-car'
import type { TrafficCar } from './traffic'
import type { SmokeParticle } from '../physics/drift'
import { updateLighting, WEATHER_CYCLE_SECONDS, type LightingEnvironment } from './lighting'
import { mulberry32 } from './scenery'
import { getEnvironmentProfile } from './environment'
import { DRAW_DISTANCE } from './road-geometry'
import { projectSmoke } from './smoke-render'
import { renderRoadStripToCanvas, shadeColor, type RoadStrip } from './road-strip'
import { projectTraffic } from './traffic-render'
// 渲染关注点拆分模块（2026-08-05 renderer 瘦身：景物形状/屏幕特效/车流/地形/道路渲染各自独立）
import { drawBoostVignette, drawCollisionVignette, drawSpeedLines } from './screen-effects'
import { NO_STRIP, renderRoadSurface, drawDistanceFog, type RoadSurfaceResources } from './road-surface'
import { drawSingleTraffic } from './traffic-draw'
import { drawCactus, drawLamp, drawPalm, drawSnowpile, drawTree } from './sprite-draw'
import { drawTerrain } from './terrain-draw'

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
  /** 跳过玩家车辆精灵绘制（P0：渲染降级/非玩家车场景，缺省绘制） */
  skipPlayerCar?: boolean
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
  /** M17 环境场景（赛道级）：驱动天空/草地色相与远山配色；缺省 plains 与旧版一致 */
  environment?: LightingEnvironment
  /** BOOST 尾焰粒子（H2：game 层维护、渲染层投影，缺省无粒子） */
  boostParticles?: BoostParticle[]
  /** M8：当前玩家速度比（speed / maxSpeed），用于速度线 alpha 与显示阈值 */
  speedRatio?: number
  /** M8：BOOST 激活状态，用于金色 vignette 屏幕特效 */
  boosting?: boolean
  /** M16：碰撞红闪强度（0-1，碰撞后指数衰减），用于屏幕红色 vignette */
  collisionFlash?: number
  /** 玩家实时转向输入（-1..1，game 层 CarInput.steer 透传）：驱动车辆转向倾斜；
   *  缺省 undefined 时 drawPlayerCar 回退 laneOffset 推导（无延迟的即时响应） */
  steer?: number
  /** 2026-08-05 P2-5 玩家序号（1 | 2）：分屏 P2 时给玩家车传蓝色车身，与 HUD P1/P2
   *  标签语义一致，帮助双人分辨车辆归属；缺省 undefined（P1）走默认红色 */
  playerIndex?: 1 | 2
}

interface MountainLayer {
  profile: number[]
  factor: number
  color: string
  peak: number
  /** 离屏预渲染的山形位图 */
  offscreen: HTMLCanvasElement
}

/** 2026-08-05 P2-5 分屏 P2 玩家车车身主色/暗部（蓝色，与 HUD P1 黄 / P2 绿标签语义并列区分车辆归属） */
const P2_BODY_COLOR = '#2563eb'
const P2_BODY_DARK_COLOR = '#1e40af'

/** 雨滴数量（确定性生成，渲染时按 timeSec 下落） */
const RAIN_DROPS = 80

/** M18 仙人掌明暗：远处明暗分档的投影 scale 阈值（scale 小于该值视为远处，两档明暗） */
const CACTUS_SHADE_SCALE_THRESHOLD = 0.35
/** M18 仙人掌明暗：远处明暗亮度因子（shadeColor ×0.8 ≈ 变暗 20%，偏冷降饱和） */
const CACTUS_SHADE_FACTOR = 0.8

/** 雨丝倾斜角（B7 天气交互化）：固定 15° 风向感（弧度），预计算 sin/cos 供离屏预渲染复用 */
const RAIN_TILT = (15 * Math.PI) / 180
const RAIN_TILT_SIN = Math.sin(RAIN_TILT)
const RAIN_TILT_COS = Math.cos(RAIN_TILT)

/** BOOST 尾焰粒子投影复用缓冲（S 修复：循环内立即消费，复用安全） */
const _boostProj: Projected = { x: 0, y: 0, scale: 0 }
/** 景物底部投影复用缓冲（S 修复：drawSpriteProjected 内立即消费，复用安全） */
const _spriteProj: Projected = { x: 0, y: 0, scale: 0 }

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
    // 首尾闭环：视差平铺时 profile[0] 与 profile[length-1] 相邻绘制，
    // 右端点强制与左端点等高，消除双幅平铺接缝处的垂直台阶（P3 天空条纹）
    const value = x === layer.profile.length - 1 ? layer.profile[0] : layer.profile[x]
    ctx.lineTo(x, height - value * height)
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

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private opts: ProjectionOptions
  private camera = { x: 0, y: 1, z: 0 }
  private mountains: MountainLayer[]
  /** 夜晚模式的深色远山缓存（night 赛道用，避免每帧重建离屏位图） */
  private mountainsNight: MountainLayer[]
  /** M17 当前环境（懒重建远山缓存用：环境切换时才重建离屏位图，运行时零成本） */
  private currentEnv: LightingEnvironment = 'plains'
  /** 赛道曲率前缀和，用于 O(1) 查询累计曲率 */
  private curvePrefixSum: Float64Array
  /** 路边景物段索引（键 = floor(z / SEGMENT_LENGTH)），drawSprites 用 O(候选段数) 查询替代线性扫描 */
  private spriteIndex = new Map<number, Sprite[]>()
  /** 雨滴数据（构造时确定性生成，x 归一化 0-1） */
  private rainDrops: RainDrop[]
  /** 雨丝离屏缓存（F5）：预渲染全部 80 条雨丝，帧内双幅 drawImage 平铺替代逐段绘制 */
  private rainCanvas: HTMLCanvasElement | null = null
  /** 道路段离屏缓存：strip index → 预渲染 canvas（Task A 已激活：setTrack 预热，
   *  帧内以 drawImage 切片替代逐段 drawQuad）；渲染消费在 road-surface.ts */
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

  /** 分屏交界分隔线：4px 深色渐变（左右边缘柔化，视觉不生硬），覆盖两区域近处路缘石交错瑕疵。
   *  必须在 renderRegion 的 ctx.restore() 之后调用（transform 已复位，用全屏坐标）。 */
  drawDivider(x: number, width = 4): void {
    const { ctx } = this
    const cx = Math.round(x)
    const gradient = ctx.createLinearGradient(cx - width / 2, 0, cx + width / 2, 0)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.65)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(cx - width / 2, 0, width, this.opts.height)
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
    // M17：按环境懒重建远山离屏缓存（不同环境配色不同；切换赛道时重建一次，运行时稳定复用）
    const envForMountains = (view?.environment ?? 'plains') as LightingEnvironment
    if (envForMountains !== this.currentEnv) {
      this.currentEnv = envForMountains
      const env = getEnvironmentProfile(envForMountains)
      this.mountains = this.buildMountains(this.opts.width, env.mountainFar, env.mountainNear)
      this.mountainsNight = this.buildMountains(this.opts.width, env.mountainFarNight, env.mountainNearNight)
    }
    // 天气循环：晴/阴/雨三态各 45 秒循环（phase 0 晴 / 1 阴 / 2 雨，timeSec 为渲染用累计时间）
    const phase = Math.floor(timeSec / WEATHER_CYCLE_SECONDS) % 3
    const overcast = phase === 1
    const raining = phase === 2
    // 夜晚模式（赛道级）：view.night 缺省 false；夜晚锁定色板 + 深色远山 + 车灯
    const night = view?.night ?? false
    // M17：环境（缺省 plains 与旧版一致）驱动天空/草地色相
    const environment = view?.environment ?? 'plains'
    // M18：环境车灯配色（night 赛道可见；canyon 红棕暖光 / alpine 冷白，其余缺省默认色）
    const envProfile = getEnvironmentProfile(environment)
    const colors = updateLighting(timeSec, overcast, raining, night, environment)

    // 天空纵向渐变（P1）：skyTop → skyBottom 两段渐变填充至地平线，替代单色天空（消除山脊硬切感）；
    // 夜晚赛道锁定深暗色板，渐变仍保持暗色氛围（top 略亮、bottom 更暗）
    const skyGradient = ctx.createLinearGradient(0, 0, 0, opts.horizon)
    skyGradient.addColorStop(0, colors.skyTop)
    skyGradient.addColorStop(1, colors.skyBottom)
    ctx.fillStyle = skyGradient
    ctx.fillRect(0, 0, opts.width, opts.horizon)
    for (const layer of night ? this.mountainsNight : this.mountains) {
      drawMountainLayerCached(ctx, layer, cameraZ, opts)
    }
    ctx.fillStyle = colors.grass
    ctx.fillRect(0, opts.horizon, opts.width, opts.height - opts.horizon)
    // M17 地形装饰（沙漠沙丘/海岸海面/峡谷岩壁）：在草地层之上、道路之前绘制（俯视地面的远景纹理）
    // M18：传入累计时间 timeSec（海面波浪 y 随 time 轻微漂移；沙丘 sin 变形帧内零新建数组）
    drawTerrain(ctx, opts, environment, night, timeSec)

    const baseIndex = trackIndexForCameraZ(v.track, cameraZ)
    const baseZ = Math.floor(cameraZ / SEGMENT_LENGTH) * SEGMENT_LENGTH
    // 道路层：优先消费 roadStrip 离屏缓存（Task A 激活：每段切片 drawImage），
    // 缓存不可用时回退逐段 drawQuad；雨天 overlay / 起终点线 / 曲率累计两条路径共享
    const roadResources: RoadSurfaceResources = {
      cachedTrack: this.cachedTrack,
      roadStripCache: this.roadStripCache,
      stripForSegment: this.stripForSegment,
      roadStrips: this.roadStrips,
    }
    renderRoadSurface(ctx, opts, this.camera, roadResources, v.track, baseIndex, baseZ, cameraZ, maxK, raining)
    // 景物 + 车流合并景深绘制（2026-08-05 z-order 修复）：旧版先画全部景物再画全部车流，
    // 远处车永远覆盖近处树/路灯（不合常理）；改为按 z 降序交错绘制，近者正确遮挡远者
    this.drawWorldObjects(cameraZ, opts, v, maxK, night)
    // 距离大气透视（2026-08-05 道路平滑化）：远端路面/景物/车流渐融天空雾色，
    // 消除远端密集分段条纹与平板感；画在世界物体之上、烟雾/玩家车之下（近处不受影响）
    drawDistanceFog(ctx, opts, colors.skyBottom)
    if (!renderOpts?.skipSmoke) {
      this.drawSmoke(smoke, cameraZ, opts)
    }
    if (!renderOpts?.skipBoostParticles && v.boostParticles?.length) {
      this.drawBoostParticles(v.boostParticles, cameraZ, opts)
    }
    // 玩家车辆精灵（P0）：屏幕底部固定位置、不参与世界投影，画在路面/车流/烟雾/尾焰之上、雨层之前；
    // 横向偏移由 camera.x 提供；转向倾斜由 game 层实时 steer 输入驱动（缺省回退 laneOffset 推导，
    // 即按下转向键即刻倾斜、无需等待 laneOffset 累积）；
    // BOOST 提示复用 boostParticles 非空判定，并与 skipBoostParticles 联动（跳过 BOOST 特效时车尾尾焰一并跳过）
    if (!renderOpts?.skipPlayerCar) {
      drawPlayerCar(ctx, opts, {
        laneOffset: this.camera.x,
        night,
        boosting: !renderOpts?.skipBoostParticles && (v.boostParticles?.length ?? 0) > 0,
        steer: v.steer,
        // M18：碰撞边框闪白（collision-feedback 状态驱动，0-1 指数衰减）
        flash: v.collisionFlash,
        // M18：环境车灯配色（canyon 红棕 / alpine 冷白，其余 undefined 走默认黄白）
        headlightColor: envProfile.headlightColor,
        // 2026-08-05 P2-5：分屏 P2 传蓝色车身（#2563eb）区分归属；P1/单屏 undefined 走默认红
        bodyColor: v.playerIndex === 2 ? P2_BODY_COLOR : undefined,
        bodyDarkColor: v.playerIndex === 2 ? P2_BODY_DARK_COLOR : undefined,
      })
    }
    if (raining && !renderOpts?.skipRain) {
      this.drawRain(timeSec, opts)
    }
    // M8：速度线（高速感）与 BOOST 金色 vignette（激活时）——最上层轻量特效
    drawSpeedLines(ctx, opts, v.speedRatio ?? 0)
    drawBoostVignette(ctx, opts, v.boosting ?? false)
    // M16：碰撞红色 vignette——碰撞后屏幕边缘红闪，强度随速度比衰减
    drawCollisionVignette(ctx, opts, v.collisionFlash)
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
      const proj = project(opts, this.camera, { x: p.x - this.camera.x, y: 0, z: p.z }, _boostProj)
      if (!proj) {
        continue
      }
      const radius = Math.max(proj.scale * opts.height * 0.15, 2)
      const alpha = Math.max(1 - p.t / BOOST_PARTICLE_LIFETIME, 0)
      ctx.fillStyle = this.getFillStyle(255, 180, 80, alpha)
      ctx.beginPath()
      ctx.arc(proj.x, proj.y - radius * 0.5, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /** 绘制路边景物与车流的合并景深通道（2026-08-05）：两类世界物体各自投影后按 z 降序
   *  双指针归并绘制（画家算法）——近处树/路灯正确遮挡远处车流，远处车流不再覆盖近处景物。
   *  景物中心同时减去相机自身曲率偏移（坐标系修正）：路面渲染的曲率累计以相机为起点归零，
   *  curveOffsetAtZ 返回赛道绝对前缀和，不减相机偏移会在弯道上系统性漂移（实测最大 0.36 世界单位）。 */
  private drawWorldObjects(
    cameraZ: number,
    opts: ProjectionOptions,
    v: RenderView,
    maxK: number,
    night: boolean,
  ): void {
    const count = spritesInRangeIndexed(
      v.spriteIndex,
      v.track,
      cameraZ,
      maxK * SEGMENT_LENGTH,
      this.spriteScratch, // 复用数组：返回匹配数量，数组内容在下一次调用前有效
    )
    const cars = projectTraffic(v.traffic, cameraZ, this.camera.x, opts, this.camera)
    const camCurve = curveOffsetAtZ(v.track, v.curvePrefixSum, cameraZ)
    // spriteScratch 近→远（索引 0 最近），cars 远→近（索引 0 最远）；双指针从远端向近端归并
    let si = count - 1
    let ti = 0
    while (si >= 0 || ti < cars.length) {
      const spriteZ = si >= 0 ? this.spriteScratch[si].z : -Infinity
      const carZ = ti < cars.length ? cars[ti].car.z : -Infinity
      if (spriteZ >= carZ) {
        this.drawSpriteProjected(this.spriteScratch[si], opts, v, camCurve)
        si--
      } else {
        drawSingleTraffic(this.ctx, cars[ti], night)
        ti++
      }
    }
  }

  /** 单个景物投影绘制：中心线取相机相对累计曲率（与路面同坐标系），投影失败（相机后方）跳过 */
  private drawSpriteProjected(sprite: Sprite, opts: ProjectionOptions, v: RenderView, camCurve: number): void {
    const centerX = curveOffsetAtZ(v.track, v.curvePrefixSum, sprite.z) - camCurve
    const cx = centerX - this.camera.x
    const bottom = project(
      opts,
      this.camera,
      {
        x: cx + sprite.offset,
        y: 0,
        z: sprite.z,
      },
      _spriteProj,
    )
    if (!bottom) {
      return
    }
    // M18：精灵近距缩放上限（MAX_SPRITE_SCALE）——在精灵侧 clamp，路面投影数学不动
    const hpx = clampSpriteHeight(sprite.kind, sprite.height * clampSpriteScale(bottom.scale) * opts.height * 0.5)
    switch (sprite.kind) {
      case 'lamp':
        drawLamp(this.ctx, bottom.x, bottom.y, hpx)
        break
      case 'cactus': {
        // 仙人掌：矮柱 + 双臂，颜色随环境（沙漠灰绿）；scale 控制远处小仙人掌尺寸。
        // M18：按投影 scale 远近两档明暗——远档 shadeColor×0.8 偏暗冷（降饱和感）、近档原色；
        // treeColor 缺省时透传 undefined（drawCactus 内部回退默认色）
        const baseColor = sprite.treeColor
        const cactusColor =
          baseColor !== undefined && bottom.scale < CACTUS_SHADE_SCALE_THRESHOLD
            ? shadeColor(baseColor, CACTUS_SHADE_FACTOR)
            : baseColor
        drawCactus(this.ctx, bottom.x, bottom.y, hpx, cactusColor, sprite.scale)
        break
      }
      case 'palm':
        // 棕榈：弯曲树干 + 扇形冠（热带海岛/海岸）；rotation 随机化弯曲方向
        drawPalm(this.ctx, bottom.x, bottom.y, hpx, sprite.treeColor, sprite.treeColorLight, sprite.rotation)
        break
      case 'snowpile':
        // 雪堆：圆顶 + 树冠覆雪（山岳冷色）
        drawSnowpile(this.ctx, bottom.x, bottom.y, hpx, sprite.treeColor, sprite.treeColorLight)
        break
      case 'tree':
      default:
        // M17：环境树色由 sprite 携带（createRoadsideSprites 按 environment 注入），缺省回退内置色
        drawTree(this.ctx, bottom.x, bottom.y, hpx, sprite.treeColor, sprite.treeColorLight)
        break
    }
  }
}
