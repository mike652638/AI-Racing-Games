import { describe, it, expect } from 'vitest'
import { projectSmoke } from '../../src/engine/smoke-render'
import type { ProjectionOptions } from '../../src/engine/projection'
import type { SmokeParticle } from '../../src/physics/drift'

const opts: ProjectionOptions = { width: 800, height: 600, horizon: 300, depth: 300 }
const camera = { x: 0, y: 1, z: 0 }
const cameraX = 0

function particle(z: number, t = 0, x = 0): SmokeParticle {
  return { x, z, t }
}

describe('projectSmoke 烟雾投影', () => {
  it('过滤相机后方或平齐的烟雾', () => {
    expect(projectSmoke([particle(100)], 200, cameraX, opts, camera)).toHaveLength(0)
    expect(projectSmoke([particle(200)], 200, cameraX, opts, camera)).toHaveLength(0)
  })

  it('可见烟雾返回投影且半径为正', () => {
    const result = projectSmoke([particle(300)], 200, cameraX, opts, camera)
    expect(result).toHaveLength(1)
    expect(result[0].radius).toBeGreaterThan(0)
  })

  it('透明度随存活时间衰减', () => {
    const fresh = projectSmoke([particle(300, 0)], 200, cameraX, opts, camera)[0]
    const middle = projectSmoke([particle(300, 0.3)], 200, cameraX, opts, camera)[0]
    const dead = projectSmoke([particle(300, 0.6)], 200, cameraX, opts, camera)[0]
    expect(fresh.alpha).toBe(0.4)
    expect(middle.alpha).toBeCloseTo(0.2, 5)
    expect(middle.alpha).toBeLessThan(fresh.alpha)
    expect(middle.alpha).toBeGreaterThan(0)
    expect(dead.alpha).toBe(0)
  })

  it('透明度不因存活时间过长而变负', () => {
    const p = projectSmoke([particle(300, 5)], 200, cameraX, opts, camera)[0]
    expect(p.alpha).toBe(0)
  })

  it('半径随距离缩小（近大远小）', () => {
    const near = projectSmoke([particle(300)], 200, cameraX, opts, camera)[0]
    const far = projectSmoke([particle(1200)], 200, cameraX, opts, camera)[0]
    expect(far.radius).toBeLessThan(near.radius)
    expect(far.radius).toBeGreaterThan(0)
  })

  it('横向位置随粒子 x 偏移', () => {
    const left = projectSmoke([particle(300, 0, -1)], 200, cameraX, opts, camera)[0]
    const right = projectSmoke([particle(300, 0, 1)], 200, cameraX, opts, camera)[0]
    expect(right.x).toBeGreaterThan(left.x)
  })

  it('圆心位于粒子底部之上（y 上移）', () => {
    const p = projectSmoke([particle(300)], 200, cameraX, opts, camera)[0]
    expect(p.y).toBeLessThan(opts.horizon + 300 * (opts.depth / 100) * 0.5)
  })

  it('空数组返回空结果', () => {
    expect(projectSmoke([], 200, cameraX, opts, camera)).toEqual([])
  })
})
