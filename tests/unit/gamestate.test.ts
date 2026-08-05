import { describe, expect, test } from 'vitest'
// ui/gamestate 兼容层已移除（2026-08-05，src 内 0 消费方）：直接依赖 shared 唯一真源
import { PHASE_MENU, PHASE_RACING, PHASE_FINISHED, PHASE_PAUSED } from '../../src/shared/phase'
import { nextPhase, togglePause } from '../../src/shared/phase-logic'

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

describe('togglePause', () => {
  test('比赛中暂停', () => {
    expect(togglePause(PHASE_RACING)).toBe(PHASE_PAUSED)
  })
  test('暂停恢复比赛', () => {
    expect(togglePause(PHASE_PAUSED)).toBe(PHASE_RACING)
  })
})
