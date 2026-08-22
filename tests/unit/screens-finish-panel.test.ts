import { describe, expect, it, vi } from 'vitest'
import { applyPhaseToScreens, type FinishPanelOptions, type ScreenElements } from '../../src/ui/screens'
import { createRaceState } from '../../src/game/state'
import { createCarConfig } from '../../src/physics/car'
import { PHASE_FINISHED } from '../../src/shared/phase'
import { CHALLENGE_TARGET_SCORE } from '../../src/shared/constants'
import { FINISH_DRIFT_HINT, FINISH_TITLE_CHALLENGE, FINISH_TITLE_DEFAULT, MEDAL_LABEL } from '../../src/ui/copy'
import type { RaceState } from '../../src/shared/types'
import type { WinStats } from '../../src/ui/save'

/**
 * 结算面板填充（fillFinishPanel）白盒补盲测试。
 *
 * fillFinishPanel 为 screens.ts 私有函数（未导出），但由已导出的 applyPhaseToScreens
 * 在 PHASE_FINISHED 阶段调用——本测试经该公开入口覆盖 fillFinishPanel 各分支。
 *
 * 环境说明：vitest 配置为 node（非 jsdom），故沿用 hud.test.ts / screens-pause.test.ts
 * 的对象字面量 DOM mock 模式；save.ts 在无 localStorage 时安全降级（读返回 null、写返回
 * false），因此 NEW RECORD / NEW DRIFT RECORD 分支在 node 环境不可达（属已知盲区，见报告）。
 */
function makeElements(): ScreenElements {
  const el = () => ({ hidden: false, textContent: '' })
  const elWithClass = () => ({
    hidden: false,
    textContent: '',
    classList: { toggle: vi.fn() },
  })
  return {
    startScreen: el() as unknown as HTMLDivElement,
    finishScreen: el() as unknown as HTMLDivElement,
    pauseScreen: el() as unknown as HTMLDivElement,
    finishTitle: el() as unknown as HTMLHeadingElement,
    finishTime: el() as unknown as HTMLParagraphElement,
    finishSpeed: el() as unknown as HTMLParagraphElement,
    finishBest: el() as unknown as HTMLParagraphElement,
    finishScore: el() as unknown as HTMLParagraphElement,
    finishLaps: el() as unknown as HTMLDivElement,
    finishTime2: el() as unknown as HTMLParagraphElement,
    finishSpeed2: el() as unknown as HTMLParagraphElement,
    finishBest2: el() as unknown as HTMLParagraphElement,
    finishScore2: el() as unknown as HTMLParagraphElement,
    finishLaps2: el() as unknown as HTMLDivElement,
    finishCard2: el() as unknown as HTMLDivElement,
    finishHint: el() as unknown as HTMLDivElement,
    finishDriftHint: el() as unknown as HTMLDivElement,
    finishDriftWinner: elWithClass() as unknown as HTMLDivElement,
    finishWins: el() as unknown as HTMLDivElement,
    finishAchievements: el() as unknown as HTMLDivElement,
    finishDaily: el() as unknown as HTMLDivElement,
    finishRestartBtn: el() as unknown as HTMLButtonElement,
    finishRestartHint: elWithClass() as unknown as HTMLParagraphElement,
  } as unknown as ScreenElements
}

/** 构造已完赛的 P1 状态（cameraZ/raceTime 供平均速度计算） */
function finishedRace(overrides: Partial<RaceState> = {}): RaceState {
  const race = createRaceState()
  race.player1.cameraZ = 50000
  race.player1.raceTime = 50
  race.lapTimes = [10, 25]
  return { ...race, ...overrides }
}

/** 默认普通单人完赛选项 */
function baseOpts(overrides: Partial<FinishPanelOptions> = {}): FinishPanelOptions {
  return {
    splitMode: false,
    finishedP1: true,
    finishedP2: false,
    hotseatMode: false,
    hotseatRound: 1,
    prevP1Time: null,
    driftWinner: null,
    winStats: null,
    challengeMode: false,
    ...overrides,
  }
}

/** 触发结算面板填充（applyPhaseToScreens 在 PHASE_FINISHED 时调用 fillFinishPanel） */
function fill(elements: ScreenElements, race: RaceState, opts: FinishPanelOptions): void {
  applyPhaseToScreens(elements, PHASE_FINISHED, race, createCarConfig(), opts)
}

describe('fillFinishPanel：普通单人完赛', () => {
  it('填充标题/用时/平均速度/最佳/漂移得分/圈速，P2 卡片隐藏', () => {
    const elements = makeElements()
    const race = finishedRace()
    fill(elements, race, baseOpts())
    expect(elements.finishTitle!.textContent).toBe(FINISH_TITLE_DEFAULT)
    expect(elements.finishTime!.textContent).toBe('总用时 0:50.000')
    // 平均速度 = cameraZ/raceTime 经 formatSpeed 换算（maxSpeed 由 createCarConfig 决定）
    expect(elements.finishSpeed!.textContent).toContain('平均速度')
    expect(elements.finishSpeed!.textContent).toContain('km/h')
    // node 环境无 localStorage → saveBestTime 返回 false → 非 NEW RECORD，显示「最佳」
    expect(elements.finishBest!.textContent).toContain('最佳')
    expect(elements.finishScore!.textContent).toBe('漂移得分 0')
    expect(elements.finishLaps!.textContent).toBe('LAP 1: 0:10.000  LAP 2: 0:15.000')
    expect(elements.finishCard2!.hidden).toBe(true)
  })

  it('漂移得分为 0 时显示 FINISH_DRIFT_HINT 引导', () => {
    const elements = makeElements()
    const race = finishedRace()
    race.player1.driftState.score = 0
    fill(elements, race, baseOpts())
    expect(elements.finishDriftHint!.hidden).toBe(false)
    expect(elements.finishDriftHint!.textContent).toBe(FINISH_DRIFT_HINT)
  })

  it('漂移得分 >0 时隐藏漂移提示', () => {
    const elements = makeElements()
    const race = finishedRace()
    race.player1.driftState.score = 120
    fill(elements, race, baseOpts())
    expect(elements.finishDriftHint!.hidden).toBe(true)
  })

  it('奖牌（medalP1）追加到最佳成绩行末尾', () => {
    const elements = makeElements()
    const race = finishedRace()
    fill(elements, race, baseOpts({ medalP1: 'S' }))
    expect(elements.finishBest!.textContent).toContain(` ${MEDAL_LABEL.S}`)
  })
})

describe('fillFinishPanel：挑战模式', () => {
  it('达标（score ≥ 目标）显示「达标」与漂移榜名次', () => {
    const elements = makeElements()
    const race = finishedRace()
    race.player1.driftState.score = CHALLENGE_TARGET_SCORE + 1000
    fill(elements, race, baseOpts({ challengeMode: true, driftRank: 3 }))
    expect(elements.finishTitle!.textContent).toBe(FINISH_TITLE_CHALLENGE)
    expect(elements.finishScore!.textContent).toContain('达标')
    expect(elements.finishScore!.textContent).toContain(`目标 ${CHALLENGE_TARGET_SCORE}`)
    expect(elements.finishBest!.textContent).toBe('漂移榜第 3 名')
  })

  it('未达标（score < 目标）显示「未达标」，未入榜显示「未进 TOP10」', () => {
    const elements = makeElements()
    const race = finishedRace()
    race.player1.driftState.score = 1000
    fill(elements, race, baseOpts({ challengeMode: true, driftRank: 0 }))
    expect(elements.finishScore!.textContent).toContain('未达标')
    expect(elements.finishBest!.textContent).toBe('未进 TOP10')
  })

  it('通过检查点时用时行追加检查点奖励', () => {
    const elements = makeElements()
    const race = finishedRace()
    race.player1.challengeCheckpoints = 3
    race.player1.challengeBonus = 6
    fill(elements, race, baseOpts({ challengeMode: true }))
    expect(elements.finishTime!.textContent).toBe('用时 0:50.000 · 检查点 +6s')
  })
})

describe('fillFinishPanel：路线模式', () => {
  it('展示累计总用时/段数/累计漂移得分，清空 BEST 与圈速行', () => {
    const elements = makeElements()
    const race = finishedRace()
    race.routeCumulativeTime = 100
    race.routeCumulativeDriftScore = 1234.5
    race.routeStageCount = 4
    fill(elements, race, baseOpts({ routeMode: true, routeName: '海岸线' }))
    expect(elements.finishTime!.textContent).toBe('路线总用时 2:30.000')
    expect(elements.finishSpeed!.textContent).toBe('完成 4 段路线 · 海岸线')
    expect(elements.finishScore!.textContent).toBe('累计漂移得分 1235')
    expect(elements.finishBest!.textContent).toBe('')
    expect(elements.finishLaps!.textContent).toBe('')
  })
})

describe('fillFinishPanel：热座 round 2', () => {
  it('P1 行显示上一回合快照用时，胜负横幅按用时比较', () => {
    const elements = makeElements()
    const race = finishedRace()
    race.player2.raceTime = 40
    fill(elements, race, baseOpts({ hotseatMode: true, hotseatRound: 2, prevP1Time: 42.5 }))
    expect(elements.finishTime!.textContent).toBe('P1 用时 0:42.500')
    expect(elements.finishHint!.hidden).toBe(false)
    expect(elements.finishHint!.textContent).toBe('P2 更快！')
    expect(elements.finishCard2!.hidden).toBe(false)
  })
})

describe('fillFinishPanel：P1 未完赛', () => {
  it('单屏显示「未完赛」并清空其余行、隐藏漂移提示', () => {
    const elements = makeElements()
    const race = finishedRace()
    fill(elements, race, baseOpts({ finishedP1: false }))
    expect(elements.finishTime!.textContent).toBe('未完赛')
    expect(elements.finishSpeed!.textContent).toBe('')
    expect(elements.finishBest!.textContent).toBe('')
    expect(elements.finishScore!.textContent).toBe('')
    expect(elements.finishDriftHint!.hidden).toBe(true)
  })
})

describe('fillFinishPanel：分屏', () => {
  it('P1/P2 行加前缀，P2 完赛填充 P2 行并显示 P2 卡片', () => {
    const elements = makeElements()
    const race = finishedRace()
    race.player2.cameraZ = 40000
    race.player2.raceTime = 45
    race.lapTimes2 = [12, 30]
    fill(elements, race, baseOpts({ splitMode: true, finishedP2: true }))
    expect(elements.finishTime!.textContent).toBe('P1 总用时 0:50.000')
    expect(elements.finishTime2!.textContent).toBe('P2 总用时 0:45.000')
    expect(elements.finishLaps2!.textContent).toBe('P2 LAP 1: 0:12.000  LAP 2: 0:18.000')
    expect(elements.finishCard2!.hidden).toBe(false)
  })

  it('分屏漂移竞速胜者横幅显示并置 p1 类', () => {
    const elements = makeElements()
    const race = finishedRace()
    fill(elements, race, baseOpts({ splitMode: true, finishedP2: true, driftWinner: 'P1' }))
    expect(elements.finishDriftWinner!.hidden).toBe(false)
    expect(elements.finishDriftWinner!.textContent).toBe('DRIFT 竞速 · P1 获胜！')
    expect(elements.finishDriftWinner!.classList.toggle).toHaveBeenCalledWith('p1', true)
  })
})

describe('fillFinishPanel：附加行', () => {
  it('胜场统计行：winStats 非 null 时显示统计与连胜', () => {
    const elements = makeElements()
    const race = finishedRace()
    const winStats: WinStats = { p1: 2, p2: 1, streak: 2, streakPlayer: 'P1' }
    fill(elements, race, baseOpts({ winStats }))
    expect(elements.finishWins!.hidden).toBe(false)
    expect(elements.finishWins!.textContent).toBe('胜场统计 · P1 2 : 1 P2 · P1 连胜 2')
  })

  it('新解锁成就行：非空列表显示成就名', () => {
    const elements = makeElements()
    const race = finishedRace()
    fill(elements, race, baseOpts({ newlyUnlockedAchievements: ['first-boost'] }))
    expect(elements.finishAchievements!.hidden).toBe(false)
    expect(elements.finishAchievements!.textContent).toContain('首次氮气')
  })

  it('今日挑战完成行：dailyDoneToday 时显示', () => {
    const elements = makeElements()
    const race = finishedRace()
    fill(elements, race, baseOpts({ dailyDoneToday: true }))
    expect(elements.finishDaily!.hidden).toBe(false)
    expect(elements.finishDaily!.textContent).toContain('今日挑战完成')
  })
})

describe('fillFinishPanel：幂等与守卫', () => {
  it('finishShown 置位后同一 race 二次调用不重复填充', () => {
    const elements = makeElements()
    const race = finishedRace()
    fill(elements, race, baseOpts())
    const first = elements.finishTime!.textContent
    // 第二次调用（改 opts 也不应覆盖，因 finishShown 已 true）
    fill(elements, race, baseOpts({ challengeMode: true }))
    expect(elements.finishTime!.textContent).toBe(first)
    expect(elements.finishTitle!.textContent).toBe(FINISH_TITLE_DEFAULT)
  })

  it('可选字段缺失时安全跳过不抛错（fillFinishPanel 对可选元素有守卫，必填字段仍须存在）', () => {
    const race = finishedRace()
    // 仅提供必填字段（finishTime/finishSpeed/finishBest/finishScore/finishLaps/finishScreen），
    // 其余可选字段（finishTitle/finishDriftHint/finishCard2 等）全部缺失——验证可选守卫不抛错
    const minimal = {
      finishScreen: { hidden: false },
      finishTime: { textContent: '' },
      finishSpeed: { textContent: '' },
      finishBest: { textContent: '' },
      finishScore: { textContent: '' },
      finishLaps: { textContent: '' },
    } as unknown as ScreenElements
    expect(() => applyPhaseToScreens(minimal, PHASE_FINISHED, race, createCarConfig(), baseOpts())).not.toThrow()
  })
})
