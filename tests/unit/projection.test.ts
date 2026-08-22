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

  // ---- D1 渲染热路径 out 复用（S 修复）----

  test('D1 传 out 时返回同一对象引用且字段正确', () => {
    const out = { x: 0, y: 0, scale: 0 }
    const p = project(opts, camera, { x: 1, y: 0, z: 300 }, out)
    expect(p).not.toBeNull()
    // 返回同一引用（in-place 写入，不新建对象）
    expect(p).toBe(out)
    expect(p!.x).toBe(800)
    // y = horizon + scale*(camera.y - point.y)*(height/2) = 300 + 1*1*300 = 600
    expect(p!.y).toBe(opts.horizon + opts.height / 2)
    expect(p!.scale).toBe(1)
  })

  test('D1 不传 out 时新建对象返回（向后兼容，纯调用方零改动）', () => {
    const a = project(opts, camera, { x: 0, y: 0, z: 300 })
    const b = project(opts, camera, { x: 0, y: 0, z: 300 })
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    // 每次调用都新建独立对象（非同一引用）
    expect(a).not.toBe(b)
    // 数值与旧版一致
    expect(a!.x).toBe(b!.x)
    expect(a!.y).toBe(b!.y)
    expect(a!.scale).toBe(b!.scale)
  })

  test('D1 out 复用后字段被完整覆盖（无残留脏字段）', () => {
    // 预置脏值，验证复用后所有字段都被投影结果完整覆盖
    const out = { x: 999, y: 999, scale: 999 }
    const p = project(opts, camera, { x: 0, y: 0, z: 300 }, out)
    expect(p).toBe(out)
    expect(out.x).toBe(400)
    expect(out.y).toBe(opts.horizon + opts.height / 2)
    expect(out.scale).toBe(1)
    // 再复用一次（不同投影点），确认旧值被新一轮覆盖而非残留
    project(opts, camera, { x: -1, y: 0, z: 300 }, out)
    expect(out.x).toBe(0)
    expect(out.scale).toBe(1)
  })

  test('D1 out 在不可见点返回 null 且不污染 out', () => {
    const out = { x: 123, y: 456, scale: 7 }
    const p = project(opts, camera, { x: 0, y: 0, z: -100 }, out)
    expect(p).toBeNull()
    // 相机后方/平齐点不写入 out，保留原值（调用方据此跳过绘制）
    expect(out.x).toBe(123)
    expect(out.y).toBe(456)
    expect(out.scale).toBe(7)
  })
})
