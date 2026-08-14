import { getRouteDef, ROUTE_DEFS, routeStageCount } from '../engine/routes'
import { APP_VERSION, APP_VERSION_DATE, RACING_TOUCH_HINT, SPLIT_TOUCH_HINT, WEATHER_MODE_LABEL } from '../ui/copy'
import { CHALLENGE_SECONDS, CHALLENGE_TARGET_SCORE } from './constants'
import type { ModeStrategy } from './mode-strategy'
import type { WeatherOverride } from '../engine/lighting'

/**
 * 菜单静态装饰装配（M34 拆分自 game-loop.ts 构造器）：菜单提示文案、模式/天气徽章、
 * body 分屏类、触屏提示文案与版本号填充。元素经注入式 getElement 解耦 document（可单测），
 * 行为与拆分前构造器内联块逐字节一致。
 */

export interface MenuChromeArgs {
  /** 游玩模式策略（徽章四分支与 menuHint 文案来源） */
  mode: ModeStrategy
  /** 对局天气模式（天气徽章来源，auto 隐藏） */
  weatherMode: WeatherOverride | 'random'
  /** 路线模式路线 id（路线徽章名称/段数来源；非路线模式为 null） */
  routeId: string | null
  /** 注入式元素查询（真实环境 document.getElementById；测试 stub） */
  getElement: (id: string) => HTMLElement | null
  /** body 类操作目标（分屏类写入；测试可注入替身，null 时跳过） */
  body: HTMLElement | null
}

/** 装配菜单静态装饰（menu-hint / 模式徽章 / 天气徽章 / body 类 / touch-hint / app-version） */
export function applyMenuChrome(args: MenuChromeArgs): void {
  const { mode, weatherMode, routeId, getElement, body } = args
  // 模式菜单提示（#menu-hint 由 index.html 提供）：文案下沉至 mode.menuHint（分屏/热座/挑战/单屏各一套）
  const menuHint = getElement('menu-hint')
  if (menuHint) {
    menuHint.textContent = mode.menuHint
  }
  // UX-3 修复（2026-08-05）：菜单模式徽章——分屏/热座/挑战模式显式标识，避免用户误认为单屏；
  // 单屏模式保持隐藏（默认玩法无需标注）
  const modeBadge = getElement('menu-mode-badge')
  if (modeBadge) {
    if (mode.splitMode) {
      modeBadge.hidden = false
      modeBadge.textContent = '分屏模式 · 双人同屏'
      modeBadge.className = 'mode-badge mode-split'
    } else if (mode.hotseatMode) {
      modeBadge.hidden = false
      modeBadge.textContent = '热座模式 · 回合轮流'
      modeBadge.className = 'mode-badge mode-hotseat'
    } else if (mode.challengeMode) {
      modeBadge.hidden = false
      // M20 P3-4：徽章文案补目标分（CHALLENGE_TARGET_SCORE 真源 src/shared/constants）
      modeBadge.textContent = `挑战模式 · ${CHALLENGE_SECONDS} 秒刷分 · 目标 ${CHALLENGE_TARGET_SCORE}`
      modeBadge.className = 'mode-badge mode-challenge'
    } else if (mode.routeMode && routeId !== null) {
      // M28 方案 9：路线模式徽章——显示路线名 + 阶段数（3 条预设路线之一）
      modeBadge.hidden = false
      const route = getRouteDef(routeId)
      modeBadge.textContent = `路线模式 · ${route?.name ?? '未知路线'} · ${routeStageCount(route ?? ROUTE_DEFS[0])} 段岔路`
      modeBadge.className = 'mode-badge mode-route'
    } else {
      modeBadge.hidden = true
    }
  }
  // M23 方案 11：菜单天气徽章——?weather=random/固定变体显式标识当前天气模式；
  // auto（默认时间循环）保持隐藏（默认玩法无需标注，仿 mode-badge 语义）
  const weatherBadge = getElement('menu-weather-badge')
  if (weatherBadge) {
    const label = WEATHER_MODE_LABEL[weatherMode]
    if (label !== undefined && weatherMode !== 'auto') {
      weatherBadge.hidden = false
      weatherBadge.textContent = `天气：${label}`
      weatherBadge.className = 'mode-badge weather-badge'
    } else {
      weatherBadge.hidden = true
    }
  }
  // UX-8 修复：分屏模式为 body 加类，启用 HUD P1/P2 侧标签（.hud-side-tag，CSS 控制显隐）
  if (mode.splitMode && typeof body?.classList?.add === 'function') {
    body.classList.add('split-mode')
  }
  // M-9（菜单审计）：#touch-hint 文案改由 copy.ts 同源填充（原 index.html 硬编码已与
  // RACING_TOUCH_HINT 漂移且无测试保护）；元素缺失时安全跳过。
  // 2026-08-08 分屏文案修复：分屏不常驻右下角摇杆（U-4），统一摇杆文案误导
  const touchHint = getElement('touch-hint')
  if (touchHint) touchHint.textContent = mode.splitMode ? SPLIT_TOUCH_HINT : RACING_TOUCH_HINT
  // 2026-08-08：菜单底部版本号（#app-version）由 copy.ts 填充，便于确认线上部署版本
  //（APP_VERSION 已含 v 前缀，勿重复拼接）
  const versionTag = getElement('app-version')
  if (versionTag) versionTag.textContent = `${APP_VERSION} · ${APP_VERSION_DATE}`
}
