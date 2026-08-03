import { describe, expect, test } from 'vitest'
import {
  SEGMENT_LENGTH,
  createSmoothTrack,
  createTrack,
  totalCurve,
  trackIndexForCameraZ,
  type Segment,
} from '../../src/engine/track'
import { createDefaultTrack, createStraightTrack } from '../helpers/track'

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

describe('可配置曲线赛道生成', () => {
  test('按曲线分组展开分段', () => {
    const track = createTrack([
      { curve: 0, count: 2 },
      { curve: 0.5, count: 3 },
      { curve: -0.25, count: 1 },
    ])
    expect(track).toHaveLength(6)
    expect(track.map((s) => s.curve)).toEqual([0, 0, 0.5, 0.5, 0.5, -0.25])
  })

  test('分段 z 跨分组连续递增', () => {
    const track = createTrack([
      { curve: 0, count: 2 },
      { curve: 0.5, count: 2 },
    ])
    for (let i = 1; i < track.length; i++) {
      expect(track[i].z - track[i - 1].z).toBe(SEGMENT_LENGTH)
    }
    expect(track[0].z).toBe(0)
  })

  test('空分组返回空赛道', () => {
    expect(createTrack([])).toEqual([])
  })

  test('totalCurve 累加全段曲率（回环赛道设计约束）', () => {
    const track = createTrack([
      { curve: 0.02, count: 50 },
      { curve: 0, count: 30 },
      { curve: -0.02, count: 50 },
    ])
    expect(totalCurve(track)).toBeCloseTo(0, 10)
  })

  test('曲线赛道同样支持环形回绕索引', () => {
    const track = createTrack([
      { curve: 0.02, count: 50 },
      { curve: -0.02, count: 50 },
    ])
    expect(trackIndexForCameraZ(track, 100 * SEGMENT_LENGTH)).toBe(0)
  })
})

describe('平滑弯道（曲线控制点插值）', () => {
  test('控制点之间线性插值 curve', () => {
    const track = createSmoothTrack([
      { z: 0, curve: 0 },
      { z: 800, curve: 0.4 },
      { z: 1600, curve: 0 },
    ])
    expect(track).toHaveLength(9)
    expect(track.map((s) => s.curve)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.3, 0.2, 0.1, 0])
  })

  test('首尾控制点值保留在端点', () => {
    const track = createSmoothTrack([
      { z: 0, curve: -0.5 },
      { z: 400, curve: 0.2 },
    ])
    expect(track[0].curve).toBe(-0.5)
    expect(track[track.length - 1].curve).toBeCloseTo(0.2, 5)
  })

  test('空控制点返回空赛道', () => {
    expect(createSmoothTrack([])).toEqual([])
  })

  test('createDefaultTrack 改用控制点后仍为闭环且可跑圈', () => {
    const track = createDefaultTrack()
    expect(track).toHaveLength(460)
    expect(totalCurve(track)).toBeCloseTo(0, 5)
    expect(trackIndexForCameraZ(track, 460 * SEGMENT_LENGTH - 100)).toBe(459)
    expect(trackIndexForCameraZ(track, 460 * SEGMENT_LENGTH + 50)).toBe(0)
  })
})
