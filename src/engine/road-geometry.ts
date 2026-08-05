import { EDGE_WIDTH, RENDER_DRAW_DISTANCE, ROAD_HALF_WIDTH } from '../shared/constants'
import { project, type Projected, type ProjectionOptions, type Camera3D } from './projection'

export { EDGE_WIDTH, ROAD_HALF_WIDTH }
/**
 * 渲染可视距离（分段数）——兼容名导出。
 * 真源为 constants.RENDER_DRAW_DISTANCE，消费方若使用 DRAW_DISTANCE 请迁移。
 */
export const DRAW_DISTANCE = RENDER_DRAW_DISTANCE

// 路面交替色（2026-08-05 平滑化）：原 #4a4a4a/#3c3c3c 亮度差 14 过强，远端压缩成密集条纹；
// 收敛为 #484848/#404040（亮度差 8），保留速度感的分段节奏但显著柔和
const ROAD_COLORS = ['#484848', '#404040']
const SIDE_COLORS = ['#d03030', '#e8e8e8']

export interface Quad {
  l1: Projected
  l2: Projected
  r1: Projected
  r2: Projected
}

/** 计算单个分段的四边形投影（纯函数），z 在相机后方返回 null */
export function projectSegmentQuad(opts: ProjectionOptions, camera: Camera3D, z: number, centerX: number): Quad | null {
  const cx = centerX - camera.x
  const l1 = project(opts, camera, { x: cx - ROAD_HALF_WIDTH, y: 0, z })
  const l2 = project(opts, camera, {
    x: cx - ROAD_HALF_WIDTH - EDGE_WIDTH,
    y: 0,
    z,
  })
  const r1 = project(opts, camera, { x: cx + ROAD_HALF_WIDTH, y: 0, z })
  const r2 = project(opts, camera, {
    x: cx + ROAD_HALF_WIDTH + EDGE_WIDTH,
    y: 0,
    z,
  })
  if (!l1 || !l2 || !r1 || !r2) {
    return null
  }
  return { l1, l2, r1, r2 }
}

/** 路面/路缘颜色按段号奇偶交替选择（纯函数） */
export function roadColors(segmentIndex: number): {
  road: string
  side: string
} {
  const parity = segmentIndex % 2
  return { road: ROAD_COLORS[parity], side: SIDE_COLORS[parity] }
}

/** 中心线虚线是否应绘制（纯函数，每两段绘制一次） */
export function shouldDrawCenterLine(segmentIndex: number): boolean {
  return segmentIndex % 2 === 0
}
