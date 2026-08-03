import { describe, it, expect } from 'vitest'
import {
  projectSegmentQuad,
  roadColors,
  shouldDrawCenterLine,
  ROAD_HALF_WIDTH,
  EDGE_WIDTH,
} from '../../src/engine/road-geometry'
import type { ProjectionOptions } from '../../src/engine/projection'

const opts: ProjectionOptions = { width: 800, height: 600, horizon: 300, depth: 300 }
const camera = { x: 0, y: 1, z: 0 }

describe('roadColors 路面/路缘颜色交替', () => {
  it('偶数段返回深色路面', () => {
    expect(roadColors(0).road).toBe('#4a4a4a')
  })

  it('奇数段返回浅色路面', () => {
    expect(roadColors(1).road).toBe('#3c3c3c')
  })

  it('偶数段返回深红路缘', () => {
    expect(roadColors(0).side).toBe('#d03030')
  })

  it('奇数段返回浅色路缘', () => {
    expect(roadColors(1).side).toBe('#e8e8e8')
  })

  it('颜色随段号奇偶循环', () => {
    expect(roadColors(2)).toEqual(roadColors(0))
    expect(roadColors(3)).toEqual(roadColors(1))
  })
})

describe('shouldDrawCenterLine 中心线虚线', () => {
  it('偶数段绘制中心线', () => {
    expect(shouldDrawCenterLine(0)).toBe(true)
  })

  it('奇数段不绘制中心线', () => {
    expect(shouldDrawCenterLine(1)).toBe(false)
  })

  it('每两段出现一次', () => {
    const pattern = Array.from({ length: 6 }, (_, i) => shouldDrawCenterLine(i))
    expect(pattern).toEqual([true, false, true, false, true, false])
  })
})

describe('projectSegmentQuad 分段四边形投影', () => {
  it('z 在相机后方或平齐返回 null', () => {
    expect(projectSegmentQuad(opts, camera, -100, 0)).toBeNull()
    expect(projectSegmentQuad(opts, camera, 0, 0)).toBeNull()
  })

  it('正常投影返回四个角点（左点居左、右缘居右、近端在下）', () => {
    const quad = projectSegmentQuad(opts, camera, 300, 0)
    expect(quad).not.toBeNull()
    expect(quad!.l1.x).toBeLessThan(quad!.r1.x)
    expect(quad!.r1.x).toBeLessThan(quad!.r2.x)
    expect(quad!.l2.x).toBeLessThan(quad!.l1.x)
    expect(quad!.l1.y).toBeGreaterThan(opts.horizon)
  })

  it('路面半宽按透视比例投影', () => {
    const quad = projectSegmentQuad(opts, camera, 300, 0)!
    // 屏幕宽度 = 2 * 半宽 * 半屏宽 * scale
    const expected = 2 * ROAD_HALF_WIDTH * (opts.width / 2) * (opts.depth / 300)
    expect(quad.r1.x - quad.l1.x).toBeCloseTo(expected, 0)
  })

  it('路缘宽于路面', () => {
    const quad = projectSegmentQuad(opts, camera, 300, 0)!
    expect(quad.r2.x - quad.l1.x).toBeCloseTo(
      (2 * ROAD_HALF_WIDTH + EDGE_WIDTH) * (opts.width / 2) * (opts.depth / 300),
      0,
    )
  })

  it('curveSum 增大时四边形整体横向偏移', () => {
    const base = projectSegmentQuad(opts, camera, 300, 0)!
    const shifted = projectSegmentQuad(opts, camera, 300, 1)!
    expect(shifted.l1.x).toBeGreaterThan(base.l1.x)
    expect(shifted.r2.x).toBeGreaterThan(base.r2.x)
  })

  it('跟随相机横向位置（camera.x 参与投影）', () => {
    const cam = { x: 0.5, y: 1, z: 0 }
    const quad = projectSegmentQuad(opts, cam, 300, 0)!
    const noCam = projectSegmentQuad(opts, camera, 300, 0)!
    expect(quad.l1.x).toBeLessThan(noCam.l1.x)
  })

  it('远处四边形收缩（近大远小）', () => {
    const near = projectSegmentQuad(opts, camera, 300, 0)!
    const far = projectSegmentQuad(opts, camera, 1200, 0)!
    expect(far.r1.x - far.l1.x).toBeLessThan(near.r1.x - near.l1.x)
  })
})
