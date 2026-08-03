import type { CarConfig } from '../physics/car'
import type { RaceState } from '../game/state'
import { formatLapTimes, formatSpeed, formatTime } from './format'
import { loadBestDriftScore, loadBestTime, saveBestDriftScore, saveBestTime } from './save'
import {
  PHASE_FINISHED,
  PHASE_MENU,
  PHASE_PAUSED,
  PHASE_RACING,
  type Phase,
} from './gamestate'

/** 屏幕 DOM 引用：启动/结算/暂停面板及结算文本 */
export interface ScreenElements {
  startScreen: HTMLDivElement
  finishScreen: HTMLDivElement
  pauseScreen: HTMLDivElement
  finishTime: HTMLParagraphElement
  finishSpeed: HTMLParagraphElement
  finishBest: HTMLParagraphElement
  finishScore: HTMLParagraphElement
  finishLaps: HTMLDivElement
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
  trackId: string,
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
    fillFinishPanel(elements, race, carConfig, trackId)
  }
}

/** 结算面板填充（每局只执行一次，写入记录并展示平均速度/圈速/漂移得分） */
function fillFinishPanel(
  elements: ScreenElements,
  race: RaceState,
  carConfig: CarConfig,
  trackId: string,
): void {
  if (race.finishShown) {
    return
  }
  race.finishShown = true

  const avgSpeed = race.cameraZ / Math.max(race.raceTime, 0.001)
  elements.finishTime.textContent = `总用时 ${formatTime(race.raceTime)}`
  elements.finishSpeed.textContent = `平均速度 ${formatSpeed(avgSpeed, carConfig.maxSpeed)} km/h`

  const isRecord = saveBestTime(race.raceTime, trackId)
  const bestTime = loadBestTime(trackId)
  elements.finishBest.textContent = isRecord
    ? 'NEW RECORD!'
    : `最佳 ${formatTime(bestTime ?? race.raceTime)}`

  elements.finishScore.textContent = `漂移得分 ${Math.round(race.driftState.score)}`
  if (race.driftState.score > 0) {
    const isDriftRecord = saveBestDriftScore(Math.round(race.driftState.score), trackId)
    const bestDriftScore = loadBestDriftScore(trackId)
    if (isDriftRecord) {
      elements.finishScore.textContent += ' NEW DRIFT RECORD!'
    }
    else if (bestDriftScore !== null) {
      elements.finishScore.textContent += ` (最高 ${bestDriftScore})`
    }
  }

  const lapTexts = formatLapTimes(race.lapTimes)
  elements.finishLaps.textContent = lapTexts.join('  ')
}
