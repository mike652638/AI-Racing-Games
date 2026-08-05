import type { ProjectionOptions } from './projection'

/** 玩家车绘制选项（纯数据；玩家车为屏幕底部固定精灵，不参与世界投影） */
export interface PlayerCarOptions {
  /** 横向偏移（世界单位，来自 camera.x / laneOffset），0 = 赛道中央 */
  laneOffset?: number
  /** 转向输入（-1..1，用于车身倾斜；缺省由 laneOffset 推导） */
  steer?: number
  /** 夜间模式：车头双灯 + 光晕 + 近端路面光柱 */
  night?: boolean
  /** BOOST 激活：车尾橙色尾焰提示 */
  boosting?: boolean
  /** M18 碰撞边框闪白强度（0-1，collision-feedback 驱动；0 或省略 = 不绘制）。
   *  已落地（M16 设计意图）：flash>0 时车身外描边，色随强度白→红插值，线宽 3px */
  flash?: number
  /** M18 环境车灯配色（night 模式车头核心灯色；缺省默认黄白 #ffe08a；
   *  canyon 红棕暖光 / alpine 冷白由 renderer 按环境传入） */
  headlightColor?: string
}

/** 玩家车高度占屏幕高度比例（任务 P0：15-20%） */
export const PLAYER_CAR_HEIGHT_RATIO = 0.19
/** 车身宽高比（宽 / 高） */
const PLAYER_CAR_ASPECT = 0.82
/** 车底距屏幕底部的空隙（占屏幕高度比例，位置"底部中央偏下"） */
const PLAYER_CAR_BOTTOM_GAP_RATIO = 0.05
/** 最大倾斜角（度，任务：±5° 左右） */
const PLAYER_CAR_MAX_TILT_DEG = 5
/** 横向偏移映射系数（世界单位 → 像素：laneOffset × height × 系数） */
const LANE_OFFSET_PX_FACTOR = 0.2
/** 车身主色（红色，参考 road-geometry 路缘配色 #d03030） */
const BODY_COLOR = '#d8382f'
/** 车身下缘暗部（底盘阴影） */
const BODY_DARK_COLOR = '#9c1f18'
/** 车窗色 */
const WINDOW_COLOR = '#1b2430'
/** 车轮色 */
const WHEEL_COLOR = '#14171c'
/** 车头灯外层光晕 / 核心（配色参考 drawHeadlight；UX-9 修复 2026-08-05：光晕 alpha 0.35→0.25，
 * 半径倍率 1.6→1.25，防大团光晕笼罩车体影响辨识） */
const HEADLIGHT_HALO = 'rgba(255, 235, 180, 0.25)'
const HEADLIGHT_CORE = '#ffe08a'
/** 碰撞边框闪白：白色端点（flash=0 时纯白）与红色端点（flash=1 时纯红，与 M16 碰撞红闪同理念） */
const FLASH_WHITE_RGB = { r: 255, g: 255, b: 255 }
const FLASH_RED_RGB = { r: 255, g: 80, b: 60 }
/** 碰撞边框描边线宽（px） */
const FLASH_LINE_WIDTH = 3
/** BOOST 车尾尾焰色 */
const BOOST_FLAME_COLOR = 'rgba(255, 180, 80, 0.85)'
/** 夜间光柱合成模式与填充色（lighter 加亮近端路面） */
const BEAM_COMPOSITE = 'lighter'
const BEAM_COLOR = 'rgba(255, 235, 180, 0.18)'
/** 尾翼色（深红，与车身主色 #d8382f 区分但协调，OutRun 风格车顶横条） */
export const WING_COLOR = '#7a1510'
/** 前挡风反光（浅蓝白半透明横条，模拟天空/云反光，仅渲染层细节） */
export const WINDOW_SHINE = 'rgba(140, 170, 200, 0.35)'
/** 尾灯条色（白天可见细节；夜间与车头光效共存，理念与夜间尾灯一致：车尾朝下） */
export const TAILLIGHT_COLOR = '#ff4a3d'
/** 车牌色（浅米白） */
export const PLATE_COLOR = '#f0e8d8'

/** 将玩家车世界横向偏移（laneOffset）映射为屏幕像素偏移，并 clamp 到画面内 */
export function laneOffsetToPx(laneOffset: number, opts: ProjectionOptions, carWidth: number): number {
  const maxShift = Math.max(0, opts.width / 2 - carWidth / 2 - 4)
  const raw = laneOffset * opts.height * LANE_OFFSET_PX_FACTOR
  return Math.max(-maxShift, Math.min(maxShift, raw))
}

/** 绘制玩家车辆精灵：屏幕底部固定位置（不参与世界投影）、随 laneOffset 横向平移、
 *  按 steer 倾斜（save/rotate/restore，±5°）、夜间车头双灯 + 光柱、BOOST 车尾尾焰；
 *  M18：碰撞边框闪白（flash 白→红插值描边，M16 设计意图已落地）+ 环境车灯配色（headlightColor） */
export function drawPlayerCar(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  options?: PlayerCarOptions,
): void {
  const laneOffset = options?.laneOffset ?? 0
  const night = options?.night ?? false
  const boosting = options?.boosting ?? false
  const flash = options?.flash ?? 0
  const headlightColor = options?.headlightColor ?? HEADLIGHT_CORE
  const carH = opts.height * PLAYER_CAR_HEIGHT_RATIO
  const carW = carH * PLAYER_CAR_ASPECT
  const cx = opts.width / 2 + laneOffsetToPx(laneOffset, opts, carW)
  const bottomY = opts.height - opts.height * PLAYER_CAR_BOTTOM_GAP_RATIO

  // BOOST 车尾尾焰（画在车身之前，被车身下缘部分覆盖）
  if (boosting) {
    ctx.fillStyle = BOOST_FLAME_COLOR
    ctx.beginPath()
    ctx.arc(cx, bottomY, carH * 0.17, 0, Math.PI * 2)
    ctx.fill()
  }

  // 转向倾斜：围绕车底中心 save/rotate/restore（steer 缺省由 laneOffset 推导，保持纯函数风格）
  const steer = options?.steer ?? Math.max(-1, Math.min(1, laneOffset * 1.2))
  const angle = (steer * PLAYER_CAR_MAX_TILT_DEG * Math.PI) / 180
  ctx.save()
  ctx.translate(cx, bottomY)
  ctx.rotate(angle)
  ctx.translate(-cx, -bottomY)

  // 尾翼（车顶后端深色横条，伸出车身两侧；最先绘制作为底层——车身覆盖其中段，
  // 仅两侧伸出部分可见，模拟横贯车顶的扰流板；纯渲染细节，不影响任何数学）
  const wingTop = bottomY - carH * 0.98
  ctx.fillStyle = WING_COLOR
  ctx.fillRect(cx - carW * 0.62, wingTop, carW * 1.24, carH * 0.06)

  // 车身底盘（主色红）
  ctx.fillStyle = BODY_COLOR
  ctx.fillRect(cx - carW / 2, bottomY - carH, carW, carH)
  // 底盘下缘暗部
  ctx.fillStyle = BODY_DARK_COLOR
  ctx.fillRect(cx - carW / 2, bottomY - carH * 0.16, carW, carH * 0.16)

  // 尾翼支柱（左右各一，自尾翼下缘向下延伸衔接车身顶端；画在车身之后保证可见，
  // 位置公式与早期版本一致——先画尾翼做底层、车身覆盖中段，支柱再叠回车身顶部）
  ctx.fillStyle = WING_COLOR
  ctx.fillRect(cx - carW * 0.42, wingTop + carH * 0.06, carW * 0.04, carH * 0.04)
  ctx.fillRect(cx + carW * 0.42 - carW * 0.04, wingTop + carH * 0.06, carW * 0.04, carH * 0.04)

  // 车窗（上部居中，深色）
  const winW = carW * 0.5
  const winH = carH * 0.2
  ctx.fillStyle = WINDOW_COLOR
  ctx.fillRect(cx - winW / 2, bottomY - carH * 0.62, winW, winH)

  // 前挡风反光（车窗上部 30% 浅色半透明横条，车窗绘制之后叠加）
  ctx.fillStyle = WINDOW_SHINE
  ctx.fillRect(cx - winW / 2, bottomY - carH * 0.62, winW, winH * 0.3)

  // 车轮（4 个：左右 × 前后；后轮贴车底、前轮近车头）
  const wheelW = carH * 0.1
  const wheelH = carH * 0.09
  ctx.fillStyle = WHEEL_COLOR
  ctx.fillRect(cx - carW * 0.52, bottomY - wheelH - carH * 0.04, wheelW, wheelH)
  ctx.fillRect(cx + carW * 0.52 - wheelW, bottomY - wheelH - carH * 0.04, wheelW, wheelH)
  ctx.fillRect(cx - carW * 0.52, bottomY - carH + carH * 0.1, wheelW, wheelH)
  ctx.fillRect(cx + carW * 0.52 - wheelW, bottomY - carH + carH * 0.1, wheelW, wheelH)

  // 尾灯条（车尾下缘两侧红色小条；day/night 均绘制——day 提供细节，night 与光效共存；
  // 右条 x 减去自身宽，与上方车轮写法一致）
  ctx.fillStyle = TAILLIGHT_COLOR
  ctx.fillRect(cx - carW * 0.35, bottomY - carH * 0.1, carW * 0.16, carH * 0.045)
  ctx.fillRect(cx + carW * 0.35 - carW * 0.16, bottomY - carH * 0.1, carW * 0.16, carH * 0.045)

  // 车牌（车底中央浅色小矩形，最后绘制盖在车身下缘之上）
  ctx.fillStyle = PLATE_COLOR
  ctx.fillRect(cx - carW * 0.1, bottomY - carH * 0.03, carW * 0.2, carH * 0.045)

  // 夜间车头灯：光柱 + 双灯（外层光晕 + 核心，配色参考 drawHeadlight）
  if (night) {
    // 光柱：从车头向远处路面投射的半透明梯形（lighter 合成加亮近端路面，进阶特效）
    ctx.globalCompositeOperation = BEAM_COMPOSITE
    ctx.fillStyle = BEAM_COLOR
    ctx.beginPath()
    ctx.moveTo(cx - carW * 0.2, bottomY - carH)
    ctx.lineTo(cx + carW * 0.2, bottomY - carH)
    ctx.lineTo(cx + carW * 0.6, bottomY - carH * 2.4)
    ctx.lineTo(cx - carW * 0.6, bottomY - carH * 2.4)
    ctx.closePath()
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

    // 车头双灯（车头朝画面上方，灯在车顶附近；外层光晕 ×1.25 + 核心；UX-9：光晕收敛防笼罩车体）
    const lampY = bottomY - carH * 0.94
    const lampDX = carW * 0.28
    const r = carW * 0.12
    ctx.fillStyle = HEADLIGHT_HALO
    ctx.beginPath()
    ctx.arc(cx - lampDX, lampY, r * 1.25, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + lampDX, lampY, r * 1.25, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = headlightColor
    ctx.beginPath()
    ctx.arc(cx - lampDX, lampY, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + lampDX, lampY, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // M18 碰撞车身边框闪白（M16 设计意图落地）：车身外描边（随转向倾斜变换），
  // 色随 flash 强度白→红插值（低闪白亮、高闪红），线宽 3px；
  // flash 状态由 collision-feedback 驱动（renderer 传 view.collisionFlash），此处纯消费
  if (flash > 0) {
    const a = Math.min(1, flash)
    const r = Math.round(FLASH_WHITE_RGB.r + (FLASH_RED_RGB.r - FLASH_WHITE_RGB.r) * a)
    const g = Math.round(FLASH_WHITE_RGB.g + (FLASH_RED_RGB.g - FLASH_WHITE_RGB.g) * a)
    const b = Math.round(FLASH_WHITE_RGB.b + (FLASH_RED_RGB.b - FLASH_WHITE_RGB.b) * a)
    ctx.lineWidth = FLASH_LINE_WIDTH
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
    ctx.beginPath()
    ctx.rect(cx - carW / 2, bottomY - carH, carW, carH)
    ctx.stroke()
  }

  ctx.restore()
}
