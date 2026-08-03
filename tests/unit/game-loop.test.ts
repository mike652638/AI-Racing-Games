import { describe, expect, test } from 'vitest'
import {
  advancePreviewCameraZ,
  initialPreviewCameraZ,
  PREVIEW_CAMERA_SPEED,
  updateBoostCharge,
  updatePlayerFrame,
} from '../../src/game/game-loop'
import { createPlayerState } from '../../src/game/player-state'
import { createCarConfig, type CarInput } from '../../src/physics/car'
import { TRACK_DEFS, createTrackFromDef } from '../../src/engine/tracks'
import { SEGMENT_LENGTH } from '../../src/engine/track'

const LAP_LENGTH = 1000
/** 直线全油门输入 */
const THROTTLE: CarInput = { throttle: 1, brake: false, steer: 0 }

describe('updatePlayerFrame 完整更新链路', () => {
  test('全油门推进：速度加速、相机推进、个人计时递增', () => {
    const player = createPlayerState()
    const config = createCarConfig()
    const lapTimes: number[] = []
    const ref = { value: 1 }

    updatePlayerFrame(1, THROTTLE, player, config, LAP_LENGTH, lapTimes, ref)
    // speed = 0 + 2400 * 1 = 2400（无漂移，速度因子 1）
    expect(player.carState.speed).toBe(2400)
    expect(player.cameraZ).toBe(2400)
    expect(player.raceTime).toBe(1)

    updatePlayerFrame(1, THROTTLE, player, config, LAP_LENGTH, lapTimes, ref)
    expect(player.carState.speed).toBe(4800)
    expect(player.cameraZ).toBe(7200)
    expect(player.raceTime).toBe(2)
  })

  test('速度上限受 maxSpeed 约束', () => {
    const player = createPlayerState()
    const config = createCarConfig()
    updatePlayerFrame(10, THROTTLE, player, config, LAP_LENGTH)
    expect(player.carState.speed).toBe(config.maxSpeed)
  })

  test('G3（G3）：wet=true 时转向偏移小于 wet=false（湿滑路面抓地力透传）', () => {
    const dry = createPlayerState()
    const wet = createPlayerState()
    const config = createCarConfig()
    const steer: CarInput = { throttle: 0, brake: false, steer: 1 }
    // 预热：各加速 1 秒到同速度（2400），随后同速度下转向 1 秒对比横向偏移
    updatePlayerFrame(1, THROTTLE, dry, config, LAP_LENGTH)
    updatePlayerFrame(1, THROTTLE, wet, config, LAP_LENGTH)
    const dryBase = dry.carState.position
    const wetBase = wet.carState.position
    updatePlayerFrame(1, steer, dry, config, LAP_LENGTH, undefined, undefined, false)
    updatePlayerFrame(1, steer, wet, config, LAP_LENGTH, undefined, undefined, true)
    expect(wet.carState.position - wetBase).toBeLessThan(dry.carState.position - dryBase)
  })
})

describe('updatePlayerFrame 漂移链路', () => {
  test('高速大转向持续 0.3s 后激活漂移并产生横向偏移', () => {
    const player = createPlayerState()
    const config = createCarConfig()

    // 直线加速到满速（3s × 2400 = 7200 → clamp 6000）
    updatePlayerFrame(3, THROTTLE, player, config, LAP_LENGTH)
    expect(player.carState.speed).toBe(config.maxSpeed)

    // 连续高速大转向：charge 每帧 +0.1，0.25 阈值后激活漂移
    for (let i = 0; i < 3; i++) {
      updatePlayerFrame(0.1, { throttle: 0, brake: false, steer: 1 }, player, config, LAP_LENGTH)
    }
    expect(player.driftState.active).toBe(true)
    // 漂移期间有效转向率 ×1.5，车辆横向偏移
    expect(player.carState.position).toBeGreaterThan(0.1)
  })

  test('低速大转向不激活漂移', () => {
    const player = createPlayerState()
    const config = createCarConfig()
    // 低速（speed=0）持续转向不满足速度阈值，不激活
    for (let i = 0; i < 3; i++) {
      updatePlayerFrame(0.1, { throttle: 0, brake: false, steer: 1 }, player, config, LAP_LENGTH)
    }
    expect(player.driftState.active).toBe(false)
  })
})

describe('updatePlayerFrame 圈数记录', () => {
  test('过圈把当前 raceTime 压入 lapTimes 并推进 lastLapRef', () => {
    const player = createPlayerState()
    const config = createCarConfig()
    const lapTimes: number[] = []
    const ref = { value: 1 }

    for (let i = 0; i < 3; i++) {
      updatePlayerFrame(1, THROTTLE, player, config, LAP_LENGTH, lapTimes, ref)
    }
    // 帧1 cameraZ=2400 → lap 3；帧2 7200 → lap 8；帧3 13200 → lap 14
    expect(lapTimes).toEqual([1, 2, 3])
    expect(ref.value).toBe(14)
  })

  test('圈数未增加时不重复记录', () => {
    const player = createPlayerState()
    const config = createCarConfig()
    const lapTimes: number[] = []
    const ref = { value: 1 }

    updatePlayerFrame(0.1, THROTTLE, player, config, LAP_LENGTH, lapTimes, ref)
    expect(lapTimes).toEqual([])
    expect(ref.value).toBe(1)
  })

  test('不传圈数参数（P2 模式）只推进不记录圈速', () => {
    const player = createPlayerState()
    const config = createCarConfig()
    // 未传 lapTimes/lastLapRef：物理与计时照常，但不参与圈速记录
    updatePlayerFrame(1, THROTTLE, player, config, LAP_LENGTH)
    expect(player.cameraZ).toBe(2400)
    expect(player.raceTime).toBe(1)
  })
})

describe('updatePlayerFrame P1/P2 互不影响', () => {
  test('P1 推进不污染 P2 状态与圈速记录', () => {
    const config = createCarConfig()
    const p1 = createPlayerState()
    const p2 = createPlayerState()
    const lapTimes1: number[] = []
    const lapTimes2: number[] = []
    const ref1 = { value: 1 }
    const ref2 = { value: 1 }

    // P1 推进两帧并记录圈速
    updatePlayerFrame(1, THROTTLE, p1, config, LAP_LENGTH, lapTimes1, ref1)
    updatePlayerFrame(1, THROTTLE, p1, config, LAP_LENGTH, lapTimes1, ref1)

    // P2 完全不受影响
    expect(p2.cameraZ).toBe(0)
    expect(p2.raceTime).toBe(0)
    expect(p2.carState.speed).toBe(0)
    expect(p2.driftState.active).toBe(false)
    expect(lapTimes2).toEqual([])
    expect(ref2.value).toBe(1)

    // P2 独立推进后拥有自己的圈速记录
    updatePlayerFrame(1, THROTTLE, p2, config, LAP_LENGTH, lapTimes2, ref2)
    expect(p2.cameraZ).toBeGreaterThan(0)
    expect(lapTimes2).toEqual([1])
    expect(lapTimes1).toHaveLength(2)
  })

  test('P2 跨多圈独立记录到 lapTimes2（与 P1 数组完全隔离）', () => {
    const config = createCarConfig()
    const p2 = createPlayerState()
    const lapTimes1: number[] = []
    const lapTimes2: number[] = []
    const ref2 = { value: 1 }

    // P2 全油门推进 3 帧（LAP_LENGTH=1000，每帧跨多圈，与 P1 用例同节奏）
    for (let i = 0; i < 3; i++) {
      updatePlayerFrame(1, THROTTLE, p2, config, LAP_LENGTH, lapTimes2, ref2)
    }
    expect(lapTimes2).toEqual([1, 2, 3])
    expect(lapTimes1).toEqual([])
    expect(ref2.value).toBeGreaterThan(1)
  })
})

describe('菜单预览相机', () => {
  test('advancePreviewCameraZ 按固定速度线性推进', () => {
    expect(advancePreviewCameraZ(0, 1, 10000)).toBe(PREVIEW_CAMERA_SPEED)
    expect(advancePreviewCameraZ(1000, 0.5, 10000)).toBe(1000 + PREVIEW_CAMERA_SPEED * 0.5)
  })

  test('推进超过圈长后回绕回圈内', () => {
    // 恰好到达圈长边界仍保留（> lapLength 才回绕），回绕后严格落在圈内
    expect(advancePreviewCameraZ(10000 - PREVIEW_CAMERA_SPEED, 1, 10000)).toBe(10000)
    expect(advancePreviewCameraZ(10000 - 1, 1, 10000)).toBe(PREVIEW_CAMERA_SPEED - 1)
    expect(advancePreviewCameraZ(10000 - 1, 1, 10000)).toBeGreaterThanOrEqual(0)
  })

  test('initialPreviewCameraZ 按圈长等分起点', () => {
    const lapLength = 90000
    const count = TRACK_DEFS.length
    expect(initialPreviewCameraZ(0, lapLength)).toBe(0)
    expect(initialPreviewCameraZ(1, lapLength)).toBe(Math.floor(lapLength / count))
    expect(initialPreviewCameraZ(2, lapLength)).toBe(Math.floor((2 * lapLength) / count))
  })

  test('各赛道真实圈长下预览起点互不相同', () => {
    // 与 TrackManager 相同的圈长派生公式：track.length * SEGMENT_LENGTH
    const lapLengths = TRACK_DEFS.map((def) => createTrackFromDef(def).length * SEGMENT_LENGTH)
    const starts = TRACK_DEFS.map((_, i) => initialPreviewCameraZ(i, lapLengths[i]))
    // 起点两两不同，且都落在各自圈内
    expect(new Set(starts).size).toBe(starts.length)
    for (let i = 0; i < starts.length; i++) {
      expect(starts[i]).toBeGreaterThanOrEqual(0)
      expect(starts[i]).toBeLessThan(lapLengths[i])
    }
  })
})

describe('updateBoostCharge（G4）', () => {
  const DT = 0.05

  test('漂移激活时蓄力：charge 按 BOOST_CHARGE_RATE 累积', () => {
    // 漂移 1 秒（20 帧 × 0.05）：charge = min(1, 0 + 1 * 0.3) = 0.3
    const r = updateBoostCharge(0, DT, false, true)
    expect(r.charge).toBeCloseTo(DT * 0.3, 6)
    expect(r.boost).toBe(false)
  })

  test('按下 boost 且 charge > 0 时消耗并激活：charge 按 BOOST_DRAIN_RATE 递减', () => {
    const r = updateBoostCharge(0.5, DT, true, false)
    expect(r.charge).toBeCloseTo(0.5 - DT * 0.5, 6)
    expect(r.boost).toBe(true)
  })

  test('边界 clamp：漂移蓄力封顶 1、charge 归零后不再激活 boost', () => {
    // 满 charge 再漂移 → 封顶 1
    const full = updateBoostCharge(0.9, 1, false, true)
    expect(full.charge).toBe(1)
    // charge 0 且按 boost → 不激活
    const empty = updateBoostCharge(0, DT, true, false)
    expect(empty.charge).toBe(0)
    expect(empty.boost).toBe(false)
    // 消耗不越 0
    const drain = updateBoostCharge(0.01, DT, true, false)
    expect(drain.charge).toBe(0)
    expect(drain.boost).toBe(true)
  })
})
