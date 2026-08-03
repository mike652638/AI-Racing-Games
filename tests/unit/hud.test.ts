import { describe, expect, it, vi } from 'vitest'
import { updateHud, type HudElements } from '../../src/ui/hud'
import { createRaceState } from '../../src/game/state'
import { createCarConfig } from '../../src/physics/car'
import { TRACK_DEFS } from '../../src/engine/tracks'
import { createTrackContext, type TrackContext } from '../../src/game/track-context'

/** 双玩家各自独立赛道世界：P1 经典（3 圈）、P2 S 弯（2 圈） */
const TRACKS: [TrackContext, TrackContext] = [
  createTrackContext(TRACK_DEFS[0]),
  createTrackContext(TRACK_DEFS[2]),
]

/** 用对象字面量模拟 HUD DOM 元素：仅暴露 updateHud 使用的 hidden/textContent/classList */
function createMockHudElements(): HudElements {
  const element = () => ({ hidden: false, textContent: '' })
  const container = () => ({ classList: { toggle: vi.fn() } })
  return {
    hudContainer: container() as unknown as HTMLDivElement,
    hud2Container: container() as unknown as HTMLDivElement,
    hudBest: element(),
    hudSpeed: element(),
    hudSpeedUnit: element(),
    hudLap: element(),
    hudTime: element(),
    hudSpeed2: element(),
    hudSpeedUnit2: element(),
    hudLap2: element(),
    hudTime2: element(),
    hudBest2: element(),
    driftIndicator: element(),
    driftScoreValue: element(),
  } as unknown as HudElements
}

describe('hud visibility', () => {
  it('菜单阶段隐藏所有 HUD 元素', () => {
    const elements = createMockHudElements()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'menu', null, null)
    expect(elements.hudSpeed.hidden).toBe(true)
    expect(elements.hudSpeedUnit!.hidden).toBe(true)
    expect(elements.hudSpeedUnit2!.hidden).toBe(true)
    expect(elements.hudLap.hidden).toBe(true)
    expect(elements.hudTime.hidden).toBe(true)
    expect(elements.hudBest.hidden).toBe(true)
    expect(elements.hudSpeed2.hidden).toBe(true)
    expect(elements.hudLap2.hidden).toBe(true)
    expect(elements.hudTime2.hidden).toBe(true)
    expect(elements.driftIndicator.hidden).toBe(true)
  })

  it('比赛阶段显示 P1 HUD，漂移未激活时隐藏漂移指示', () => {
    const elements = createMockHudElements()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'racing', null, null)
    expect(elements.hudSpeed.hidden).toBe(false)
    expect(elements.hudSpeedUnit!.hidden).toBe(false)
    expect(elements.hudLap.hidden).toBe(false)
    expect(elements.hudTime.hidden).toBe(false)
    expect(elements.driftIndicator.hidden).toBe(true)
  })
})

describe('hud split layout', () => {
  it('分屏模式时给两个 HUD 容器切换 split 布局类', () => {
    const elements = createMockHudElements()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, true, TRACKS, 'racing', null, null)
    expect(elements.hudContainer!.classList.toggle).toHaveBeenCalledWith('split', true)
    expect(elements.hud2Container!.classList.toggle).toHaveBeenCalledWith('split', true)
  })

  it('非分屏模式时移除 split 布局类', () => {
    const elements = createMockHudElements()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'racing', null, null)
    expect(elements.hudContainer!.classList.toggle).toHaveBeenCalledWith('split', false)
    expect(elements.hud2Container!.classList.toggle).toHaveBeenCalledWith('split', false)
  })
})

describe('hud 双玩家圈数（各自独立赛道世界）', () => {
  it('分屏时 P1 圈数按 tracks[0]（classic 3 圈）、P2 按 tracks[1]（s-curve 2 圈）格式化', () => {
    const elements = createMockHudElements()
    const race = createRaceState()
    const carConfig = createCarConfig()
    // cameraZ=0 → lapFromZ 返回第 1 圈：LAP 1/3 与 LAP 1/2
    updateHud(elements, race, carConfig, null, true, TRACKS, 'racing', null, null)
    expect(elements.hudLap.textContent).toBe('LAP 1/3')
    expect(elements.hudLap2.textContent).toBe('LAP 1/2')
  })

  it('非分屏时 P2 圈数隐藏，P1 圈数仍按 tracks[0] 格式化', () => {
    const elements = createMockHudElements()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'racing', null, null)
    expect(elements.hudLap.textContent).toBe('LAP 1/3')
    expect(elements.hudLap2.hidden).toBe(true)
  })
})

describe('hud P2 BEST', () => {
  it('分屏比赛阶段显示 P2 BEST（formatTime 格式）', () => {
    const elements = createMockHudElements()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, true, TRACKS, 'racing', 42.5, null)
    expect(elements.hudBest2!.hidden).toBe(false)
    expect(elements.hudBest2!.textContent).toBe('BEST 0:42.500')
  })

  it('分屏且 bestTime2 为 null 时隐藏 P2 BEST', () => {
    const elements = createMockHudElements()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, true, TRACKS, 'racing', null, null)
    expect(elements.hudBest2!.hidden).toBe(true)
  })

  it('非分屏时 P2 BEST 保持隐藏（即使有 bestTime2 值）', () => {
    const elements = createMockHudElements()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'racing', 42.5, null)
    expect(elements.hudBest2!.hidden).toBe(true)
  })

  it('菜单阶段 P2 BEST 隐藏', () => {
    const elements = createMockHudElements()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, true, TRACKS, 'menu', 42.5, null)
    expect(elements.hudBest2!.hidden).toBe(true)
  })
})

describe('单屏 P2 BEST', () => {
  /** 在既有 mock 基础上补 hudBestP2 字段（既有用例 mock 无此字段，用于验证可选访问兼容） */
  const withP2Best = (): HudElements => {
    const element = () => ({ hidden: false, textContent: '' })
    return {
      ...createMockHudElements(),
      hudBestP2: element() as HTMLDivElement,
    } as unknown as HudElements
  }

  it('单屏且 bestTime2 有值时显示 P2 BEST（formatTime 格式）', () => {
    const elements = withP2Best()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'racing', 12.34, null)
    expect(elements.hudBestP2!.hidden).toBe(false)
    expect(elements.hudBestP2!.textContent).toBe('P2 BEST 0:12.340')
  })

  it('单屏且 bestTime2 为 null 时隐藏 hudBestP2', () => {
    const elements = withP2Best()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'racing', null, null)
    expect(elements.hudBestP2!.hidden).toBe(true)
  })

  it('分屏模式时 hudBestP2 保持隐藏（单屏专用元素）', () => {
    const elements = withP2Best()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, true, TRACKS, 'racing', 12.34, null)
    expect(elements.hudBestP2!.hidden).toBe(true)
  })
})

describe('hud 热座玩家标签（hudPlayerTag）', () => {
  /** 在既有 mock 基础上补 hudPlayerTag 字段（含 classList.toggle，热座回合标识用） */
  const withTag = (): HudElements => {
    const element = () => ({ hidden: false, textContent: '', classList: { toggle: vi.fn() } })
    return {
      ...createMockHudElements(),
      hudPlayerTag: element() as unknown as HTMLDivElement,
    } as unknown as HudElements
  }

  it('热座 P2 回合显示 P2 驾驶中并切换 p2 类', () => {
    const elements = withTag()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'racing', null, 2)
    expect(elements.hudPlayerTag!.hidden).toBe(false)
    expect(elements.hudPlayerTag!.textContent).toBe('P2 驾驶中')
    expect(elements.hudPlayerTag!.classList.toggle).toHaveBeenCalledWith('p1', false)
    expect(elements.hudPlayerTag!.classList.toggle).toHaveBeenCalledWith('p2', true)
  })

  it('热座 P1 回合显示 P1 驾驶中并切换 p1 类', () => {
    const elements = withTag()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'racing', null, 1)
    expect(elements.hudPlayerTag!.hidden).toBe(false)
    expect(elements.hudPlayerTag!.textContent).toBe('P1 驾驶中')
    expect(elements.hudPlayerTag!.classList.toggle).toHaveBeenCalledWith('p1', true)
    expect(elements.hudPlayerTag!.classList.toggle).toHaveBeenCalledWith('p2', false)
  })

  it('非热座（第 9 参 null）隐藏玩家标签', () => {
    const elements = withTag()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'racing', null, null)
    expect(elements.hudPlayerTag!.hidden).toBe(true)
  })

  it('菜单阶段隐藏玩家标签（即使热座回合 1）', () => {
    const elements = withTag()
    const race = createRaceState()
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, TRACKS, 'menu', null, 1)
    expect(elements.hudPlayerTag!.hidden).toBe(true)
  })
})
