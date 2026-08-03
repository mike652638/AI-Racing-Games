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
/** 树木世界高度（约 4m，道路全宽 2 单位 ≈ 7m 的合理比例） */
const TREE_HEIGHT = 1.2
/** 路灯世界高度（约 2.8m） */
const LAMP_HEIGHT = 0.8

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

/** 环形窗口过滤的单一事实来源：返回绝对 z 化副本或 null（视距外） */
function windowedSprite(
  sprite: Sprite,
  totalLength: number,
  cameraZ: number,
  viewDistance: number,
): Sprite | null {
  const zNorm = ((sprite.z % totalLength) + totalLength) % totalLength
  const relZ = ((zNorm - cameraZ) % totalLength + totalLength) % totalLength
  if (relZ > viewDistance) {
    return null
  }
  return { ...sprite, z: cameraZ + relZ }
}

/** 环形可见窗口：[cameraZ, cameraZ+viewDistance)，返回绝对 z 化的可见景物（按输入顺序） */
export function spritesInRange(
  sprites: Sprite[],
  track: Segment[],
  cameraZ: number,
  viewDistance: number,
): Sprite[] {
  const totalLength = track.length * SEGMENT_LENGTH
  const seen: Sprite[] = []
  for (const sprite of sprites) {
    const windowed = windowedSprite(sprite, totalLength, cameraZ, viewDistance)
    if (windowed) {
      seen.push(windowed)
    }
  }
  return seen
}

/** 按段分组构建精灵空间索引：键 = floor(z / segmentLength)（z 应在 [0, track 总长) 内） */
export function buildSpriteIndex(
  sprites: Sprite[],
  segmentLength: number,
): Map<number, Sprite[]> {
  const index = new Map<number, Sprite[]>()
  for (const sprite of sprites) {
    const seg = Math.floor(sprite.z / segmentLength)
    const bucket = index.get(seg)
    if (bucket) {
      bucket.push(sprite)
    } else {
      index.set(seg, [sprite])
    }
  }
  return index
}

/**
 * 环形可见窗口的索引查询版：仅遍历相机前方 viewDistance 内的候选段（O(候选段数)），
 * 逐精灵过滤与 spritesInRange 完全一致（环形回绕 + 绝对 z 化 + relZ <= viewDistance）。
 * 候选段数为 floor(viewDistance / SEGMENT_LENGTH) + 2 的安全上界（窗口跨段数 + 1），
 * 且不超过总段数（视距 >= 环长时退化为全环）。
 */
export function spritesInRangeIndexed(
  index: Map<number, Sprite[]>,
  track: Segment[],
  cameraZ: number,
  viewDistance: number,
): Sprite[] {
  const totalLength = track.length * SEGMENT_LENGTH
  const camWrapped = ((cameraZ % totalLength) + totalLength) % totalLength
  const startSeg = Math.floor(camWrapped / SEGMENT_LENGTH)
  const numSegs = Math.min(
    track.length,
    Math.floor(viewDistance / SEGMENT_LENGTH) + 2,
  )
  const seen: Sprite[] = []
  for (let k = 0; k < numSegs; k++) {
    const bucket = index.get((startSeg + k) % track.length)
    if (!bucket) {
      continue
    }
    for (const sprite of bucket) {
      const windowed = windowedSprite(sprite, totalLength, cameraZ, viewDistance)
      if (windowed) {
        seen.push(windowed)
      }
    }
  }
  return seen
}

/** 预计算前缀和：prefixCurveSum[i] = sum(track[0..i-1].curve) */
export function buildCurvePrefixSum(track: Segment[]): Float64Array {
  const prefix = new Float64Array(track.length + 1)
  for (let i = 0; i < track.length; i++) {
    prefix[i + 1] = prefix[i] + track[i].curve
  }
  return prefix
}

/** sprite 所在 z 处的中心线累计曲率偏移（世界单位），O(1) 前缀和查询 */
export function curveOffsetAtZ(
  track: Segment[],
  prefixSum: Float64Array,
  z: number,
): number {
  const index = trackIndexForCameraZ(track, z)
  const baseZ = index * SEGMENT_LENGTH
  const curveSum = prefixSum[index] // O(1) 查询
  const frac = (z - baseZ) / SEGMENT_LENGTH
  return curveSum + track[index].curve * frac
}
