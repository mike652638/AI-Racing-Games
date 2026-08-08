import { SEGMENT_LENGTH, trackIndexForCameraZ, type Segment } from './track'
import { mulberry32 } from './scenery'

export type SpriteKind = 'tree' | 'lamp' | 'cactus' | 'palm' | 'snowpile'

export interface Sprite {
  kind: SpriteKind
  /** 绝对世界 z 坐标 */
  z: number
  /** 相对赛道中心线的横向偏移（世界单位） */
  offset: number
  /** 世界高度（单位） */
  height: number
  /** M17 环境树冠主色（渲染层用，环境配置驱动；缺省 fallback 内置色） */
  treeColor?: string
  /** M17 环境树冠亮色（两层树冠的上层） */
  treeColorLight?: string
  /** M17 棕榈弯曲方向：-1 左弯 / +1 右弯（确定性随机，多变化） */
  rotation?: number
  /** M17 整体缩放系数（沙漠远处小仙人掌用，<1 缩小）；缺省 1 */
  scale?: number
}

const ROAD_SIDE_OFFSET = 1.55
/** 路灯专用横向偏移（UX-10 修复 2026-08-05：1.4→1.8）——旧值在弯道路灯与路面边界相交，
 * 视觉上「路灯长在路面上」；外移后灯杆稳定落在路外，树/仙人掌/棕榈/雪堆仍用 ROAD_SIDE_OFFSET */
const LAMP_SIDE_OFFSET = 1.8
/** 树木世界高度（约 4m，道路全宽 2 单位 ≈ 7m 的合理比例） */
const TREE_HEIGHT = 1.2
/** 路灯世界高度（约 2.8m） */
const LAMP_HEIGHT = 0.8
/** M17 环境默认：路边景物间距（世界单位） */
const DEFAULT_SPACING = 800
/** M17 环境默认：树出现概率 */
const DEFAULT_TREE_RATIO = 0.7
/** M17 环境默认：树冠主色（与旧版 drawTree 内置 #2d5a27 一致，保证 plains 零回归） */
const DEFAULT_TREE_COLOR = '#2d5a27'
const DEFAULT_TREE_COLOR_LIGHT = '#3a7a35'

/** 极近距离树的最大绘制高度（像素，P2）：防 1/cameraDepth 投影在贴脸时产生过大精灵遮挡画面 */
export const MAX_TREE_HEIGHT_PX = 240
/** 极近距离路灯的最大绘制高度（像素，P2） */
export const MAX_LAMP_HEIGHT_PX = 200

/** 景物像素高度 clamp（P2）：hpx 超出对应上限时截断，防止近距精灵无限放大。
 *  仅约束绘制高度，不影响投影数学（project 保持原语义，路面/车流等投影不受影响）。
 *  M17：树/仙人掌/棕榈/雪堆共用树的上限（同属"高大景物"），路灯用路灯上限。 */
export function clampSpriteHeight(kind: SpriteKind, hpx: number): number {
  const max = kind === 'lamp' ? MAX_LAMP_HEIGHT_PX : MAX_TREE_HEIGHT_PX
  return Math.min(hpx, max)
}

/** M17 环境景物配置（treeRatio/spacing/treeColor/spriteKind 由 environment.ts 提供，此处收敛为可选参保持向后兼容） */
export interface RoadsideEnv {
  /** 景物类型（'tree' 基准树形；desert 仙人掌、coast 棕榈、alpine 雪堆） */
  spriteKind?: SpriteKind
  treeRatio?: number
  spacing?: number
  treeColor?: string
  treeColorLight?: string
  /** V-2（2026-08-05 审计）：跳过右侧（+offset）景物生成（coast 海侧防叠压海面）；
   *  仅影响 push，rand() 消费顺序不变，其余环境确定性逐字节不变 */
  skipRightSprites?: boolean
}

/** 沿赛道确定性生成成对路边景物（左右各一，间隔 spacing；M17 支持环境驱动密度/树色/形状/旋转）。
 *  M17 增强：palm 生成随机弯曲方向（rotation ±1）；cactus 环境（沙漠）在树位之间额外插入
 *  间隔一半、高度减半的小仙人掌（scale 0.5），营造远处仙人掌群。 */
export function createRoadsideSprites(
  track: Segment[],
  seed = 1234,
  spacing = DEFAULT_SPACING,
  env: RoadsideEnv = {},
): Sprite[] {
  const rand = mulberry32(seed)
  const totalLength = track.length * SEGMENT_LENGTH
  const treeRatio = env.treeRatio ?? DEFAULT_TREE_RATIO
  const treeColor = env.treeColor ?? DEFAULT_TREE_COLOR
  const treeColorLight = env.treeColorLight ?? DEFAULT_TREE_COLOR_LIGHT
  // V-2（2026-08-05 审计）：coast 环境海侧（+offset）不生成景物，防棕榈叠压海面
  const skipRight = env.skipRightSprites === true
  // M17：环境决定"树位"的实际形状（desert 仙人掌 / coast 棕榈 / alpine 雪堆 / 其余树）
  const kindAtTreeSlot: SpriteKind = env.spriteKind ?? 'tree'
  // M17 增强：沙漠环境在相邻树位中点额外插入小仙人掌（scale 0.5，高度减半）
  const insertSmallCactus = kindAtTreeSlot === 'cactus'
  const sprites: Sprite[] = []
  for (let z = spacing / 2; z < totalLength; z += spacing) {
    const kind: SpriteKind = rand() < treeRatio ? kindAtTreeSlot : 'lamp'
    const height = kind === 'lamp' ? LAMP_HEIGHT : TREE_HEIGHT
    // 棕榈弯曲方向确定性随机（±1），其余景物无 rotation
    const rotation = kind === 'palm' ? (rand() < 0.5 ? -1 : 1) : undefined
    // UX-10：路灯用 LAMP_SIDE_OFFSET（1.8）外移至路外，其余景物保持 ROAD_SIDE_OFFSET（1.4）
    const sideOffset = kind === 'lamp' ? LAMP_SIDE_OFFSET : ROAD_SIDE_OFFSET
    sprites.push({ kind, z, offset: -sideOffset, height, treeColor, treeColorLight, rotation })
    if (!skipRight) {
      sprites.push({ kind, z, offset: sideOffset, height, treeColor, treeColorLight, rotation })
    }
    // 沙漠小仙人掌：树位之间中点（z + spacing/2），高度减半、scale 0.5，左右各一
    if (insertSmallCactus && z + spacing / 2 < totalLength) {
      const smallZ = z + spacing / 2
      sprites.push({
        kind: 'cactus',
        z: smallZ,
        offset: -ROAD_SIDE_OFFSET,
        height: TREE_HEIGHT * 0.5,
        treeColor,
        treeColorLight,
        scale: 0.5,
      })
      if (!skipRight) {
        sprites.push({
          kind: 'cactus',
          z: smallZ,
          offset: ROAD_SIDE_OFFSET,
          height: TREE_HEIGHT * 0.5,
          treeColor,
          treeColorLight,
          scale: 0.5,
        })
      }
    }
  }
  return sprites
}

/** 环形窗口过滤的单一事实来源：返回绝对 z 化副本或 null（视距外） */
function windowedSprite(sprite: Sprite, totalLength: number, cameraZ: number, viewDistance: number): Sprite | null {
  const zNorm = ((sprite.z % totalLength) + totalLength) % totalLength
  const relZ = (((zNorm - cameraZ) % totalLength) + totalLength) % totalLength
  if (relZ > viewDistance) {
    return null
  }
  return { ...sprite, z: cameraZ + relZ }
}

/** 按段分组构建精灵空间索引：键 = floor(z / segmentLength)（z 应在 [0, track 总长) 内） */
export function buildSpriteIndex(sprites: Sprite[], segmentLength: number): Map<number, Sprite[]> {
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
 * 逐精灵过滤与线性版（已迁移至 tests/helpers/sprites.ts 的 spritesInRange）完全一致（环形回绕 + 绝对 z 化 + relZ <= viewDistance）。
 * 候选段数为 floor(viewDistance / SEGMENT_LENGTH) + 2 的安全上界（窗口跨段数 + 1），
 * 且不超过总段数（视距 >= 环长时退化为全环）。
 *
 * 重载：不传 out 时返回新数组（旧行为，向后兼容）；传 out 时清空重填该数组并返回匹配数量，
 * 避免渲染循环每帧创建新数组（对象复用，见 Task B-5）。
 */
export function spritesInRangeIndexed(
  index: Map<number, Sprite[]>,
  track: Segment[],
  cameraZ: number,
  viewDistance: number,
): Sprite[]
export function spritesInRangeIndexed(
  index: Map<number, Sprite[]>,
  track: Segment[],
  cameraZ: number,
  viewDistance: number,
  out: Sprite[],
): number
export function spritesInRangeIndexed(
  index: Map<number, Sprite[]>,
  track: Segment[],
  cameraZ: number,
  viewDistance: number,
  out?: Sprite[],
): Sprite[] | number {
  const result = out ?? []
  result.length = 0 // 清空但保留内存（复用数组时避免重新分配）
  const totalLength = track.length * SEGMENT_LENGTH
  const camWrapped = ((cameraZ % totalLength) + totalLength) % totalLength
  const startSeg = Math.floor(camWrapped / SEGMENT_LENGTH)
  const numSegs = Math.min(track.length, Math.floor(viewDistance / SEGMENT_LENGTH) + 2)
  for (let k = 0; k < numSegs; k++) {
    const bucket = index.get((startSeg + k) % track.length)
    if (!bucket) {
      continue
    }
    for (const sprite of bucket) {
      const windowed = windowedSprite(sprite, totalLength, cameraZ, viewDistance)
      if (windowed) {
        result.push(windowed)
      }
    }
  }
  return out ? result.length : result
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
export function curveOffsetAtZ(track: Segment[], prefixSum: Float64Array, z: number): number {
  const index = trackIndexForCameraZ(track, z)
  const baseZ = index * SEGMENT_LENGTH
  const curveSum = prefixSum[index] // O(1) 查询
  const frac = (z - baseZ) / SEGMENT_LENGTH
  return curveSum + track[index].curve * frac
}
