import { describe, expect, test } from 'vitest'
import {
  SEGMENT_LENGTH,
  createStraightTrack,
  trackIndexForCameraZ,
  type Segment,
} from '../../src/engine/track'

describe('直道分段生成', () => {
  test('生成指定数量的等距分段', () => {
    const track = createStraightTrack(100)
    expect(track).toHaveLength(100)
    expect(track[1].z - track[0].z).toBe(SEGMENT_LENGTH)
  })

  test('分段 z 从 0 递增', () => {
    const track = createStraightTrack(10)
    expect(track[0].z).toBe(0)
    expect(track[9].z).toBe(9 * SEGMENT_LENGTH)
  })
})

describe('环形分段索引', () => {
  test('cameraZ 定位到所在分段', () => {
    const track: Segment[] = createStraightTrack(100)
    expect(trackIndexForCameraZ(track, 0)).toBe(0)
    expect(trackIndexForCameraZ(track, 250)).toBe(1)
    expect(trackIndexForCameraZ(track, 199 * SEGMENT_LENGTH)).toBe(99)
  })

  test('超出赛道长度后环形回绕', () => {
    const track = createStraightTrack(100)
    expect(trackIndexForCameraZ(track, 100 * SEGMENT_LENGTH)).toBe(0)
    expect(trackIndexForCameraZ(track, 250 * SEGMENT_LENGTH + 10)).toBe(50)
  })
})
