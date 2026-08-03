import { describe, expect, test } from 'vitest'
import {
  buildCurvePrefixSum,
  createRoadsideSprites,
  curveOffsetAtZ,
  spritesInRange,
  type Sprite,
} from '../../src/engine/sprites'
import { project, type Camera3D, type ProjectionOptions } from '../../src/engine/projection'
import { createStraightTrack, createTrack, SEGMENT_LENGTH } from '../../src/engine/track'

describe('路边景物生成', () => {
  test('确定性生成（同 seed 同结果）', () => {
    const track = createStraightTrack(50)
    expect(createRoadsideSprites(track, 1234)).toEqual(createRoadsideSprites(track, 1234))
  })

  test('按间隔成对放置，z 从间距一半开始', () => {
    const track = createStraightTrack(50) // 总长 10000
    const sprites = createRoadsideSprites(track, 1, 800)
    const zs = [...new Set(sprites.map((s) => s.z))]
    expect(zs[0]).toBe(400)
    expect(zs.every((z, i) => i === 0 || z - zs[i - 1] === 800)).toBe(true)
    expect(sprites.every((s) => Math.abs(s.offset) === 1.4)).toBe(true)
    for (const z of zs) {
      const pair = sprites.filter((s) => s.z === z)
      expect(pair).toHaveLength(2)
      expect(new Set(pair.map((s) => s.offset))).toEqual(new Set([-1.4, 1.4]))
    }
    expect(sprites.every((s) => s.height === 1.2 || s.height === 0.8)).toBe(true)
  })

  test('包含树与灯两种景物', () => {
    const track = createStraightTrack(200) // 总长 40000 → 50 对
    const sprites = createRoadsideSprites(track, 7)
    const kinds = new Set(sprites.map((s) => s.kind))
    expect(kinds).toContain('tree')
    expect(kinds).toContain('lamp')
  })
})

describe('曲率前缀和', () => {
  const track = createTrack([
    { curve: 0.02, count: 5 },
    { curve: -0.01, count: 3 },
    { curve: 0, count: 2 },
  ])

  test('前缀和长度与内容正确', () => {
    const prefix = buildCurvePrefixSum(track)
    expect(prefix).toHaveLength(track.length + 1)
    expect(prefix[0]).toBe(0)
    expect(prefix[5]).toBeCloseTo(0.1) // 前 5 段各 0.02
    expect(prefix[8]).toBeCloseTo(0.07) // 之后 3 段各 -0.01
    expect(prefix[track.length]).toBeCloseTo(0.07)
  })

  test('curveOffsetAtZ 与旧逐段累计逻辑一致（含跨段与段内插值）', () => {
    const prefix = buildCurvePrefixSum(track)
    // 旧 O(n) 参考实现：与新版应逐点一致
    const totalLength = track.length * SEGMENT_LENGTH
    const naiveCurveOffset = (z: number): number => {
      const wrapped = ((z % totalLength) + totalLength) % totalLength
      const index = Math.floor(wrapped / SEGMENT_LENGTH)
      const baseZ = index * SEGMENT_LENGTH
      let curveSum = 0
      for (let i = 0; i < index; i++) curveSum += track[i].curve
      const frac = (z - baseZ) / SEGMENT_LENGTH
      return curveSum + track[index].curve * frac
    }
    const sampleZs = [
      0,
      3 * SEGMENT_LENGTH,
      3 * SEGMENT_LENGTH + SEGMENT_LENGTH / 2,
      8 * SEGMENT_LENGTH - 1,
      3 * SEGMENT_LENGTH + totalLength, // 环回整圈
      8 * SEGMENT_LENGTH + totalLength / 2, // 环回半圈
    ]
    for (const z of sampleZs) {
      expect(curveOffsetAtZ(track, prefix, z)).toBeCloseTo(naiveCurveOffset(z))
    }
  })
})

describe('环形可见窗口', () => {
  test('窗口内可见、窗口外不可见，返回绝对 z', () => {
    const track = createStraightTrack(10) // 总长 2000
    const sprites: Sprite[] = [
      { kind: 'tree', z: 400, offset: -1.4, height: 3 },
      { kind: 'lamp', z: 1200, offset: 1.4, height: 2 },
    ]
    const seen = spritesInRange(sprites, track, 1500, 1000)
    expect(seen.map((s) => s.z)).toEqual([2400])
  })

  test('边界值可见且绝对 z 连续', () => {
    const track = createStraightTrack(10)
    const sprites: Sprite[] = [{ kind: 'tree', z: 1200, offset: -1.4, height: 3 }]
    const seen = spritesInRange(sprites, track, 1500, 1700)
    expect(seen).toHaveLength(1)
    expect(seen[0].z).toBe(3200)
  })
})

describe('路边景物投影尺寸（P0-3 回归）', () => {
  // 与 Renderer.buildOpts 同参：horizon = height*0.35, depth = width*0.84
  const opts: ProjectionOptions = { width: 800, height: 600, horizon: 210, depth: 672 }
  const camera: Camera3D = { x: 0, y: 1, z: 0 }

  test('非贴地景物（z≥900）投影高度不超过屏幕高度 50%（防极端放大回归）', () => {
    const track = createStraightTrack(50)
    const sprites = createRoadsideSprites(track, 1234)
    // z=400 的景物底部已超出屏幕（贴脸透视），50% 界限针对树底仍可见的近处景物
    const candidates = sprites.filter((s) => s.z >= 900)
    expect(candidates.length).toBeGreaterThan(0)
    const maxHpx = Math.max(
      ...candidates.map((s) => {
        const bottom = project(opts, camera, { x: s.offset, y: 0, z: s.z })
        const top = project(opts, camera, { x: s.offset, y: s.height, z: s.z })
        if (!bottom || !top) {
          throw new Error('投影失败')
        }
        return bottom.y - top.y
      }),
    )
    expect(maxHpx).toBeLessThan(opts.height * 0.5)
  })
})
