export const SEGMENT_LENGTH = 200

export interface Segment {
  /** 分段起点世界 z 坐标 */
  z: number
}

/** 生成等距直线赛道分段（M1 仅直道，后续里程碑扩展弯道） */
export function createStraightTrack(count: number): Segment[] {
  return Array.from({ length: count }, (_, i) => ({ z: i * SEGMENT_LENGTH }))
}

/** 环形索引：cameraZ 所在的赛道分段下标 */
export function trackIndexForCameraZ(track: Segment[], cameraZ: number): number {
  const totalLength = track.length * SEGMENT_LENGTH
  const wrapped = ((cameraZ % totalLength) + totalLength) % totalLength
  return Math.floor(wrapped / SEGMENT_LENGTH)
}
