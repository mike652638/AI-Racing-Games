import { describe, expect, test } from 'vitest'
import { createRoadsideSprites, spritesInRange, type Sprite } from '../../src/engine/sprites'
import { createStraightTrack } from '../../src/engine/track'

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
    expect(sprites.every((s) => s.height === 3 || s.height === 2)).toBe(true)
  })

  test('包含树与灯两种景物', () => {
    const track = createStraightTrack(200) // 总长 40000 → 50 对
    const sprites = createRoadsideSprites(track, 7)
    const kinds = new Set(sprites.map((s) => s.kind))
    expect(kinds).toContain('tree')
    expect(kinds).toContain('lamp')
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
