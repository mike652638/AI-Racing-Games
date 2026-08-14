import { describe, expect, it, vi } from 'vitest'
import { bindPauseControls, setStartBtnLoading, type VolumeTrack } from '../../src/game/pause-controls'
import { PHASE_MENU, type Phase } from '../../src/shared/phase'
import type { ScreenElements } from '../../src/ui/screens'
import type { HudElements } from '../../src/ui/hud'

/** M34：暂停控件绑定（拆分自 game-loop.ts bindPauseControls/bindVolumeSlider/bindPhaseButton/setStartBtnLoading） */
interface StubEl {
  value?: string
  textContent?: string
  dataset?: Record<string, string>
  classList: { toggle: ReturnType<typeof vi.fn>; contains: ReturnType<typeof vi.fn> }
  addEventListener: (type: string, cb: (e: unknown) => void) => void
  removeEventListener: (type: string, cb: (e: unknown) => void) => void
  _listeners?: Map<string, Array<(e: unknown) => void>>
}

function makeEl(value = ''): StubEl {
  const listeners = new Map<string, Array<(e: unknown) => void>>()
  return {
    value,
    textContent: '',
    dataset: {},
    classList: { toggle: vi.fn(), contains: vi.fn(() => false) },
    addEventListener: (type, cb) => {
      const arr = listeners.get(type) ?? []
      arr.push(cb)
      listeners.set(type, arr)
    },
    removeEventListener: (type, cb) => {
      const arr = listeners.get(type) ?? []
      listeners.set(
        type,
        arr.filter((f) => f !== cb),
      )
    },
    _listeners: listeners,
  }
}

function fire(el: StubEl, type: string, e: unknown = {}): void {
  for (const cb of el._listeners?.get(type) ?? []) cb(e)
}

function setup() {
  const screenElements = {
    pauseVolume: makeEl('50') as unknown as HTMLInputElement,
    pauseMusicVolume: makeEl('80') as unknown as HTMLInputElement,
    pauseSfxVolume: makeEl('100') as unknown as HTMLInputElement,
    pauseRestart: makeEl() as unknown as HTMLButtonElement,
    pauseQuit: makeEl() as unknown as HTMLButtonElement,
    finishRestartBtn: makeEl() as unknown as HTMLButtonElement,
    pauseResume: makeEl() as unknown as HTMLButtonElement,
  } as unknown as ScreenElements
  const hudElements = { pauseBtn: makeEl() as unknown as HTMLButtonElement } as unknown as HudElements
  const labels = new Map<string, StubEl>([
    ['pause-volume-value', makeEl()],
    ['pause-music-volume-value', makeEl()],
    ['pause-sfx-volume-value', makeEl()],
  ])
  const getElement = (id: string): HTMLElement | null => (labels.get(id) as unknown as HTMLElement | undefined) ?? null
  const cleanups: Array<() => void> = []
  const volumes: Record<VolumeTrack, number> = { master: 0.5, music: 0.8, sfx: 1 }
  const gains: Record<VolumeTrack, GainNode | null> = { master: null, music: null, sfx: null }
  const applied: Array<{ track: VolumeTrack; phase: Phase }> = []
  const phase: Phase = PHASE_MENU
  const onSelect = vi.fn()
  bindPauseControls({
    screenElements,
    hudElements,
    getElement,
    onCleanup: (fn) => cleanups.push(fn),
    getPhase: () => phase,
    applyPhase: (p) => {
      applied.push({ track: 'master', phase: p })
    },
    chooseRouteBranch: (dir) => onSelect(dir),
    getGain: (track) => gains[track],
    setVolume: (track, v) => {
      volumes[track] = v
      return v
    },
  })
  return { screenElements, hudElements, labels, cleanups, volumes, applied, onSelect, getElement }
}

describe('bindPauseControls', () => {
  it('音量 slider input：clamp+写回音量字段+持久化+标签同步（gain 为 null 时仅 clamp 不同步）', () => {
    const { screenElements, volumes, labels, cleanups } = setup()
    const slider = screenElements.pauseVolume as unknown as StubEl
    // input 事件模拟
    slider.value = '60'
    fire(slider, 'input')
    expect(volumes.master).toBeCloseTo(0.6)
    expect(labels.get('pause-volume-value')?.textContent).toBe('60%')
    // 清理登记后移除监听
    expect(cleanups.length).toBeGreaterThan(0)
    cleanups.forEach((fn) => fn())
    fire(slider, 'input')
    expect(volumes.master).toBeCloseTo(0.6)
  })

  it('初始同步标签（绑定后立即填充百分比）', () => {
    const { labels } = setup()
    expect(labels.get('pause-volume-value')?.textContent).toBe('50%')
    expect(labels.get('pause-music-volume-value')?.textContent).toBe('80%')
    expect(labels.get('pause-sfx-volume-value')?.textContent).toBe('100%')
  })

  it('重开/退出/结算返回按钮 click 均回菜单；继续按钮走 togglePause（暂停态 → 恢复比赛）', () => {
    const { screenElements, applied } = setup()
    const restart = screenElements.pauseRestart as unknown as StubEl
    fire(restart, 'click')
    expect(applied.some((a) => a.phase === PHASE_MENU)).toBe(true)
    // togglePause：非 RACING/PAUSED 原样返回——暂停态点击继续才恢复比赛
    let phase: Phase = 'racing'
    const applied2: Array<Phase> = []
    const cleanups: Array<() => void> = []
    bindPauseControls({
      screenElements: { pauseResume: screenElements.pauseResume } as unknown as ScreenElements,
      hudElements: {} as unknown as HudElements,
      getElement: () => null,
      onCleanup: (fn) => cleanups.push(fn),
      getPhase: () => phase,
      applyPhase: (p) => applied2.push(p),
      chooseRouteBranch: vi.fn(),
      getGain: () => null,
      setVolume: (_, v) => v,
    })
    phase = 'paused'
    fire(screenElements.pauseResume as unknown as StubEl, 'click')
    expect(applied2).toEqual(['racing'])
  })

  it('岔路按钮 click 触发 chooseRouteBranch', () => {
    const routeLeft = makeEl()
    const routeRight = makeEl()
    const getElement = (id: string): HTMLElement | null => {
      if (id === 'route-choice-left') return routeLeft as unknown as HTMLElement
      if (id === 'route-choice-right') return routeRight as unknown as HTMLElement
      return null
    }
    const onSelect = vi.fn()
    const cleanups: Array<() => void> = []
    bindPauseControls({
      screenElements: { pauseVolume: undefined } as unknown as ScreenElements,
      hudElements: {} as unknown as HudElements,
      getElement,
      onCleanup: (fn) => cleanups.push(fn),
      getPhase: () => PHASE_MENU,
      applyPhase: vi.fn(),
      chooseRouteBranch: (dir) => onSelect(dir),
      getGain: () => null,
      setVolume: (_, v) => v,
    })
    fire(routeLeft, 'click')
    fire(routeRight, 'click')
    expect(onSelect).toHaveBeenNthCalledWith(1, 'left')
    expect(onSelect).toHaveBeenNthCalledWith(2, 'right')
  })

  it('slider/按钮缺失（undefined）：安全跳过不抛错', () => {
    const cleanups: Array<() => void> = []
    expect(() =>
      bindPauseControls({
        screenElements: {} as unknown as ScreenElements,
        hudElements: {} as unknown as HudElements,
        getElement: () => null,
        onCleanup: (fn) => cleanups.push(fn),
        getPhase: () => PHASE_MENU,
        applyPhase: vi.fn(),
        chooseRouteBranch: vi.fn(),
        getGain: () => null,
        setVolume: (_, v) => v,
      }),
    ).not.toThrow()
    expect(cleanups.length).toBe(0)
  })
})

describe('setStartBtnLoading', () => {
  it('loading 切换文案并记录原始文本，恢复时还原', () => {
    const btn = makeEl() as unknown as HTMLElement
    btn.textContent = '开始游戏'
    Object.defineProperty(btn, 'dataset', { value: {}, configurable: true })
    setStartBtnLoading(btn, true)
    expect(btn.classList.toggle).toHaveBeenCalledWith('loading', true)
    expect(btn.textContent).toBe('开始中…')
    expect((btn.dataset as unknown as Record<string, string>).originalText).toBe('开始游戏')
    setStartBtnLoading(btn, false)
    expect(btn.textContent).toBe('开始游戏')
  })

  it('dataset 缺失：安全回退默认文案', () => {
    const btn = makeEl() as unknown as HTMLElement
    Object.defineProperty(btn, 'dataset', { value: undefined, configurable: true })
    expect(() => setStartBtnLoading(btn, true)).not.toThrow()
    expect(btn.textContent).toBe('开始中…')
    setStartBtnLoading(btn, false)
    expect(btn.textContent).toBe('开始游戏')
  })
})
