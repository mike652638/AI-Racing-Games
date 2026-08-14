import { describe, expect, it, vi } from 'vitest'
import { applyPauseBranding, type ScreenElements } from '../../src/ui/screens'

/** M34：暂停面板品牌标注（拆分自 game-loop.ts applyPhase 暂停块，行为逐字节等价） */
function makeElements(): { elements: ScreenElements; pauseTitle: HTMLElement; pauseTrack: HTMLElement } {
  const pauseTitle = { textContent: '', classList: { toggle: vi.fn() } } as unknown as HTMLElement
  const pauseTrack = { textContent: '' } as HTMLElement
  return {
    pauseTitle,
    pauseTrack,
    elements: { pauseTitle, pauseTrackName: pauseTrack } as unknown as ScreenElements,
  }
}

describe('applyPauseBranding', () => {
  it('单屏：通用 PAUSED，无 p1/p2 类；赛道名正常填充', () => {
    const { elements, pauseTitle, pauseTrack } = makeElements()
    applyPauseBranding(elements, {
      splitMode: false,
      hotseatMode: false,
      lastActivePlayer: 1,
      hotseatPlayer: 1,
      trackName: '经典赛道',
    })
    expect(pauseTitle.textContent).toBe('PAUSED')
    expect(pauseTrack.textContent).toBe('赛道：经典赛道')
  })

  it('分屏：按最近活跃玩家标注 P1/P2 并置对应类', () => {
    const { elements, pauseTitle } = makeElements()
    applyPauseBranding(elements, {
      splitMode: true,
      hotseatMode: false,
      lastActivePlayer: 2,
      hotseatPlayer: 1,
      trackName: '',
    })
    expect(pauseTitle.textContent).toBe('P2 已暂停')
    expect(pauseTitle.classList.toggle).toHaveBeenCalledWith('p1', false)
    expect(pauseTitle.classList.toggle).toHaveBeenCalledWith('p2', true)

    applyPauseBranding(elements, {
      splitMode: true,
      hotseatMode: false,
      lastActivePlayer: 1,
      hotseatPlayer: 1,
      trackName: '',
    })
    expect(pauseTitle.textContent).toBe('P1 已暂停')
  })

  it('热座：按当前回合玩家标注', () => {
    const { elements, pauseTitle } = makeElements()
    applyPauseBranding(elements, {
      splitMode: false,
      hotseatMode: true,
      lastActivePlayer: 1,
      hotseatPlayer: 2,
      trackName: '',
    })
    expect(pauseTitle.textContent).toBe('P2 已暂停')
  })

  it('赛道名为空：不显示赛道行（无匹配赛道场景）', () => {
    const { elements, pauseTrack } = makeElements()
    applyPauseBranding(elements, {
      splitMode: false,
      hotseatMode: false,
      lastActivePlayer: 1,
      hotseatPlayer: 1,
      trackName: '',
    })
    expect(pauseTrack.textContent).toBe('')
  })

  it('元素缺失：安全跳过不抛错', () => {
    expect(() =>
      applyPauseBranding({} as ScreenElements, {
        splitMode: false,
        hotseatMode: false,
        lastActivePlayer: 1,
        hotseatPlayer: 1,
        trackName: '经典赛道',
      }),
    ).not.toThrow()
  })
})
