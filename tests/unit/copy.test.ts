import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENTS,
  APP_VERSION,
  APP_VERSION_DATE,
  BEST_EMPTY_HINT,
  COUNTDOWN_HINTS,
  COUNTDOWN_HINTS_TOUCH,
  COUNTDOWN_HINTS_TOUCH_SPLIT,
  COUNTDOWN_HINT_README_KEYWORDS,
  DAILY_PROGRESS_PREFIX,
  DRIFT_EMPTY_HINT,
  FINISH_DRIFT_HINT,
  MATCH_EMPTY_HINT,
  MEDAL_LABEL,
  MENU_HINT,
  MENU_HINT_TOUCH,
  RACING_TOUCH_HINT,
  SPLIT_TOUCH_HINT,
  WEATHER_MODE_LABEL,
} from '../../src/ui/copy'
import { ACHIEVEMENT_ID_LIST } from '../../src/ui/save'

describe('copy.ts UI 文案常量', () => {
  it('倒计时提示恰好三条且不为空', () => {
    expect(COUNTDOWN_HINTS.length).toBe(3)
    for (const hint of COUNTDOWN_HINTS) {
      expect(hint.length).toBeGreaterThan(0)
    }
  })

  it('提示与 README 关键词一一对应（数组长度一致）', () => {
    expect(COUNTDOWN_HINT_README_KEYWORDS.length).toBe(COUNTDOWN_HINTS.length)
  })

  it('M33 触屏倒计时提示：恰好三条且非空（小米 13 Ultra 横屏专项实测修复）', () => {
    expect(COUNTDOWN_HINTS_TOUCH.length).toBe(3)
    expect(COUNTDOWN_HINTS_TOUCH_SPLIT.length).toBe(3)
    for (const hint of [...COUNTDOWN_HINTS_TOUCH, ...COUNTDOWN_HINTS_TOUCH_SPLIT]) {
      expect(hint.length).toBeGreaterThan(0)
    }
    // 单屏触屏不得含键盘专属词（WASD/空格 对触屏玩家无意义）
    expect(COUNTDOWN_HINTS_TOUCH.join('')).not.toContain('WASD')
    expect(COUNTDOWN_HINTS_TOUCH.join('')).not.toContain('空格')
    // 分屏触屏不得误导「右下角摇杆」（分屏为各自半屏四分区触控）
    expect(COUNTDOWN_HINTS_TOUCH_SPLIT.join('')).not.toContain('右下角')
    expect(COUNTDOWN_HINTS_TOUCH_SPLIT.join('')).toContain('P1')
    expect(COUNTDOWN_HINTS_TOUCH_SPLIT.join('')).toContain('P2')
  })

  it('菜单提示非空', () => {
    expect(MENU_HINT.length).toBeGreaterThan(0)
    expect(MENU_HINT_TOUCH.length).toBeGreaterThan(0)
  })

  it('M18 新增文案常量非空', () => {
    expect(RACING_TOUCH_HINT.length).toBeGreaterThan(0)
    expect(FINISH_DRIFT_HINT.length).toBeGreaterThan(0)
    expect(MATCH_EMPTY_HINT.length).toBeGreaterThan(0)
    expect(BEST_EMPTY_HINT.length).toBeGreaterThan(0)
    expect(DRIFT_EMPTY_HINT.length).toBeGreaterThan(0)
  })

  it('分屏触屏引导文案（2026-08-08 新增）：非空且描述实际四分区行为（不误导「右下角」）', () => {
    expect(SPLIT_TOUCH_HINT.length).toBeGreaterThan(0)
    // 分屏不常驻右下角摇杆，文案不得含「右下角」误导
    expect(SPLIT_TOUCH_HINT).not.toContain('右下角')
    // 描述实际行为：P1/P2 各自半屏四分区（右上油门 / 左上刹车 / 左下左转 / 右下右转）
    expect(SPLIT_TOUCH_HINT).toContain('P1')
    expect(SPLIT_TOUCH_HINT).toContain('P2')
    expect(SPLIT_TOUCH_HINT).toContain('油门')
    expect(SPLIT_TOUCH_HINT).toContain('刹车')
  })

  it('M23 新增文案常量非空（奖牌标签 + 成就名称/描述 + 天气模式标签）', () => {
    expect(MEDAL_LABEL.S).toBe('S')
    expect(MEDAL_LABEL.A).toBe('A')
    expect(MEDAL_LABEL.B).toBe('B')
    expect(Object.keys(ACHIEVEMENTS).length).toBe(ACHIEVEMENT_ID_LIST.length)
    for (const a of Object.values(ACHIEVEMENTS)) {
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.desc.length).toBeGreaterThan(0)
    }
    // M23 方案 11：5 个天气模式标签非空（auto/random/sunny/rain/night）
    expect(Object.keys(WEATHER_MODE_LABEL).length).toBe(5)
    for (const label of Object.values(WEATHER_MODE_LABEL)) {
      expect(label.length).toBeGreaterThan(0)
    }
    // M28 方案 14：每日挑战进度前缀非空
    expect(DAILY_PROGRESS_PREFIX.length).toBeGreaterThan(0)
  })

  it('M-9（菜单审计）：#touch-hint 不再硬编码文案，运行时由 RACING_TOUCH_HINT 同源填充', () => {
    const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')
    expect(html).toContain('id="touch-hint"')
    // 硬编码旧文案（与 RACING_TOUCH_HINT 已漂移）不得再出现在 HTML
    expect(html).not.toContain('虚拟摇杆控制方向与油门')
    // 同源常量包含关键控件词，保证填充后语义完整
    expect(RACING_TOUCH_HINT).toContain('虚拟摇杆')
    expect(RACING_TOUCH_HINT).toContain('暂停')
  })
})

describe('操作提示与 README「操作说明」同源（防文案漂移）', () => {
  // 读取 README.md 原文（工作区根目录），断言每条提示的关键词都在 README 中出现
  const readme = readFileSync(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8')

  it('README 包含全部倒计时提示关键词', () => {
    for (const keywords of COUNTDOWN_HINT_README_KEYWORDS) {
      for (const kw of keywords) {
        expect(readme, `README 缺少关键词「${kw}」`).toContain(kw)
      }
    }
  })

  it('README 包含触屏倒计时提示描述（2026-08-08 小米 13 Ultra 横屏专项实测新增）', () => {
    // 单屏触屏：摇杆指引（与 RACING_TOUCH_HINT 语义一致）
    expect(readme).toContain('虚拟摇杆')
    expect(readme).toContain('触屏')
    // 分屏触屏：四分区指引（防「右下角」误导）
    expect(readme).toContain('四分区')
    expect(readme).toContain('摇杆指引')
  })

  it('菜单提示「空格键开始」在 README 有对应描述', () => {
    expect(readme).toContain('任意键')
    expect(readme).toContain('开始游戏')
  })
})

describe('部署可见版本号（2026-08-08 新增）', () => {
  it('APP_VERSION 非空且形如 vX.Y.Z', () => {
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  it('APP_VERSION_DATE 为 YYYY-MM-DD', () => {
    expect(APP_VERSION_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('index.html 的 meta app-version 与常量同步（防版本号漂移）', () => {
    const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')
    expect(html).toContain(`content="${APP_VERSION}-${APP_VERSION_DATE}"`)
  })

  it('菜单含版本标签元素 #app-version', () => {
    const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')
    expect(html).toContain('id="app-version"')
  })
})
