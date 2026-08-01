export const SEGMENT_LENGTH = 200

export interface Segment {
  /** 分段起点世界 z 坐标 */
  z: number
  /** 曲率：该分段造成的中心线横向偏移（世界单位） */
  curve: number
}

export interface CurveGroup {
  curve: number
  count: number
}

/** 按曲线分组生成等距赛道分段（环形赛道） */
export function createTrack(groups: CurveGroup[], segmentLength = SEGMENT_LENGTH): Segment[] {
  const track: Segment[] = []
  let z = 0
  for (const group of groups) {
    for (let i = 0; i < group.count; i++) {
      track.push({ z, curve: group.curve })
      z += segmentLength
    }
  }
  return track
}

/** 生成直线赛道分段 */
export function createStraightTrack(count: number): Segment[] {
  return createTrack([{ curve: 0, count }])
}

/** 默认环形赛道：直道+左右弯交替（弯道带渐变坡道），总曲率回环为 0（460 段，约 15 秒/圈） */
export function createDefaultTrack(): Segment[] {
  return createSmoothTrack([
    { z: 0, curve: 0 },
    { z: 10000, curve: 0 },
    { z: 12000, curve: 0.02 },
    { z: 22200, curve: 0.02 },
    { z: 24200, curve: 0 },
    { z: 30000, curve: 0 },
    { z: 32000, curve: -0.02 },
    { z: 42200, curve: -0.02 },
    { z: 44200, curve: 0 },
    { z: 50000, curve: 0 },
    { z: 52000, curve: 0.01 },
    { z: 62000, curve: 0.01 },
    { z: 64000, curve: 0 },
    { z: 70000, curve: 0 },
    { z: 72000, curve: -0.01 },
    { z: 82000, curve: -0.01 },
    { z: 84000, curve: 0 },
    { z: 91800, curve: 0 },
  ])
}

export interface CurveControlPoint {
  /** 分段起点 z 坐标（应为段长的整数倍） */
  z: number
  /** 该点的目标曲率 */
  curve: number
}

/** 按控制点线性插值生成平滑曲线赛道（环形赛道） */
export function createSmoothTrack(
  controlPoints: CurveControlPoint[],
  segmentLength = SEGMENT_LENGTH,
): Segment[] {
  if (controlPoints.length === 0) return []
  const segments: Segment[] = []
  const lastZ = controlPoints[controlPoints.length - 1].z
  for (let z = 0; z <= lastZ; z += segmentLength) {
    let i = 0
    while (i < controlPoints.length - 2 && controlPoints[i + 1].z < z) i++
    const a = controlPoints[i]
    const b = controlPoints[i + 1]
    const span = Math.max(b.z - a.z, segmentLength)
    const t = (z - a.z) / span
    const curve = Math.round((a.curve + (b.curve - a.curve) * t) * 1000) / 1000
    segments.push({ z, curve })
  }
  return segments
}

/** 全赛道曲率之和（回环赛道设计约束应接近 0） */
export function totalCurve(track: Segment[]): number {
  return track.reduce((sum, segment) => sum + segment.curve, 0)
}

/** 环形索引：cameraZ 所在的赛道分段下标 */
export function trackIndexForCameraZ(track: Segment[], cameraZ: number): number {
  const totalLength = track.length * SEGMENT_LENGTH
  const wrapped = ((cameraZ % totalLength) + totalLength) % totalLength
  return Math.floor(wrapped / SEGMENT_LENGTH)
}
