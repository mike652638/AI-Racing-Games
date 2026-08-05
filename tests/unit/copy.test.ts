import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BEST_EMPTY_HINT,
  COUNTDOWN_HINTS,
  COUNTDOWN_HINT_README_KEYWORDS,
  DRIFT_EMPTY_HINT,
  FINISH_DRIFT_HINT,
  MATCH_EMPTY_HINT,
  MENU_HINT,
  MENU_HINT_TOUCH,
  RACING_TOUCH_HINT,
} from '../../src/ui/copy'

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

  it('菜单提示「空格键开始」在 README 有对应描述', () => {
    expect(readme).toContain('任意键')
    expect(readme).toContain('开始游戏')
  })
})
