import { describe, expect, it } from 'vitest'
import { drawSingleTraffic, headlightGeometry } from '../../src/engine/traffic-draw'
import type { TrafficProjection } from '../../src/engine/traffic-render'
import type { TrafficCar } from '../../src/engine/traffic'

/**
 * 夜间车前灯光晕收敛回归（2026-09-07）。
 * 缺陷原貌：核心灯 r=0.5×车宽（直径=整个车宽）、外层光晕 r=0.8×车宽且无像素上限，
 * 近处车（width 100px+）光晕直径 180px+ 加 0.35 alpha 叠在车身上，夜间 NPC 几乎只见
 * 车灯不见车身（用户实测截图）。本文件锁定三个修复面：几何 clamp、绘制顺序（光晕在
 * 车身之下）、透明度收敛。
 */

/** 构造 TrafficProjection 替身（仅 drawSingleTraffic 消费的字段） */
function makeProjection(width: number, shiftDir: -1 | 0 | 1 = 0): TrafficProjection {
  const car = { z: 1000, offset: 0, speed: 200, colorIndex: 0, shiftDir, cruiseOffset: 0 } as TrafficCar
  return {
    car,
    z: 1000,
    bottom: { x: 200, y: 400, scale: 1 },
    top: { x: 200, y: 380, scale: 1 },
    width,
    height: 40,
    color: '#d84a4a',
  }
}

interface Op {
  kind: 'rect' | 'arc'
  /** arc 半径（rect 恒 0） */
  r: number
  /** 调用时生效的 fillStyle */
  style: string
}

/** 记录式 ctx 替身：按调用顺序记录 fillRect / arc 及当时的 fillStyle（断言顺序与半径 clamp） */
function createCtxStub(): { ops: Op[]; ctx: CanvasRenderingContext2D } {
  const ops: Op[] = []
  let style = ''
  const ctx = {
    set fillStyle(v: string) {
      style = v
    },
    get fillStyle() {
      return style
    },
    fillRect: () => {
      ops.push({ kind: 'rect', r: 0, style })
    },
    beginPath: () => {},
    arc: (_x: number, _y: number, r: number) => {
      ops.push({ kind: 'arc', r, style })
    },
    fill: () => {},
  }
  return { ops, ctx: ctx as unknown as CanvasRenderingContext2D }
}

describe('headlightGeometry 车前灯几何 clamp', () => {
  it('近处大车（width=200）：核心灯/光晕半径均触发像素上限，不再随车宽线性放大', () => {
    const geo = headlightGeometry(200, 0)
    // 旧版：coreR=100（直径=整个车宽）、haloR=160（直径 320px 光盘）
    expect(geo.coreR).toBe(9)
    expect(geo.haloR).toBe(26)
  })

  it('远处小车（width=12）：按比例缩放且不低于下限', () => {
    const geo = headlightGeometry(12, 0)
    expect(geo.coreR).toBe(2) // 0.14×12=1.68 → 下限 2
    expect(geo.haloR).toBeCloseTo(5.4) // 0.45×12
  })

  it('极小车（width=5）：触发下限，保证远处车灯仍可见', () => {
    const geo = headlightGeometry(5, 0)
    expect(geo.coreR).toBe(2)
    expect(geo.haloR).toBe(4)
  })

  it('光束朝向偏移随 steerDir 且带绝对值上限（width=200 时偏移不再= 0.35×车宽）', () => {
    expect(headlightGeometry(200, 1).coreOffset).toBe(10)
    expect(headlightGeometry(200, -1).coreOffset).toBe(-10)
    expect(headlightGeometry(200, 0).coreOffset).toBe(0)
    // 光晕偏移幅度更小（0.6 倍上限），扩散方向与核心灯一致
    expect(headlightGeometry(200, 1).haloOffset).toBe(6)
    expect(headlightGeometry(12, 1).coreOffset).toBeCloseTo(4.2) // 未触发上限
  })
})

describe('drawSingleTraffic night 车前灯绘制', () => {
  it('绘制顺序：氛围光晕 arc 在车身 rect 之前，核心灯 arc 在最后（光晕不罩车身）', () => {
    const { ops, ctx } = createCtxStub()
    drawSingleTraffic(ctx, makeProjection(60), true)
    expect(ops[0].kind).toBe('arc') // 氛围光晕（车身之下）
    expect(ops[1].kind).toBe('rect') // 车身
    expect(ops[ops.length - 1].kind).toBe('arc') // 核心灯（车身上）
    // night 共两次 arc（halo + core），中间全部是车身细节 rect
    expect(ops.filter((o) => o.kind === 'arc')).toHaveLength(2)
  })

  it('近处大车（width=200）：arc 半径命中像素上限，光晕直径 52px 远小于旧版 320px', () => {
    const { ops, ctx } = createCtxStub()
    drawSingleTraffic(ctx, makeProjection(200), true)
    const arcs = ops.filter((o) => o.kind === 'arc')
    expect(arcs[0].r).toBe(26) // halo
    expect(arcs[1].r).toBe(9) // core
  })

  it('氛围光晕透明度由 0.35 收敛为 0.16（多车叠加不再泛白成片）', () => {
    const { ops, ctx } = createCtxStub()
    drawSingleTraffic(ctx, makeProjection(60), true)
    const arcs = ops.filter((o) => o.kind === 'arc')
    expect(arcs[0].style).toBe('rgba(255, 235, 180, 0.16)')
    expect(arcs[1].style).toBe('#ffe08a')
  })

  it('白天（night=false）：无任何 arc 调用（车灯仅夜间绘制）', () => {
    const { ops, ctx } = createCtxStub()
    drawSingleTraffic(ctx, makeProjection(60), false)
    expect(ops.filter((o) => o.kind === 'arc')).toHaveLength(0)
    // 白天尾灯灯带仍在
    expect(ops.some((o) => o.style === 'rgba(255, 90, 80, 0.8)')).toBe(true)
  })
})
