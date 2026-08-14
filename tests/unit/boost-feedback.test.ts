import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BOOST_DENIED_COOLDOWN_MS, maybeTriggerBoostDeniedFlash } from '../../src/game/boost-feedback'
import { PHASE_RACING, PHASE_MENU, type Phase } from '../../src/shared/phase'

/** M34：BOOST 未蓄能红闪反馈（拆分自 game-loop.ts frame 内联块，300ms 冷却窗口契约） */
describe('maybeTriggerBoostDeniedFlash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function makeBar() {
    const bar = { classList: { add: vi.fn(), remove: vi.fn() } } as unknown as HTMLElement
    return bar
  }

  const base: {
    phase: Phase
    now: number
    inputBoost: boolean
    boostCharge: number
    boostActive: boolean
    lastDeniedAt: number
  } = {
    phase: PHASE_RACING,
    now: 1000,
    inputBoost: true,
    boostCharge: 0,
    boostActive: false,
    lastDeniedAt: 0,
  }

  it('条件满足：返回新时间戳并触发红闪，300ms 后移除', () => {
    const bar = makeBar()
    const next = maybeTriggerBoostDeniedFlash({ ...base, boostBar: bar })
    expect(next).toBe(1000)
    expect(bar.classList.add).toHaveBeenCalledWith('no-charge')
    vi.advanceTimersByTime(BOOST_DENIED_COOLDOWN_MS)
    expect(bar.classList.remove).toHaveBeenCalledWith('no-charge')
  })

  it('冷却窗口内重复触发：不更新时间戳、不重复红闪', () => {
    const bar = makeBar()
    maybeTriggerBoostDeniedFlash({ ...base, boostBar: bar })
    const again = maybeTriggerBoostDeniedFlash({ ...base, now: 1100, lastDeniedAt: 1000, boostBar: bar })
    expect(again).toBe(1000)
    expect(bar.classList.add).toHaveBeenCalledTimes(1)
  })

  it('冷却窗口外再次触发：更新时间戳并再次红闪', () => {
    const bar = makeBar()
    maybeTriggerBoostDeniedFlash({ ...base, boostBar: bar })
    const again = maybeTriggerBoostDeniedFlash({
      ...base,
      now: 1000 + BOOST_DENIED_COOLDOWN_MS + 1,
      lastDeniedAt: 1000,
      boostBar: bar,
    })
    expect(again).toBe(1000 + BOOST_DENIED_COOLDOWN_MS + 1)
    expect(bar.classList.add).toHaveBeenCalledTimes(2)
  })

  it('条件不满足（非 RACING / 有蓄能 / 已激活 / 未按键）：不更新不闪', () => {
    const bar = makeBar()
    expect(maybeTriggerBoostDeniedFlash({ ...base, phase: PHASE_MENU, boostBar: bar })).toBe(0)
    expect(maybeTriggerBoostDeniedFlash({ ...base, boostCharge: 0.5, boostBar: bar })).toBe(0)
    expect(maybeTriggerBoostDeniedFlash({ ...base, boostActive: true, boostBar: bar })).toBe(0)
    expect(maybeTriggerBoostDeniedFlash({ ...base, inputBoost: false, boostBar: bar })).toBe(0)
    expect(bar.classList.add).not.toHaveBeenCalled()
  })

  it('boostBar 为 null：更新冷却时间戳但不红闪', () => {
    const next = maybeTriggerBoostDeniedFlash({ ...base, boostBar: null })
    expect(next).toBe(1000)
  })
})
