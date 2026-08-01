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
