import type { CarConfig } from '../physics/car'
import type { RaceState } from '../game/state'
import type { TrackContext } from '../game/track-context'
import { formatLap, formatSpeed, formatTime, lapFromZ } from './format'
import { PHASE_PAUSED, PHASE_RACING, type Phase } from './gamestate'

/** HUD 全部 DOM 引用：P1/P2 速度、圈数、计时、最佳时间与漂移指示 */
export interface HudElements {
  /** P1 HUD 容器（分屏时切换 split 布局类） */
  hudContainer?: HTMLDivElement
  /** P2 HUD 容器（分屏时切换 split 布局类） */
  hud2Container?: HTMLDivElement
  hudBest: HTMLDivElement
  hudSpeed: HTMLDivElement
  /** 速度单位标签（km/h），菜单阶段需与速度数字一同隐藏 */
  hudSpeedUnit?: HTMLDivElement
  hudLap: HTMLDivElement
  hudTime: HTMLDivElement
  hudSpeed2: HTMLDivElement
  hudSpeedUnit2?: HTMLDivElement
  hudLap2: HTMLDivElement
  hudTime2: HTMLDivElement
  /** P2 最佳时间（分屏时显示，P2 独立存档） */
  hudBest2?: HTMLDivElement
  /** P2 最佳时间（单屏时显示，热座 P2 存档；分屏时隐藏） */
  hudBestP2?: HTMLDivElement
  /** 热座当前驾驶玩家标签（热座时显示"P1/P2 驾驶中"；非热座隐藏） */
  hudPlayerTag?: HTMLDivElement
  driftIndicator: HTMLDivElement
  driftScoreValue: HTMLSpanElement
}

/** 每帧刷新 HUD 文本：P1 速度/圈数/计时/最佳，分屏时附加 P2，以及漂移指示。
 *  圈数按各自赛道世界计算：P1 用 tracks[0]（圈长/总圈数），P2 用 tracks[1]。
 *  hotseatPlayer（第 9 尾参）：热座当前回合玩家；null 表示非热座（行为与旧 8 参完全一致）。 */
export function updateHud(
  elements: HudElements,
  race: RaceState,
  carConfig: CarConfig,
  bestTime: number | null,
  splitMode: boolean,
  tracks: [TrackContext, TrackContext],
  phase: Phase,
  bestTime2: number | null,
  hotseatPlayer: 1 | 2 | null = null,
): void {
  // 分屏时切换布局类：P1 HUD 定位左侧区域上方、P2 HUD 定位右侧区域上方
  if (elements.hudContainer) {
    elements.hudContainer.classList.toggle('split', splitMode)
  }
  if (elements.hud2Container) {
    elements.hud2Container.classList.toggle('split', splitMode)
  }

  // 仅在比赛/暂停阶段显示 HUD；菜单/结算阶段隐藏全部元素，避免右上角残留
  const showHud = phase === PHASE_RACING || phase === PHASE_PAUSED
  if (!showHud) {
    elements.hudSpeed.hidden = true
    if (elements.hudSpeedUnit) elements.hudSpeedUnit.hidden = true
    elements.hudLap.hidden = true
    elements.hudTime.hidden = true
    elements.hudBest.hidden = true
    elements.hudSpeed2.hidden = true
    if (elements.hudSpeedUnit2) elements.hudSpeedUnit2.hidden = true
    elements.hudLap2.hidden = true
    elements.hudTime2.hidden = true
    if (elements.hudBest2) elements.hudBest2.hidden = true
    if (elements.hudBestP2) elements.hudBestP2.hidden = true
    if (elements.hudPlayerTag) elements.hudPlayerTag.hidden = true
    elements.driftIndicator.hidden = true
    return
  }

  elements.hudSpeed.hidden = false
  if (elements.hudSpeedUnit) elements.hudSpeedUnit.hidden = false
  elements.hudLap.hidden = false
  elements.hudTime.hidden = false
  elements.hudSpeed.textContent = formatSpeed(race.player1.carState.speed, carConfig.maxSpeed)
  elements.hudLap.textContent = formatLap(
    lapFromZ(race.player1.cameraZ, tracks[0].lapLength),
    tracks[0].totalLaps,
  )
  elements.hudTime.textContent = formatTime(race.player1.raceTime)

  elements.hudBest.hidden = bestTime === null
  if (bestTime !== null) {
    elements.hudBest.textContent = `BEST ${formatTime(bestTime)}`
  }

  // P2 元素显隐由 updateHud 统一处理：非分屏隐藏、分屏显示
  elements.hudSpeed2.hidden = !splitMode
  if (elements.hudSpeedUnit2) elements.hudSpeedUnit2.hidden = !splitMode
  elements.hudLap2.hidden = !splitMode
  elements.hudTime2.hidden = !splitMode
  if (elements.hudBest2) elements.hudBest2.hidden = !splitMode || bestTime2 === null
  if (splitMode) {
    elements.hudSpeed2.textContent = formatSpeed(race.player2.carState.speed, carConfig.maxSpeed)
    elements.hudLap2.textContent = formatLap(
      lapFromZ(race.player2.cameraZ, tracks[1].lapLength),
      tracks[1].totalLaps,
    )
    elements.hudTime2.textContent = formatTime(race.player2.raceTime)
    if (elements.hudBest2 && bestTime2 !== null) {
      elements.hudBest2.textContent = `BEST ${formatTime(bestTime2)}`
    }
  }

  // 热座玩家标签：非热座（null）隐藏；P1/P2 回合显示对应"驾驶中"文本并切换配色类
  if (elements.hudPlayerTag) {
    elements.hudPlayerTag.hidden = hotseatPlayer === null
    if (hotseatPlayer !== null) {
      elements.hudPlayerTag.textContent = hotseatPlayer === 1 ? 'P1 驾驶中' : 'P2 驾驶中'
      elements.hudPlayerTag.classList.toggle('p1', hotseatPlayer === 1)
      elements.hudPlayerTag.classList.toggle('p2', hotseatPlayer === 2)
    }
  }

  // 漂移指示取当前驾驶玩家：热座 P2 回合显示 P2 漂移，其余（含非热座）显示 P1
  const driftPlayer = hotseatPlayer === 2 ? race.player2 : race.player1
  elements.driftIndicator.hidden = !driftPlayer.driftState.active
  if (driftPlayer.driftState.active) {
    elements.driftScoreValue.textContent = String(Math.round(driftPlayer.driftState.score))
  }

  // 单屏 P2 BEST：热座数据复用 bestTime2，但分屏时隐藏（单屏专用元素）
  if (elements.hudBestP2) {
    elements.hudBestP2.hidden = splitMode || bestTime2 === null
    if (bestTime2 !== null && !elements.hudBestP2.hidden) {
      elements.hudBestP2.textContent = `P2 BEST ${formatTime(bestTime2)}`
    }
  }
}
