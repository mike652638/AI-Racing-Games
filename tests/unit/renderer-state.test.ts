import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Renderer, type RenderView } from '../../src/engine/renderer'
import { SEGMENT_LENGTH, createStraightTrack } from '../../src/engine/track'
import { createTrackFromDef, TRACK_DEFS } from '../../src/engine/tracks'
import { createTraffic } from '../../src/engine/traffic'
import {
  buildCurvePrefixSum,
  buildSpriteIndex,
  createRoadsideSprites,
} from '../../src/engine/sprites'
import {
  createMockCanvas,
  type MockCanvas,
  type MockCanvasCallCounts,
  type MockCanvasRenderingContext2D,
} from '../__mocks__/canvas'

/**
 * Renderer 构造/重建视口时会调用 document.createElement('canvas') 生成离屏山形缓存
 * （renderMountainOffscreen），node 测试环境没有 DOM，这里 stub 一个最小 document。
 */
function stubDocument(): void {
  vi.stubGlobal('document', {
    createElement: (): MockCanvas => createMockCanvas(),
  })
}

/** 构造真实赛道与 Renderer，返回画布引用供调用计数断言 */
function createHarness(width = 800, height = 600): { canvas: MockCanvas; renderer: Renderer } {
  const canvas = createMockCanvas(width, height)
  const renderer = new Renderer(canvas, createStraightTrack(10), width, height)
  return { canvas, renderer }
}

function callCount(calls: MockCanvasCallCounts, method: string): number {
  return calls[method] ?? 0
}

/** 参与"view 路径与默认路径等价"对比的绘制方法（排除 save/translate/rect/clip 等区域管理调用） */
const DRAW_METHODS = [
  'beginPath',
  'moveTo',
  'lineTo',
  'closePath',
  'fill',
  'fillRect',
  'arc',
  'drawImage',
] as const

/**
 * 提取绘制方法实参序列。drawImage 的第一参数是各自构造的离屏山形 canvas，
 * 跨实例不相等，统一替换为占位符后再比较。
 */
function drawingArgs(ctx: MockCanvasRenderingContext2D): Record<string, unknown[][]> {
  const out: Record<string, unknown[][]> = {}
  for (const method of DRAW_METHODS) {
    out[method] = (ctx.__args[method] ?? []).map((row) =>
      row.map((arg) =>
        typeof arg === 'object' && arg !== null && 'width' in arg && 'height' in arg
          ? '<canvas>'
          : arg,
      ),
    )
  }
  return out
}

describe('Renderer 状态切换', () => {
  beforeEach(() => {
    stubDocument()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('构造后渲染不抛错且产生绘制输出', () => {
    const { canvas, renderer } = createHarness()
    renderer.render(0)
    expect(callCount(canvas.__ctx.__calls, 'fill')).toBeGreaterThan(0)
    expect(callCount(canvas.__ctx.__calls, 'fillRect')).toBeGreaterThan(0)
    expect(callCount(canvas.__ctx.__calls, 'drawImage')).toBeGreaterThan(0)
    expect(callCount(canvas.__ctx.__calls, 'setTransform')).toBeGreaterThan(0)
  })

  it('同一参数重复渲染输出稳定（每帧绘制次数恒定）', () => {
    const { canvas, renderer } = createHarness()
    renderer.render(1000)
    const first = callCount(canvas.__ctx.__calls, 'fill')
    renderer.render(1000)
    const second = callCount(canvas.__ctx.__calls, 'fill')
    // 两次渲染新增的 fill 次数应完全一致（确定性渲染）
    expect(second - first).toBe(first)
  })

  it('setTrack 切换赛道后渲染不抛错且继续绘制', () => {
    const { canvas, renderer } = createHarness()
    renderer.setTrack(createStraightTrack(20), [])
    renderer.render(0)
    expect(callCount(canvas.__ctx.__calls, 'fill')).toBeGreaterThan(0)
  })

  it('setTrack 支持切换为真实赛道定义', () => {
    const { canvas, renderer } = createHarness()
    renderer.setTrack(createTrackFromDef(TRACK_DEFS[1]), [])
    renderer.render(0)
    expect(callCount(canvas.__ctx.__calls, 'fill')).toBeGreaterThan(0)
  })

  it('setViewport 更新画布物理尺寸并按新视口渲染', () => {
    const { canvas, renderer } = createHarness()
    renderer.setViewport(canvas, 400, 300)
    expect(canvas.width).toBe(400)
    expect(canvas.height).toBe(300)
    renderer.render(0)
    expect(callCount(canvas.__ctx.__calls, 'fillRect')).toBeGreaterThan(0)
  })

  it('setTraffic 切换车流后渲染不抛错且车流参与绘制', () => {
    const { canvas, renderer } = createHarness()
    // 先无车流渲染一帧，记录基准
    renderer.render(0)
    const noTraffic = callCount(canvas.__ctx.__calls, 'fillRect')
    // 接入真实车流后再渲染：车身+车窗每辆 2 个矩形，fillRect 计数应增加
    renderer.setTraffic(createTraffic(2000))
    renderer.render(0)
    expect(callCount(canvas.__ctx.__calls, 'fillRect')).toBeGreaterThan(noTraffic)
  })

  it('renderRegion 走裁剪平移路径：save/translate/rect/clip/restore 均被调用', () => {
    const { canvas, renderer } = createHarness()
    renderer.renderRegion(0, 0, 400)
    const calls = canvas.__ctx.__calls
    expect(callCount(calls, 'save')).toBeGreaterThan(0)
    expect(callCount(calls, 'translate')).toBeGreaterThan(0)
    expect(callCount(calls, 'rect')).toBeGreaterThan(0)
    expect(callCount(calls, 'clip')).toBeGreaterThan(0)
    expect(callCount(calls, 'restore')).toBeGreaterThan(0)
    expect(callCount(calls, 'fill')).toBeGreaterThan(0)
  })

  it('setCameraX 更新相机横向偏移后渲染不抛错', () => {
    const { renderer } = createHarness()
    renderer.setCameraX(0.5)
    renderer.render(0)
  })

  it('renderRegion 使用整数像素对齐的裁剪区域（奇数宽触发 640.5）', () => {
    // 1281 奇数宽：w/2 = 640.5 非整数，未对齐前 rect/translate 落在像素网格之间，
    // 交界处出现 1px 级重叠/缝隙（近处路缘石斜边交错）
    const { canvas, renderer } = createHarness(1281, 720)
    renderer.renderRegion(0, 640.5, 640.5, [], 0)
    const args = canvas.__ctx.__args
    const lastRect = args.rect[args.rect.length - 1]
    // rect(0, 0, ow, height)：x=0 恒为整数，w 必须取整
    expect(Number.isInteger(lastRect[0])).toBe(true)
    expect(Number.isInteger(lastRect[2])).toBe(true)
    const lastTranslate = args.translate[args.translate.length - 1]
    // translate(ox, 0)：x 必须取整，否则裁剪区域偏移到半像素
    expect(Number.isInteger(lastTranslate[0])).toBe(true)
  })

  it('drawDivider 绘制全高深色竖线', () => {
    const { canvas, renderer } = createHarness(800, 600)
    renderer.drawDivider(400)
    const fillRectArgs = canvas.__ctx.__args.fillRect
    const last = fillRectArgs[fillRectArgs.length - 1]
    // fillRect(Math.round(x - width/2), 0, width, height)：居中 2px 全高竖线
    expect(last[0]).toBe(399)
    expect(last[1]).toBe(0)
    expect(last[2]).toBe(2)
    expect(last[3]).toBe(600)
    expect(canvas.__ctx.fillStyle).toBe('#000')
  })

  it('renderRegion 用自定义 RenderView 渲染不同赛道（s-curve）不抛错且产生绘制', () => {
    const { canvas, renderer } = createHarness()
    const trackB = createTrackFromDef(TRACK_DEFS[2]) // s-curve
    const viewB: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
      traffic: [],
    }
    expect(() => renderer.renderRegion(0, 0, 400, [], 0, viewB)).not.toThrow()
    expect(callCount(canvas.__ctx.__calls, 'fill')).toBeGreaterThan(0)
    expect(callCount(canvas.__ctx.__calls, 'fillRect')).toBeGreaterThan(0)
  })

  it('render 接受自定义 RenderView 参数并按视图渲染', () => {
    const { canvas, renderer } = createHarness()
    const trackB = createTrackFromDef(TRACK_DEFS[2])
    const viewB: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
      traffic: [],
    }
    expect(() => renderer.render(0, [], 0, viewB)).not.toThrow()
    expect(callCount(canvas.__ctx.__calls, 'fill')).toBeGreaterThan(0)
  })

  it('带 view 的 renderRegion 与 setTrack 后默认路径的绘制调用序列一致', () => {
    // 默认路径：renderer 持有 trackB（setTrack 切换），render(0) 用 this 字段渲染
    const canvasA = createMockCanvas(800, 600)
    const rendererA = new Renderer(canvasA, createStraightTrack(10), 800, 600)
    const trackB = createTrackFromDef(TRACK_DEFS[2])
    const spritesB = createRoadsideSprites(trackB)
    rendererA.setTrack(trackB, spritesB)
    rendererA.render(0)

    // view 路径：renderer 构造时仍为直道，renderRegion 传入 viewB（trackB 全套数据）
    const canvasB = createMockCanvas(800, 600)
    const rendererB = new Renderer(canvasB, createStraightTrack(10), 800, 600)
    const viewB: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(spritesB, SEGMENT_LENGTH),
      traffic: [],
    }
    rendererB.renderRegion(0, 0, 800, [], 0, viewB)

    // renderRegion 的裁剪路径在绘制开始前多一次 ctx.beginPath()（save→translate→beginPath→rect→clip），
    // 属区域管理调用而非 view 数据差异，去掉后其余绘制序列必须与默认路径完全一致
    const actual = drawingArgs(canvasB.__ctx)
    actual.beginPath = actual.beginPath.slice(1)
    expect(actual).toEqual(drawingArgs(canvasA.__ctx))
  })
})
