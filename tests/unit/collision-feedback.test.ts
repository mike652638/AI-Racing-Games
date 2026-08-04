import { describe, expect, it } from 'vitest'
import {
  COLLISION_FLASH_DECAY,
  COLLISION_FLASH_DURATION,
  COLLISION_FLASH_EPSILON,
  flashSeedFromSpeedRatio,
  updateCollisionFlash,
} from '../../src/game/collision-feedback'

describe('updateCollisionFlash（M16 碰撞红闪状态机）', () => {
  it('无反馈时恒为 0（0 输入返回 0）', () => {
    expect(updateCollisionFlash(0, null, 0.016)).toBe(0)
    expect(updateCollisionFlash(0, undefined, 0.016)).toBe(0)
    expect(updateCollisionFlash(0, 0, 0.016)).toBe(0)
  })

  it('命中时以 hitSeed 重置强度（高速满格）', () => {
    expect(updateCollisionFlash(0, 0.8, 0.016)).toBeCloseTo(0.8, 5)
    expect(updateCollisionFlash(0, 1, 0.016)).toBe(1)
  })

  it('未命中时按指数衰减（duration 内明显回落）', () => {
    // flash=1 经过一个完整时长后应显著衰减（exp(-6*0.35)≈0.12）
    const after = updateCollisionFlash(1, null, COLLISION_FLASH_DURATION)
    expect(after).toBeLessThan(0.2)
    expect(after).toBeGreaterThan(0)
    // 衰减速率由常量锁定：每 0.1s 衰减 exp(-6*0.1)≈0.55
    const step = updateCollisionFlash(1, null, 0.1)
    expect(step).toBeCloseTo(Math.exp(-COLLISION_FLASH_DECAY * 0.1), 4)
  })

  it('低于 EPSILON 归零（衰减结束）', () => {
    expect(updateCollisionFlash(COLLISION_FLASH_EPSILON * 0.5, null, 1)).toBe(0)
    // 极小强度继续衰减最终归零
    expect(updateCollisionFlash(0.001, null, 2)).toBe(0)
  })

  it('连续碰撞取较大强度（不因命中而减弱）', () => {
    // 已有 flash=0.9，新命中 0.5 → 保留 0.9（取 max）
    const r = updateCollisionFlash(0.9, 0.5, 0.016)
    expect(r).toBeGreaterThanOrEqual(0.9)
    // 已有 flash=0.3，新命中 0.8 → 升级为 0.8
    const r2 = updateCollisionFlash(0.3, 0.8, 0.016)
    expect(r2).toBeGreaterThanOrEqual(0.8)
  })

  it('强度 clamp 到 [0, 1]', () => {
    expect(updateCollisionFlash(0.5, 1.5, 0.016)).toBe(1)
    expect(updateCollisionFlash(0.5, -0.2, 0.016)).toBeGreaterThan(0)
  })
})

describe('flashSeedFromSpeedRatio（M16 速度比 → 红闪强度映射）', () => {
  it('高速（≥0.6 速度比）满强度', () => {
    expect(flashSeedFromSpeedRatio(0.6)).toBe(1)
    expect(flashSeedFromSpeedRatio(1)).toBe(1)
  })

  it('低速（<0.6）线性缩放', () => {
    expect(flashSeedFromSpeedRatio(0.3)).toBeCloseTo(0.5, 5)
    expect(flashSeedFromSpeedRatio(0.15)).toBeCloseTo(0.25, 5)
  })

  it('零速度/负值无反馈', () => {
    expect(flashSeedFromSpeedRatio(0)).toBe(0)
    expect(flashSeedFromSpeedRatio(-0.5)).toBe(0)
  })
})
