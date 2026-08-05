import { describe, expect, it } from 'vitest'
import {
  BOOST_ACCEL_MULT,
  BOOST_CHARGE_RATE,
  BOOST_DRAIN_RATE,
  BOOST_MAX_SPEED_MULT,
  CHALLENGE_SECONDS,
  CHALLENGE_TARGET_SCORE,
  COLLISION_COOLDOWN,
  COLLISION_SPEED_FACTOR,
  DRIFT_CHARGE_THRESHOLD,
  DRIFT_SCORE_MAX,
  DRIFT_SPEED_FACTOR,
  DRIFT_STEER_THRESHOLD,
  EDGE_WIDTH,
  OFF_ROAD_PUSHBACK,
  RACE_START_GRACE,
  RENDER_DEPTH_RATIO,
  RENDER_DRAW_DISTANCE,
  RENDER_HORIZON_RATIO,
  ROAD_HALF_WIDTH,
  TRAFFIC_DEFAULT_COUNT,
} from '../../src/game/constants'
import { DRAW_DISTANCE } from '../../src/engine/road-geometry'

describe('constants 常量注册表（防魔法数字回潮）', () => {
  it('漂移常量值与约定一致', () => {
    expect(DRIFT_STEER_THRESHOLD).toBe(0.7)
    expect(DRIFT_CHARGE_THRESHOLD).toBe(0.25)
    expect(DRIFT_SPEED_FACTOR).toBe(0.985)
    expect(DRIFT_SCORE_MAX).toBe(99999)
  })

  it('挑战模式常量值与约定一致（G1：限时 60 秒刷分；M15：目标 5000 分）', () => {
    expect(CHALLENGE_SECONDS).toBe(60)
    expect(CHALLENGE_TARGET_SCORE).toBe(5000)
  })

  it('BOOST 氮气常量值与约定一致（G4）', () => {
    expect(BOOST_ACCEL_MULT).toBe(0.6)
    expect(BOOST_MAX_SPEED_MULT).toBe(1.15)
    expect(BOOST_CHARGE_RATE).toBe(0.3)
    expect(BOOST_DRAIN_RATE).toBe(0.5)
  })

  it('碰撞常量值与约定一致', () => {
    expect(COLLISION_SPEED_FACTOR).toBe(0.5)
    expect(COLLISION_COOLDOWN).toBe(1)
    // 起步保护期（2026-08-05）：覆盖倒计时 ≈2.9s + 开局短窗口（classic 首次环绕穿越 ≈1.9s）
    expect(RACE_START_GRACE).toBe(5)
  })

  it('渲染常量值与约定一致', () => {
    expect(RENDER_DRAW_DISTANCE).toBe(120)
    expect(RENDER_HORIZON_RATIO).toBe(0.35)
    expect(RENDER_DEPTH_RATIO).toBe(0.84)
  })

  it('路面几何常量值与约定一致', () => {
    expect(ROAD_HALF_WIDTH).toBe(1)
    expect(EDGE_WIDTH).toBe(0.15)
    // 出界内侧推回量（BUG-2 修复，2026-08-05）
    expect(OFF_ROAD_PUSHBACK).toBe(0.05)
  })

  it('车流常量值与约定一致', () => {
    expect(TRAFFIC_DEFAULT_COUNT).toBe(14)
  })

  it('road-geometry 兼容导出 DRAW_DISTANCE 与真源 RENDER_DRAW_DISTANCE 一致', () => {
    expect(DRAW_DISTANCE).toBe(RENDER_DRAW_DISTANCE)
  })
})
