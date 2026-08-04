/** 车流绘制模块（2026-08-05 从 Renderer 类提取）：车流车身/尾灯绘制与 night 车前灯光晕。
 *  纯函数（ctx/camera/traffic 显式传入），不依赖 Renderer 实例状态。 */
import type { Camera3D, ProjectionOptions } from './projection'
import { projectTraffic } from './traffic-render'
import type { TrafficCar } from './traffic'

/** 绘制车流（车身 + 车顶暗区 + 车窗反光 + 车轮 + 尾灯，远→近）；
 *  day 尾灯为单条灯带、night 为双灯 + 车前灯光晕（night fillRect 计数恒高于 day，供渲染断言区分） */
export function drawTraffic(
  ctx: CanvasRenderingContext2D,
  camera: Camera3D,
  traffic: TrafficCar[],
  cameraZ: number,
  opts: ProjectionOptions,
  night: boolean,
): void {
  for (const car of projectTraffic(traffic, cameraZ, camera.x, opts, camera)) {
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
      // 红色尾灯：车身下部（车头朝画面上方，车尾在下）双灯——cx ± width*0.3、宽 width*0.2、
      // 从 car.top.y + height*0.7 起高 height*0.25
      ctx.fillStyle = '#ff3b30'
      ctx.fillRect(cx - w * 0.3, topY + h * 0.7, w * 0.2, h * 0.25)
      ctx.fillRect(cx + w * 0.3, topY + h * 0.7, w * 0.2, h * 0.25)
      // car 为 TrafficProjection（含原始车数据字段 car.car），shiftDir 取自车数据
      drawHeadlight(ctx, cx, topY, w, h, car.car.shiftDir)
    } else {
      // 白天尾灯灯带（单条细红带，比 night 双灯低调）
      ctx.fillStyle = 'rgba(255, 90, 80, 0.8)'
      ctx.fillRect(cx - w * 0.3, topY + h * 0.72, w * 0.6, h * 0.06)
    }
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
