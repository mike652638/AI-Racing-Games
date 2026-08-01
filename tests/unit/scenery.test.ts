import { describe, expect, test } from 'vitest'
import { generateMountainProfile, parallaxOffset } from '../../src/engine/scenery'

describe('远山轮廓生成', () => {
  test('生成与宽度等长的轮廓', () => {
    const profile = generateMountainProfile(320, 42)
    expect(profile).toHaveLength(320)
  })

  test('轮廓值域在 0..1 之间', () => {
    const profile = generateMountainProfile(320, 7)
    for (const h of profile) {
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(1)
    }
  })

  test('相同种子输出确定且相同', () => {
    expect(generateMountainProfile(128, 99)).toEqual(generateMountainProfile(128, 99))
  })

  test('不同种子输出不同', () => {
    expect(generateMountainProfile(128, 99)).not.toEqual(generateMountainProfile(128, 100))
  })

  test('轮廓存在起伏（非全平）', () => {
    const profile = generateMountainProfile(128, 5)
    const max = Math.max(...profile)
    const min = Math.min(...profile)
    expect(max - min).toBeGreaterThan(0.05)
  })
})

describe('视差偏移', () => {
  test('相机归零时偏移为 0', () => {
    expect(parallaxOffset(0, 1, 100)).toBe(0)
  })

  test('偏移按宽度取模', () => {
    expect(parallaxOffset(250, 1, 100)).toBe(50)
  })

  test('负值相机坐标回绕为正', () => {
    expect(parallaxOffset(-50, 1, 100)).toBe(50)
  })

  test('视差因子放大偏移并取模', () => {
    expect(parallaxOffset(100, 2, 100)).toBe(0)
    expect(parallaxOffset(30, 3, 100)).toBe(90)
  })
})
