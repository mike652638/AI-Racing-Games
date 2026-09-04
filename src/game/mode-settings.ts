import { ROUTE_DEFS } from '../engine/routes'

/**
 * M38 模式设置面板（菜单 #mode-selector 九卡）：把 URL 模式参数暴露为可点击卡片。
 * 单一真源仍为 URL query——点击卡片循环切换参数值 → history.replaceState 写回 →
 * 六卡（weather/traffic/guide/daily/challenge/route）热应用（onChanged 回调通知
 * GameLoop 重解析并更新运行时字段，无需刷新）；三卡（split/hotseat/perf）涉及
 * 构造级组件（TrackManager/joystick/HUD 布局/性能档），写 URL 后执行 reload
 * 重新走一遍构造器与初始化，对普通用户比手输参数友好、对高级用户保留 URL 可分享性。
 *
 * 游玩模式四互斥（split 热血优先于 hotseat 优先于 challenge 优先于 route，与
 * parseGameParams / createModeStrategy 一致），perf 独立不互斥。
 */

/** 全部卡片参数名（与 index.html .mode-card[data-param] 一一对应） */
export const MODE_CARD_PARAMS = [
  'weather',
  'traffic',
  'guide',
  'route',
  'challenge',
  'daily',
  'split',
  'hotseat',
  'perf',
] as const

export type ModeCardParam = (typeof MODE_CARD_PARAMS)[number]

/** 需 reload 的卡片集合（构造级依赖，热切会破坏一致性） */
export const RELOAD_CARD_PARAMS: ReadonlySet<ModeCardParam> = new Set(['split', 'hotseat', 'perf'])

/** 判断卡片是否走 reload 路径 */
export function isReloadCard(param: ModeCardParam): boolean {
  return RELOAD_CARD_PARAMS.has(param)
}

/** 天气循环序列：缺省(auto) → 固定三变体 → 每局随机 → 回到缺省 */
const WEATHER_CYCLE: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '自动' },
  { value: 'sunny', label: '晴天' },
  { value: 'rain', label: '雨天' },
  { value: 'night', label: '夜晚' },
  { value: 'random', label: '随机' },
]

/** 天气当前值 → 循环下一值（'' 表示删除参数回 auto） */
export function cycleWeatherValue(current: string): string {
  const idx = WEATHER_CYCLE.findIndex((w) => w.value === current)
  return WEATHER_CYCLE[(idx + 1) % WEATHER_CYCLE.length].value
}

/**
 * 路线当前值 → 循环下一值（'' → 1 → … → ROUTE_DEFS.length → ''；数字为 1 基下标；
 * 无效值归一化为「关」再推进到路线 1）。
 * 上界取自 `ROUTE_DEFS.length` 而非硬编码 1/2/3——与 `routeLabel` 共用同一判定口径，
 * 路线增至 4 条时循环不会断裂（2026-09-04 修复）。
 */
export function cycleRouteValue(current: string): string {
  const total = ROUTE_DEFS.length
  const n = Number(current)
  if (!Number.isInteger(n) || n < 1 || n > total) return '1'
  return n >= total ? '' : String(n + 1)
}

/** 天气值显示名（无效值按 auto 处理，与 parseGameParams 回退语义一致） */
export function weatherLabel(value: string): string {
  return WEATHER_CYCLE.find((w) => w.value === value)?.label ?? '自动'
}

/** 路线值显示名（1/2/3 → 路线N；''/无效 → 关） */
export function routeLabel(value: string): string {
  const n = Number(value)
  return n >= 1 && n <= ROUTE_DEFS.length ? `路线${n}` : '关'
}

/**
 * 点击卡片后的参数写入（原地修改传入 params）：循环推进该参数值，
 * 并执行 UI 层互斥清理——split/hotseat/challenge/route 四互斥
 *（split 最高优先，与 parseGameParams / createModeStrategy 判定一致）；
 * perf 独立不参与互斥。
 */
export function applyModeParam(params: URLSearchParams, param: ModeCardParam): void {
  switch (param) {
    case 'weather': {
      const next = cycleWeatherValue(params.get('weather') ?? '')
      if (next === '') params.delete('weather')
      else params.set('weather', next)
      break
    }
    case 'traffic': {
      // dynamic 为缺省（删参）；static 显式写参
      if (params.get('traffic') === 'static') params.delete('traffic')
      else params.set('traffic', 'static')
      break
    }
    case 'guide': {
      if (params.get('guide') === '1') params.delete('guide')
      else params.set('guide', '1')
      break
    }
    case 'route': {
      const next = cycleRouteValue(params.get('route') ?? '')
      if (next === '') params.delete('route')
      else {
        params.set('route', next)
        // 四互斥：开路线清其余三玩法模式
        params.delete('split')
        params.delete('hotseat')
        params.delete('challenge')
      }
      break
    }
    case 'challenge': {
      if (params.has('challenge')) params.delete('challenge')
      else {
        params.set('challenge', '')
        // 四互斥：开挑战清其余三
        params.delete('split')
        params.delete('hotseat')
        params.delete('route')
      }
      break
    }
    case 'daily': {
      // on 为缺省（删参）；off 显式 daily=0
      if (params.get('daily') === '0') params.delete('daily')
      else params.set('daily', '0')
      break
    }
    case 'split': {
      if (params.has('split')) params.delete('split')
      else {
        params.set('split', '')
        params.delete('hotseat')
        params.delete('challenge')
        params.delete('route')
      }
      break
    }
    case 'hotseat': {
      if (params.has('hotseat')) params.delete('hotseat')
      else {
        params.set('hotseat', '')
        params.delete('split')
        params.delete('challenge')
        params.delete('route')
      }
      break
    }
    case 'perf': {
      if (params.has('perf')) params.delete('perf')
      else params.set('perf', '')
      break
    }
  }
}

/** 卡片显示态（label 为「名称·值」全量文案；selected = 当前值非缺省） */
export interface ModeCardView {
  param: ModeCardParam
  label: string
  selected: boolean
}

/** 从 URL 参数推导单张卡片的显示态 */
export function describeModeCard(param: ModeCardParam, params: URLSearchParams): ModeCardView {
  switch (param) {
    case 'weather':
      return { param, label: `天气·${weatherLabel(params.get('weather') ?? '')}`, selected: params.has('weather') }
    case 'traffic':
      return {
        param,
        label: `车流·${params.get('traffic') === 'static' ? '固定' : '动态'}`,
        selected: params.get('traffic') === 'static',
      }
    case 'guide':
      return {
        param,
        label: `引导线·${params.get('guide') === '1' ? '开' : '关'}`,
        selected: params.get('guide') === '1',
      }
    case 'route': {
      const raw = params.get('route') ?? ''
      return { param, label: `路线·${routeLabel(raw)}`, selected: raw !== '' }
    }
    case 'challenge':
      return { param, label: `挑战·${params.has('challenge') ? '开' : '关'}`, selected: params.has('challenge') }
    case 'daily':
      return {
        param,
        label: `每日·${params.get('daily') === '0' ? '关' : '开'}`,
        selected: params.get('daily') === '0',
      }
    case 'split':
      return { param, label: `分屏·${params.has('split') ? '开' : '关'}`, selected: params.has('split') }
    case 'hotseat':
      return { param, label: `热座·${params.has('hotseat') ? '开' : '关'}`, selected: params.has('hotseat') }
    case 'perf':
      return { param, label: `性能·${params.has('perf') ? '开' : '关'}`, selected: params.has('perf') }
  }
}

/** 绑定后的操作句柄（供 GameLoop 在外部改动 URL 后同步卡片显示态） */
export interface ModeSelectorHandle {
  /** 重新渲染全部卡片显示态（URL 被外部修改后调用，保证显示与 URL 单一真源同步） */
  render(): void
}

/**
 * 绑定菜单模式设置卡片（GameLoop 构造器调用；注入式 DOM 解耦可单测）：
 * 初始化各卡显隐态 → click 循环切换 → 写 URL（replaceState 不产生历史记录）→
 * 六卡热切时全卡重渲染 + onChanged 通知 GameLoop 热更新；三卡（split/hotseat/perf）
 * 写 URL 后 trigger reload 走完整构造器重建（构造级依赖无需热切，既正确又简单）。
 * 元素缺失（测试 stub 环境）或无卡片时返回 null。
 */
export function bindModeSelector(args: {
  getElement: (id: string) => HTMLElement | null
  onCleanup: (fn: () => void) => void
  /** 六卡热切变更后回调（GameLoop 重解析 + 刷新徽章/提示/榜单板块）；三卡走 reload 路径不调用 onChanged */
  onChanged: () => void
  /**
   * 热切前置守卫（可选）：返回 false 时直接忽略点击（不写 URL、不触发热切）。
   * GameLoop 传 `() => phase === PHASE_MENU`——卡片虽只在 start-screen 内，
   * 但显式守卫可防止「隐式前提被破坏后比赛中途改模式」的状态错乱。缺省视为总是允许。
   */
  isMenuPhase?: () => boolean
}): ModeSelectorHandle | null {
  const container = args.getElement('mode-selector')
  if (!container) return null
  const cards = MODE_CARD_PARAMS.map((param) => {
    const el = container.querySelector<HTMLButtonElement>(`.mode-card[data-param="${param}"]`)
    return el ? { param, el } : null
  }).filter((c): c is { param: ModeCardParam; el: HTMLButtonElement } => c !== null)
  if (cards.length === 0) return null

  const render = (): void => {
    const params = new URLSearchParams(window.location.search)
    for (const { param, el } of cards) {
      const view = describeModeCard(param, params)
      const labelEl = el.querySelector<HTMLElement>('.mode-card-label')
      if (labelEl) labelEl.textContent = view.label
      el.classList.toggle('mode-card--selected', view.selected)
      el.setAttribute('aria-pressed', String(view.selected))
    }
  }

  const onClick = (event: Event): void => {
    const target = event.currentTarget as HTMLButtonElement | null
    const param = target?.dataset.param as ModeCardParam | undefined
    if (!param || !MODE_CARD_PARAMS.includes(param)) return
    // 热切守卫：非菜单阶段直接忽略（守卫置于写 URL 之前，避免"URL 已改但状态未同步"）
    if (!isReloadCard(param) && args.isMenuPhase && !args.isMenuPhase()) return
    const url = new URL(window.location.href)
    applyModeParam(url.searchParams, param)
    window.history.replaceState({}, document.title, url.toString())
    // 三卡走 reload 路径（构造级依赖）：reloaded 页面会按新 URL 重建全部状态；无需 render/onChanged
    if (isReloadCard(param)) {
      window.location.reload()
      return
    }
    render()
    args.onChanged()
  }

  for (const { el } of cards) {
    el.addEventListener('click', onClick)
    args.onCleanup(() => el.removeEventListener('click', onClick))
  }
  render()
  return { render }
}
