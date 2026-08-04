import { PHASE_FINISHED, PHASE_MENU, PHASE_PAUSED, PHASE_RACING, type Phase } from './phase'

/** 圈数计数：lapFromZ 到 1..totalLaps+1，超圈即完赛 */
export function nextPhase(phase: Phase, lap: number, totalLaps: number): Phase {
  switch (phase) {
    case PHASE_MENU:
      return PHASE_RACING
    case PHASE_RACING:
      return lap > totalLaps ? PHASE_FINISHED : PHASE_RACING
    case PHASE_FINISHED:
      return PHASE_MENU
    case PHASE_PAUSED:
      return phase
  }
}

/** 暂停切换：racing↔paused，其他态无效 */
export function togglePause(phase: Phase): Phase {
  if (phase === PHASE_RACING) return PHASE_PAUSED
  if (phase === PHASE_PAUSED) return PHASE_RACING
  return phase
}
