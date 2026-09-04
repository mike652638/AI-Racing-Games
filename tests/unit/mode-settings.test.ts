import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyModeParam,
  bindModeSelector,
  cycleRouteValue,
  cycleWeatherValue,
  describeModeCard,
  isReloadCard,
  routeLabel,
  weatherLabel,
} from '../../src/game/mode-settings'
import { ROUTE_DEFS } from '../../src/engine/routes'

/** M38：九卡模式设置（循环切换/四互斥/显示态/热切与 reload 双路径绑定） */

describe('cycleWeatherValue 天气五态循环', () => {
  it('缺省 auto → sunny → rain → night → random → auto 完整循环', () => {
    expect(cycleWeatherValue('')).toBe('sunny')
    expect(cycleWeatherValue('sunny')).toBe('rain')
    expect(cycleWeatherValue('rain')).toBe('night')
    expect(cycleWeatherValue('night')).toBe('random')
    expect(cycleWeatherValue('random')).toBe('')
  })

  it('无效值回退 auto（与 parseGameParams 缺省回退语义一致）', () => {
    expect(cycleWeatherValue('bogus')).toBe('')
  })
})

describe('cycleRouteValue 路线四态循环', () => {
  it('关 → 路线1 → 路线2 → 路线3 → 关', () => {
    expect(cycleRouteValue('')).toBe('1')
    expect(cycleRouteValue('1')).toBe('2')
    expect(cycleRouteValue('2')).toBe('3')
    expect(cycleRouteValue('3')).toBe('')
  })

  it('无效值视为关再推进到路线1', () => {
    expect(cycleRouteValue('9')).toBe('1')
  })
})

describe('weatherLabel / routeLabel 显示名', () => {
  it('天气值映射中文显示名，无效回自动', () => {
    expect(weatherLabel('')).toBe('自动')
    expect(weatherLabel('sunny')).toBe('晴天')
    expect(weatherLabel('rain')).toBe('雨天')
    expect(weatherLabel('night')).toBe('夜晚')
    expect(weatherLabel('random')).toBe('随机')
    expect(weatherLabel('bogus')).toBe('自动')
  })

  it('路线值映射路线N，空/无效为关', () => {
    expect(routeLabel('')).toBe('关')
    expect(routeLabel('1')).toBe('路线1')
    expect(routeLabel('3')).toBe('路线3')
    expect(routeLabel('x')).toBe('关')
  })
})

describe('isReloadCard 分流判定', () => {
  it('分屏/热座/性能走 reload 重新加载', () => {
    expect(isReloadCard('split')).toBe(true)
    expect(isReloadCard('hotseat')).toBe(true)
    expect(isReloadCard('perf')).toBe(true)
  })

  it('前六卡走热切 onChanged 流程', () => {
    expect(isReloadCard('weather')).toBe(false)
    expect(isReloadCard('challenge')).toBe(false)
    expect(isReloadCard('route')).toBe(false)
  })
})

describe('applyModeParam 参数写入与互斥清理', () => {
  it('weather 循环写参/删参（空值时删除回到 auto）', () => {
    const p = new URLSearchParams('')
    applyModeParam(p, 'weather')
    expect(p.get('weather')).toBe('sunny')
    applyModeParam(p, 'weather')
    applyModeParam(p, 'weather')
    applyModeParam(p, 'weather')
    expect(p.get('weather')).toBe('random')
    applyModeParam(p, 'weather')
    expect(p.has('weather')).toBe(false)
  })

  it('traffic 动态(删参)⇄固定(static)', () => {
    const p = new URLSearchParams('')
    applyModeParam(p, 'traffic')
    expect(p.get('traffic')).toBe('static')
    applyModeParam(p, 'traffic')
    expect(p.has('traffic')).toBe(false)
  })

  it('guide 关(删参)⇄开(guide=1)', () => {
    const p = new URLSearchParams('')
    applyModeParam(p, 'guide')
    expect(p.get('guide')).toBe('1')
    applyModeParam(p, 'guide')
    expect(p.has('guide')).toBe(false)
  })

  it('route 开启时四互斥清除 split/hotseat/challenge；关闭时不动', () => {
    const p = new URLSearchParams('?split&hotseat&challenge')
    applyModeParam(p, 'route')
    expect(p.get('route')).toBe('1')
    expect(p.has('split')).toBe(false)
    expect(p.has('hotseat')).toBe(false)
    expect(p.has('challenge')).toBe(false)
    // 关闭路线不再连带清挑战
    applyModeParam(p, 'route')
    applyModeParam(p, 'route')
    applyModeParam(p, 'route')
    expect(p.has('route')).toBe(false)
  })

  it('challenge 开启时四互斥清除 split/hotseat/route', () => {
    const p = new URLSearchParams('?route=2&split&hotseat')
    applyModeParam(p, 'challenge')
    expect(p.has('challenge')).toBe(true)
    expect(p.has('route')).toBe(false)
    expect(p.has('split')).toBe(false)
    expect(p.has('hotseat')).toBe(false)
    applyModeParam(p, 'challenge')
    expect(p.has('challenge')).toBe(false)
  })

  it('daily 开(删参)⇄关(daily=0)', () => {
    const p = new URLSearchParams('')
    applyModeParam(p, 'daily')
    expect(p.get('daily')).toBe('0')
    applyModeParam(p, 'daily')
    expect(p.has('daily')).toBe(false)
  })

  it('split 开启时四互斥清除 hotseat/challenge/route；再次点击关闭', () => {
    const p = new URLSearchParams('?hotseat&challenge&route=1')
    applyModeParam(p, 'split')
    expect(p.has('split')).toBe(true)
    expect(p.has('hotseat')).toBe(false)
    expect(p.has('challenge')).toBe(false)
    expect(p.has('route')).toBe(false)
    applyModeParam(p, 'split')
    expect(p.has('split')).toBe(false)
  })

  it('hotseat 开启时四互斥清除 split/challenge/route', () => {
    const p = new URLSearchParams('?split&challenge&route=2')
    applyModeParam(p, 'hotseat')
    expect(p.has('hotseat')).toBe(true)
    expect(p.has('split')).toBe(false)
    expect(p.has('challenge')).toBe(false)
    expect(p.has('route')).toBe(false)
  })

  it('perf 性能模式独立开关不参与互斥', () => {
    const p = new URLSearchParams('?split&hotseat&route=1&challenge')
    applyModeParam(p, 'perf')
    expect(p.has('perf')).toBe(true)
    expect(p.has('split')).toBe(true)
    expect(p.has('hotseat')).toBe(true)
    applyModeParam(p, 'perf')
    expect(p.has('perf')).toBe(false)
    expect(p.has('split')).toBe(true)
  })
})

describe('describeModeCard 卡片显示态', () => {
  it('全缺省：label 均带名称·值且 selected=false（每日缺省开）', () => {
    const p = new URLSearchParams('')
    expect(describeModeCard('weather', p)).toEqual({ param: 'weather', label: '天气·自动', selected: false })
    expect(describeModeCard('traffic', p)).toEqual({ param: 'traffic', label: '车流·动态', selected: false })
    expect(describeModeCard('guide', p)).toEqual({ param: 'guide', label: '引导线·关', selected: false })
    expect(describeModeCard('route', p)).toEqual({ param: 'route', label: '路线·关', selected: false })
    expect(describeModeCard('challenge', p)).toEqual({ param: 'challenge', label: '挑战·关', selected: false })
    expect(describeModeCard('daily', p)).toEqual({ param: 'daily', label: '每日·开', selected: false })
    expect(describeModeCard('split', p)).toEqual({ param: 'split', label: '分屏·关', selected: false })
    expect(describeModeCard('hotseat', p)).toEqual({ param: 'hotseat', label: '热座·关', selected: false })
    expect(describeModeCard('perf', p)).toEqual({ param: 'perf', label: '性能·关', selected: false })
  })

  it('非缺省参数：selected=true 且 label 反映当前值', () => {
    const p = new URLSearchParams('?weather=night&traffic=static&guide=1&route=3&challenge&daily=0&split&hotseat&perf')
    expect(describeModeCard('weather', p).selected).toBe(true)
    expect(describeModeCard('weather', p).label).toBe('天气·夜晚')
    expect(describeModeCard('traffic', p).label).toBe('车流·固定')
    expect(describeModeCard('guide', p).label).toBe('引导线·开')
    expect(describeModeCard('route', p).label).toBe('路线·路线3')
    expect(describeModeCard('challenge', p).label).toBe('挑战·开')
    expect(describeModeCard('daily', p).label).toBe('每日·关')
    // split 优先于 hotseat：当前 isReloadCard 仅反映有无参数，不反映有效性；此处测显示态
    expect(describeModeCard('perf', p).label).toBe('性能·开')
  })
})

/** stub 卡片按钮元素（querySelector 返回 label stub；dataset 记录 data-param） */
function createCardStub(param: string) {
  const label = { textContent: '' }
  const el = {
    dataset: { param },
    classList: { toggle: vi.fn() },
    setAttribute: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: (sel: string) => (sel === '.mode-card-label' ? label : null),
  }
  return { el, label }
}

describe('bindModeSelector DOM 绑定', () => {
  let windowStub: Record<string, unknown>
  let search: string
  let reloadSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    search = ''
    reloadSpy = vi.fn()
    windowStub = {
      location: {
        get search() {
          return search
        },
        get href() {
          return `http://localhost:5173/${search}`
        },
        reload: reloadSpy,
      },
      history: {
        replaceState: (_s: unknown, _t: string, url: string) => {
          search = url.includes('?') ? `?${url.split('?')[1]}` : ''
        },
      },
    }
    vi.stubGlobal('window', windowStub as unknown as Window & typeof globalThis)
    vi.stubGlobal('document', { title: '像素狂飙' })
  })

  function setupCards(): Map<string, ReturnType<typeof createCardStub>> {
    return new Map(
      ['weather', 'traffic', 'guide', 'route', 'challenge', 'daily', 'split', 'hotseat', 'perf'].map((p) => [
        p,
        createCardStub(p),
      ]),
    )
  }

  function fireClick(el: ReturnType<typeof createCardStub>['el']): void {
    const handler = (el.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'click')?.[1] as
      ((e: { currentTarget: unknown }) => void) | undefined
    handler?.({ currentTarget: el })
  }

  it('初始化渲染九卡 label 与选中态；点击热切卡循环切换并写回 URL、回调 onChanged', () => {
    const cards = setupCards()
    const onChanged = vi.fn()
    bindModeSelector({
      getElement: (id) =>
        id === 'mode-selector'
          ? ({
              querySelector: (sel: string) => {
                const m = /^\.mode-card\[data-param="([\w]+)"\]$/.exec(sel)
                return m ? (cards.get(m[1])?.el as unknown as HTMLElement) : null
              },
            } as unknown as HTMLElement)
          : null,
      onCleanup: vi.fn(),
      onChanged,
    })
    // 初始渲染：天气卡 label 为「天气·自动」、未选中
    expect(cards.get('weather')!.label.textContent).toBe('天气·自动')
    expect(cards.get('weather')!.el.classList.toggle).toHaveBeenCalledWith('mode-card--selected', false)
    expect(cards.get('split')!.label.textContent).toBe('分屏·关')

    // 点击天气卡一次 → ?weather=sunny + onChanged + 全卡重渲染
    fireClick(cards.get('weather')!.el)
    expect(search).toContain('weather=sunny')
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(cards.get('weather')!.label.textContent).toBe('天气·晴天')
    expect(cards.get('weather')!.el.classList.toggle).toHaveBeenLastCalledWith('mode-card--selected', true)
  })

  it('点击挑战卡清除路线参数（互斥联动渲染），onChanged 每次点击回调一次', () => {
    search = '?route=1'
    const cards = setupCards()
    const onChanged = vi.fn()
    bindModeSelector({
      getElement: (id) =>
        id === 'mode-selector'
          ? ({
              querySelector: (sel: string) => {
                const m = /^\.mode-card\[data-param="([\w]+)"\]$/.exec(sel)
                return m ? (cards.get(m[1])?.el as unknown as HTMLElement) : null
              },
            } as unknown as HTMLElement)
          : null,
      onCleanup: vi.fn(),
      onChanged,
    })
    expect(cards.get('route')!.label.textContent).toBe('路线·路线1')
    fireClick(cards.get('challenge')!.el)
    expect(search).not.toContain('route=')
    expect(search).toContain('challenge')
    expect(cards.get('route')!.label.textContent).toBe('路线·关')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('点击 reload 卡写 URL 后触发 reload 且不回调 onChanged', () => {
    const cards = setupCards()
    const onChanged = vi.fn()
    bindModeSelector({
      getElement: (id) =>
        id === 'mode-selector'
          ? ({
              querySelector: (sel: string) => {
                const m = /^\.mode-card\[data-param="([\w]+)"\]$/.exec(sel)
                return m ? (cards.get(m[1])?.el as unknown as HTMLElement) : null
              },
            } as unknown as HTMLElement)
          : null,
      onCleanup: vi.fn(),
      onChanged,
    })
    fireClick(cards.get('split')!.el)
    expect(search).toContain('split')
    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('容器缺失安全跳过（测试 stub 环境防御）', () => {
    expect(() => bindModeSelector({ getElement: () => null, onCleanup: vi.fn(), onChanged: vi.fn() })).not.toThrow()
  })

  // —— 2026-09-04 M38 收口：句柄重渲染 + 热切阶段守卫 ——

  it('容器缺失返回 null（GameLoop 侧用可选链安全消费）', () => {
    expect(bindModeSelector({ getElement: () => null, onCleanup: vi.fn(), onChanged: vi.fn() })).toBeNull()
  })

  it('返回句柄 render 可在 URL 被外部改动后重渲染（消除 URL/显示双真源）', () => {
    const cards = setupCards()
    const handle = bindModeSelector({
      getElement: (id) =>
        id === 'mode-selector'
          ? ({
              querySelector: (sel: string) => {
                const m = /^\.mode-card\[data-param="([\w]+)"\]$/.exec(sel)
                return m ? (cards.get(m[1])?.el as unknown as HTMLElement) : null
              },
            } as unknown as HTMLElement)
          : null,
      onCleanup: vi.fn(),
      onChanged: vi.fn(),
    })
    expect(handle).not.toBeNull()
    expect(cards.get('challenge')!.label.textContent).toBe('挑战·关')

    // 模拟 applyPhase(PHASE_MENU) 清理 ?challenge 之外的反向场景：URL 被外部打开挑战
    search = '?challenge'
    handle!.render()
    expect(cards.get('challenge')!.label.textContent).toBe('挑战·开')
    expect(cards.get('challenge')!.el.classList.toggle).toHaveBeenLastCalledWith('mode-card--selected', true)
  })

  it('isMenuPhase=false 时忽略热切点击（不写 URL、不回调 onChanged）', () => {
    search = ''
    const cards = setupCards()
    const onChanged = vi.fn()
    bindModeSelector({
      getElement: (id) =>
        id === 'mode-selector'
          ? ({
              querySelector: (sel: string) => {
                const m = /^\.mode-card\[data-param="([\w]+)"\]$/.exec(sel)
                return m ? (cards.get(m[1])?.el as unknown as HTMLElement) : null
              },
            } as unknown as HTMLElement)
          : null,
      onCleanup: vi.fn(),
      onChanged,
      isMenuPhase: () => false,
    })
    fireClick(cards.get('weather')!.el)
    expect(search).toBe('')
    expect(onChanged).not.toHaveBeenCalled()
    expect(cards.get('weather')!.label.textContent).toBe('天气·自动')
  })

  it('isMenuPhase=true 时正常热切（守卫不误伤菜单阶段）', () => {
    search = ''
    const cards = setupCards()
    const onChanged = vi.fn()
    bindModeSelector({
      getElement: (id) =>
        id === 'mode-selector'
          ? ({
              querySelector: (sel: string) => {
                const m = /^\.mode-card\[data-param="([\w]+)"\]$/.exec(sel)
                return m ? (cards.get(m[1])?.el as unknown as HTMLElement) : null
              },
            } as unknown as HTMLElement)
          : null,
      onCleanup: vi.fn(),
      onChanged,
      isMenuPhase: () => true,
    })
    fireClick(cards.get('weather')!.el)
    expect(search).toContain('weather=sunny')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})

describe('cycleRouteValue 上界由 ROUTE_DEFS.length 驱动（2026-09-04 收口）', () => {
  it('循环上界 = 路线总数，依次推进后回到关', () => {
    const total = ROUTE_DEFS.length
    let v = ''
    for (let i = 1; i <= total; i++) {
      v = cycleRouteValue(v)
      expect(v).toBe(String(i))
    }
    // 走完全部路线后回到「关」
    expect(cycleRouteValue(v)).toBe('')
  })

  it('超出总数 / 非数字值归一化为关再推进到路线1（旧实现在路线增至 4 条时会断裂）', () => {
    expect(cycleRouteValue('9')).toBe('1')
    expect(cycleRouteValue('0')).toBe('1')
    expect(cycleRouteValue('-1')).toBe('1')
    expect(cycleRouteValue('abc')).toBe('1')
  })
})
