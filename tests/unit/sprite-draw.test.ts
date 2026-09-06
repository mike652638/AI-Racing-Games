/**
 * 景物形状绘制模块单测：锁定「上层叶 fillStyle 为合法 6 位 hex」回归。
 *
 * 背景修复：drawPalm 原 `(leafColor ?? '#2a6a3a').replace('#', '#3')` 产出 7 位非法 hex
 * （如 #32a6a3a），浏览器直接忽略该 fillStyle；现改为 shadeColor(leaf, 1.15)（合法 6 位 hex 变亮，
 * 非 6 位输入原样返回防御）。
 */
import { describe, expect, test } from 'vitest'
import { drawPalm } from '../../src/engine/sprite-draw'
import { shadeColor } from '../../src/engine/road-strip'
import { createMockCanvas } from '../__mocks__/canvas'

/** 调用 drawPalm 并捕获每次 fill 时刻的 fillStyle（mock 的 fill 不记录颜色快照，测试内补丁） */
function palmFillStyles(leafColor?: string): string[] {
  const canvas = createMockCanvas(200, 200)
  const ctx = canvas.__ctx
  const styles: string[] = []
  const orig = ctx.fill.bind(ctx)
  ctx.fill = (() => {
    styles.push(String(ctx.fillStyle))
    orig()
  }) as typeof ctx.fill
  drawPalm(ctx, 100, 180, 80, undefined, leafColor)
  return styles
}

describe('drawPalm 上层叶 fillStyle 合法性（修复回归）', () => {
  test('默认叶色：上层叶为合法 6 位 hex（原 .replace 产出 7 位非法色）', () => {
    const styles = palmFillStyles()
    // 两次 fill：下层冠 + 上层叶
    expect(styles).toHaveLength(2)
    for (const s of styles) {
      expect(s).toMatch(/^#[0-9a-f]{6}$/i)
    }
    // 上层叶 = 叶色略亮一档（shadeColor('#2a6a3a', 1.15)）
    expect(styles[1]).toBe(shadeColor('#2a6a3a', 1.15))
    expect(styles[1]).not.toMatch(/^#[0-9a-f]{7,}$/i)
  })

  test('自定义 leafColor：上层叶仍为合法 6 位 hex 变亮色', () => {
    const styles = palmFillStyles('#88aa33')
    expect(styles[1]).toBe(shadeColor('#88aa33', 1.15))
    expect(styles[1]).toMatch(/^#[0-9a-f]{6}$/i)
  })

  test('非 hex 输入（如 rgba/颜色名）原样返回，不产出非法 6+ 位色', () => {
    // shadeColor 对非 6 位 hex 原样返回（防御），不产生 7 位非法 hex
    expect(palmFillStyles('rgb(10, 20, 30)')[1]).toBe('rgb(10, 20, 30)')
    expect(palmFillStyles('red')[1]).toBe('red')
  })
})
