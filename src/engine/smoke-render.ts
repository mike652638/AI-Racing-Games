import { project, type ProjectionOptions, type Camera3D } from './projection'
import type { SmokeParticle } from '../physics/drift'

export interface SmokeProjection {
  /** 圆心屏幕 x（像素） */
  x: number
  /** 圆心屏幕 y（像素） */
  y: number
  /** 烟雾半径（像素） */
  radius: number
  /** 透明度 0~1 */
  alpha: number
}

/** 计算烟雾投影（过滤不可见粒子），纯函数 */
export function projectSmoke(
  smoke: SmokeParticle[],
  cameraZ: number,
  cameraX: number,
  opts: ProjectionOptions,
  camera: Camera3D,
): SmokeProjection[] {
  const result: SmokeProjection[] = []
  for (const particle of smoke) {
    const dz = particle.z - cameraZ
    if (dz <= 0) {
      continue
    }
    const proj = project(opts, camera, {
      x: particle.x - cameraX,
      y: 0,
      z: particle.z,
    })
    if (!proj) {
      continue
    }
    const radius = Math.max(proj.scale * opts.height * 0.06, 2)
    const alpha = Math.max(1 - particle.t / 0.6, 0) * 0.4
    result.push({ x: proj.x, y: proj.y - radius * 0.5, radius, alpha })
  }
  return result
}
