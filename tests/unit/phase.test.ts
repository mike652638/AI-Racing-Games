import { describe, expect, test } from 'vitest'
import {
  PHASE_MENU,
  PHASE_RACING,
  PHASE_FINISHED,
  PHASE_PAUSED,
  type Phase,
} from '../../src/game/phase'
import { nextPhase, togglePause } from '../../src/game/phase-logic'

describe('nextPhase（game/phase-logic）', () => {
  test('菜单按任意键进入比赛', () => {
    expect(nextPhase(PHASE_MENU, 1, 3)).toBe(PHASE_RACING)
  })
  test('比赛未到最后一圈保持 racing', () => {
    expect(nextPhase(PHASE_RACING, 1, 3)).toBe(PHASE_RACING)
    expect(nextPhase(PHASE_RACING, 3, 3)).toBe(PHASE_RACING)
  })
  test('完成最后一圈进入结算', () => {
    expect(nextPhase(PHASE_RACING, 4, 3)).toBe(PHASE_FINISHED)
  })
  test('结算按 R 重开回菜单', () => {
    expect(nextPhase(PHASE_FINISHED, 4, 3)).toBe(PHASE_MENU)
  })
  test('暂停态不响应 nextPhase（保持暂停）', () => {
    expect(nextPhase(PHASE_PAUSED, 1, 3)).toBe(PHASE_PAUSED)
  })
})

describe('togglePause（game/phase-logic）', () => {
  test('比赛中暂停', () => {
    expect(togglePause(PHASE_RACING)).toBe(PHASE_PAUSED)
  })
  test('暂停恢复比赛', () => {
    expect(togglePause(PHASE_PAUSED)).toBe(PHASE_RACING)
  })
  test('菜单与结算态 togglePause 无效', () => {
    expect(togglePause(PHASE_MENU)).toBe(PHASE_MENU)
    expect(togglePause(PHASE_FINISHED)).toBe(PHASE_FINISHED)
  })
})

describe('Phase 类型集合', () => {
  test('四个阶段常量均为合法 Phase', () => {
    const all: Phase[] = [PHASE_MENU, PHASE_RACING, PHASE_FINISHED, PHASE_PAUSED]
    expect(all).toEqual(['menu', 'racing', 'finished', 'paused'])
  })
})
