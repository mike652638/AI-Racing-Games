import { describe, expect, test } from 'vitest'
import { project, type ProjectionOptions } from '../../src/engine/projection'

const opts: ProjectionOptions = { width: 800, height: 600, horizon: 300, depth: 300 }
const camera = { x: 0, y: 1, z: 0 }

describe('project 伪3D透视投影', () => {
  test('相机正前方 depth 处的地面点 scale 为 1 且横向居中', () => {
    const p = project(opts, camera, { x: 0, y: 0, z: 300 })
    expect(p).not.toBeNull()
    expect(p!.scale).toBe(1)
    expect(p!.x).toBe(400)
  })

  test('远处点 scale 缩小，屏幕 y 向地平线收敛', () => {
    const near = project(opts, camera, { x: 0, y: 0, z: 300 })!
    const far = project(opts, camera, { x: 0, y: 0, z: 1200 })!
    expect(far.scale).toBeLessThan(near.scale)
    expect(far.y).toBeGreaterThan(opts.horizon)
    expect(far.y).toBeLessThan(near.y)
  })

  test('横向偏移映射到屏幕 x（scale=1 时 1 世界单位 = 半屏宽）', () => {
    const right = project(opts, camera, { x: 1, y: 0, z: 300 })!
    expect(right.x).toBe(800)
    const left = project(opts, camera, { x: -1, y: 0, z: 300 })!
    expect(left.x).toBe(0)
  })

  test('相机后方或平齐的点不可见（返回 null）', () => {
    expect(project(opts, camera, { x: 0, y: 0, z: 300 })).not.toBeNull()
    expect(project(opts, camera, { x: 0, y: 0, z: 0 })).toBeNull()
    expect(project(opts, camera, { x: 0, y: 0, z: -100 })).toBeNull()
  })

  test('极远处收敛到地平线且 scale 趋近 0', () => {
    const p = project(opts, camera, { x: 0, y: 0, z: 1e6 })!
    expect(p.y).toBeCloseTo(opts.horizon, 0)
    expect(p.scale).toBeCloseTo(0, 3)
  })
})
