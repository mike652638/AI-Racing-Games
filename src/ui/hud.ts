import type { CarConfig } from '../physics/car'
import type { RaceState } from '../game/state'
import { formatLap, formatSpeed, formatTime, lapFromZ } from './format'
import { PHASE_PAUSED, PHASE_RACING, type Phase } from './gamestate'

/** HUD 全部 DOM 引用：P1/P2 速度、圈数、计时、最佳时间与漂移指示 */
export interface HudElements {
  hudBest: HTMLDivElement
  hudSpeed: HTMLDivElement
  hudLap: HTMLDivElement
  hudTime: HTMLDivElement
  hudSpeed2: HTMLDivElement
  hudLap2: HTMLDivElement
  hudTime2: HTMLDivElement
  driftIndicator: HTMLDivElement
  driftScoreValue: HTMLSpanElement
}

/** 每帧刷新 HUD 文本：P1 速度/圈数/计时/最佳，分屏时附加 P2，以及漂移指示 */
export function updateHud(
  elements: HudElements,
  race: RaceState,
  carConfig: CarConfig,
  bestTime: number | null,
  splitMode: boolean,
  lapLength: number,
  totalLaps: number,
  phase: Phase,
): void {
  // 仅在比赛/暂停阶段显示 HUD；菜单/结算阶段隐藏全部元素，避免右上角残留
  const showHud = phase === PHASE_RACING || phase === PHASE_PAUSED
  if (!showHud) {
    elements.hudSpeed.hidden = true
    elements.hudLap.hidden = true
    elements.hudTime.hidden = true
    elements.hudBest.hidden = true
    elements.hudSpeed2.hidden = true
    elements.hudLap2.hidden = true
    elements.hudTime2.hidden = true
    elements.driftIndicator.hidden = true
    return
  }

  elements.hudSpeed.hidden = false
  elements.hudLap.hidden = false
  elements.hudTime.hidden = false
  elements.hudSpeed.textContent = formatSpeed(race.carState.speed, carConfig.maxSpeed)
  elements.hudLap.textContent = formatLap(lapFromZ(race.cameraZ, lapLength), totalLaps)
  elements.hudTime.textContent = formatTime(race.raceTime)

  elements.hudBest.hidden = bestTime === null
  if (bestTime !== null) {
    elements.hudBest.textContent = `BEST ${formatTime(bestTime)}`
  }

  // P2 元素显隐由 updateHud 统一处理：非分屏隐藏、分屏显示
  elements.hudSpeed2.hidden = !splitMode
  elements.hudLap2.hidden = !splitMode
  elements.hudTime2.hidden = !splitMode
  if (splitMode) {
    elements.hudSpeed2.textContent = formatSpeed(race.carState2.speed, carConfig.maxSpeed)
    elements.hudLap2.textContent = formatLap(lapFromZ(race.cameraZ2, lapLength), totalLaps)
    elements.hudTime2.textContent = formatTime(race.raceTime2)
  }

  elements.driftIndicator.hidden = !race.driftState.active
  if (race.driftState.active) {
    elements.driftScoreValue.textContent = String(Math.round(race.driftState.score))
  }
}
