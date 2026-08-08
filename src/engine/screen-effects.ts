/** 屏幕特效模块（2026-08-05 从 Renderer 类提取）：速度线 / BOOST 金色 / 碰撞红色 vignette。
 *  均为纯函数（仅依赖 ctx 与 opts），帧内最上层轻量特效，不参与世界投影。 */
import type { ProjectionOptions } from './projection'

/** M8：速度线——速度 > 0.7×maxSpeed 时屏幕边缘 8 条径向条纹，alpha 0.0→0.6
 *  M20 P2/HUD-1：颜色从纯白 rgba(255,255,255,0.6) 改为淡蓝白 rgba(190,220,255,0.6)，
 *  降低突兀感（纯白在深色天空背景上视觉刺眼，淡蓝白更协调）；alpha 与 len 保持原值
 *  避免触发天空条纹 P0-1 回归断言（maxDelta<60）。
 *  M29 方案 12 二次打磨：新增 boosting 参数——BOOST 激活时速度线更长（len×1.6）、
 *  更亮（alpha×1.5）+ 金色（rgba(255,200,120)）叠加，强化「冲刺」的视觉冲刺感
 *  （研究报告「BOOST 激活时镜头轻微后拉」的低风险替代，不改变投影数学） */
export function drawSpeedLines(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  speedRatio: number,
  boosting = false,
): void {
  if (speedRatio <= 0.7) return
  const t = Math.min((speedRatio - 0.7) / 0.3, 1)
  const alpha = t * (boosting ? 0.9 : 0.6)
  const len = (40 + t * 40) * (boosting ? 1.6 : 1)
  ctx.lineWidth = 2
  const w = opts.width
  const h = opts.height
  const topXs = [w * 0.25, w * 0.5, w * 0.75]
  // 基础层：淡蓝白（与旧版一致，保证非 BOOST 场景零回归）
  ctx.strokeStyle = `rgba(190, 220, 255, ${alpha})`
  ctx.beginPath()
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
  // BOOST 强化层：金色叠加（alpha 减半避免刺眼；仅 BOOST 激活时绘制）
  if (boosting) {
    ctx.strokeStyle = `rgba(255, 200, 120, ${alpha * 0.5})`
    ctx.beginPath()
    for (const x of topXs) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, len * 0.7)
    }
    for (const x of topXs) {
      ctx.moveTo(x, h)
      ctx.lineTo(x, h - len * 0.7)
    }
    ctx.moveTo(0, h * 0.5)
    ctx.lineTo(len * 0.7, h * 0.5)
    ctx.moveTo(w, h * 0.5)
    ctx.lineTo(w - len * 0.7, h * 0.5)
    ctx.stroke()
  }
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

/**
 * M31 方案 12 三次打磨：碰撞白色闪帧——碰撞瞬间全屏短促白色闪（alpha = flash² × 0.18，
 * 碰撞初始 flash≈1 时约 0.18，随 flash 衰减快速消失），叠加在红色 vignette 之上增强「撞击感」
 * （研究报告「卡肉感」的低风险替代：不冻结帧/不影响 raceTime/bot 确定性，纯 Canvas 特效层）。
 * 触发式：flash<=0 不绘制；e2e 天空断言场景（普通 W 加速无碰撞）零影响。
 */
export function drawCollisionWhiteFlash(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  flash: number | undefined,
): void {
  if (!flash || flash <= 0) return
  const alpha = flash * flash * 0.18
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
  ctx.fillRect(0, 0, opts.width, opts.height)
}

/**
 * M23 方案 12：near-miss 屏幕边缘速度线脉冲——贴身超车触发瞬间屏幕四周短促
 * 白色速度线脉冲（脉冲强度 0-1 指数衰减，约 0.25s），叠加在既有速度线上强化「擦身而过」的冲击感。
 * 触发式短效反馈：非触发帧 pulse<=0 直接返回，不产生任何绘制（不影响 e2e 天空断言）。
 */
export function drawNearMissPulse(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  pulse: number | undefined,
): void {
  if (!pulse || pulse <= 0) return
  const t = Math.min(pulse, 1)
  const alpha = t * 0.75
  const len = 30 + t * 50
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
  ctx.lineWidth = 3
  ctx.beginPath()
  const w = opts.width
  const h = opts.height
  const topXs = [w * 0.18, w * 0.5, w * 0.82]
  for (const x of topXs) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, len)
    ctx.moveTo(x, h)
    ctx.lineTo(x, h - len)
  }
  ctx.moveTo(0, h * 0.5)
  ctx.lineTo(len, h * 0.5)
  ctx.moveTo(w, h * 0.5)
  ctx.lineTo(w - len, h * 0.5)
  ctx.stroke()
}

/**
 * M23 方案 12：完美氮气金色闪光 vignette——激活瞬间短促金色屏幕边缘闪光
 * （flash 0-1 指数衰减，约 0.3s），与普通 BOOST 金色暗角区分（持续 vs 脉冲）。
 * 触发式：flash<=0 不绘制。
 */
export function drawPerfectBoostFlash(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  flash: number | undefined,
): void {
  if (!flash || flash <= 0) return
  drawVignette(ctx, opts, 0.2, 255, 200, 60, 0.5 * Math.min(flash, 1))
}

/**
 * M23 方案 12：漂移小喷蓝色闪光 vignette——小喷（Mini-Turbo）触发瞬间短促蓝色
 * 屏幕边缘闪光（flash 0-1 指数衰减，约 0.3s），与漂移释放的「出弯喷发」爽感呼应。
 * 触发式：flash<=0 不绘制。
 */
export function drawMiniTurboFlash(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  flash: number | undefined,
): void {
  if (!flash || flash <= 0) return
  drawVignette(ctx, opts, 0.2, 80, 170, 255, 0.45 * Math.min(flash, 1))
}

/**
 * M23 方案 12：漂移得分浮动飘字——漂移得分累积到整数位变化时在玩家车辆上方
 * 弹出 "+N" 飘字（上浮渐隐，约 0.7s）。Canvas 最上层轻量绘制（不参与世界投影，
 * 不碰 DOM 布局），触发式短效：popup 非空且 t<1 时绘制，否则不产生任何像素。
 */
export interface DriftPopup {
  /** 弹出已持续时间（秒，0-0.7，推进/超期移除由调用方处理） */
  t: number
  /** 本段新增得分（整数，≥1 才生成飘字） */
  amount: number
  /** 玩家索引（1/2，分屏时定位各自屏幕区域；单屏恒 1）。可选：兼容 PlayerState 轻量状态。 */
  playerIndex?: 1 | 2
  /**
   * M29 方案 12 二次打磨：生成时的连击档位（0-10）——连击 ≥5 时飘字放大 1.35×
   * 且颜色从金色转橙色（COMBO_MULTIPLIER_STEP 高连击高亮），强化「连击成长」反馈。
   * 缺省 0（无连击）保持旧行为。
   */
  combo?: number
}
export function drawDriftPopup(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  popup: DriftPopup | undefined,
  viewX = 0,
  viewW = opts.width,
): void {
  if (!popup) return
  const life = 0.7
  const t = Math.min(popup.t / life, 1)
  const alpha = 1 - t
  if (alpha <= 0) return
  // M29 方案 12 二次打磨：连击 ≥5 时飘字放大（1 → 1.35）+ 橙色高亮（高连击成长反馈）
  const highCombo = (popup.combo ?? 0) >= 5
  const comboScale = highCombo ? 1.35 : 1
  // 上浮 28px + 轻微放大（1 → 1.15）+ 高连击额外放大
  const y = opts.horizon - 40 - t * 28
  const scale = (1 + t * 0.15) * comboScale
  const cx = viewX + viewW * 0.5
  ctx.save()
  ctx.translate(cx, y)
  ctx.scale(scale, scale)
  // 高连击更大字号（26px → 30px），低连击保持 26px
  ctx.font = `bold ${highCombo ? 30 : 26}px "Segoe UI", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 金色描边 + 白色填充（drift 主题色）；高连击转橙色（rgba(255,150,60)），上浮渐隐
  ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.8})`
  ctx.lineWidth = 4
  ctx.strokeText(`+${popup.amount}`, 0, 0)
  ctx.fillStyle = highCombo ? `rgba(255, 150, 60, ${alpha})` : `rgba(255, 205, 80, ${alpha})`
  ctx.fillText(`+${popup.amount}`, 0, 0)
  ctx.restore()
}
