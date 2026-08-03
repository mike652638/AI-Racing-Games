/**
 * 测试辅助函数：景物环形窗口过滤（线性版）。
 * 原位于 src/engine/sprites.ts 的 spritesInRange 因 src/ 内无生产调用方
 * （生产路径走 spritesInRangeIndexed 空间索引查询），按死代码清理约定迁移至此；
 * 实现（含私有 windowedSprite）与原版逐字节一致，供 sprites.test.ts 作为
 * 索引查询版的线性基准对照。
 */
import { SEGMENT_LENGTH, type Segment } from '../../src/engine/track'
import type { Sprite } from '../../src/engine/sprites'

/** 环形窗口过滤：返回绝对 z 化副本或 null（视距外）——与 src 内 spritesInRangeIndexed 共用同一语义 */
function windowedSprite(sprite: Sprite, totalLength: number, cameraZ: number, viewDistance: number): Sprite | null {
  const zNorm = ((sprite.z % totalLength) + totalLength) % totalLength
  const relZ = (((zNorm - cameraZ) % totalLength) + totalLength) % totalLength
  if (relZ > viewDistance) {
    return null
  }
  return { ...sprite, z: cameraZ + relZ }
}

/** 环形可见窗口：[cameraZ, cameraZ+viewDistance)，返回绝对 z 化的可见景物（按输入顺序） */
export function spritesInRange(sprites: Sprite[], track: Segment[], cameraZ: number, viewDistance: number): Sprite[] {
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
