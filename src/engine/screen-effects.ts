/** 屏幕特效模块（2026-08-05 从 Renderer 类提取）：速度线 / BOOST 金色 / 碰撞红色 vignette。
 *  均为纯函数（仅依赖 ctx 与 opts），帧内最上层轻量特效，不参与世界投影。 */
import type { ProjectionOptions } from './projection'

/** M8：速度线——速度 > 0.7×maxSpeed 时屏幕边缘 8 条径向条纹，alpha 0.0→0.6
 *  M20 P2/HUD-1：颜色从纯白 rgba(255,255,255,0.6) 改为淡蓝白 rgba(190,220,255,0.6)，
 *  降低突兀感（纯白在深色天空背景上视觉刺眼，淡蓝白更协调）；alpha 与 len 保持原值
 *  避免触发天空条纹 P0-1 回归断言（maxDelta<60） */
export function drawSpeedLines(ctx: CanvasRenderingContext2D, opts: ProjectionOptions, speedRatio: number): void {
  if (speedRatio <= 0.7) return
  const t = Math.min((speedRatio - 0.7) / 0.3, 1)
  const alpha = t * 0.6
  const len = 40 + t * 40
  ctx.strokeStyle = `rgba(190, 220, 255, ${alpha})`
  ctx.lineWidth = 2
  ctx.beginPath()
  const w = opts.width
  const h = opts.height
  const topXs = [w * 0.25, w * 0.5, w * 0.75]
  for (const x of topXs) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, len)
  }
  for (const x of topXs) {
    ctx.moveTo(x, h)
    ctx.lineTo(x, h - len)
  }
  ctx.moveTo(0, h * 0.5)
  ctx.lineTo(len, h * 0.5)
  ctx.moveTo(w, h * 0.5)
  ctx.lineTo(w - len, h * 0.5)
  ctx.stroke()
}

/** 径向 vignette 工厂（R6 重复逻辑收敛）：BOOST 金色 / 碰撞红色共用——屏幕四角暗角
 *  （内圈透明 → 外圈指定色 alpha）。参数：内圈半径比例（相对短边）与外圈颜色 RGB + alpha。 */
function drawVignette(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  r1Ratio: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
): void {
  const cx = opts.width * 0.5
  const cy = opts.height * 0.5
  const r1 = Math.min(opts.width, opts.height) * r1Ratio
  const r2 = Math.max(opts.width, opts.height) * 0.85
  const grad = ctx.createRadialGradient(cx, cy, r1, cx, cy, r2)
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${alpha})`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, opts.width, opts.height)
}

/** M8：BOOST 金色 vignette——激活时屏幕四角径向渐变暗角，alpha 0.4 */
export function drawBoostVignette(ctx: CanvasRenderingContext2D, opts: ProjectionOptions, boosting: boolean): void {
  if (!boosting) return
  drawVignette(ctx, opts, 0.25, 255, 180, 80, 0.4)
}

/** M16：碰撞红色 vignette——碰撞后 0.35s 屏幕边缘红色暗角，强度随 flash 衰减（0-1），
 *  alpha = 0.45 × flash（高速撞击更明显）；与 BOOST 金色 vignette 同屏共存时红色优先感知 */
export function drawCollisionVignette(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  flash: number | undefined,
): void {
  if (!flash || flash <= 0) return
  drawVignette(ctx, opts, 0.35, 255, 40, 40, 0.45 * flash)
}
