import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  drawPlayerCar,
  laneOffsetToPx,
  PLAYER_CAR_HEIGHT_RATIO,
  PLATE_COLOR,
  TAILLIGHT_COLOR,
  WINDOW_SHINE,
  WING_COLOR,
} from '../../src/engine/player-car'
import { Renderer } from '../../src/engine/renderer'
import { createMockCanvas, type MockCanvas } from '../__mocks__/canvas'
import { createStraightTrack } from '../helpers/track'

/** 与 Renderer.buildOpts 同参：horizon = height*0.35, depth = width*0.84 */
const opts = { width: 800, height: 600, horizon: 210, depth: 672 }
/** 车身像素尺寸（与 drawPlayerCar 内部推导一致：carH = height × 0.17、carW = carH × 0.82） */
const carH = 600 * PLAYER_CAR_HEIGHT_RATIO
const carW = carH * 0.82

/**
 * 查找与给定参数匹配的 fillRect 记录（x/y/w/h 容差 1e-6、颜色精确比较）。
 * mock 的 fillRect 记录为 5 元组 [x, y, w, h, fillStyle]（见 tests/__mocks__/canvas.ts）。
 */
function findRect(
  canvas: MockCanvas,
  match: { x?: number; y?: number; w?: number; h?: number; fillStyle?: string },
): unknown[] | undefined {
  return (canvas.__ctx.__args.fillRect ?? []).find((a) => {
    if (match.x !== undefined && Math.abs((a[0] as number) - match.x) > 1e-6) return false
    if (match.y !== undefined && Math.abs((a[1] as number) - match.y) > 1e-6) return false
    if (match.w !== undefined && Math.abs((a[2] as number) - match.w) > 1e-6) return false
    if (match.h !== undefined && Math.abs((a[3] as number) - match.h) > 1e-6) return false
    if (match.fillStyle !== undefined && a[4] !== match.fillStyle) return false
    return true
  })
}

describe('drawPlayerCar 玩家车辆精灵（P0）', () => {
  test('绘制玩家车产生 fillRect 绘制调用（车身/车窗/车轮）', () => {
    const canvas = createMockCanvas(800, 600)
    drawPlayerCar(canvas.__ctx, opts)
    expect(canvas.__ctx.__calls.fillRect ?? 0).toBeGreaterThan(0)
  })

  test('车身尺寸约占屏幕高度 15-20% 且位于底部中央偏下', () => {
    // 尺寸比例常量落在任务区间（15-20%）
    expect(PLAYER_CAR_HEIGHT_RATIO).toBeGreaterThanOrEqual(0.15)
    expect(PLAYER_CAR_HEIGHT_RATIO).toBeLessThanOrEqual(0.2)
    const canvas = createMockCanvas(800, 600)
    drawPlayerCar(canvas.__ctx, opts)
    // 车身底盘矩形：宽 = carW、高 = carH，车底距屏幕底部仅 5% 空隙（底部中央偏下）
    const body = (canvas.__ctx.__args.fillRect ?? []).find(
      (a) => Math.abs((a[2] as number) - carW) < 1e-6 && Math.abs((a[3] as number) - carH) < 1e-6,
    )
    expect(body).toBeDefined()
    const y = body![1] as number
    expect(y + carH).toBeLessThanOrEqual(600)
    expect(y).toBeGreaterThan(600 * 0.6) // 车顶位于屏幕下半部（不遮挡地平线以上）
  })

  test('转向时调用 save/rotate/restore 且 rotate 角度非零（±5° 内）', () => {
    const canvas = createMockCanvas(800, 600)
    drawPlayerCar(canvas.__ctx, opts, { laneOffset: 0.8, steer: 0.8 })
    expect(canvas.__ctx.__calls.save ?? 0).toBeGreaterThan(0)
    expect(canvas.__ctx.__calls.rotate ?? 0).toBeGreaterThan(0)
    expect(canvas.__ctx.__calls.restore ?? 0).toBeGreaterThan(0)
    const maxAngle = (5 * Math.PI) / 180
    const angles = (canvas.__ctx.__args.rotate ?? []).map((a) => a[0] as number)
    expect(Math.abs(angles[0])).toBeGreaterThan(0)
    expect(Math.abs(angles[0])).toBeLessThanOrEqual(maxAngle)
  })

  test('无转向输入（laneOffset=0）时 rotate 角度为 0（车身不倾斜）', () => {
    const canvas = createMockCanvas(800, 600)
    drawPlayerCar(canvas.__ctx, opts)
    const angles = (canvas.__ctx.__args.rotate ?? []).map((a) => a[0] as number)
    expect(angles).toHaveLength(1)
    expect(angles[0]).toBe(0)
  })

  test('横向偏移随 laneOffset 平移（右为正）', () => {
    const centerCanvas = createMockCanvas(800, 600)
    drawPlayerCar(centerCanvas.__ctx, opts)
    const rightCanvas = createMockCanvas(800, 600)
    drawPlayerCar(rightCanvas.__ctx, opts, { laneOffset: 0.8 })
    const bodyX = (canvas: MockCanvas): number =>
      (canvas.__ctx.__args.fillRect ?? []).find(
        (a) => Math.abs((a[2] as number) - carW) < 1e-6 && Math.abs((a[3] as number) - carH) < 1e-6,
      )![0] as number
    expect(bodyX(rightCanvas)).toBeGreaterThan(bodyX(centerCanvas))
  })

  test('夜间模式绘制车头灯（arc 增量 + 光柱 fill）', () => {
    const dayCanvas = createMockCanvas(800, 600)
    drawPlayerCar(dayCanvas.__ctx, opts)
    const nightCanvas = createMockCanvas(800, 600)
    drawPlayerCar(nightCanvas.__ctx, opts, { night: true })
    // 双灯（外层光晕 + 核心）共 4 次 arc；day 模式零 arc
    expect(nightCanvas.__ctx.__calls.arc ?? 0).toBeGreaterThan(dayCanvas.__ctx.__calls.arc ?? 0)
    // 光柱梯形需要 beginPath/moveTo/lineTo/closePath/fill（绘制调用增量）
    expect(nightCanvas.__ctx.__calls.beginPath ?? 0).toBeGreaterThan(dayCanvas.__ctx.__calls.beginPath ?? 0)
  })

  test('BOOST 激活时绘制车尾尾焰（arc 增量）', () => {
    const normalCanvas = createMockCanvas(800, 600)
    drawPlayerCar(normalCanvas.__ctx, opts)
    const boostCanvas = createMockCanvas(800, 600)
    drawPlayerCar(boostCanvas.__ctx, opts, { boosting: true })
    expect(boostCanvas.__ctx.__calls.arc ?? 0).toBeGreaterThan(normalCanvas.__ctx.__calls.arc ?? 0)
  })

  test('修复：BOOST 尾焰在 save/rotate 变换内绘制（随车身 steer 倾斜，非绝对坐标）', () => {
    const canvas = createMockCanvas(800, 600)
    // 仅 boosting（无 night）：唯一 arc 即尾焰；带 steer 倾斜
    drawPlayerCar(canvas.__ctx, opts, { boosting: true, steer: 0.8 })
    const order = canvas.__ctx.__order
    const saveIdx = order.indexOf('save')
    const restoreIdx = order.indexOf('restore')
    const arcIdxs = order.map((m, i) => (m === 'arc' ? i : -1)).filter((i) => i >= 0)
    expect(saveIdx).toBeGreaterThanOrEqual(0)
    expect(restoreIdx).toBeGreaterThan(saveIdx)
    // 尾焰 arc 位于 save 与 restore 之间（变换生效），且 rotate 已先应用
    expect(arcIdxs).toHaveLength(1)
    expect(arcIdxs[0]).toBeGreaterThan(saveIdx)
    expect(arcIdxs[0]).toBeLessThan(restoreIdx)
    expect(order.indexOf('rotate')).toBeLessThan(arcIdxs[0])
  })

  test('尾翼/支柱/反光/尾灯/车牌 fillRect 颜色与位置（P2 细节）', () => {
    const canvas = createMockCanvas(800, 600)
    drawPlayerCar(canvas.__ctx, opts)
    // laneOffset=0 居中：cx = 800/2 = 400；底部空隙 5%：bottomY = 600 - 30 = 570
    const cx = 400
    const bottomY = 570
    // 尾翼：车顶后端深色横条，横跨 cx±carW*0.62
    const wingTop = bottomY - carH * 0.98
    expect(
      findRect(canvas, { x: cx - carW * 0.62, y: wingTop, w: carW * 1.24, h: carH * 0.06, fillStyle: WING_COLOR }),
    ).toBeDefined()
    // 尾翼支柱：左右各一（宽 carW*0.04、高 carH*0.04，自尾翼下缘向下延伸；右条 x 减去自身宽）
    expect(
      findRect(canvas, {
        x: cx - carW * 0.42,
        y: wingTop + carH * 0.06,
        w: carW * 0.04,
        h: carH * 0.04,
        fillStyle: WING_COLOR,
      }),
    ).toBeDefined()
    expect(
      findRect(canvas, {
        x: cx + carW * 0.42 - carW * 0.04,
        y: wingTop + carH * 0.06,
        w: carW * 0.04,
        h: carH * 0.04,
        fillStyle: WING_COLOR,
      }),
    ).toBeDefined()
    // 前挡风反光：车窗（winW×winH）上部 30% 浅色横条
    const winW = carW * 0.5
    const winH = carH * 0.2
    expect(
      findRect(canvas, { x: cx - winW / 2, y: bottomY - carH * 0.62, w: winW, h: winH * 0.3, fillStyle: WINDOW_SHINE }),
    ).toBeDefined()
    // 尾灯条：车尾下缘两侧（右条 x = cx + carW*0.35 - carW*0.16，与车轮写法一致）
    expect(
      findRect(canvas, {
        x: cx - carW * 0.35,
        y: bottomY - carH * 0.1,
        w: carW * 0.16,
        h: carH * 0.045,
        fillStyle: TAILLIGHT_COLOR,
      }),
    ).toBeDefined()
    expect(
      findRect(canvas, {
        x: cx + carW * 0.35 - carW * 0.16,
        y: bottomY - carH * 0.1,
        w: carW * 0.16,
        h: carH * 0.045,
        fillStyle: TAILLIGHT_COLOR,
      }),
    ).toBeDefined()
    // 车牌：车底中央浅色小矩形
    expect(
      findRect(canvas, {
        x: cx - carW * 0.1,
        y: bottomY - carH * 0.03,
        w: carW * 0.2,
        h: carH * 0.045,
        fillStyle: PLATE_COLOR,
      }),
    ).toBeDefined()
  })

  test('day 模式也绘制尾灯条（白天细节，非夜间专属）', () => {
    const canvas = createMockCanvas(800, 600)
    drawPlayerCar(canvas.__ctx, opts)
    const taillights = (canvas.__ctx.__args.fillRect ?? []).filter((a) => a[4] === TAILLIGHT_COLOR)
    expect(taillights).toHaveLength(2)
  })

  test('night 模式：夜间光柱/双灯与细节共存（arc 与 fillRect 计数）', () => {
    const dayCanvas = createMockCanvas(800, 600)
    drawPlayerCar(dayCanvas.__ctx, opts)
    const nightCanvas = createMockCanvas(800, 600)
    drawPlayerCar(nightCanvas.__ctx, opts, { night: true })
    // 双灯（外层光晕 + 核心）共 4 次 arc 增量；day 模式零 arc
    expect(nightCanvas.__ctx.__calls.arc ?? 0).toBe((dayCanvas.__ctx.__calls.arc ?? 0) + 4)
    // 光柱梯形 fill 增量（day 模式零 fill）
    expect(nightCanvas.__ctx.__calls.fill ?? 0).toBeGreaterThan(dayCanvas.__ctx.__calls.fill ?? 0)
    // 细节 fillRect 与夜间模式无关：day/night 数量相等（尾翼/反光/尾灯/车牌两种模式均绘制，光柱走 fill 不走 fillRect）
    expect(nightCanvas.__ctx.__calls.fillRect ?? 0).toBe(dayCanvas.__ctx.__calls.fillRect ?? 0)
    expect((nightCanvas.__ctx.__args.fillRect ?? []).filter((a) => a[4] === TAILLIGHT_COLOR)).toHaveLength(2)
  })

  test('laneOffsetToPx：居中为 0、偏移同号、clamp 在画面内', () => {
    expect(laneOffsetToPx(0, opts, carW)).toBe(0)
    expect(laneOffsetToPx(0.5, opts, carW)).toBeGreaterThan(0)
    expect(laneOffsetToPx(-0.5, opts, carW)).toBeLessThan(0)
    const maxShift = opts.width / 2 - carW / 2 - 4
    expect(laneOffsetToPx(10, opts, carW)).toBeLessThanOrEqual(maxShift)
    expect(laneOffsetToPx(-10, opts, carW)).toBeGreaterThanOrEqual(-maxShift)
  })

  test('M18 碰撞边框闪白：flash=0（缺省）不绘制描边（零 rect/stroke）', () => {
    const canvas = createMockCanvas(800, 600)
    drawPlayerCar(canvas.__ctx, opts)
    drawPlayerCar(canvas.__ctx, opts, { flash: 0 })
    expect(canvas.__ctx.__calls.stroke ?? 0).toBe(0)
    // 车身路径 rect 也零调用（flash=0 无任何描边路径）
    expect(canvas.__ctx.__args.rect ?? []).toHaveLength(0)
  })

  test('M18 碰撞边框闪白：flash>0 时车身外描边（rect+stroke、白→红插值色、3px 线宽）', () => {
    const canvas = createMockCanvas(800, 600)
    drawPlayerCar(canvas.__ctx, opts, { flash: 0.8 })
    // 描边路径：一次 rect（车身矩形）+ 一次 stroke
    expect(canvas.__ctx.__calls.stroke ?? 0).toBe(1)
    const rectArgs = (canvas.__ctx.__args.rect ?? []).find(
      (a) => Math.abs((a[2] as number) - carW) < 1e-6 && Math.abs((a[3] as number) - carH) < 1e-6,
    )
    expect(rectArgs).toBeDefined()
    expect(canvas.__ctx.lineWidth).toBe(3)
    // 白(255,255,255) → 红(255,80,60) 插值 80%：g = 255-175×0.8 = 115、b = 255-195×0.8 = 99
    expect(canvas.__ctx.strokeStyle).toBe('rgba(255, 115, 99, 0.800)')
  })

  test('M18 碰撞边框闪白：flash=1 满强度为红色端点、flash 随强度衰减可关闭', () => {
    const canvas = createMockCanvas(800, 600)
    drawPlayerCar(canvas.__ctx, opts, { flash: 1 })
    expect(canvas.__ctx.__calls.stroke ?? 0).toBe(1)
    expect(canvas.__ctx.strokeStyle).toBe('rgba(255, 80, 60, 1.000)')
  })

  test('M18 环境车灯配色：headlightColor 覆盖夜间核心灯色（缺省默认黄白）', () => {
    // mock 的 fill 不记录颜色快照，测试内补丁捕获 fill 时刻的 fillStyle
    const drawWith = (extra: { night: boolean; headlightColor?: string }): string[] => {
      const canvas = createMockCanvas(800, 600)
      const ctx = canvas.__ctx
      const styles: string[] = []
      const orig = (ctx as unknown as { fill: (...a: unknown[]) => void }).fill
      ;(ctx as unknown as { fill: (...a: unknown[]) => void }).fill = (...a: unknown[]) => {
        styles.push(String(ctx.fillStyle))
        orig(...a)
      }
      drawPlayerCar(ctx, opts, extra)
      return styles
    }
    const defaultStyles = drawWith({ night: true })
    const canyonStyles = drawWith({ night: true, headlightColor: '#ff8a5c' })
    // 缺省：核心灯色为默认黄白（HEADLIGHT_CORE = #fff0c0，C3 更白更冷一档）
    expect(defaultStyles).toContain('#fff0c0')
    // 传入环境色时覆盖核心灯色
    expect(canyonStyles).toContain('#ff8a5c')
    expect(defaultStyles).not.toContain('#ff8a5c')
  })
})

describe('Renderer 集成（P0：玩家车参与渲染管线）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** node 测试环境无 DOM：stub 最小 document（renderMountainOffscreen/buildRainCanvas 用 createElement） */
  function createRenderer(canvas: MockCanvas): Renderer {
    vi.stubGlobal('document', { createElement: (): MockCanvas => createMockCanvas() })
    return new Renderer(canvas, createStraightTrack(10), 800, 600)
  }

  test('渲染一帧默认包含玩家车；skipPlayerCar 时玩家车绘制消失（非玩家车场景）', () => {
    const canvas = createMockCanvas(800, 600)
    const renderer = createRenderer(canvas)
    // 逐帧记录 fillRect 序列（__args 为累计记录，须按索引切片取帧内增量）
    renderer.render(0)
    const baseLen = (canvas.__ctx.__args.fillRect ?? []).length
    renderer.render(0)
    const withFrame = (canvas.__ctx.__args.fillRect ?? []).slice(baseLen)
    renderer.render(0, [], 0, undefined, { skipPlayerCar: true })
    const withoutFrame = (canvas.__ctx.__args.fillRect ?? []).slice(baseLen + withFrame.length)
    const hasBody = (frame: unknown[][]): boolean =>
      frame.some((a) => Math.abs((a[2] as number) - carW) < 1e-6 && Math.abs((a[3] as number) - carH) < 1e-6)
    // 默认帧出现车身尺寸矩形；skipPlayerCar 帧不出现（非玩家车场景零玩家车绘制）
    expect(hasBody(withFrame)).toBe(true)
    expect(hasBody(withoutFrame)).toBe(false)
  })
})
