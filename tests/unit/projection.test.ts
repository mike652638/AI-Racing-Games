import { describe, expect, test } from 'vitest'
import { clampSpriteScale, MAX_SPRITE_SCALE, project, type ProjectionOptions } from '../../src/engine/projection'

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

  test('相机沿 z 移动后按相对距离投影（远行画面不坍缩）', () => {
    const moving = { x: 0, y: 1, z: 84000 }
    const p = project(opts, moving, { x: 0, y: 0, z: 84200 })
    expect(p).not.toBeNull()
    expect(p!.scale).toBeCloseTo(opts.depth / 200, 5)
    expect(p!.y).toBeGreaterThan(opts.horizon)
  })

  test('M18 近距 scale 不超上限：clampSpriteScale 收敛到 MAX_SPRITE_SCALE', () => {
    expect(MAX_SPRITE_SCALE).toBe(2.2)
    // 正常距离原样返回
    expect(clampSpriteScale(1)).toBe(1)
    expect(clampSpriteScale(0.5)).toBe(0.5)
    // 恰好在上限时不变
    expect(clampSpriteScale(2.2)).toBe(2.2)
    // 近距贴脸收敛到上限
    expect(clampSpriteScale(10)).toBe(MAX_SPRITE_SCALE)
    expect(clampSpriteScale(100)).toBe(MAX_SPRITE_SCALE)
  })

  test('M18 clamp 在精灵侧：project 保持原语义（路面 quad 共用，不内部 clamp）', () => {
    // 极近点（z=1）返回原始超大 scale（远大于 MAX_SPRITE_SCALE）——
    // 证明 clamp 不放在 project 内，路面/车流投影数学不受影响
    const near = project(opts, camera, { x: 0, y: 0, z: 1 })
    expect(near).not.toBeNull()
    expect(near!.scale).toBeGreaterThan(MAX_SPRITE_SCALE)
    // project 的 scale 语义不变：scale = depth / dz
    expect(near!.scale).toBeCloseTo(opts.depth, 5)
  })
})
