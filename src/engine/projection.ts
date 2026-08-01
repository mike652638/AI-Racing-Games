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
 * 将世界坐标投影到屏幕。
 * 地面平面 y=0，相机朝 +z 方向，z 增大即远离相机。
 * 相机后方或平齐的点返回 null（不可见）。
 */
export function project(
  opts: ProjectionOptions,
  camera: Camera3D,
  point: Point3D,
): Projected | null {
  const dz = point.z - camera.z
  if (dz <= 0) {
    return null
  }
  const scale = opts.depth / dz
  const x = opts.width / 2 + scale * (point.x - camera.x) * (opts.width / 2)
  const y = opts.horizon + scale * (camera.y - point.y) * (opts.height / 2)
  return { x, y, scale }
}
