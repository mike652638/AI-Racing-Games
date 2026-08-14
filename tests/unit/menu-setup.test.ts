import { describe, expect, it, vi } from 'vitest'
import { applyMenuChrome } from '../../src/game/menu-setup'
import { createModeStrategy } from '../../src/game/mode-strategy'
import { APP_VERSION, APP_VERSION_DATE, RACING_TOUCH_HINT, SPLIT_TOUCH_HINT } from '../../src/ui/copy'

/** M34：菜单静态装饰装配（拆分自 game-loop.ts 构造器，注入式 getElement 可单测） */
function createElStub() {
  return {
    textContent: '',
    hidden: false,
    className: '',
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
  }
}

function setupElements() {
  const els = {
    'menu-hint': createElStub(),
    'menu-mode-badge': createElStub(),
    'menu-weather-badge': createElStub(),
    'touch-hint': createElStub(),
    'app-version': createElStub(),
  }
  const getElement = (id: string): HTMLElement | null =>
    ((els as Record<string, unknown>)[id] ?? null) as HTMLElement | null
  return { els, getElement }
}

const mode = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false })

describe('applyMenuChrome', () => {
  it('单屏缺省：menu-hint 填充策略文案、模式/天气徽章隐藏、touch-hint 用摇杆文案、版本号填充', () => {
    const { els, getElement } = setupElements()
    applyMenuChrome({ mode, weatherMode: 'auto', routeId: null, getElement, body: null })
    expect(els['menu-hint'].textContent).toBe(mode.menuHint)
    expect(els['menu-mode-badge'].hidden).toBe(true)
    expect(els['menu-weather-badge'].hidden).toBe(true)
    expect(els['touch-hint'].textContent).toBe(RACING_TOUCH_HINT)
    expect(els['app-version'].textContent).toBe(`${APP_VERSION} · ${APP_VERSION_DATE}`)
  })

  it('分屏模式：徽章文案/类名、body 加 split-mode 类、touch-hint 用四分区文案', () => {
    const { els, getElement } = setupElements()
    const body = createElStub() as unknown as HTMLElement
    const split = createModeStrategy({ splitMode: true, hotseatMode: false, challengeMode: false })
    applyMenuChrome({ mode: split, weatherMode: 'auto', routeId: null, getElement, body })
    expect(els['menu-mode-badge'].hidden).toBe(false)
    expect(els['menu-mode-badge'].textContent).toBe('分屏模式 · 双人同屏')
    expect(els['menu-mode-badge'].className).toBe('mode-badge mode-split')
    expect(body.classList.add).toHaveBeenCalledWith('split-mode')
    expect(els['touch-hint'].textContent).toBe(SPLIT_TOUCH_HINT)
  })

  it('非分屏不加 body 类', () => {
    const { getElement } = setupElements()
    const body = createElStub() as unknown as HTMLElement
    applyMenuChrome({ mode, weatherMode: 'auto', routeId: null, getElement, body })
    expect(body.classList.add).not.toHaveBeenCalled()
  })

  it('热座/挑战徽章分支文案', () => {
    const { els, getElement } = setupElements()
    const hotseat = createModeStrategy({ splitMode: false, hotseatMode: true, challengeMode: false })
    applyMenuChrome({ mode: hotseat, weatherMode: 'auto', routeId: null, getElement, body: null })
    expect(els['menu-mode-badge'].textContent).toBe('热座模式 · 回合轮流')
    expect(els['menu-mode-badge'].className).toBe('mode-badge mode-hotseat')

    const challenge = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: true })
    applyMenuChrome({ mode: challenge, weatherMode: 'auto', routeId: null, getElement, body: null })
    expect(els['menu-mode-badge'].textContent).toBe('挑战模式 · 60 秒刷分 · 目标 5000')
    expect(els['menu-mode-badge'].className).toBe('mode-badge mode-challenge')
  })

  it('路线模式徽章显示路线名与段数', () => {
    const { els, getElement } = setupElements()
    const route = createModeStrategy({ splitMode: false, hotseatMode: false, challengeMode: false, routeMode: true })
    applyMenuChrome({ mode: route, weatherMode: 'auto', routeId: 'classic-tour', getElement, body: null })
    expect(els['menu-mode-badge'].textContent).toBe('路线模式 · 经典之旅 · 4 段岔路')
    expect(els['menu-mode-badge'].className).toBe('mode-badge mode-route')
  })

  it('天气徽章：非 auto 变体显示；auto 隐藏', () => {
    const { els, getElement } = setupElements()
    applyMenuChrome({ mode, weatherMode: 'rain', routeId: null, getElement, body: null })
    expect(els['menu-weather-badge'].hidden).toBe(false)
    expect(els['menu-weather-badge'].textContent).toContain('雨')
    expect(els['menu-weather-badge'].className).toBe('mode-badge weather-badge')

    applyMenuChrome({ mode, weatherMode: 'auto', routeId: null, getElement, body: null })
    expect(els['menu-weather-badge'].hidden).toBe(true)
  })

  it('元素缺失（getElement 返回 null）时安全跳过不抛错', () => {
    expect(() =>
      applyMenuChrome({ mode, weatherMode: 'auto', routeId: null, getElement: () => null, body: null }),
    ).not.toThrow()
  })

  it('body 缺失或无 classList.add 时不抛错', () => {
    const { getElement } = setupElements()
    const split = createModeStrategy({ splitMode: true, hotseatMode: false, challengeMode: false })
    expect(() =>
      applyMenuChrome({ mode: split, weatherMode: 'auto', routeId: null, getElement, body: null }),
    ).not.toThrow()
    expect(() =>
      applyMenuChrome({
        mode: split,
        weatherMode: 'auto',
        routeId: null,
        getElement,
        body: { classList: {} } as unknown as HTMLElement,
      }),
    ).not.toThrow()
  })
})
