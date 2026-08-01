export const PHASE_MENU = 'menu'
export const PHASE_RACING = 'racing'
export const PHASE_FINISHED = 'finished'
export type Phase = typeof PHASE_MENU | typeof PHASE_RACING | typeof PHASE_FINISHED

/** 圈数计数：lapFromZ 到 1..totalLaps+1，超圈即完赛 */
export function nextPhase(phase: Phase, lap: number, totalLaps: number): Phase {
  switch (phase) {
    case PHASE_MENU:
      return PHASE_RACING
    case PHASE_RACING:
      return lap > totalLaps ? PHASE_FINISHED : PHASE_RACING
    case PHASE_FINISHED:
      return PHASE_MENU
  }
}
