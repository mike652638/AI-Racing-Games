/**
 * M23 方案 12：Game Feel 屏幕特效纯函数单测。
 * 覆盖 near-miss 脉冲线 / 完美氮气金闪 / 小喷蓝闪 / 漂移得分飘字绘制：
 * 触发态绘制（fill/stroke 被调用）、非触发态零绘制（无副作用）。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  drawCollisionWhiteFlash,
  drawDriftPopup,
  drawMiniTurboFlash,
  drawNearMissPulse,
  drawPerfectBoostFlash,
  drawSpeedLines,
} from '../../src/engine/screen-effects'
import type { ProjectionOptions } from '../../src/engine/projection'

const opts: ProjectionOptions = { width: 1280, height: 720, horizon: 260, depth: 100 }

function makeCtx() {
  // M29：用可读属性存储 setter（strokeStyle/scale 断言需要读回赋值）
  const styleState: { strokeStyle: string; fillStyle: string } = { strokeStyle: '', fillStyle: '' }
  const scaleCalls: number[][] = []
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn((x: number, y: number) => scaleCalls.push([x, y])),
    beginPath: vi.fn(),
    stroke: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    set fillStyle(v: string) {
      styleState.fillStyle = v
    },
    get fillStyle() {
      return styleState.fillStyle
    },
    set strokeStyle(v: string) {
      styleState.strokeStyle = v
    },
    get strokeStyle() {
      return styleState.strokeStyle
    },
    set lineWidth(_v: number) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
    // M29：暴露内部状态供断言（非 Canvas 接口，仅测试辅助）
    _style: styleState,
    _scaleCalls: scaleCalls,
  }
}

describe('M23 方案 12：near-miss 速度线脉冲', () => {
  it('pulse>0 时绘制（beginPath/stroke 被调用）', () => {
    const ctx = makeCtx()
    drawNearMissPulse(ctx as unknown as CanvasRenderingContext2D, opts, 0.8)
    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })
  it('pulse<=0 或 undefined 时不绘制', () => {
    const ctx = makeCtx()
    drawNearMissPulse(ctx as unknown as CanvasRenderingContext2D, opts, 0)
    drawNearMissPulse(ctx as unknown as CanvasRenderingContext2D, opts, undefined)
    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })
})

describe('M23 方案 12：完美氮气金闪 / 小喷蓝闪', () => {
  it('flash>0 时绘制（fillRect 被调用）', () => {
    const ctx = makeCtx()
    drawPerfectBoostFlash(ctx as unknown as CanvasRenderingContext2D, opts, 1)
    drawMiniTurboFlash(ctx as unknown as CanvasRenderingContext2D, opts, 1)
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
  })
  it('flash<=0 或 undefined 时不绘制', () => {
    const ctx = makeCtx()
    drawPerfectBoostFlash(ctx as unknown as CanvasRenderingContext2D, opts, 0)
    drawPerfectBoostFlash(ctx as unknown as CanvasRenderingContext2D, opts, undefined)
    drawMiniTurboFlash(ctx as unknown as CanvasRenderingContext2D, opts, 0)
    drawMiniTurboFlash(ctx as unknown as CanvasRenderingContext2D, opts, undefined)
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })
})

describe('M23 方案 12：漂移得分浮动飘字', () => {
  it('popup 未超期时绘制（strokeText/fillText 被调用）', () => {
    const ctx = makeCtx()
    drawDriftPopup(ctx as unknown as CanvasRenderingContext2D, opts, { t: 0.1, amount: 42 })
    expect(ctx.strokeText).toHaveBeenCalled()
    expect(ctx.fillText).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })
  it('popup 为空时不绘制', () => {
    const ctx = makeCtx()
    drawDriftPopup(ctx as unknown as CanvasRenderingContext2D, opts, undefined)
    expect(ctx.strokeText).not.toHaveBeenCalled()
    expect(ctx.fillText).not.toHaveBeenCalled()
  })
  it('popup 超期（t≥life）时零绘制（alpha 归零）', () => {
    const ctx = makeCtx()
    drawDriftPopup(ctx as unknown as CanvasRenderingContext2D, opts, { t: 0.7, amount: 5 })
    expect(ctx.strokeText).not.toHaveBeenCalled()
    expect(ctx.fillText).not.toHaveBeenCalled()
  })
})

describe('M29 方案 12 二次打磨：BOOST 速度线强化', () => {
  it('speedRatio≤0.7 不绘制（无论 boosting）', () => {
    const ctx = makeCtx()
    drawSpeedLines(ctx as unknown as CanvasRenderingContext2D, opts, 0.5, true)
    expect(ctx.stroke).not.toHaveBeenCalled()
  })
  it('非 BOOST：基础层 1 次 stroke（淡蓝白）', () => {
    const ctx = makeCtx()
    drawSpeedLines(ctx as unknown as CanvasRenderingContext2D, opts, 1, false)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
    // speedRatio=1 → t=1 → alpha = 1×0.6 = 0.6
    expect(ctx._style.strokeStyle).toBe(`rgba(190, 220, 255, ${0.6})`)
  })
  it('BOOST 激活：基础层 + 金色叠加层 = 2 次 stroke', () => {
    const ctx = makeCtx()
    drawSpeedLines(ctx as unknown as CanvasRenderingContext2D, opts, 0.9, true)
    expect(ctx.stroke).toHaveBeenCalledTimes(2)
  })
})

describe('M29 方案 12 二次打磨：飘字 combo 联动', () => {
  it('combo≥5 时放大（scale 含 1.35 系数：1.15×1.35≈1.55）', () => {
    const ctx = makeCtx()
    drawDriftPopup(ctx as unknown as CanvasRenderingContext2D, opts, { t: 0.1, amount: 42, combo: 6 })
    // scale(1.15 × 1.35) ≈ 1.5525（t=0.1/0.7=0.1429 → 1+0.1429*0.15=1.0214；1.0214*1.35≈1.379）
    const scaleCall = ctx._scaleCalls[0]
    expect(scaleCall[0]).toBeGreaterThan(1.35)
  })
  it('combo<5 保持旧行为（scale 无 1.35 系数）', () => {
    const ctx = makeCtx()
    drawDriftPopup(ctx as unknown as CanvasRenderingContext2D, opts, { t: 0.1, amount: 42, combo: 2 })
    const scaleCall = ctx._scaleCalls[0]
    expect(scaleCall[0]).toBeLessThan(1.1)
  })
})

describe('M31 方案 12 三次打磨：碰撞白色闪帧', () => {
  it('flash>0 时 fillRect 全屏白闪（alpha = flash²×0.18）', () => {
    const ctx = makeCtx()
    drawCollisionWhiteFlash(ctx as unknown as CanvasRenderingContext2D, opts, 1)
    expect(ctx.fillRect).toHaveBeenCalledTimes(1)
    // flash=1 → alpha = 1²×0.18 = 0.18
    expect(ctx._style.fillStyle).toBe(`rgba(255, 255, 255, ${0.18})`)
  })

  it('flash 衰减时 alpha 平方衰减（flash=0.5 → 0.045）', () => {
    const ctx = makeCtx()
    drawCollisionWhiteFlash(ctx as unknown as CanvasRenderingContext2D, opts, 0.5)
    expect(ctx._style.fillStyle).toBe(`rgba(255, 255, 255, ${0.045})`)
  })

  it('flash<=0 或 undefined 时零绘制', () => {
    const ctx = makeCtx()
    drawCollisionWhiteFlash(ctx as unknown as CanvasRenderingContext2D, opts, 0)
    drawCollisionWhiteFlash(ctx as unknown as CanvasRenderingContext2D, opts, undefined)
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })
})
