import { describe, expect, it } from 'vitest'
import { drawTerrain } from '../../src/engine/terrain-draw'
import { createMockCanvas } from '../__mocks__/canvas'

const opts = { width: 800, height: 600, horizon: 210, depth: 672 }

describe('drawTerrain 地形细节（M18）', () => {
  it('沙漠沙丘：sin 变形路径绘制（无 ellipse，折线逼近 + moveTo/lineTo/fill）', () => {
    const canvas = createMockCanvas(800, 600)
    drawTerrain(canvas.__ctx, opts, 'desert', false)
    // 沙丘不再走纯 ellipse（M18 改为 sin 噪声叠加的折线路径）
    expect(canvas.__ctx.__calls.ellipse ?? 0).toBe(0)
    expect(canvas.__ctx.__calls.beginPath ?? 0).toBeGreaterThan(0)
    expect(canvas.__ctx.__calls.moveTo ?? 0).toBeGreaterThan(0)
    expect(canvas.__ctx.__calls.lineTo ?? 0).toBeGreaterThan(0)
    expect(canvas.__ctx.__calls.fill ?? 0).toBeGreaterThan(0)
  })

  it('海岸海面：波浪 y 随 time 轻微漂移（time 不同 → ellipse y 不同；time 相同 → 逐字节一致）', () => {
    const yOf = (time: number): number[] => {
      const canvas = createMockCanvas(800, 600)
      drawTerrain(canvas.__ctx, opts, 'coast', false, time)
      // ctx.ellipse(x, y, ...) → 实参索引 1 为 y
      return (canvas.__ctx.__args.ellipse ?? []).map((a) => a[1] as number)
    }
    const y0 = yOf(0)
    const y1 = yOf(1.3)
    expect(y0).toHaveLength(3) // 3 道波浪
    expect(y1).toHaveLength(3)
    expect(y1).not.toEqual(y0) // 漂移幅度非零：y 随 time 变化
    expect(yOf(0)).toEqual(y0) // 同 time 确定性
  })

  it('time 参数缺省向后兼容（不传 time 与传 0 渲染一致）', () => {
    const c1 = createMockCanvas(800, 600)
    drawTerrain(c1.__ctx, opts, 'coast', false)
    const c2 = createMockCanvas(800, 600)
    drawTerrain(c2.__ctx, opts, 'coast', false, 0)
    expect(c1.__ctx.__args.ellipse).toEqual(c2.__ctx.__args.ellipse)
  })

  it('非目标环境（plains）零绘制（零开销）', () => {
    const canvas = createMockCanvas(800, 600)
    drawTerrain(canvas.__ctx, opts, 'plains', false)
    expect(canvas.__ctx.__calls.fill ?? 0).toBe(0)
  })

  it('峡谷岩壁（rock）不受影响（fillRect 绘制）', () => {
    const canvas = createMockCanvas(800, 600)
    drawTerrain(canvas.__ctx, opts, 'canyon', true)
    expect(canvas.__ctx.__calls.fillRect ?? 0).toBeGreaterThan(0)
    expect(canvas.__ctx.__calls.ellipse ?? 0).toBe(0)
  })
})
