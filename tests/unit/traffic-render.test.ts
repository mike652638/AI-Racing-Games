import { describe, it, expect } from 'vitest'
import { projectTraffic } from '../../src/engine/traffic-render'
import { DRAW_DISTANCE } from '../../src/engine/road-geometry'
import { SEGMENT_LENGTH } from '../../src/engine/track'
import type { ProjectionOptions } from '../../src/engine/projection'
import type { TrafficCar } from '../../src/engine/traffic'

const opts: ProjectionOptions = { width: 800, height: 600, horizon: 300, depth: 300 }
const camera = { x: 0, y: 1, z: 0 }
const cameraX = 0

function car(z: number, offset = 0, colorIndex = 0): TrafficCar {
  return { z, offset, speed: 2400, colorIndex }
}

describe('projectTraffic 车流投影', () => {
  it('过滤 z < cameraZ 的车辆', () => {
    const result = projectTraffic([car(100), car(300)], 200, cameraX, opts, camera)
    expect(result).toHaveLength(1)
    expect(result[0].car.z).toBe(300)
  })

  it('过滤 z 与相机平齐的车辆', () => {
    const result = projectTraffic([car(200)], 200, cameraX, opts, camera)
    expect(result).toHaveLength(0)
  })

  it('过滤超出 DRAW_DISTANCE 的车辆', () => {
    const farZ = 200 + DRAW_DISTANCE * SEGMENT_LENGTH + 1
    const result = projectTraffic([car(farZ)], 200, cameraX, opts, camera)
    expect(result).toHaveLength(0)
  })

  it('恰好处于 DRAW_DISTANCE 边界的车辆可见', () => {
    const edgeZ = 200 + DRAW_DISTANCE * SEGMENT_LENGTH
    const result = projectTraffic([car(edgeZ)], 200, cameraX, opts, camera)
    expect(result).toHaveLength(1)
  })

  it('按距离远→近排序', () => {
    const result = projectTraffic([car(400), car(800), car(600)], 200, cameraX, opts, camera)
    expect(result.map((p) => p.car.z)).toEqual([800, 600, 400])
  })

  it('投影尺寸随距离缩放（近大远小）', () => {
    const near = projectTraffic([car(300)], 200, cameraX, opts, camera)[0]
    const far = projectTraffic([car(1200)], 200, cameraX, opts, camera)[0]
    expect(far.width).toBeLessThan(near.width)
    expect(far.height).toBeLessThan(near.height)
    expect(far.bottom.y).toBeLessThan(near.bottom.y)
  })

  it('车身高度为正且窗口位于车身内部', () => {
    const p = projectTraffic([car(300)], 200, cameraX, opts, camera)[0]
    expect(p.height).toBeGreaterThan(0)
    expect(p.top.y).toBeLessThan(p.bottom.y)
  })

  it('颜色按 colorIndex 循环选择', () => {
    const result = projectTraffic([car(300, 0, 0), car(400, 0, 4)], 200, cameraX, opts, camera)
    expect(result[0].color).toBe(result[1].color)
  })

  it('横向偏移映射到屏幕 x（右移车辆投影右移）', () => {
    const left = projectTraffic([car(300, -0.5)], 200, cameraX, opts, camera)[0]
    const right = projectTraffic([car(300, 0.5)], 200, cameraX, opts, camera)[0]
    expect(right.bottom.x).toBeGreaterThan(left.bottom.x)
  })

  it('空数组返回空结果', () => {
    expect(projectTraffic([], 200, cameraX, opts, camera)).toEqual([])
  })
})

describe('车流投影尺寸校准（P0-2 回归）', () => {
  // 与 Renderer.buildOpts 同参：horizon = height*0.35, depth = width*0.84
  const sizingOpts: ProjectionOptions = { width: 800, height: 600, horizon: 210, depth: 672 }
  const sizingCamera = { x: 0, y: 1, z: 0 }

  it('近处车流（z=400）投影尺寸不超过屏幕显著比例（防巨大方块回归）', () => {
    const projected = projectTraffic([car(400, 0)], 0, 0, sizingOpts, sizingCamera)
    expect(projected).toHaveLength(1)
    const p = projected[0]
    // 车高 ≤ 40% 屏高、车宽 ≤ 60% 屏高（旧公式分别为 ~117% 与 ~151%）
    expect(p.height).toBeLessThan(sizingOpts.height * 0.4)
    expect(p.width).toBeLessThan(sizingOpts.height * 0.6)
  })
})
