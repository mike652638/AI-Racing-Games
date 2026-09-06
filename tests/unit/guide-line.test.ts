/**
 * M28 方案 10：导航辅助线纯函数单测。
 * 覆盖 drawGuideLine：strength<=0 零绘制（无任何 beginPath/stroke）、>0 时沿道路中心投影绘制、
 * 投影点数量与采样步长一致、不修改外部状态（纯函数）。
 */
import { describe, expect, test, vi } from 'vitest'
import { drawGuideLine, drawRouteFork, GUIDE_LINE_MAX_Z } from '../../src/engine/guide-line'
import type { ProjectionOptions } from '../../src/engine/projection'
import { project } from '../../src/engine/projection'
import { createStraightTrack } from '../helpers/track'
import { buildCurvePrefixSum, curveOffsetAtZ } from '../../src/engine/sprites'
import { createTrack, SEGMENT_LENGTH } from '../../src/engine/track'

const opts: ProjectionOptions = { width: 1280, height: 720, horizon: 260, depth: 100 }

function makeCtx() {
  const ops = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    set lineWidth(_v: number) {},
    set lineJoin(_v: string) {},
    set lineCap(_v: string) {},
    set strokeStyle(_v: string) {},
  }
  return ops
}

function makeTrack() {
  const track = createStraightTrack(60) // 60 段直道
  return { track, prefix: buildCurvePrefixSum(track) }
}

describe('M28 方案 10：drawGuideLine 导航辅助线', () => {
  test('strength=0 或负值：零绘制（不产生任何像素）', () => {
    const ctx = makeCtx()
    const { track, prefix } = makeTrack()
    drawGuideLine(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: 0 }, track, prefix, 0)
    drawGuideLine(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: 0 }, track, prefix, -1)
    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  test('strength>0：绘制引导线（beginPath/stroke 被调用）', () => {
    const ctx = makeCtx()
    const { track, prefix } = makeTrack()
    drawGuideLine(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: 0 }, track, prefix, 0.8)
    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
    // 采样点数量：GUIDE_LINE_MAX_Z / SAMPLE_STEP + 1 ≈ 60*200/120 + 1 ≈ 101
    expect(ctx.moveTo).toHaveBeenCalled()
  })

  test('投影点数量与采样步长一致（约 GUIDE_LINE_MAX_Z/120 段）', () => {
    const ctx = makeCtx()
    const { track, prefix } = makeTrack()
    drawGuideLine(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: 0 }, track, prefix, 0.5)
    // 每段独立 path（逐段 alpha 渐隐）：moveTo/lineTo 各调（采样点数-1）次 ≈ GUIDE_LINE_MAX_Z/120
    expect(ctx.moveTo.mock.calls.length).toBeGreaterThanOrEqual(20)
    expect(ctx.moveTo.mock.calls.length).toBeLessThanOrEqual(Math.ceil(GUIDE_LINE_MAX_Z / 120) + 1)
    expect(ctx.lineTo.mock.calls.length).toBe(ctx.moveTo.mock.calls.length)
    // 每段一次 stroke（渐隐 alpha 逐段变化）
    expect(ctx.stroke.mock.calls.length).toBe(ctx.moveTo.mock.calls.length)
  })

  test('直道引导线投影在屏幕中心附近（x≈width/2，无曲率偏移）', () => {
    const ctx = makeCtx()
    const { track, prefix } = makeTrack()
    drawGuideLine(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: 0 }, track, prefix, 0.8)
    // 直道 curve=0 → 投影 x = width/2（首采样点 moveTo）
    const firstMove = ctx.moveTo.mock.calls[0]
    expect(firstMove[0]).toBeCloseTo(640, 0)
  })

  test('空 track 安全不崩溃', () => {
    const ctx = makeCtx()
    drawGuideLine(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: 0 }, [], new Float64Array(0), 0.8)
    expect(ctx.beginPath).not.toHaveBeenCalled()
  })

  test('采样覆盖范围与 SEGMENT_LENGTH 对齐（相机中段从段起点开始采样）', () => {
    const ctx = makeCtx()
    const { track, prefix } = makeTrack()
    const camZ = SEGMENT_LENGTH * 5.5
    drawGuideLine(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: camZ }, track, prefix, 0.8)
    expect(ctx.stroke).toHaveBeenCalled()
  })
})

describe('M28 方案 9 深化：drawRouteFork 分叉渲染', () => {
  const makeFork = (over: Partial<Parameters<typeof drawRouteFork>[5]> = {}) =>
    ({
      active: true,
      leftName: '森林穿梭',
      rightName: '环岛巡回',
      leftOffset: -6,
      rightOffset: 6,
      ...over,
    }) as Parameters<typeof drawRouteFork>[5]

  test('routeFork.active 时绘制两条分支（路面+描边各 2 次 → stroke ≥2）', () => {
    const ctx = makeCtx()
    const { track, prefix } = makeTrack()
    drawRouteFork(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: 0 }, track, prefix, makeFork())
    // 每个分支：1 次路面 stroke + 1 次描边 stroke = 4 次
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.stroke.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  test('routeFork.active=false 或 undefined 时零绘制', () => {
    const ctx = makeCtx()
    const { track, prefix } = makeTrack()
    drawRouteFork(
      ctx as unknown as CanvasRenderingContext2D,
      opts,
      { x: 0, y: 0, z: 0 },
      track,
      prefix,
      makeFork({ active: false }),
    )
    drawRouteFork(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: 0 }, track, prefix, undefined)
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  test('forkAlpha=0 时零绘制（动画淡入前不出现）', () => {
    const ctx = makeCtx()
    const { track, prefix } = makeTrack()
    drawRouteFork(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: 0 }, track, prefix, makeFork(), 0)
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  test('空 track 安全不崩溃', () => {
    const ctx = makeCtx()
    drawRouteFork(
      ctx as unknown as CanvasRenderingContext2D,
      opts,
      { x: 0, y: 0, z: 0 },
      [],
      new Float64Array(0),
      makeFork(),
    )
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  test('直道回归：分叉首采样点对齐屏幕中心（curveOffsetAtZ=0，无多余偏移）', () => {
    const ctx = makeCtx()
    const { track, prefix } = makeTrack()
    drawRouteFork(ctx as unknown as CanvasRenderingContext2D, opts, { x: 0, y: 0, z: 0 }, track, prefix, makeFork())
    // 直道 curveOffsetAtZ(z)=0，首采样点（forkZ 处 progress=0）投影 x = width/2 = 640
    const firstX = ctx.moveTo.mock.calls[0][0] as number
    expect(firstX).toBeCloseTo(640, 0)
  })

  test('弯道对齐：分叉从道路中心线出发（不双重叠加 baseCenter，修复回归）', () => {
    const ctx = makeCtx()
    // 右弯恒定曲率：forkZ（z=1600）处中心线绝对偏移 baseCenter = 8 段 × 0.02 = 0.16
    const track = createTrack([{ curve: 0.02, count: 80 }])
    const prefix = buildCurvePrefixSum(track)
    const cam = { x: 0, y: 0, z: 0 }
    drawRouteFork(ctx as unknown as CanvasRenderingContext2D, opts, cam, track, prefix, makeFork())
    const forkZ = 8 * SEGMENT_LENGTH // camera.z=0 → forkZ = ROUTE_FORK_START_DELAY
    const baseCenter = curveOffsetAtZ(track, prefix, forkZ)
    expect(baseCenter).toBeGreaterThan(0) // 右弯：中心线偏移为正
    // 左分支先画：首 moveTo 即 samples[0]（forkZ 处 progress=0 → centerOffset = curveOffsetAtZ(forkZ)）
    const firstX = ctx.moveTo.mock.calls[0][0] as number
    const fixedX = project(opts, cam, { x: baseCenter, y: 0, z: forkZ })!.x
    const oldBugX = project(opts, cam, { x: baseCenter + baseCenter, y: 0, z: forkZ })!.x // 旧实现双倍叠加
    // 新语义：与中心线偏移投影一致（容差 1px）；旧语义多出 baseCenter 偏移（>1px 区分）
    expect(Math.abs(firstX - fixedX)).toBeLessThan(1)
    expect(Math.abs(firstX - oldBugX)).toBeGreaterThan(1)
  })
})
