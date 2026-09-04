/** 车流绘制模块（2026-08-05 从 Renderer 类提取）：车流车身/尾灯绘制与 night 车前灯光晕。
 *  纯函数（ctx/camera/traffic 显式传入），不依赖 Renderer 实例状态。 */
import type { Camera3D, ProjectionOptions } from './projection'
import { projectTraffic, type TrafficProjection } from './traffic-render'
import type { TrafficCar } from './traffic'

/** 绘制单辆已投影车流（车身 + 车顶暗区 + 车窗反光 + 车轮 + 尾灯）；
 *  从 drawTraffic 拆出供 Renderer 与景物按 z 交错绘制（景深 z-order 修复，2026-08-05）。
 *  day 尾灯为单条灯带、night 为双灯 + 车前灯光晕（night fillRect 计数恒高于 day，供渲染断言区分） */
export function drawSingleTraffic(ctx: CanvasRenderingContext2D, car: TrafficProjection, night: boolean): void {
  const cx = car.bottom.x
  const topY = car.top.y
  const w = car.width
  const h = car.height
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
  if (night) {
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
    // car 为 TrafficProjection（含原始车数据字段 car.car），shiftDir 取自车数据
    drawHeadlight(ctx, cx, topY, w, h, car.car.shiftDir)
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

/** 车前灯光晕（night 专用）：参考 drawLamp 双弧模式——外层半透明光晕 + 核心灯，位置在车头（画面上方）；
 *  steerDir 为车流避让变道方向（-1/0/1），核心灯与光晕随其横向偏移（模拟光束朝向变道侧，0 时与旧版逐字节一致） */
function drawHeadlight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  width: number,
  height: number,
  steerDir: -1 | 0 | 1,
): void {
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
