/**
 * 测试辅助函数：赛道构造工具。
 * 原位于 src/engine/track.ts 的 createDefaultTrack / createStraightTrack 因 src/ 内无
 * 生产调用方（生产走 tracks.ts 的 TRACK_DEFS / createTrackFromDef），按死代码清理
 * 约定迁移至此；实现与原版逐字节一致，供各单测使用。
 */
import { createTrack, DEFAULT_CONTROL_POINTS, createSmoothTrack, type Segment } from '../../src/engine/track'

/** 默认环形赛道：直道+左右弯交替（弯道带渐变坡道），总曲率回环为 0（460 段，约 15 秒/圈） */
export function createDefaultTrack(): Segment[] {
  return createSmoothTrack(DEFAULT_CONTROL_POINTS)
}

/** 直线赛道分段（生成指定数量的等距直道分段） */
export function createStraightTrack(count: number): Segment[] {
  return createTrack([{ curve: 0, count }])
}
