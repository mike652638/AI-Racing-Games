import { project, type Camera3D, type ProjectionOptions } from './projection'
import { SEGMENT_LENGTH, type Segment } from './track'
import { curveOffsetAtZ } from './sprites'

/**
 * M28 方案 10：导航辅助线（ideal racing line）——
 * 复用 bot 决策器的「沿道路中心线」理想走线语义，将前方道路中心线的屏幕轨迹
 * 投影为半透明引导线（青色），新手可开启辅助过弯，资深玩家关闭零视觉负担。
 *
 * 绘制策略：从玩家当前位置起，按定距采样前方道路中心点（曲率由 curveOffsetAtZ 计算），
 * 用 project 投影到屏幕并连成折线。投影数学与 road-strip/精灵共用同一 project（零新增投影逻辑）。
 * 近端保留（scale 大、视觉贴近路面），远端渐隐（超过 guideMaxZ 或 scale 过小即停止）。
 * 仅在 guideStrength > 0 时绘制（缺省关闭，不产生任何像素，不影响 e2e 视觉断言）。
 */

/** 引导线最大投影距离（世界单位）：按 DRAW_DISTANCE 段数 × 段长计算（渲染可视深度内） */
export const GUIDE_LINE_MAX_Z = 60 * SEGMENT_LENGTH
/** 引导线采样间距（世界单位）：投影点密度，越密曲线越平滑 */
const GUIDE_LINE_SAMPLE_STEP = 120
/** 引导线宽度（像素）：半透明粗线保证可见性但不遮挡路面细节（2026-08-08 实测：4→5 增强远端可辨性） */
const GUIDE_LINE_WIDTH = 5
/** 引导线基础颜色：青色（与天气徽章同色系，区别于漂移橙色/碰撞红色） */
const GUIDE_LINE_RGB = '0, 217, 255'

/**
 * 绘制导航辅助线（纯函数，无副作用——不修改任何状态，仅消费 ctx）。
 * @param ctx Canvas 2D 上下文
 * @param opts 投影选项（宽/高/地平线/深度）
 * @param camera 当前相机（x/z 为玩家位置）
 * @param track 赛道段列表
 * @param curvePrefixSum 曲率前缀和（curveOffsetAtZ 的 O(1) 查询表，缺省时动态计算慢路径——正常路径总是传入）
 * @param strength 引导线强度（0-1）：>0 时绘制；控制 alpha（近端 0.55×strength → 远端 0）
 */
export function drawGuideLine(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  camera: Camera3D,
  track: Segment[],
  curvePrefixSum: Float64Array,
  strength: number,
): void {
  if (!strength || strength <= 0 || track.length === 0) {
    return
  }
  // 近端起点：对齐当前段起点（避免从相机正下方画导致投影 y 异常）
  const startZ = Math.floor(camera.z / SEGMENT_LENGTH) * SEGMENT_LENGTH
  const samples: Array<{ x: number; y: number; t: number }> = []
  // 采样点（每步 GUIDE_LINE_SAMPLE_STEP 世界单位，最多 ceil(GUIDE_LINE_MAX_Z/step) 个）
  for (let z = startZ; z <= camera.z + GUIDE_LINE_MAX_Z; z += GUIDE_LINE_SAMPLE_STEP) {
    const centerOffset = curveOffsetAtZ(track, curvePrefixSum, z)
    // 引导线沿道路中心线走（世界坐标 x = 中心线曲率偏移，y=0 地面平面）
    const p = project(opts, camera, { x: centerOffset, y: 0, z })
    if (p && p.scale > 0.01) {
      samples.push({ x: p.x, y: p.y, t: (z - startZ) / GUIDE_LINE_MAX_Z })
    }
  }
  if (samples.length < 2) {
    return
  }
  ctx.save()
  ctx.lineWidth = GUIDE_LINE_WIDTH
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // 近端实、远端虚：用逐段 alpha 模拟（近端 0.5×strength → 远端 0），每段独立 path
  // 2026-08-08 实测：近端 alpha 0.55→0.5，避免近端接近实心压过路面纹理
  const firstAlpha = 0.5 * strength
  for (let i = 0; i < samples.length - 1; i++) {
    const a = firstAlpha * (1 - samples[i].t)
    ctx.strokeStyle = `rgba(${GUIDE_LINE_RGB}, ${a.toFixed(3)})`
    ctx.beginPath()
    ctx.moveTo(samples[i].x, samples[i].y)
    ctx.lineTo(samples[i + 1].x, samples[i + 1].y)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * M28 方案 9 深化（视觉分叉渲染）：岔路选择时在道路末端渲染左/右两条分叉引导带——
 * OutRun 标志性的「前方分叉路」视觉：从当前段道路中心线末端开始，左/右分支分别
 * 以目标曲率偏移向两侧弯曲延伸，投影为两条半透明彩色「路面条带」（粗 stroke 模拟路面
 * + 亮色描边）。仅在 routeFork.active 时绘制（缺省关闭，不影响 e2e 视觉断言）。
 */

/** 分叉引导带长度（世界单位）：从分叉点延伸到可视深度中段（视觉清晰且不刺眼） */
export const ROUTE_FORK_LENGTH = 60 * SEGMENT_LENGTH
/** 分叉引导带采样间距（世界单位） */
const ROUTE_FORK_SAMPLE_STEP = 120
/** 分叉引导带「路面」宽度（像素，粗 stroke 模拟路面） */
const ROUTE_FORK_ROAD_WIDTH = 28
/** 分叉引导带描边宽度（像素，亮色边线） */
const ROUTE_FORK_EDGE_WIDTH = 3
/** 分叉起始偏移：从道路中心线末端向前一段距离才分叉（避免贴脸突兀） */
const ROUTE_FORK_START_DELAY = 8 * SEGMENT_LENGTH

/** 分叉渲染参数（RenderView.routeFork 消费） */
export interface RouteFork {
  /** 是否激活（岔路选择中） */
  active: boolean
  /** 左/右分支名称（屏幕角落提示；空串隐藏） */
  leftName: string
  rightName: string
  /** 左/右分支目标横向偏移（世界单位，正 = 右；分叉方向由符号决定） */
  leftOffset: number
  rightOffset: number
}

/** 绘制左/右分支引导带（纯函数，无副作用） */
function drawForkBranch(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  camera: Camera3D,
  track: Segment[],
  curvePrefixSum: Float64Array,
  forkZ: number,
  dirOffset: number,
  rgb: string,
  alpha: number,
): void {
  const samples: Array<{ x: number; y: number }> = []
  for (let z = forkZ; z <= forkZ + ROUTE_FORK_LENGTH; z += ROUTE_FORK_SAMPLE_STEP) {
    // 分支中心：当前道路中心 + 按距离线性插值到目标分叉偏移。
    // 修复：不再叠加 baseCenter——curveOffsetAtZ(z) 已返回 z 处道路中心线的**绝对**曲率偏移
    // （自赛道起点累计，forkZ 处即等于 baseCenter），再叠加 baseCenter 会双重计入绝对偏移
    // （弯道处分支被错误地多偏移一个 baseCenter）。去掉后分支在 forkZ 起点仍对齐 baseCenter
    // （curveOffsetAtZ(forkZ) === baseCenter），直道（曲线=0）从 0 出发、弯道沿中心线正确跟随。
    const progress = (z - forkZ) / ROUTE_FORK_LENGTH
    const centerOffset = curveOffsetAtZ(track, curvePrefixSum, z) + dirOffset * Math.min(progress, 1)
    const p = project(opts, camera, { x: centerOffset, y: 0, z })
    if (p && p.scale > 0.01) {
      samples.push({ x: p.x, y: p.y })
    }
  }
  if (samples.length < 2) {
    return
  }
  // 路面（粗 stroke）+ 亮色描边
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = `rgba(${rgb}, ${alpha})`
  ctx.lineWidth = ROUTE_FORK_ROAD_WIDTH
  ctx.beginPath()
  ctx.moveTo(samples[0].x, samples[0].y)
  for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i].x, samples[i].y)
  ctx.stroke()
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.7})`
  ctx.lineWidth = ROUTE_FORK_EDGE_WIDTH
  ctx.stroke()
  ctx.restore()
}

/**
 * 绘制分叉引导带（routeFork.active 时调用）。
 * @param routeFork 分叉参数（名称/偏移）
 * @param forkAlpha 整体透明度（0-1，缺省 1；动画淡入用）
 */
export function drawRouteFork(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  camera: Camera3D,
  track: Segment[],
  curvePrefixSum: Float64Array,
  routeFork: RouteFork | undefined,
  forkAlpha = 1,
): void {
  if (!routeFork || !routeFork.active || track.length === 0 || forkAlpha <= 0) {
    return
  }
  // 分叉起点：相机前方 ROUTE_FORK_START_DELAY（道路末端在相机前方，从道路尾端开始分叉）
  const forkZ = camera.z + ROUTE_FORK_START_DELAY
  // 左分支（偏移向左 → 负）、右分支（偏移向右 → 正）；颜色：左青右橙（与 UI 按钮配色一致）
  drawForkBranch(
    ctx,
    opts,
    camera,
    track,
    curvePrefixSum,
    forkZ,
    -Math.abs(routeFork.leftOffset),
    '0, 217, 255',
    0.7 * forkAlpha,
  )
  drawForkBranch(
    ctx,
    opts,
    camera,
    track,
    curvePrefixSum,
    forkZ,
    Math.abs(routeFork.rightOffset),
    '255, 160, 60',
    0.7 * forkAlpha,
  )
}
