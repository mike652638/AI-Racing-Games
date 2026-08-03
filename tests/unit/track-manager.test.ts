import { describe, expect, it, vi } from 'vitest'
import { TrackManager } from '../../src/game/track-manager'
import { TRACK_DEFS } from '../../src/engine/tracks'
import { SEGMENT_LENGTH } from '../../src/engine/track'
import type { Renderer } from '../../src/engine/renderer'

/** 构造 TrackManager 依赖 mock：渲染器 setTrack、重置回调与选单 DOM */
function createHarness() {
  const setTrack = vi.fn()
  const renderer = { setTrack } as unknown as Renderer
  const resetRace = vi.fn()
  const trackName = { textContent: '' }
  const trackOptions = Array.from({ length: 3 }, () => ({
    classList: { toggle: vi.fn() },
  }))
  const manager = new TrackManager({
    renderer: () => renderer,
    resetRace,
    trackName: trackName as unknown as HTMLSpanElement,
    trackOptions: trackOptions as unknown as HTMLDivElement[],
  })
  return { manager, setTrack, resetRace, trackName, trackOptions }
}

describe('TrackManager 初始状态', () => {
  it('默认选中第一个赛道并派生圈长/圈数', () => {
    const { manager } = createHarness()
    expect(manager.selectedIndex).toBe(0)
    expect(manager.trackDef).toBe(TRACK_DEFS[0])
    expect(manager.track.length).toBeGreaterThan(0)
    expect(manager.totalLaps).toBe(TRACK_DEFS[0].laps)
    expect(manager.lapLength).toBe(manager.track.length * SEGMENT_LENGTH)
  })
})

describe('TrackManager.applyTrack', () => {
  it('切换赛道定义并派生新的圈长/圈数', () => {
    const { manager } = createHarness()
    manager.applyTrack(1)
    expect(manager.selectedIndex).toBe(1)
    expect(manager.trackDef).toBe(TRACK_DEFS[1])
    expect(manager.totalLaps).toBe(TRACK_DEFS[1].laps)
    expect(manager.lapLength).toBe(manager.track.length * SEGMENT_LENGTH)
  })

  it('同步渲染器景物并重置对局', () => {
    const { manager, setTrack, resetRace } = createHarness()
    manager.applyTrack(2)
    expect(setTrack).toHaveBeenCalledTimes(1)
    expect(resetRace).toHaveBeenCalledTimes(1)
  })

  it('更新赛道名与选单高亮', () => {
    const { manager, trackName, trackOptions } = createHarness()
    manager.applyTrack(2)
    expect(trackName.textContent).toBe(TRACK_DEFS[2].name)
    expect(trackOptions[2].classList.toggle).toHaveBeenCalledWith('selected', true)
    expect(trackOptions[0].classList.toggle).toHaveBeenCalledWith('selected', false)
  })
})
