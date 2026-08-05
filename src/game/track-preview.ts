import type { TrackDef } from '../engine/tracks'

/**
 * 赛道缩略图生成（2026-08-05 自 game-loop 下沉）：
 * 控制点积分生成平面轨迹 + 归一化 SVG path（菜单中央信息区预览用）。
 */

/**
 * 由赛道控制点积分生成轨迹点列（伪 3D 曲率 → 平面 x/z 曲线）：
 * angle += curve*dz；x += sin(angle)*dz。总采样约 160 点，段内按曲率线性插值。
 */
export function integrateControlPoints(controlPoints: { z: number; curve: number }[]): { x: number; z: number }[] {
  const totalZ = controlPoints.reduce((sum, p) => sum + p.z, 0)
  const points: { x: number; z: number }[] = []
  let x = 0
  let z = 0
  let angle = 0
  for (let i = 0; i < controlPoints.length; i++) {
    const seg = controlPoints[i]
    const steps = Math.max(1, Math.round((160 * seg.z) / totalZ))
    const dz = seg.z / steps
    for (let s = 0; s < steps; s++) {
      // 段内曲率线性插值（与下一段衔接平滑）
      const next = controlPoints[i + 1]
      const t = next ? s / steps : 1
      const curve = seg.curve + (next ? (next.curve - seg.curve) * t : 0)
      angle += curve * dz
      x += Math.sin(angle) * dz
      z += dz
      points.push({ x, z })
    }
  }
  return points
}

/**
 * 构建赛道缩略图 SVG innerHTML（主题色轨迹 path + 起点圆点）。
 * 归一化到 W×H viewBox：x 按全段跨度、z 按总长纵向铺满；空控制点返回 null。
 * color 为轨迹主题色（随环境区分，2026-08-05 菜单优化），缺省金黄 #ffd75e。
 */
export function buildTrackPreviewSvg(def: TrackDef, W = 200, H = 64, pad = 8, color = '#ffd75e'): string | null {
  const pts = integrateControlPoints(def.controlPoints)
  if (pts.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z > maxZ) maxZ = p.z
  }
  const spanX = maxX - minX || 1
  const sx = (x: number): number => pad + ((x - minX) / spanX) * (W - 2 * pad)
  const sy = (z: number): number => pad + (z / maxZ) * (H - 2 * pad)
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)} ${sy(p.z).toFixed(1)}`).join(' ')
  // color 表现属性供 CSS drop-shadow(currentColor) 生成同色光晕（2026-08-05 菜单优化）
  return `<path d="${d}" fill="none" stroke="${color}" color="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${sx(pts[0].x).toFixed(1)}" cy="${pad}" r="4" fill="${color}" color="${color}"/>`
}
