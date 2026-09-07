/** 车流绘制模块（2026-08-05 从 Renderer 类提取）：车流车身/尾灯绘制与 night 车前灯光晕。
 *  纯函数（ctx/camera/traffic 显式传入），不依赖 Renderer 实例状态。 */
import type { Camera3D, ProjectionOptions } from './projection'
import { projectTraffic, type TrafficProjection } from './traffic-render'
import type { TrafficCar } from './traffic'

// —— 车前灯尺寸上限（night 专用，2026-09-07 收敛）——
// 缺陷：原核心灯 r=0.5×车宽（直径 = 整个车宽）、外层光晕 r=0.8×车宽（直径 1.6×车宽），
// 且均无像素上限——近处车投影宽可达 100px+，光晕直径 180px+ 把整个车身罩成黄色光盘，
// 加 0.35 alpha 画在车身之上、多车叠加，夜间 NPC 几乎只见车灯不见车身（实测截图）。
// 修复参考：① M20 P1-3 给路灯加 MAX_LAMP_SCALE 防"屏幕巨型黄斑"的同构思路——
// 半径随车宽缩放但 clamp 像素上限；② 街机赛车夜景惯例——头灯是小亮点 + 有限氛围光，
// 且氛围光画在车身之下（照亮车前路面，而不是罩住自己的车）。
/** 核心灯半径上限（px） */
const HEADLIGHT_CORE_MAX_R = 9
/** 外层光晕半径上限（px，直径 ≤ 52px，远小于近处车身宽） */
const HEADLIGHT_HALO_MAX_R = 26
/** 光束朝向偏移上限（px）：防止近处车灯飘出车身 */
const HEADLIGHT_STEER_OFFSET_MAX = 10

/**
 * 车前灯几何（night 专用，由车投影宽决定；核心灯/光晕/朝向偏移均带像素上限，见上方常量注释）。
 * 导出供单测断言 clamp 行为。
 */
export function headlightGeometry(
  width: number,
  steerDir: -1 | 0 | 1,
): { coreR: number; haloR: number; coreOffset: number; haloOffset: number } {
  const coreR = Math.min(Math.max(width * 0.14, 2), HEADLIGHT_CORE_MAX_R)
  const haloR = Math.min(Math.max(width * 0.45, 4), HEADLIGHT_HALO_MAX_R)
  return {
    coreR,
    haloR,
    coreOffset: steerDir * Math.min(width * 0.35, HEADLIGHT_STEER_OFFSET_MAX),
    haloOffset: steerDir * Math.min(width * 0.18, HEADLIGHT_STEER_OFFSET_MAX * 0.6),
  }
}

/** 绘制单辆已投影车流（车身 + 车顶暗区 + 车窗反光 + 车轮 + 尾灯）；
 *  从 drawTraffic 拆出供 Renderer 与景物按 z 交错绘制（景深 z-order 修复，2026-08-05）。
 *  day 尾灯为单条灯带、night 为双灯 + 车前灯光晕（night fillRect 计数恒高于 day，供渲染断言区分）；
 *  night 车前灯拆为两段（2026-09-07）：氛围光晕画在车身之下（照亮车前路面，不罩车身），
 *  核心灯画在车身上（车头亮点）——原实现光晕叠在车身上是"只见车灯不见车"的第二个成因 */
export function drawSingleTraffic(ctx: CanvasRenderingContext2D, car: TrafficProjection, night: boolean): void {
  const cx = car.bottom.x
  const topY = car.top.y
  const w = car.width
  const h = car.height
  // night 车前灯几何（一次计算两段共用；灯心取车身高度 25% 处 = 车头位置，行驶方向朝画面上方）
  const light = night ? headlightGeometry(w, car.car.shiftDir) : null
  const lightY = topY + h * 0.25
  if (light) {
    // 氛围光晕（车身之下）：低透明暖白，半径 clamp 后不会再罩住车身
    ctx.fillStyle = 'rgba(255, 235, 180, 0.16)'
    ctx.beginPath()
    ctx.arc(cx + light.haloOffset, lightY, light.haloR, 0, Math.PI * 2)
    ctx.fill()
  }
  // 车身
  ctx.fillStyle = car.color
  ctx.fillRect(cx - w / 2, topY, w, h)
  // 车顶暗区（车窗上方，半透明黑压暗车顶层次）
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
  ctx.fillRect(cx - w / 2, topY, w, h * 0.3)
  // 车窗
  ctx.fillStyle = '#1b2430'
  ctx.fillRect(cx - w / 4, topY + h * 0.3, w / 2, h * 0.4)
  // 车窗反光（后窗上部淡蓝斜光条）
  ctx.fillStyle = 'rgba(140, 170, 200, 0.25)'
  ctx.fillRect(cx - w / 4, topY + h * 0.32, w / 2, h * 0.07)
  // 车轮（后视可见左右两轮，贴地部）
  ctx.fillStyle = '#14171c'
  ctx.fillRect(cx - w * 0.45, topY + h * 0.78, w * 0.18, h * 0.22)
  ctx.fillRect(cx + w * 0.27, topY + h * 0.78, w * 0.18, h * 0.22)
  if (night && light) {
    // 红色尾灯：车身下部（车头朝画面上方，车尾在下）双灯。
    // 2026-08-22 收敛：原每盏 0.2w×0.25h 面积过大（合计约 10% 车身面积、纵向吞掉
    // 70%-95% 区带）遮挡车身，且右灯未减自身宽导致左右不对称；现核心灯收敛为
    // 0.15w×0.07h 并镜像对称（左 [-0.26,-0.11] / 右 [0.11,0.26]），外层低透明
    // 光晕保留夜间点亮感（合计面积约 5%，不再遮挡车身主体）。
    ctx.fillStyle = 'rgba(255, 59, 48, 0.25)'
    ctx.fillRect(cx - w * 0.29, topY + h * 0.7, w * 0.22, h * 0.11)
    ctx.fillRect(cx + w * 0.29 - w * 0.22, topY + h * 0.7, w * 0.22, h * 0.11)
    ctx.fillStyle = '#ff3b30'
    ctx.fillRect(cx - w * 0.26, topY + h * 0.72, w * 0.15, h * 0.07)
    ctx.fillRect(cx + w * 0.26 - w * 0.15, topY + h * 0.72, w * 0.15, h * 0.07)
    // 核心灯画在车身上（车头亮点；氛围光晕已在车身之下画过）
    ctx.fillStyle = '#ffe08a'
    ctx.beginPath()
    ctx.arc(cx + light.coreOffset, lightY, light.coreR, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // 白天尾灯灯带（单条细红带，比 night 双灯低调）
    ctx.fillStyle = 'rgba(255, 90, 80, 0.8)'
    ctx.fillRect(cx - w * 0.3, topY + h * 0.72, w * 0.6, h * 0.06)
  }
}

/** 绘制车流（投影后逐辆 drawSingleTraffic，远→近）；保留为兼容入口（Renderer 已改走交错绘制） */
export function drawTraffic(
  ctx: CanvasRenderingContext2D,
  camera: Camera3D,
  traffic: TrafficCar[],
  cameraZ: number,
  opts: ProjectionOptions,
  night: boolean,
  /** 圈长（可选）：传入时启用车流环形语义，与 Renderer 交错绘制路径保持一致 */
  lapLength?: number,
): void {
  for (const car of projectTraffic(traffic, cameraZ, camera.x, opts, camera, lapLength)) {
    drawSingleTraffic(ctx, car, night)
  }
}
