import type { HudElements } from '../ui/hud'
import type { ScreenElements } from '../ui/screens'

/**
 * DOM 引用组装（2026-08-05 自 game-loop 下沉）：
 * HUD 与屏幕元素的构造期一次性查询聚合，GameLoop 构造时调用。
 */

/** 组装 HUD DOM 引用（P1/P2 速度、圈数、计时、最佳时间与漂移指示；hud2Container 分屏布局类） */
export function collectHudElements($: (id: string) => HTMLElement, hud2Container: HTMLDivElement): HudElements {
  return {
    hudContainer: $('hud') as HTMLDivElement,
    hud2Container,
    hudBest: $('hud-best') as HTMLDivElement,
    hudSpeed: $('hud-speed') as HTMLDivElement,
    hudSpeedUnit: $('hud-speed-unit') as HTMLDivElement,
    hudLap: $('hud-lap') as HTMLDivElement,
    hudTime: $('hud-time') as HTMLDivElement,
    hudSpeed2: $('hud-speed-2') as HTMLDivElement,
    hudSpeedUnit2: $('hud-speed-unit-2') as HTMLDivElement,
    hudLap2: $('hud-lap-2') as HTMLDivElement,
    hudTime2: $('hud-time-2') as HTMLDivElement,
    hudBestP2: $('hud-best-p2') as HTMLDivElement,
    hudPlayerTag: $('hud-player-tag') as HTMLDivElement,
    driftIndicator: $('drift-indicator') as HTMLDivElement,
    driftScoreValue: $('drift-score-value') as HTMLSpanElement,
    driftCombo: $('drift-combo') as HTMLDivElement,
    hudCollision: $('hud-collision') as HTMLDivElement,
    pauseBtn: $('pause-btn') as HTMLButtonElement,
  }
}

/** 组装屏幕 DOM 引用（启动/结算/暂停面板及结算文本，P2 行仅分屏时存在） */
export function collectScreenElements($: (id: string) => HTMLElement): ScreenElements {
  return {
    startScreen: $('start-screen') as HTMLDivElement,
    finishScreen: $('finish-screen') as HTMLDivElement,
    pauseScreen: $('pause-screen') as HTMLDivElement,
    finishTime: $('finish-time') as HTMLParagraphElement,
    finishSpeed: $('finish-speed') as HTMLParagraphElement,
    finishBest: $('finish-best') as HTMLParagraphElement,
    finishScore: $('finish-score') as HTMLParagraphElement,
    finishLaps: $('finish-laps') as HTMLDivElement,
    finishTime2: $('finish-time-2') as HTMLParagraphElement,
    finishSpeed2: $('finish-speed-2') as HTMLParagraphElement,
    finishBest2: $('finish-best-2') as HTMLParagraphElement,
    finishScore2: $('finish-score-2') as HTMLParagraphElement,
    finishLaps2: $('finish-laps-2') as HTMLDivElement,
    finishCard2: $('finish-card-2') as HTMLDivElement,
    finishHint: $('finish-hint') as HTMLDivElement,
    finishDriftWinner: $('finish-drift-winner') as HTMLDivElement,
    finishWins: $('finish-wins') as HTMLDivElement,
    pauseVolume: $('pause-volume') as HTMLInputElement,
    pauseRestart: $('pause-restart') as HTMLButtonElement,
    pauseResume: $('pause-resume') as HTMLButtonElement,
    pauseQuit: $('pause-quit-btn') as HTMLButtonElement,
    pauseMusicVolume: $('pause-music-volume') as HTMLInputElement,
    pauseSfxVolume: $('pause-sfx-volume') as HTMLInputElement,
    pauseTitle: $('pause-title') as HTMLHeadingElement,
    finishRestartBtn: $('finish-restart-btn') as HTMLButtonElement,
  }
}
