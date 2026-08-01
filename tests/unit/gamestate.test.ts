import { describe, expect, test } from 'vitest'
import { nextPhase, PHASE_MENU, PHASE_RACING, PHASE_FINISHED } from '../../src/ui/gamestate'

describe('nextPhase', () => {
  test('菜单按任意键进入比赛', () => {
    expect(nextPhase(PHASE_MENU, 1, 3)).toBe(PHASE_RACING)
  })
  test('比赛未到最后一圈保持 racing', () => {
    expect(nextPhase(PHASE_RACING, 1, 3)).toBe(PHASE_RACING)
  })
  test('完成最后一圈进入结算', () => {
    expect(nextPhase(PHASE_RACING, 4, 3)).toBe(PHASE_FINISHED)
  })
  test('结算按 R 重开回菜单', () => {
    expect(nextPhase(PHASE_FINISHED, 4, 3)).toBe(PHASE_MENU)
  })
})
