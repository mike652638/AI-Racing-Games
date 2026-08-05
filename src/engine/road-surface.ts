/** 道路渲染模块（2026-08-05 从 Renderer 类提取）：道路段渲染（roadStrip 离屏缓存路径 /
 *  逐段 drawQuad 回退路径 / 雨天湿滑 overlay / 起终点线）。
 *  纯函数：ctx/opts/camera 与缓存资源显式传入，不反向依赖 Renderer（避免环）。 */
import { project, type Camera3D, type Projected, type ProjectionOptions } from './projection'
import { SEGMENT_LENGTH, type Segment } from './track'
import { projectSegmentQuad, roadColors, shouldDrawCenterLine, type Quad } from './road-geometry'
import { shadeColor, type RoadStrip } from './road-strip'

/** stripForSegment 的"无映射"哨兵（Uint16Array 默认值 0 可能被误判为 strip 0，故用 0xFFFF） */
export const NO_STRIP = 0xffff

/** B7 雨天湿滑路面：整段暗色压暗叠加色 + 近处中心高光反光条（路面宽 35% 的半宽系数 0.175） */
const WET_OVERLAY_COLOR = 'rgba(10, 15, 30, 0.15)'
const WET_HIGHLIGHT_COLOR = 'rgba(180, 200, 230, 0.08)'
const WET_HIGHLIGHT_MAX_K = 30

/** B7 起终点线：赛道起点段（wrappedIndex === 0）近处（k < 40）绘制 16 列 × 2 行黑白棋盘格横条 */
const START_GRID_COLS = 16
const START_LINE_MAX_K = 40
const START_GRID_BLACK = '#000000'
const START_GRID_WHITE = '#ffffff'

/** M18 路缘柔和过渡：内侧暗色分隔线亮度因子（shadeColor(路缘色, 1-0.25)，形成"阴影"） */
const CURB_SHADOW_FACTOR = 0.75
/** M18 路缘柔和过渡：外侧高光条亮度因子（shadeColor(路缘色, 1+0.15)，形成"高光"） */
const CURB_HIGHLIGHT_FACTOR = 1.15
/** M18 路缘柔和过渡：分隔线/高光条的屏幕像素宽度 */
const CURB_DETAIL_PX = 2
/** M18 路缘柔和过渡：路缘屏幕宽度小于该值跳过细节（远端压缩段不可见，同时控制每帧成本） */
const CURB_DETAIL_MIN_WIDTH = 6

/**
 * 道路段投影复用缓冲（S 修复：消除 renderRoadSurface 主循环每帧 ~1200 个对象分配）。
 * 循环内 cur/next 两段投影与中心线投影均为「同一迭代内立即消费」的同步写入，
 * 模块级复用缓冲安全（渲染单线程同步执行；分屏两区域先后调用互不冲突）。
 */
const _quadCur: Quad = {
  l1: { x: 0, y: 0, scale: 0 },
  l2: { x: 0, y: 0, scale: 0 },
  r1: { x: 0, y: 0, scale: 0 },
  r2: { x: 0, y: 0, scale: 0 },
}
const _quadNext: Quad = {
  l1: { x: 0, y: 0, scale: 0 },
  l2: { x: 0, y: 0, scale: 0 },
  r1: { x: 0, y: 0, scale: 0 },
  r2: { x: 0, y: 0, scale: 0 },
}
const _centerProj: Projected = { x: 0, y: 0, scale: 0 }

/** 道路段缓存资源（由 Renderer 持有并传入，本模块不感知 Renderer 内部实现） */
export interface RoadSurfaceResources {
  /** 缓存消费对应的赛道引用（setTrack 时赋值；视图 track 与之同引用且缓存非空才走缓存路径） */
  cachedTrack: Segment[] | null
  /** strip index → 预渲染 canvas（setTrack 预热，帧内以 drawImage 切片替代逐段 drawQuad） */
  roadStripCache: Map<number, OffscreenCanvas>
  /** 段索引 → strip 索引映射（NO_STRIP 哨兵 = 无映射；长度与缓存赛道段数一致，用作缓存有效性判定） */
  stripForSegment: Uint16Array
  /** 最近一次 setTrack 传入的道路段列表（缓存路径的 strip 数据源） */
  roadStrips: RoadStrip[]
}

/** 线性插值（fallback 段路面横向渐变分带用，帧内零分配） */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
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

/** 道路层渲染（Task A 激活缓存消费）：优先消费 roadStrip 离屏缓存（每段切片 drawImage，
 *  中心虚线已烘焙进纹理），缓存不可用时回退逐段 drawQuad（路面 + 双路缘 + 中心虚线）。
 *  雨天湿滑 overlay、起终点线、曲率累计为两条路径共享，保持原渲染顺序不变。
 *  帧内零新建数组。 */
export function renderRoadSurface(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  camera: Camera3D,
  resources: RoadSurfaceResources,
  track: Segment[],
  baseIndex: number,
  baseZ: number,
  cameraZ: number,
  maxK: number,
  raining: boolean,
): void {
  // 缓存消费激活条件：视图赛道与缓存赛道同引用、缓存非空、段映射长度匹配
  // （setTrack 不带 roadStrips 时映射置空作废，避免误用旧赛道缓存）
  const useCache =
    track === resources.cachedTrack &&
    resources.roadStripCache.size > 0 &&
    resources.stripForSegment.length === track.length
  let curveSum = 0
  for (let k = 0; k < maxK; k++) {
    const z = baseZ + k * SEGMENT_LENGTH
    if (z <= cameraZ) {
      continue
    }
    const wrappedIndex = (baseIndex + k) % track.length
    const segment = track[wrappedIndex]
    // S 修复：复用模块级缓冲，主循环零对象分配（project 写入 _quadCur/_quadNext 槽位）
    const cur = projectSegmentQuad(opts, camera, z, curveSum, _quadCur)
    const next = projectSegmentQuad(opts, camera, z + SEGMENT_LENGTH, curveSum + segment.curve, _quadNext)
    if (!cur || !next) {
      continue
    }
    const colors = roadColors(baseIndex + k)

    // 缓存路径：段级切片 drawImage（路面/路缘/中心虚线已烘焙）；miss/无映射时回退逐段 drawQuad
    let drawn = false
    if (useCache && wrappedIndex < resources.stripForSegment.length) {
      const stripIdx = resources.stripForSegment[wrappedIndex]
      const cached = stripIdx === NO_STRIP ? undefined : resources.roadStripCache.get(stripIdx)
      if (cached) {
        const strip = resources.roadStrips[stripIdx]
        // 防御性校验：映射段必须落在 strip 段范围内（stripForSegment 按 min(endSeg, length) 填充，正常必然成立）
        if (wrappedIndex >= strip.startSeg && wrappedIndex < strip.endSeg) {
          drawCachedSegment(ctx, cached, cur, next, wrappedIndex - strip.startSeg, strip.endSeg - strip.startSeg)
          drawn = true
        }
      }
    }
    if (!drawn) {
      drawFallbackSegment(ctx, cur, next, colors)
    }

    // M18 路缘柔和过渡：内侧暗色分隔线 + 外侧高光条（"高光-主体-阴影"立体感）。
    // 屏幕空间 2px 细分、随投影距离自动跳过（远端压缩段不可见）；缓存切片与逐段回退两条路径共享
    // （在道路层之上叠加，不影响既有纹理烘焙布局），弯道/直道一致生效
    drawCurbDetail(ctx, cur, next, colors)

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
      // S 修复：复用模块级缓冲（z 恒 > cameraZ，投影必成功）
      const centerProj = project(opts, camera, { x: curveSum, y: 0, z }, _centerProj)
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
      drawStartLine(ctx, cur, next)
    }
    curveSum += segment.curve
  }
}

/** 缓存段绘制：按条带内段偏移切片 drawImage。drawImage 无透视变换，直道 strip 的横向截面
 *  不随 z 变化，以条带内插值近似透视即可还原逐段视觉；curve 仅造成中心线横向偏移
 *  （已由 cur/next 的横向插值体现），不扭曲横截面。近处大段细分 4 bands 缓解拉伸伪影。 */
function drawCachedSegment(
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
  // 近处大段细分绘制以缓解单段拉伸伪影，远处合并为单次 drawImage；
  // 2026-08-05：极高段（>32px）提升至 8 bands，近景透视渐变更平滑
  const bands = segH < 4 ? 1 : segH < 12 ? 2 : segH < 32 ? 4 : 8
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

/** 回退段绘制：路面（中央亮/边缘暗 3 带横向渐变）+ 左右路缘。
 *  与缓存纹理的横向渐变视觉一致（fallback 仅为缓存不可用时的降级，三带近似足够）。
 *  保持原有调用序列（先路面后双路缘），fill/quad 计数与原实现一致（路面 3 次 → 与原 1 次等价结构）。 */
function drawFallbackSegment(
  ctx: CanvasRenderingContext2D,
  cur: Quad,
  next: Quad,
  colors: { road: string; side: string },
): void {
  // 路面按横向 3 带渐变：边缘暗(0.97) → 中央亮(1.02) → 边缘暗(0.97)
  const bands = [
    { t0: 0, t1: 0.22, factor: 0.97 },
    { t0: 0.22, t1: 0.78, factor: 1.02 },
    { t0: 0.78, t1: 1, factor: 0.97 },
  ]
  for (const band of bands) {
    const lx0 = lerp(cur.l1.x, cur.r1.x, band.t0)
    const lx1 = lerp(cur.l1.x, cur.r1.x, band.t1)
    const nx0 = lerp(next.l1.x, next.r1.x, band.t0)
    const nx1 = lerp(next.l1.x, next.r1.x, band.t1)
    fillQuadCoords(
      ctx,
      lx0,
      cur.l1.y,
      lx1,
      cur.r1.y,
      nx1,
      next.r1.y,
      nx0,
      next.l1.y,
      shadeColor(colors.road, band.factor),
    )
  }
  // 左/右路缘
  drawQuad(ctx, cur.l2, cur.l1, next.l1, next.l2, colors.side)
  drawQuad(ctx, cur.r1, cur.r2, next.r2, next.r1, colors.side)
}

/** M18 路缘柔和过渡：左右路缘各绘制内侧暗色分隔线 + 外侧高光条。
 *  左路缘外缘 l2 / 内缘 l1；右路缘外缘 r2 / 内缘 r1（内缘贴路面）。 */
function drawCurbDetail(ctx: CanvasRenderingContext2D, cur: Quad, next: Quad, colors: { side: string }): void {
  drawCurbSide(ctx, cur.l2, cur.l1, next.l1, next.l2, colors.side)
  drawCurbSide(ctx, cur.r2, cur.r1, next.r1, next.r2, colors.side)
}

/** 单个路缘的立体感细节：以内缘/外缘投影点为基准，按屏幕像素宽取 2px 细分（近/远缘独立插值）。
 *  帧内零对象分配；复用 shadeColor 纯函数派生色（不引入新色值）；近缘宽度不足时自动跳过。 */
function drawCurbSide(
  ctx: CanvasRenderingContext2D,
  outerNear: Projected,
  innerNear: Projected,
  innerFar: Projected,
  outerFar: Projected,
  sideColor: string,
): void {
  // 同 z 的投影点 y 相等（平地），路缘屏幕宽度即横向差
  const wn = Math.abs(outerNear.x - innerNear.x)
  const wf = Math.abs(outerFar.x - innerFar.x)
  if (Math.min(wn, wf) < CURB_DETAIL_MIN_WIDTH) {
    return
  }
  const tNear = CURB_DETAIL_PX / wn
  const tFar = CURB_DETAIL_PX / wf
  // 内侧暗色分隔线（贴路面 2px，阴影）
  fillQuadCoords(
    ctx,
    innerNear.x,
    innerNear.y,
    innerNear.x + (outerNear.x - innerNear.x) * tNear,
    innerNear.y,
    innerFar.x + (outerFar.x - innerFar.x) * tFar,
    innerFar.y,
    innerFar.x,
    innerFar.y,
    shadeColor(sideColor, CURB_SHADOW_FACTOR),
  )
  // 外侧高光条（外缘 2px，高光）
  fillQuadCoords(
    ctx,
    outerNear.x,
    outerNear.y,
    outerNear.x + (innerNear.x - outerNear.x) * tNear,
    outerNear.y,
    outerFar.x + (innerFar.x - outerFar.x) * tFar,
    outerFar.y,
    outerFar.x,
    outerFar.y,
    shadeColor(sideColor, CURB_HIGHLIGHT_FACTOR),
  )
}

/** 起终点线：黑白棋盘格横条（16 列 × 2 行，B7）。覆盖当前段整个路面宽度（l1↔r1）、
 *  沿 z 方向从近缘（cur）到远缘（next） 1 个段长；全部由现有投影点线性插值得到，
 *  帧内零对象分配。画在路面与中心虚线之后（覆盖其上）。 */
function drawStartLine(ctx: CanvasRenderingContext2D, cur: Quad, next: Quad): void {
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

/** 距离大气透视（2026-08-05 道路平滑化）：地平线向下的一段垂直渐变雾霾层——
 *  远端路面/景物/车流渐融入天空雾色，消除远端分段压缩形成的密集条纹（摩尔纹）
 *  与"远端对比度与近处一致"的平板感，增强纵深与真实感。
 *  仅覆盖地面顶部 fogBandRatio 区域（近处在下方，不受影响）。纯函数，帧内一次渐变填充。 */
export function drawDistanceFog(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  skyBottom: string,
  fogBandRatio = 0.42,
): void {
  const bandH = (opts.height - opts.horizon) * fogBandRatio
  if (bandH <= 0) {
    return
  }
  const g = ctx.createLinearGradient(0, opts.horizon, 0, opts.horizon + bandH)
  g.addColorStop(0, hslWithAlpha(skyBottom, 0.55))
  g.addColorStop(0.55, hslWithAlpha(skyBottom, 0.2))
  g.addColorStop(1, hslWithAlpha(skyBottom, 0))
  ctx.fillStyle = g
  ctx.fillRect(0, opts.horizon, opts.width, bandH)
}

/** 'hsl(h, s%, l%)' → 'hsla(h, s%, l%, a)'；updateLighting 恒输出 hsl()，非 hsl 格式防御性原样返回 */
function hslWithAlpha(hslColor: string, alpha: number): string {
  if (!hslColor.startsWith('hsl(')) {
    return hslColor
  }
  return `hsla(${hslColor.slice(4, -1)}, ${alpha})`
}
