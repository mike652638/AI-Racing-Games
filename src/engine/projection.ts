export interface ProjectionOptions {
  /** 视口宽度（像素） */
  width: number
  /** 视口高度（像素） */
  height: number
  /** 地平线屏幕 y（像素） */
  horizon: number
  /** 相机深度：scale=1 的参考距离 */
  depth: number
}

export interface Camera3D {
  x: number
  y: number
  z: number
}

export interface Point3D {
  x: number
  y: number
  z: number
}

export interface Projected {
  x: number
  y: number
  scale: number
}

/**
 * 精灵近距缩放上限（M18）：防 1/depth 投影在贴脸时产生超大精灵。
 * 阈值依据：道路半宽 1 世界单位、相机高度——近距精灵最大视觉高度约 240px × 2.2 ≈ 528px，
 * 超过即 clamp（与 sprites.ts 的 MAX_TREE_HEIGHT_PX 同思路，双保险）。
 */
export const MAX_SPRITE_SCALE = 2.2

/**
 * 精灵投影 scale clamp（M18）：近距贴脸时收敛到 MAX_SPRITE_SCALE。
 * 注意：clamp 放在精灵侧（renderer drawSpriteProjected 消费），不放 project 内——
 * project 同时被路面 quad 投影（road-geometry projectSegmentQuad）共用，路面数学必须保持原语义。
 * 车流近距防护走既有 MAX_TRAFFIC_HEIGHT_PX（保宽高比 clamp，P2），不叠加本 clamp。
 */
export function clampSpriteScale(scale: number): number {
  return Math.min(scale, MAX_SPRITE_SCALE)
}

/**
 * 将世界坐标投影到屏幕。
 * 地面平面 y=0，相机朝 +z 方向，z 增大即远离相机。
 * 相机后方或平齐的点返回 null（不可见）。
 */
export function project(opts: ProjectionOptions, camera: Camera3D, point: Point3D): Projected | null {
  const dz = point.z - camera.z
  if (dz <= 0) {
    return null
  }
  const scale = opts.depth / dz
  const x = opts.width / 2 + scale * (point.x - camera.x) * (opts.width / 2)
  const y = opts.horizon + scale * (camera.y - point.y) * (opts.height / 2)
  return { x, y, scale }
}
