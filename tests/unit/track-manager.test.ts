import { describe, expect, it, vi } from 'vitest'
import { TrackManager } from '../../src/game/track-manager'
import { TRACK_DEFS } from '../../src/engine/tracks'

/** 构造 TrackManager 依赖 mock：重置回调与选单 DOM（双玩家双类高亮） */
function createHarness(splitMode = true) {
  const resetRace = vi.fn()
  const trackOptions = Array.from({ length: TRACK_DEFS.length }, () => ({
    classList: { toggle: vi.fn() },
  }))
  const manager = new TrackManager({
    resetRace,
    splitMode,
    trackOptions: trackOptions as unknown as HTMLDivElement[],
  })
  return { manager, resetRace, trackOptions }
}

describe('TrackManager 双玩家赛道上下文', () => {
  it('默认 P1/P2 均选中经典赛道且圈长一致', () => {
    const { manager } = createHarness()
    expect(manager.getTrackId(0)).toBe('classic')
    expect(manager.getTrackId(1)).toBe('classic')
    expect(manager.getLapLength(0)).toBe(manager.getLapLength(1))
    expect(manager.getTotalLaps(0)).toBe(TRACK_DEFS[0].laps)
    expect(manager.getContext(0).def).toBe(TRACK_DEFS[0])
    expect(manager.getContext(1).def).toBe(TRACK_DEFS[0])
  })

  it('selectTrack(0, 2) 只切换 P1 为 S 弯，P2 不受影响', () => {
    const { manager } = createHarness()
    manager.selectTrack(0, 2)
    expect(manager.getTrackId(0)).toBe('s-curve')
    expect(manager.getContext(0).totalLaps).toBe(2)
    expect(manager.getLapLength(0)).toBeLessThan(manager.getLapLength(1))
    expect(manager.getTrackId(1)).toBe('classic')
  })

  it('selectTrack(1, 1) 只切换 P2 为高速公路，P1 不受影响', () => {
    const { manager } = createHarness()
    manager.selectTrack(1, 1)
    expect(manager.getTrackId(1)).toBe('highway')
    expect(manager.getTrackId(0)).toBe('classic')
    expect(manager.getTotalLaps(1)).toBe(TRACK_DEFS[1].laps)
    expect(manager.getTotalLaps(0)).toBe(TRACK_DEFS[0].laps)
  })
})

describe('TrackManager 选单双类高亮与回调', () => {
  it('P1 用 selected、P2 用 selected-p2 分别高亮对应选项', () => {
    const { manager, trackOptions } = createHarness()
    manager.selectTrack(0, 2)
    // P1 选中 index2：selected 高亮该项、其余项取消
    expect(trackOptions[2].classList.toggle).toHaveBeenCalledWith('selected', true)
    expect(trackOptions[0].classList.toggle).toHaveBeenCalledWith('selected', false)
    expect(trackOptions[1].classList.toggle).toHaveBeenCalledWith('selected', false)
    // P2 仍为 classic（index0）：selected-p2 高亮 index0
    expect(trackOptions[0].classList.toggle).toHaveBeenCalledWith('selected-p2', true)

    manager.selectTrack(1, 1)
    // P2 切换到 index1：selected-p2 高亮 index1、index0 取消
    expect(trackOptions[1].classList.toggle).toHaveBeenCalledWith('selected-p2', true)
    expect(trackOptions[0].classList.toggle).toHaveBeenCalledWith('selected-p2', false)
    // P1 高亮不被 P2 切换影响（index2 的 selected 仍为 true）
    expect(trackOptions[2].classList.toggle).toHaveBeenCalledWith('selected', true)
  })

  it('selectTrack 触发 resetRace 回调（构造时不触发）', () => {
    const { manager, resetRace } = createHarness()
    expect(resetRace).not.toHaveBeenCalled()
    manager.selectTrack(0, 1)
    expect(resetRace).toHaveBeenCalledTimes(1)
    manager.selectTrack(1, 2)
    expect(resetRace).toHaveBeenCalledTimes(2)
  })

  it('单屏模式（splitMode=false）不应用 P2 的 selected-p2 高亮', () => {
    const { manager, trackOptions } = createHarness(false)
    // 构造时 P2 虽默认选中 classic（index0），单屏下不得加绿色边框
    expect(trackOptions[0].classList.toggle).toHaveBeenCalledWith('selected-p2', false)
    manager.selectTrack(1, 2)
    expect(trackOptions[2].classList.toggle).toHaveBeenCalledWith('selected-p2', false)
  })
})
