import type { CarConfig } from '../physics/car'
import type { RaceState } from '../game/state'
import { formatLapTimes, formatSpeed, formatTime } from './format'
import {
  loadBestDriftScore,
  loadBestDriftScoreFor,
  loadBestTime,
  loadBestTimeFor,
  saveBestDriftScore,
  saveBestDriftScoreFor,
  saveBestTime,
  saveBestTimeFor,
  type WinStats,
} from './save'
import {
  PHASE_FINISHED,
  PHASE_MENU,
  PHASE_PAUSED,
  PHASE_RACING,
  type Phase,
} from './gamestate'

/** 屏幕 DOM 引用：启动/结算/暂停面板及结算文本（P2 行仅分屏时存在） */
export interface ScreenElements {
  startScreen: HTMLDivElement
  finishScreen: HTMLDivElement
  pauseScreen: HTMLDivElement
  finishTime: HTMLParagraphElement
  finishSpeed: HTMLParagraphElement
  finishBest: HTMLParagraphElement
  finishScore: HTMLParagraphElement
  finishLaps: HTMLDivElement
  finishTime2?: HTMLParagraphElement
  finishSpeed2?: HTMLParagraphElement
  finishBest2?: HTMLParagraphElement
  finishScore2?: HTMLParagraphElement
  finishLaps2?: HTMLDivElement
  /** 热座交棒/胜负提示（#finish-hint，仅热座模式填充） */
  finishHint?: HTMLDivElement
  /** 分屏漂移竞速排名横幅（#finish-drift-winner，仅分屏双完赛填充） */
  finishDriftWinner?: HTMLDivElement
  /** 胜场统计行（#finish-wins，热座/分屏分胜负时填充） */
  finishWins?: HTMLDivElement
  /** 暂停菜单音量 slider（#pause-volume，input range 0-100；GameLoop 构造器绑定 input 事件） */
  pauseVolume?: HTMLInputElement
  /** 暂停菜单重开按钮（#pause-restart，click 回菜单） */
  pauseRestart?: HTMLButtonElement
  /** 暂停菜单继续按钮（#pause-resume，click 恢复比赛；GameLoop 构造器绑定） */
  pauseResume?: HTMLButtonElement
}

/** 结算面板填充选项：双人完赛标记（applyPhaseToScreens 由 GameLoop 计算传入）；
 *  热座字段：hotseatMode 开热座、hotseatRound 当前回合（1 | 2）、prevP1Time 为 P1 回合快照用时；
 *  漂移竞速字段：driftWinner 为分屏双完赛时的漂移得分胜者（非分屏/未双完赛恒 null）；
 *  胜场统计字段：winStats 为 recordWin 后的最新统计（平手/单人不记时 null） */
export interface FinishPanelOptions {
  splitMode: boolean
  finishedP1: boolean
  finishedP2: boolean
  hotseatMode: boolean
  hotseatRound: 1 | 2
  prevP1Time: number | null
  driftWinner: 'P1' | 'P2' | null
  winStats: WinStats | null
}

/**
 * 阶段切换时的屏幕显隐与结算面板填充。
 * 注意：回到菜单的完整对局重置由调用方（main.ts）负责。
 */
export function applyPhaseToScreens(
  elements: ScreenElements,
  phase: Phase,
  race: RaceState,
  carConfig: CarConfig,
  opts: FinishPanelOptions,
): void {
  if (phase === PHASE_MENU) {
    elements.startScreen.hidden = false
    elements.finishScreen.hidden = true
    elements.pauseScreen.hidden = true
  }
  else if (phase === PHASE_RACING) {
    elements.startScreen.hidden = true
    elements.finishScreen.hidden = true
    elements.pauseScreen.hidden = true
  }
  else if (phase === PHASE_PAUSED) {
    elements.pauseScreen.hidden = false
  }
  else if (phase === PHASE_FINISHED) {
    elements.finishScreen.hidden = false
    fillFinishPanel(elements, race, carConfig, opts)
  }
}

/** 结算面板填充（每局只执行一次，写入记录并展示平均速度/圈速/漂移得分；双人各自独立） */
function fillFinishPanel(
  elements: ScreenElements,
  race: RaceState,
  carConfig: CarConfig,
  opts: FinishPanelOptions,
): void {
  if (race.finishShown) {
    return
  }
  race.finishShown = true

  const trackId0 = race.tracks[0].def.id
  if (opts.hotseatMode && opts.hotseatRound === 2 && opts.prevP1Time !== null) {
    // 热座 round 2：P1 行显示上一回合快照用时（不写存档、不显示纪录横幅，防止覆盖 P1 纪录）
    elements.finishTime.textContent = `P1 用时 ${formatTime(opts.prevP1Time)}`
    elements.finishSpeed.textContent = ''
    elements.finishBest.textContent = ''
    elements.finishScore.textContent = ''
    elements.finishLaps.textContent = ''
  } else if (opts.finishedP1) {
    const avgSpeed = race.player1.cameraZ / Math.max(race.player1.raceTime, 0.001)
    // E1：分屏模式下 P1 结算行加 'P1 ' 前缀（与 P2 行对称）；圈速行 finishLaps 不加（与 P2 对称）
    elements.finishTime.textContent = `${opts.splitMode ? 'P1 ' : ''}总用时 ${formatTime(race.player1.raceTime)}`
    elements.finishSpeed.textContent = `${opts.splitMode ? 'P1 ' : ''}平均速度 ${formatSpeed(avgSpeed, carConfig.maxSpeed)} km/h`

    const isRecord = saveBestTime(race.player1.raceTime, trackId0)
    const bestTime = loadBestTime(trackId0)
    elements.finishBest.textContent = isRecord
      ? `${opts.splitMode ? 'P1 ' : ''}NEW RECORD!`
      : `${opts.splitMode ? 'P1 ' : ''}最佳 ${formatTime(bestTime ?? race.player1.raceTime)}`

    elements.finishScore.textContent = `${opts.splitMode ? 'P1 ' : ''}漂移得分 ${Math.round(race.player1.driftState.score)}`
    if (race.player1.driftState.score > 0) {
      const isDriftRecord = saveBestDriftScore(Math.round(race.player1.driftState.score), trackId0)
      const bestDriftScore = loadBestDriftScore(trackId0)
      if (isDriftRecord) {
        elements.finishScore.textContent += ' NEW DRIFT RECORD!'
      }
      else if (bestDriftScore !== null) {
        elements.finishScore.textContent += ` (最高 ${bestDriftScore})`
      }
    }

    // P1：分屏时 P1 圈速行加 'P1 ' 前缀（与 P2 圈速行对称）；单屏不加
    elements.finishLaps.textContent =
      `${opts.splitMode ? 'P1 ' : ''}${formatLapTimes(race.lapTimes).join('  ')}`
  }
  else {
    // P1 未完赛：清空其余行，仅显示"未完赛"（分屏加 P1 前缀与 P2 行对称）
    elements.finishTime.textContent = opts.splitMode ? 'P1 未完赛' : '未完赛'
    elements.finishSpeed.textContent = ''
    elements.finishBest.textContent = ''
    elements.finishScore.textContent = ''
    elements.finishLaps.textContent = ''
  }

  // P2 行：分屏或热座 round 2（P2 已跑）时填充并控制显隐；热座 round 1 P2 未跑天然跳过
  // （index.html 初始 hidden，仅写 textContent 会不可见）
  if ((opts.splitMode || (opts.hotseatMode && opts.hotseatRound === 2)) && elements.finishTime2) {
    const trackId1 = race.tracks[1].def.id
    if (opts.finishedP2) {
      // 全部 P2 结算行可见（视觉缺陷修复：显式 hidden=false）
      elements.finishTime2.hidden = false
      if (elements.finishSpeed2) elements.finishSpeed2.hidden = false
      if (elements.finishBest2) elements.finishBest2.hidden = false
      if (elements.finishScore2) elements.finishScore2.hidden = false
      if (elements.finishLaps2) elements.finishLaps2.hidden = false

      elements.finishTime2.textContent = `P2 总用时 ${formatTime(race.player2.raceTime)}`
      const avgSpeed2 = race.player2.cameraZ / Math.max(race.player2.raceTime, 0.001)
      if (elements.finishSpeed2) {
        elements.finishSpeed2.textContent = `P2 平均速度 ${formatSpeed(avgSpeed2, carConfig.maxSpeed)} km/h`
      }

      const isRecord2 = saveBestTimeFor(1, race.player2.raceTime, trackId1)
      const bestTime2 = loadBestTimeFor(1, trackId1)
      if (elements.finishBest2) {
        elements.finishBest2.textContent = isRecord2
          ? 'P2 NEW RECORD!'
          : `P2 最佳 ${formatTime(bestTime2 ?? race.player2.raceTime)}`
      }

      if (elements.finishScore2) {
        elements.finishScore2.textContent = `P2 漂移得分 ${Math.round(race.player2.driftState.score)}`
        if (race.player2.driftState.score > 0) {
          const isDriftRecord2 = saveBestDriftScoreFor(1, Math.round(race.player2.driftState.score), trackId1)
          const bestDriftScore2 = loadBestDriftScoreFor(1, trackId1)
          if (isDriftRecord2) {
            elements.finishScore2.textContent += ' NEW DRIFT RECORD!'
          }
          else if (bestDriftScore2 !== null) {
            elements.finishScore2.textContent += ` (最高 ${bestDriftScore2})`
          }
        }
      }

      if (elements.finishLaps2) {
        // P1（P1）：P2 圈速行只在双人场景（分屏/热座 round 2）出现，恒加 'P2 ' 前缀
        elements.finishLaps2.textContent = `P2 ${formatLapTimes(race.lapTimes2).join('  ')}`
      }
    }
    else {
      // P2 未完赛：仅显示"P2 未完赛"一行，其余行隐藏
      elements.finishTime2.hidden = false
      elements.finishTime2.textContent = 'P2 未完赛'
      if (elements.finishSpeed2) elements.finishSpeed2.hidden = true
      if (elements.finishBest2) elements.finishBest2.hidden = true
      if (elements.finishScore2) elements.finishScore2.hidden = true
      if (elements.finishLaps2) elements.finishLaps2.hidden = true
      if (elements.finishSpeed2) elements.finishSpeed2.textContent = ''
      if (elements.finishBest2) elements.finishBest2.textContent = ''
      if (elements.finishScore2) elements.finishScore2.textContent = ''
      if (elements.finishLaps2) elements.finishLaps2.textContent = ''
    }
  }

  // 热座结算提示：round 1 提示交棒，round 2 按 P1/P2 用时显示胜负横幅；非热座隐藏
  if (elements.finishHint) {
    if (opts.hotseatMode && opts.hotseatRound === 1) {
      elements.finishHint.hidden = false
      elements.finishHint.textContent = '按回车，P2 开始'
    } else if (opts.hotseatMode && opts.hotseatRound === 2 && opts.prevP1Time !== null) {
      elements.finishHint.hidden = false
      const t1 = opts.prevP1Time
      const t2 = race.player2.raceTime
      elements.finishHint.textContent = t1 < t2 ? 'P1 更快！' : t1 > t2 ? 'P2 更快！' : '平手！'
    } else {
      elements.finishHint.hidden = true
    }
  }

  // 分屏漂移竞速排名横幅：仅分屏双完赛（driftWinner 非 null）时显示胜者并置 p1/p2 类；
  // 与热座 finish-hint 并存互不干扰（热座非分屏，driftWinner 恒 null，此处走 else 保持隐藏）
  if (elements.finishDriftWinner) {
    if (opts.driftWinner) {
      elements.finishDriftWinner.hidden = false
      elements.finishDriftWinner.textContent = `DRIFT 竞速 · ${opts.driftWinner} 获胜！`
      elements.finishDriftWinner.classList.toggle('p1', opts.driftWinner === 'P1')
      elements.finishDriftWinner.classList.toggle('p2', opts.driftWinner === 'P2')
    } else {
      elements.finishDriftWinner.hidden = true
    }
  }

  // 胜场统计行：热座/分屏分胜负（winStats 非 null）时显示统计与连胜；平手/单人（null）保持隐藏。
  // GameLoop 在 FINISHED 块内已调用 recordWin 并随 opts 传入（视觉缺陷回归：显式控制 hidden）
  if (elements.finishWins) {
    if (opts.winStats) {
      elements.finishWins.hidden = false
      const { p1, p2, streak, streakPlayer } = opts.winStats
      elements.finishWins.textContent =
        `胜场统计 · P1 ${p1} : ${p2} P2` +
        (streakPlayer ? ` · ${streakPlayer} 连胜 ${streak}` : '')
    } else {
      elements.finishWins.hidden = true
    }
  }
}
