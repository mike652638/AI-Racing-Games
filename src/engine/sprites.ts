import { SEGMENT_LENGTH, trackIndexForCameraZ, type Segment } from './track'
import { mulberry32 } from './scenery'

export type SpriteKind = 'tree' | 'lamp'

export interface Sprite {
  kind: SpriteKind
  /** 绝对世界 z 坐标 */
  z: number
  /** 相对赛道中心线的横向偏移（世界单位） */
  offset: number
  /** 世界高度（单位） */
  height: number
}

const ROAD_SIDE_OFFSET = 1.4
const TREE_HEIGHT = 3
const LAMP_HEIGHT = 2

/** 沿赛道确定性生成成对路边景物（左右各一，间隔 spacing） */
export function createRoadsideSprites(
  track: Segment[],
  seed = 1234,
  spacing = 800,
): Sprite[] {
  const rand = mulberry32(seed)
  const totalLength = track.length * SEGMENT_LENGTH
  const sprites: Sprite[] = []
  for (let z = spacing / 2; z < totalLength; z += spacing) {
    const kind: SpriteKind = rand() < 0.7 ? 'tree' : 'lamp'
    const height = kind === 'tree' ? TREE_HEIGHT : LAMP_HEIGHT
    sprites.push({ kind, z, offset: -ROAD_SIDE_OFFSET, height })
    sprites.push({ kind, z, offset: ROAD_SIDE_OFFSET, height })
  }
  return sprites
}

/** 环形可见窗口：[cameraZ, cameraZ+viewDistance)，返回绝对 z 化的可见景物 */
export function spritesInRange(
  sprites: Sprite[],
  track: Segment[],
  cameraZ: number,
  viewDistance: number,
): Sprite[] {
  const totalLength = track.length * SEGMENT_LENGTH
  const seen: Sprite[] = []
  for (const sprite of sprites) {
    const zNorm = ((sprite.z % totalLength) + totalLength) % totalLength
    const relZ = ((zNorm - cameraZ) % totalLength + totalLength) % totalLength
    if (relZ <= viewDistance) {
      seen.push({ ...sprite, z: cameraZ + relZ })
    }
  }
  return seen
}

/** sprite 所在 z 处的中心线累计曲率偏移（世界单位） */
export function curveOffsetAtZ(track: Segment[], z: number): number {
  const index = trackIndexForCameraZ(track, z)
  const baseZ = index * SEGMENT_LENGTH
  let curveSum = 0
  for (let i = 0; i < index; i++) curveSum += track[i].curve
  const frac = (z - baseZ) / SEGMENT_LENGTH
  return curveSum + track[index].curve * frac
}
