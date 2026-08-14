import { describe, expect, it } from 'vitest'
import {
  advanceRouteForkAlpha,
  hideRouteChoiceOverlay,
  initRouteRun,
  openRouteChoice,
  routeAdvanceAction,
  selectRouteBranch,
} from '../../src/game/route-choice'
import { createRaceState } from '../../src/game/state'
import { getRouteDef } from '../../src/engine/routes'
import { TRACK_DEFS } from '../../src/engine/tracks'

/** M34：路线模式集中模块契约（拆分自 game-loop.ts beginRouteChoice/chooseRouteBranch/startGame/frame） */
function setupRace() {
  const race = createRaceState()
  race.routeStageId = 'a1'
  race.routeStageCount = 4
  // routeStageIndex 为 1 基显示序号（routes.ts routeStageIndex：数组下标 + 1）
  race.routeStageIndex = 1
  race.routeIsFinish = false
  return race
}

const CLASSIC_TOUR = getRouteDef('classic-tour')

describe('initRouteRun', () => {
  it('routeId 有效：加载路线定义、置起始阶段并清空累计值，返回起始段赛道下标', () => {
    const race = setupRace()
    race.routeCumulativeTime = 99
    race.routeCumulativeDriftScore = 88
    const { routeDef, startTrackIndex } = initRouteRun('classic-tour', race)
    expect(routeDef?.id).toBe('classic-tour')
    expect(race.routeStageId).toBe('a1')
    expect(race.routeStageCount).toBe(4)
    // 1 基显示序号：a1 为第 1 段
    expect(race.routeStageIndex).toBe(1)
    expect(race.routeCumulativeTime).toBe(0)
    expect(race.routeCumulativeDriftScore).toBe(0)
    expect(startTrackIndex).toBe(TRACK_DEFS.findIndex((d) => d.id === 'classic'))
  })

  it('routeId 无效：routeDef 为 null 且不改动 race', () => {
    const race = setupRace()
    const { routeDef, startTrackIndex } = initRouteRun('nope', race)
    expect(routeDef).toBeNull()
    expect(startTrackIndex).toBe(-1)
    expect(race.routeStageId).toBe('a1')
  })

  it('routeId 为 null（非路线模式）：routeDef 为 null', () => {
    const race = setupRace()
    expect(initRouteRun(null, race).routeDef).toBeNull()
  })
})

describe('selectRouteBranch', () => {
  it('a1 段选左路 → a2-forest（forest 赛道）：累计本段时间/得分并更新段状态', () => {
    const race = setupRace()
    race.player1.raceTime = 12.3
    race.player1.driftState.score = 30
    race.player1.nearMissScore = 7
    const left = selectRouteBranch({ routeDef: CLASSIC_TOUR, race, dir: 'left' })
    expect(left?.trackIndex).toBe(TRACK_DEFS.findIndex((d) => d.id === 'forest'))
    // 累计（本段 12.3s + 30 + 7 = 37 分）
    expect(race.routeCumulativeTime).toBeCloseTo(12.3)
    expect(race.routeCumulativeDriftScore).toBe(37)
    expect(race.routeStageId).toBe('a2-forest')
    // 1 基显示序号：a2-forest 为第 2 段
    expect(race.routeStageIndex).toBe(2)
    expect(race.routeIsFinish).toBe(false)
  })

  it('a1 段选右路 → a2-island（island 赛道）', () => {
    const race = setupRace()
    const right = selectRouteBranch({ routeDef: CLASSIC_TOUR, race, dir: 'right' })
    expect(right?.trackIndex).toBe(TRACK_DEFS.findIndex((d) => d.id === 'island'))
    expect(race.routeStageId).toBe('a2-island')
  })

  it('a2-forest 双出口均指向 a3（coast 赛道）：选右路进入终段并置终段标记', () => {
    const race = setupRace()
    race.routeStageId = 'a2-forest'
    race.routeStageIndex = 2
    const right = selectRouteBranch({ routeDef: CLASSIC_TOUR, race, dir: 'right' })
    expect(right?.trackIndex).toBe(TRACK_DEFS.findIndex((d) => d.id === 'coast'))
    expect(race.routeStageId).toBe('a3')
    expect(race.routeIsFinish).toBe(true)
  })

  it('终段（a3 无分支）：选路返回 null', () => {
    const race = setupRace()
    race.routeStageId = 'a3'
    race.routeIsFinish = true
    expect(selectRouteBranch({ routeDef: CLASSIC_TOUR, race, dir: 'left' })).toBeNull()
  })

  it('routeDef 为 null：安全返回 null', () => {
    const race = setupRace()
    expect(selectRouteBranch({ routeDef: null, race, dir: 'left' })).toBeNull()
  })
})

describe('openRouteChoice', () => {
  it('覆盖层存在：填充标题/段号/按钮/预览文案，返回分叉渲染参数', () => {
    const overlay = { hidden: false, querySelector: () => ({ textContent: '' }) }
    const getElement = (id: string): HTMLElement | null =>
      id === 'route-choice' ? (overlay as unknown as HTMLElement) : null
    const race = setupRace()
    const { fork, overlayMissing } = openRouteChoice({ routeDef: CLASSIC_TOUR, race, getElement })
    expect(overlayMissing).toBe(false)
    expect(fork?.active).toBe(true)
    expect(fork?.leftName).toBe('森林穿梭')
    expect(fork?.rightName).toBe('环岛巡回')
    expect(fork?.leftOffset).toBe(-6)
    expect(fork?.rightOffset).toBe(6)
    expect(overlay.hidden).toBe(false)
  })

  it('覆盖层缺失：overlayMissing=true 且 fork 为 null（调用方回退左路防卡死）', () => {
    const race = setupRace()
    const { fork, overlayMissing } = openRouteChoice({ routeDef: CLASSIC_TOUR, race, getElement: () => null })
    expect(overlayMissing).toBe(true)
    expect(fork).toBeNull()
  })

  it('routeDef 为 null：不填充、fork 为 null 且不标记缺失', () => {
    const overlay = { hidden: false, querySelector: () => null }
    const { fork, overlayMissing } = openRouteChoice({
      routeDef: null,
      race: setupRace(),
      getElement: () => overlay as unknown as HTMLElement,
    })
    expect(fork).toBeNull()
    expect(overlayMissing).toBe(false)
  })
})

describe('routeAdvanceAction', () => {
  it('未超圈 → none', () => {
    expect(routeAdvanceAction(setupRace(), false)).toBe('none')
  })

  it('超圈且非终段 → choice', () => {
    expect(routeAdvanceAction(setupRace(), true)).toBe('choice')
  })

  it('超圈且终段 → finish', () => {
    const race = setupRace()
    race.routeIsFinish = true
    expect(routeAdvanceAction(race, true)).toBe('finish')
  })

  it('routeStageId 为 null（非路线开局）→ none', () => {
    expect(routeAdvanceAction(createRaceState(), true)).toBe('none')
  })
})

describe('advanceRouteForkAlpha / hideRouteChoiceOverlay', () => {
  it('淡入递增并 clamp 到 1', () => {
    expect(advanceRouteForkAlpha(0, 0.1)).toBeCloseTo(0.35)
    expect(advanceRouteForkAlpha(0.9, 0.1)).toBe(1)
    expect(advanceRouteForkAlpha(1, 0.1)).toBe(1)
  })

  it('隐藏覆盖层（元素缺失安全跳过）', () => {
    const overlay = { hidden: false }
    hideRouteChoiceOverlay(() => overlay as unknown as HTMLElement)
    expect(overlay.hidden).toBe(true)
    expect(() => hideRouteChoiceOverlay(() => null)).not.toThrow()
  })
})
