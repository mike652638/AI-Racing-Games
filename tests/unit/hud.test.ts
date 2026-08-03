import { describe, expect, it } from 'vitest'
import { updateHud, type HudElements } from '../../src/ui/hud'
import { createRaceState } from '../../src/game/state'
import { createCarConfig } from '../../src/physics/car'

/** 用对象字面量模拟 HUD DOM 元素：仅暴露 updateHud 使用的 hidden/textContent */
function createMockHudElements(): HudElements {
  const element = () => ({ hidden: false, textContent: '' })
  return {
    hudBest: element(),
    hudSpeed: element(),
    hudLap: element(),
    hudTime: element(),
    hudSpeed2: element(),
    hudLap2: element(),
    hudTime2: element(),
    driftIndicator: element(),
    driftScoreValue: element(),
  } as unknown as HudElements
}

describe('hud visibility', () => {
  it('菜单阶段隐藏所有 HUD 元素', () => {
    const elements = createMockHudElements()
    const race = createRaceState([])
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, 1000, 3, 'menu')
    expect(elements.hudSpeed.hidden).toBe(true)
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
    const race = createRaceState([])
    const carConfig = createCarConfig()
    updateHud(elements, race, carConfig, null, false, 1000, 3, 'racing')
    expect(elements.hudSpeed.hidden).toBe(false)
    expect(elements.hudLap.hidden).toBe(false)
    expect(elements.hudTime.hidden).toBe(false)
    expect(elements.driftIndicator.hidden).toBe(true)
  })
})
