import { describe, expect, test } from 'vitest'
import { computeEngineParams, MIN_FREQUENCY, MAX_FREQUENCY } from '../../src/audio/engine'

describe('computeEngineParams', () => {
  test('怠速与红线频率', () => {
    expect(computeEngineParams(0).frequency).toBe(MIN_FREQUENCY)
    expect(computeEngineParams(1).frequency).toBe(MAX_FREQUENCY)
  })
  test('频率随速度比单调上升', () => {
    const a = computeEngineParams(0.2)
    const b = computeEngineParams(0.8)
    expect(b.frequency).toBeGreaterThan(a.frequency)
  })
  test('增益限制在 (0, 1]', () => {
    expect(computeEngineParams(0).gain).toBeGreaterThan(0)
    expect(computeEngineParams(1).gain).toBeLessThanOrEqual(1)
  })
  test('速度比越界时钳制', () => {
    expect(computeEngineParams(-0.5).frequency).toBe(MIN_FREQUENCY)
    expect(computeEngineParams(1.5).frequency).toBe(MAX_FREQUENCY)
  })
})
