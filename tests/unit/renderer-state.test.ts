import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest'
import { Renderer, type BoostParticle, type RenderView } from '../../src/engine/renderer'
import { SEGMENT_LENGTH, trackIndexForCameraZ } from '../../src/engine/track'
import { createStraightTrack } from '../helpers/track'
import { createTrackFromDef, TRACK_DEFS } from '../../src/engine/tracks'
import { createTraffic, type TrafficCar } from '../../src/engine/traffic'
import { buildRoadStrips } from '../../src/engine/road-strip'
import {
  buildCurvePrefixSum,
  buildSpriteIndex,
  createRoadsideSprites,
  curveOffsetAtZ,
  type Sprite,
} from '../../src/engine/sprites'
import { project } from '../../src/engine/projection'
import { TRAFFIC_COLORS } from '../../src/engine/traffic-render'
import type { SmokeParticle } from '../../src/physics/drift'
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

/** node 测试环境无 OffscreenCanvas，提供最小 mock（renderRoadStripToCanvas 内部 new OffscreenCanvas） */
class MockOffscreenCanvas {
  width: number
  height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  getContext() {
    return {
      fillStyle: '',
      fillRect: vi.fn(),
    }
  }
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
const DRAW_METHODS = ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'fillRect', 'arc', 'drawImage'] as const

/**
 * 提取绘制方法实参序列。drawImage 的第一参数是各自构造的离屏山形 canvas，
 * 跨实例不相等，统一替换为占位符后再比较。
 */
function drawingArgs(ctx: MockCanvasRenderingContext2D): Record<string, unknown[][]> {
  const out: Record<string, unknown[][]> = {}
  for (const method of DRAW_METHODS) {
    out[method] = (ctx.__args[method] ?? []).map((row) =>
      row.map((arg) =>
        typeof arg === 'object' && arg !== null && 'width' in arg && 'height' in arg ? '<canvas>' : arg,
      ),
    )
  }
  return out
}

describe('Renderer 状态切换', () => {
  beforeEach(() => {
    stubDocument()
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas)
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
    const regionTranslate = args.translate[0]
    // translate(ox, 0)：x 必须取整，否则裁剪区域偏移到半像素。
    // 取序列首项：renderRegion 的区域平移恒为第一次 translate（renderWithOpts 内
    // 玩家车精灵的 save/translate/rotate 在其后，P0 起序列不再只有一项）
    expect(Number.isInteger(regionTranslate[0])).toBe(true)
  })

  it('drawDivider 绘制全高 6px 深色渐变分隔线（P3：左右边缘柔化；C5：4→6px 加宽）', () => {
    const { canvas, renderer } = createHarness(800, 600)
    renderer.drawDivider(400)
    const fillRectArgs = canvas.__ctx.__args.fillRect
    const last = fillRectArgs[fillRectArgs.length - 1]
    // fillRect(Math.round(x - width/2), 0, width, height)：居中 6px 全高竖线（P3：加宽 + 渐变）
    expect(last[0]).toBe(397)
    expect(last[1]).toBe(0)
    expect(last[2]).toBe(6)
    expect(last[3]).toBe(600)
    // fillStyle 为 createLinearGradient 渐变对象，且 addColorStop 调用了 3 次（透明→深色→透明）
    expect(canvas.__ctx.__calls.createLinearGradient ?? 0).toBeGreaterThan(0)
    expect(canvas.__ctx.__calls.addColorStop ?? 0).toBeGreaterThanOrEqual(3)
    expect(canvas.__ctx.fillStyle).not.toBe('rgba(255, 255, 255, 0.4)')
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

  it('雨天（timeSec=90，phase 2 雨）渲染：雨丝预渲染离屏后主 ctx 帧内零 stroke', () => {
    const { canvas, renderer } = createHarness()
    renderer.render(0, [], 0)
    const clearStroke = callCount(canvas.__ctx.__calls, 'stroke')
    renderer.render(0, [], 90)
    const rainStroke = callCount(canvas.__ctx.__calls, 'stroke')
    // F5：雨丝在构建期预绘制到离屏 canvas（独立 mock ctx），主 ctx 帧内不再逐段 stroke
    expect(rainStroke).toBe(clearStroke)
  })

  it('雨天渲染：雨滴离屏双幅 drawImage 平铺（drawImage 增量高于晴天）', () => {
    const { canvas, renderer } = createHarness()
    renderer.render(0, [], 0)
    const before = callCount(canvas.__ctx.__calls, 'drawImage')
    renderer.render(0, [], 90)
    const afterRain = callCount(canvas.__ctx.__calls, 'drawImage')
    renderer.render(0, [], 0)
    const afterClear = callCount(canvas.__ctx.__calls, 'drawImage')
    const rainIncr = afterRain - before
    const clearIncr = afterClear - afterRain
    // 雨天比晴天多 2 次 drawImage（双幅平铺覆盖环形回绕）；远山平铺两态一致
    expect(rainIncr).toBeGreaterThan(clearIncr)
  })

  it('setViewport 后雨滴离屏 canvas 尺寸重建（宽 = 视口宽、高 = 视口高 + 20）', () => {
    const { canvas, renderer } = createHarness(800, 600)
    // setViewport 会重建离屏 canvas（buildRainCanvas 替换引用），须每次重新读取
    const getRainCanvas = (): MockCanvas => (renderer as unknown as { rainCanvas: MockCanvas }).rainCanvas
    expect(getRainCanvas().width).toBe(800)
    expect(getRainCanvas().height).toBe(620)
    renderer.setViewport(canvas, 400, 300)
    expect(getRainCanvas().width).toBe(400)
    expect(getRainCanvas().height).toBe(320)
  })

  it('night RenderView 渲染车灯光晕：不抛错且 arc 调用增量增加', () => {
    const { canvas, renderer } = createHarness()
    const trackB = createTrackFromDef(TRACK_DEFS[4]) // canyon（夜晚赛道）
    const traffic = createTraffic(2000)
    const baseView: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
      traffic,
    }
    const nightView: RenderView = { ...baseView, night: true }
    // 预热一帧后，分别统计 day / night 渲染各自新增的 arc 次数（callCount 为累计值，须取增量）
    renderer.render(0, [], 0, baseView)
    const beforeNight = callCount(canvas.__ctx.__calls, 'arc')
    expect(() => renderer.render(0, [], 0, nightView)).not.toThrow()
    const afterNight = callCount(canvas.__ctx.__calls, 'arc')
    renderer.render(0, [], 0, baseView)
    const afterBase = callCount(canvas.__ctx.__calls, 'arc')
    const nightIncrement = afterNight - beforeNight
    const baseIncrement = afterBase - afterNight
    // 同一场景下 night 多出车灯（每辆可见车 2 次 arc：外层光晕 + 核心），增量应高于 day
    expect(nightIncrement).toBeGreaterThan(baseIncrement)
  })

  it('night 渲染车尾灯：fillRect 增量高于 day（每辆可见车 4 次红色尾灯：光晕+核心双灯）', () => {
    const { canvas, renderer } = createHarness()
    const trackB = createTrackFromDef(TRACK_DEFS[4]) // canyon（夜晚赛道）
    const traffic = createTraffic(2000)
    const baseView: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
      traffic,
    }
    const nightView: RenderView = { ...baseView, night: true }
    // 预热一帧后，分别统计 day / night 渲染各自新增的 fillRect 次数（callCount 为累计值，须取增量）
    renderer.render(0, [], 0, baseView)
    const beforeNight = callCount(canvas.__ctx.__calls, 'fillRect')
    renderer.render(0, [], 0, nightView)
    const afterNight = callCount(canvas.__ctx.__calls, 'fillRect')
    renderer.render(0, [], 0, baseView)
    const afterBase = callCount(canvas.__ctx.__calls, 'fillRect')
    const nightIncrement = afterNight - beforeNight
    const baseIncrement = afterBase - afterNight
    // 同一场景下 night 每辆可见车多 4 次 fillRect（红色尾灯光晕+核心双灯），增量应高于 day
    expect(nightIncrement).toBeGreaterThan(baseIncrement)
  })

  it('boost 粒子渲染：带 boostParticles 的 view arc 增量高于无粒子', () => {
    const { canvas, renderer } = createHarness()
    const trackB = createTrackFromDef(TRACK_DEFS[0]) // classic
    const baseView: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
      traffic: [],
    }
    const boostView: RenderView = {
      ...baseView,
      boostParticles: [
        { x: 0.5, z: 500, t: 0 },
        { x: 0.3, z: 700, t: 0.3 },
      ],
    }
    // 预热一帧后，分别统计无粒子 / 带粒子渲染各自新增的 arc 次数（callCount 为累计值，须取增量）
    renderer.render(0, [], 0, baseView)
    const before = callCount(canvas.__ctx.__calls, 'arc')
    renderer.render(0, [], 0, boostView)
    const afterBoost = callCount(canvas.__ctx.__calls, 'arc')
    renderer.render(0, [], 0, baseView)
    const afterBase = callCount(canvas.__ctx.__calls, 'arc')
    const boostIncr = afterBoost - before
    const baseIncr = afterBase - afterBoost
    // 每粒可见粒子 1 次 arc（橙色尾焰圆），带粒子渲染增量应高于无粒子
    expect(boostIncr).toBeGreaterThan(baseIncr)
  })

  it('M8 速度线：speedRatio=1 时 stroke 增量高于低速（0.7 阈值以下不绘制）', () => {
    const { canvas, renderer } = createHarness()
    const trackB = createTrackFromDef(TRACK_DEFS[0])
    const baseView: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
      traffic: [],
      speedRatio: 0.5,
    }
    const fastView: RenderView = { ...baseView, speedRatio: 1 }
    renderer.render(0, [], 0, baseView)
    const before = callCount(canvas.__ctx.__calls, 'stroke')
    renderer.render(0, [], 0, fastView)
    const afterFast = callCount(canvas.__ctx.__calls, 'stroke')
    renderer.render(0, [], 0, baseView)
    const afterBase = callCount(canvas.__ctx.__calls, 'stroke')
    const fastIncr = afterFast - before
    const baseIncr = afterBase - afterFast
    expect(fastIncr).toBeGreaterThan(baseIncr)
  })

  it('M8 BOOST 金色 vignette：boosting=true 时 createRadialGradient 与 fillRect 增量高于未激活', () => {
    const { canvas, renderer } = createHarness()
    const trackB = createTrackFromDef(TRACK_DEFS[0])
    const baseView: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
      traffic: [],
      boosting: false,
    }
    const boostView: RenderView = { ...baseView, boosting: true }
    renderer.render(0, [], 0, baseView)
    const beforeGrad = callCount(canvas.__ctx.__calls, 'createRadialGradient')
    const beforeRect = callCount(canvas.__ctx.__calls, 'fillRect')
    renderer.render(0, [], 0, boostView)
    const afterBoostGrad = callCount(canvas.__ctx.__calls, 'createRadialGradient')
    const afterBoostRect = callCount(canvas.__ctx.__calls, 'fillRect')
    renderer.render(0, [], 0, baseView)
    const afterBaseGrad = callCount(canvas.__ctx.__calls, 'createRadialGradient')
    const afterBaseRect = callCount(canvas.__ctx.__calls, 'fillRect')
    expect(afterBoostGrad - beforeGrad).toBeGreaterThan(afterBaseGrad - afterBoostGrad)
    expect(afterBoostRect - beforeRect).toBeGreaterThan(afterBaseRect - afterBoostRect)
  })

  it('M16 碰撞红色 vignette：collisionFlash>0 时 createRadialGradient/fillRect 增量高于 0（红闪反馈）', () => {
    const { canvas, renderer } = createHarness()
    const trackB = createTrackFromDef(TRACK_DEFS[0])
    const baseView: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
      traffic: [],
      collisionFlash: 0,
    }
    const flashView: RenderView = { ...baseView, collisionFlash: 0.8 }
    renderer.render(0, [], 0, baseView)
    const beforeGrad = callCount(canvas.__ctx.__calls, 'createRadialGradient')
    const beforeRect = callCount(canvas.__ctx.__calls, 'fillRect')
    renderer.render(0, [], 0, flashView)
    const afterFlashGrad = callCount(canvas.__ctx.__calls, 'createRadialGradient')
    const afterFlashRect = callCount(canvas.__ctx.__calls, 'fillRect')
    renderer.render(0, [], 0, baseView)
    const afterBaseGrad = callCount(canvas.__ctx.__calls, 'createRadialGradient')
    const afterBaseRect = callCount(canvas.__ctx.__calls, 'fillRect')
    // 红闪触发时额外绘制一次径向渐变 + 全屏填充（fillRect 增量显著高于无闪帧）
    expect(afterFlashGrad - beforeGrad).toBeGreaterThan(afterBaseGrad - afterFlashGrad)
    expect(afterFlashRect - beforeRect).toBeGreaterThan(afterBaseRect - afterFlashRect)
    // 无闪帧（base）本身无红闪径向渐变增量
    expect(afterBaseGrad - afterFlashGrad).toBe(0)
  })

  it('M18 碰撞车身边框闪白：view.collisionFlash>0 时玩家车描边 stroke 增量（边框闪白）', () => {
    const { canvas, renderer } = createHarness()
    const trackB = createTrackFromDef(TRACK_DEFS[0])
    const baseView: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
      traffic: [],
      collisionFlash: 0,
    }
    const flashView: RenderView = { ...baseView, collisionFlash: 0.8 }
    // 逐帧取 stroke 增量（速度线 speedRatio=0 阈值以下不绘制，stroke 仅来自玩家车描边）
    renderer.render(0, [], 0, baseView)
    const before = callCount(canvas.__ctx.__calls, 'stroke')
    renderer.render(0, [], 0, flashView)
    const afterFlash = callCount(canvas.__ctx.__calls, 'stroke')
    renderer.render(0, [], 0, baseView)
    const afterBase = callCount(canvas.__ctx.__calls, 'stroke')
    const flashIncr = afterFlash - before
    const baseIncr = afterBase - afterFlash
    // 闪帧玩家车 1 次描边；无闪帧 0 次
    expect(flashIncr).toBe(1)
    expect(baseIncr).toBe(0)
  })

  it('night 车灯随变道方向偏移：shiftDir=1 渲染的 arc x 序列与 shiftDir=0 不同', () => {
    const { canvas, renderer } = createHarness()
    const trackB = createTrackFromDef(TRACK_DEFS[4])
    const baseView: RenderView = {
      track: trackB,
      curvePrefixSum: buildCurvePrefixSum(trackB),
      spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
      traffic: createTraffic(2000),
    }
    const nightView: RenderView = { ...baseView, night: true }
    const shiftView: RenderView = {
      ...baseView,
      traffic: baseView.traffic.map((c) => ({ ...c, shiftDir: 1 })),
      night: true,
    }
    // 两帧 shiftDir=0 渲染取 arc x 增量序列（__args 为累计记录，须按索引切片取增量）
    renderer.render(0, [], 0, nightView)
    const before0 = (canvas.__ctx.__args.arc ?? []).length
    renderer.render(0, [], 0, nightView)
    const after0 = (canvas.__ctx.__args.arc ?? []).length
    const arcs0 = (canvas.__ctx.__args.arc ?? []).slice(before0, after0).map((a) => a[0] as number)
    // shiftDir=1 渲染
    renderer.render(0, [], 0, shiftView)
    const after1 = (canvas.__ctx.__args.arc ?? []).length
    const arcs1 = (canvas.__ctx.__args.arc ?? []).slice(after0, after1).map((a) => a[0] as number)
    // 两帧 arc 数量一致（每辆可见车 2 次：外层光晕 + 核心灯），但核心灯 x 随 steerDir 偏移 → 序列不同
    expect(arcs1.length).toBe(arcs0.length)
    expect(arcs1).not.toEqual(arcs0)
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

  describe('roadStripCache（Task 4：道路段离屏缓存基础设施）', () => {
    it('should build cache when track has roadStrips', () => {
      const { renderer } = createHarness()
      const trackB = createTrackFromDef(TRACK_DEFS[0]) // classic
      const spritesB = createRoadsideSprites(trackB)
      const roadStrips = buildRoadStrips(trackB)
      renderer.setTrack(trackB, spritesB, roadStrips)
      const cache = (renderer as unknown as { roadStripCache: Map<number, unknown> }).roadStripCache
      // setTrack 传 roadStrips 后按 strip 数构建离屏缓存
      expect(cache.size).toBe(roadStrips.length)
      // 每项缓存均为预渲染的离屏 canvas（node 环境为 MockOffscreenCanvas，带 width/height）
      for (const canvas of cache.values()) {
        expect(canvas).toBeInstanceOf(OffscreenCanvas)
        expect(canvas).toHaveProperty('width')
        expect(canvas).toHaveProperty('height')
      }
    })

    it('setTrack 不带 roadStrips 时缓存保持为空（渐进式集成零回归）', () => {
      const { renderer } = createHarness()
      const trackB = createTrackFromDef(TRACK_DEFS[0])
      const spritesB = createRoadsideSprites(trackB)
      renderer.setTrack(trackB, spritesB)
      const cache = (renderer as unknown as { roadStripCache: Map<number, unknown> }).roadStripCache
      expect(cache.size).toBe(0)
    })
  })

  describe('roadStrip 缓存消费（Task A：激活 drawImage 路径）', () => {
    it('setTrack 带 roadStrips 后渲染走缓存路径：drawImage 切片增量显著高于 fallback', () => {
      const { canvas, renderer } = createHarness()
      const trackB = createTrackFromDef(TRACK_DEFS[0]) // classic
      const spritesB = createRoadsideSprites(trackB)
      // fallback 基线：同赛道不带 roadStrips（逐段 drawQuad，道路层零 drawImage）
      renderer.setTrack(trackB, spritesB)
      renderer.render(0)
      const afterFallback = callCount(canvas.__ctx.__calls, 'drawImage')
      // 激活缓存：同赛道带 roadStrips（每段 ≥1 次切片 drawImage）
      const roadStrips = buildRoadStrips(trackB)
      renderer.setTrack(trackB, spritesB, roadStrips)
      renderer.render(0)
      const cachedIncr = callCount(canvas.__ctx.__calls, 'drawImage') - afterFallback
      // 缓存帧：远山平铺 4 次 + 可视段每段 ≥1 次 drawImage 切片（默认 120 段级）
      expect(cachedIncr).toBeGreaterThan(20)
    })

    it('缓存路径下 fill 调用显著少于 fallback（drawQuad 三连被 drawImage 替代）', () => {
      const { canvas, renderer } = createHarness()
      const trackB = createTrackFromDef(TRACK_DEFS[0])
      const spritesB = createRoadsideSprites(trackB)
      const roadStrips = buildRoadStrips(trackB)
      // fallback 两帧：取第二帧 fill 增量（避开首帧无差别基线）
      renderer.setTrack(trackB, spritesB)
      renderer.render(0)
      const afterFirst = callCount(canvas.__ctx.__calls, 'fill')
      renderer.render(0)
      const fallbackIncr = callCount(canvas.__ctx.__calls, 'fill') - afterFirst
      // 缓存帧：同赛道带 roadStrips（中心虚线已烘焙，道路层零 fill）
      renderer.setTrack(trackB, spritesB, roadStrips)
      renderer.render(0)
      const cachedIncr = callCount(canvas.__ctx.__calls, 'fill') - (afterFirst + fallbackIncr)
      // 两条路径共享景物/起终点线 fill，差值 ≈ 道路层逐段 3 fill + 中心线（每段 1 个四边形）
      // 默认可视 119 段 → 差值应显著（>300 次 fill）
      expect(fallbackIncr - cachedIncr).toBeGreaterThan(300)
    })

    it('雨天缓存路径仍保留 overlay drawQuad（fill 增量 > 晴天缓存帧）', () => {
      const { canvas, renderer } = createHarness()
      const trackB = createTrackFromDef(TRACK_DEFS[0])
      const roadStrips = buildRoadStrips(trackB)
      renderer.setTrack(trackB, createRoadsideSprites(trackB), roadStrips)
      renderer.render(0, [], 0) // 晴
      const afterClear = callCount(canvas.__ctx.__calls, 'fill')
      renderer.render(0, [], 90) // 雨（phase 2）
      const rainIncr = callCount(canvas.__ctx.__calls, 'fill') - afterClear
      // 雨天每可视段 1 次 WET_OVERLAY fill + 近处（k<30）高光条（缓存路径下未随中心线一并烘焙）
      expect(rainIncr).toBeGreaterThan(60)
    })

    it('起终点线在缓存路径下仍绘制（wrappedIndex===0 段 16 列 × 2 行棋盘格 fill）', () => {
      const { canvas, renderer } = createHarness()
      const straight = createStraightTrack(10) // 10 段环：k=10 时 wrappedIndex 回到 0
      const roadStrips = buildRoadStrips(straight)
      renderer.setTrack(straight, [], roadStrips)
      renderer.render(0)
      // 缓存激活：道路层切片 drawImage（远山仅 4 次，这里必然更多）
      expect(callCount(canvas.__ctx.__calls, 'drawImage')).toBeGreaterThan(4)
      // 起终点线 32 格 fillQuadCoords + 天空/草地各 1 = 34
      expect(callCount(canvas.__ctx.__calls, 'fill')).toBeGreaterThanOrEqual(34)
    })

    it('setViewport 后按新宽度重建缓存且渲染不抛错', () => {
      const { canvas, renderer } = createHarness()
      const trackB = createTrackFromDef(TRACK_DEFS[0])
      const roadStrips = buildRoadStrips(trackB)
      renderer.setTrack(trackB, createRoadsideSprites(trackB), roadStrips)
      expect(() => renderer.setViewport(canvas, 400, 300)).not.toThrow()
      renderer.render(0)
      expect(callCount(canvas.__ctx.__calls, 'drawImage')).toBeGreaterThan(0)
      const cache = (renderer as unknown as { roadStripCache: Map<number, { width: number }> }).roadStripCache
      // 重建后缓存条数不变、纹理宽度 = 新视口宽度
      expect(cache.size).toBe(roadStrips.length)
      expect(cache.values().next().value?.width).toBe(400)
    })

    it('分屏双 Renderer 各自缓存不串扰（cachedTrack 指向各自赛道）', () => {
      const canvasA = createMockCanvas(800, 600)
      const rendererA = new Renderer(canvasA, createStraightTrack(10), 800, 600)
      const canvasB = createMockCanvas(800, 600)
      const rendererB = new Renderer(canvasB, createStraightTrack(10), 800, 600)
      const trackA = createTrackFromDef(TRACK_DEFS[0])
      const trackB = createTrackFromDef(TRACK_DEFS[1])
      rendererA.setTrack(trackA, createRoadsideSprites(trackA), buildRoadStrips(trackA))
      rendererB.setTrack(trackB, createRoadsideSprites(trackB), buildRoadStrips(trackB))
      // 各自渲染默认视图（v.track 各自等于 cachedTrack）→ 各自走自己的缓存
      expect(() => rendererA.render(0)).not.toThrow()
      expect(() => rendererB.render(0)).not.toThrow()
      expect(callCount(canvasA.__ctx.__calls, 'drawImage')).toBeGreaterThan(4)
      expect(callCount(canvasB.__ctx.__calls, 'drawImage')).toBeGreaterThan(4)
      const cachedA = (rendererA as unknown as { cachedTrack: unknown }).cachedTrack
      const cachedB = (rendererB as unknown as { cachedTrack: unknown }).cachedTrack
      expect(cachedA).toBe(trackA)
      expect(cachedB).toBe(trackB)
      expect(cachedA).not.toBe(cachedB)
    })

    it('setTrack 不带 roadStrips 后缓存消费停用（回退逐段 drawQuad）', () => {
      const { canvas, renderer } = createHarness()
      const trackB = createTrackFromDef(TRACK_DEFS[0])
      const roadStrips = buildRoadStrips(trackB)
      renderer.setTrack(trackB, createRoadsideSprites(trackB), roadStrips)
      renderer.render(0)
      const afterCached = callCount(canvas.__ctx.__calls, 'fill')
      // 切换赛道且不带 roadStrips：缓存引用保留但段映射作废 → 缓存消费停用
      renderer.setTrack(createStraightTrack(10), [])
      renderer.render(0)
      const fallbackIncr = callCount(canvas.__ctx.__calls, 'fill') - afterCached
      // fallback：10 段环可视 ~119 段 × 3 四边形 + 中心线 → 数百次 fill
      expect(fallbackIncr).toBeGreaterThan(100)
    })
  })

  describe('fillStyle cache', () => {
    /** 以私有成员访问方式暴露 getFillStyle / _fillStyleCache */
    function expose(renderer: Renderer): {
      getFillStyle: (r: number, g: number, b: number, a: number) => string
      _fillStyleCache: Map<string, string>
    } {
      return renderer as unknown as {
        getFillStyle: (r: number, g: number, b: number, a: number) => string
        _fillStyleCache: Map<string, string>
      }
    }

    it('should return same string for same rgba values', () => {
      const { renderer } = createHarness()
      const r = expose(renderer)
      // 连续浮点 alpha 经 toFixed(3) 归一化到同一键 → 命中缓存，返回同一字符串实例
      const first = r.getFillStyle(200, 200, 210, 0.4721)
      const second = r.getFillStyle(200, 200, 210, 0.4724)
      expect(second).toBe(first)
      // 缓存键只与归一化后的分量有关：0.4721 与 0.4724 均四舍五入为 0.472
      expect(first).toBe('rgba(200, 200, 210, 0.472)')
      expect(r._fillStyleCache.size).toBe(1)
      // 不同 alpha 归一化后不同 → 新键新串，原串不被覆盖
      const other = r.getFillStyle(200, 200, 210, 0.5)
      expect(other).toBe('rgba(200, 200, 210, 0.500)')
      expect(r._fillStyleCache.size).toBe(2)
      // 命中路径不改变缓存大小
      r.getFillStyle(200, 200, 210, 0.5001)
      expect(r._fillStyleCache.size).toBe(2)
    })

    it('缓存超过 1024 项时分段清空（移除最早一半，保留热数据；R5 性能加固）', () => {
      const { renderer } = createHarness()
      const r = expose(renderer)
      // 固定 r/g/b、alpha 步进 0.001：i=0..1024 生成 1025 个互异归一化键，
      // 第 1025 次插入触发 size > 1024 → 移除最早一半（Map 插入序），保留最近 513 项
      for (let i = 0; i < 1025; i++) {
        r.getFillStyle(5, 6, 7, i / 1000)
      }
      expect(r._fillStyleCache.size).toBe(513)
      // 保留的是最近插入的一半（Map 插入序，最早的 512 个键被移除）：
      // 最近的键仍命中同一字符串实例（缓存热数据保留）
      expect(r.getFillStyle(5, 6, 7, 1.024)).toBe('rgba(5, 6, 7, 1.024)')
      expect(r._fillStyleCache.size).toBe(513)
      // 缓存清理后仍可正常获取（重建缓存）
      expect(r.getFillStyle(5, 6, 7, 0.5)).toBe('rgba(5, 6, 7, 0.500)')
    })
  })

  describe('景深 z-order 与景物坐标系（2026-08-05 修复）', () => {
    /** 把第 n 次 fillRect 调用映射到 __order 全局序列索引（跨方法绘制顺序比较用） */
    function globalFillRectIndex(order: string[], n: number): number {
      let seen = -1
      for (let i = 0; i < order.length; i++) {
        if (order[i] === 'fillRect') {
          seen++
          if (seen === n) return i
        }
      }
      return -1
    }

    it('近处树绘制在远处车流之后（近者遮挡远者，旧版整车流覆盖全景物）', () => {
      const { canvas, renderer } = createHarness()
      const track = createStraightTrack(130) // 26000 单位 > 默认视距 24000，避免环形回绕干扰
      const sprites: Sprite[] = [{ kind: 'tree', z: 800, offset: 1.4, height: 1.2 }]
      const traffic: TrafficCar[] = [{ z: 6000, offset: 0, speed: 2400, colorIndex: 0, shiftDir: 0 }]
      const view: RenderView = {
        track,
        curvePrefixSum: buildCurvePrefixSum(track),
        spriteIndex: buildSpriteIndex(sprites, SEGMENT_LENGTH),
        traffic,
      }
      renderer.render(0, [], 0, view)
      const fillRects = canvas.__ctx.__args.fillRect ?? []
      // 车身主色（TRAFFIC_COLORS[0]）与树干色（#5a3a22）各自唯一，作为两类绘制物的标记
      const carIdx = fillRects.findIndex((a) => a[4] === TRAFFIC_COLORS[0])
      const trunkIdx = fillRects.findIndex((a) => a[4] === '#5a3a22')
      expect(carIdx).toBeGreaterThanOrEqual(0)
      expect(trunkIdx).toBeGreaterThanOrEqual(0)
      const order = canvas.__ctx.__order
      const carOrder = globalFillRectIndex(order, carIdx)
      const trunkOrder = globalFillRectIndex(order, trunkIdx)
      // 树（z=800，近）必须在车（z=6000，远）之后绘制，才能正确遮挡
      expect(trunkOrder).toBeGreaterThan(carOrder)
    })

    it('弯道景物中心与路面同坐标系（减相机自身曲率偏移，防景物漂移入路面）', () => {
      const { canvas, renderer } = createHarness()
      const track = createTrackFromDef(TRACK_DEFS[2]) // s-curve（曲率大）
      const prefix = buildCurvePrefixSum(track)
      const totalLen = track.length * SEGMENT_LENGTH
      const cameraZ = totalLen * 0.4 // 弯道中段：相机处绝对前缀曲率非零
      const camCurve = curveOffsetAtZ(track, prefix, cameraZ)
      expect(Math.abs(camCurve)).toBeGreaterThan(0.1) // 前提有效性：两候选可区分
      const spriteZ = cameraZ + 2000
      const sprite: Sprite = { kind: 'tree', z: spriteZ, offset: 1.4, height: 1.2 }
      const view: RenderView = {
        track,
        curvePrefixSum: prefix,
        spriteIndex: buildSpriteIndex([sprite], SEGMENT_LENGTH),
        traffic: [],
      }
      renderer.render(cameraZ, [], 0, view)
      // 期望投影：景物中心取相机相对累计曲率（与 renderRoadSurface 的 curveSum 同坐标系）
      const opts = { width: 800, height: 600, horizon: 600 * 0.35, depth: 800 * 0.84 }
      const camera = { x: 0, y: 1, z: cameraZ }
      const relCenter =
        curveOffsetAtZ(track, prefix, spriteZ) - prefix[(trackIndexForCameraZ(track, cameraZ) + 1) % track.length]
      const expected = project(opts, camera, { x: relCenter + 1.4, y: 0, z: spriteZ })
      const wrongCandidate = project(opts, camera, {
        x: curveOffsetAtZ(track, prefix, spriteZ) + 1.4,
        y: 0,
        z: spriteZ,
      })
      expect(expected).not.toBeNull()
      expect(wrongCandidate).not.toBeNull()
      // 两候选可区分（弯道偏移 > 5px），断言才有意义
      expect(Math.abs(expected!.x - wrongCandidate!.x)).toBeGreaterThan(5)
      // 实际绘制的树干中心应与相机相对候选吻合（亚像素级）
      const trunk = (canvas.__ctx.__args.fillRect ?? []).find((a) => a[4] === '#5a3a22')
      expect(trunk).toBeDefined()
      const trunkCenterX = (trunk![0] as number) + (trunk![2] as number) / 2
      expect(Math.abs(trunkCenterX - expected!.x)).toBeLessThan(1)
    })
  })

  describe('距离大气透视（2026-08-05 道路平滑化）', () => {
    it('渲染含地平线雾带：createLinearGradient 起点在地平线、覆盖地面顶部 42% 区域', () => {
      const { canvas, renderer } = createHarness()
      renderer.render(0)
      const horizon = 600 * 0.35 // createHarness 800×600，horizon = height*0.35
      const bandH = (600 - horizon) * 0.42
      const grads = canvas.__ctx.__args.createLinearGradient ?? []
      // 天空渐变（0,0→0,horizon）之外，应有一条雾带渐变（0,horizon→0,horizon+bandH）
      const fogGrad = grads.find((g) => Math.abs((g[1] as number) - horizon) < 0.01)
      expect(fogGrad).toBeDefined()
      expect(fogGrad![0]).toBe(0)
      expect(fogGrad![3]).toBeCloseTo(horizon + bandH, 0)
      // 雾带以一次全宽 fillRect 覆盖（x=0、y=horizon、w=width、h=bandH）
      const fogRect = (canvas.__ctx.__args.fillRect ?? []).find(
        (r) => Math.abs((r[1] as number) - horizon) < 0.01 && Math.abs((r[3] as number) - bandH) < 1,
      )
      expect(fogRect).toBeDefined()
      expect(fogRect![0]).toBe(0)
      expect(fogRect![2]).toBe(800)
    })

    it('雾带渐变使用 hsla 天空雾色（三段 addColorStop：强→中→透明）', () => {
      const { canvas, renderer } = createHarness()
      renderer.render(0)
      // createLinearGradient 每次新建渐变对象后紧跟 addColorStop；雾带 3 段 stop。
      // 断言 addColorStop 总次数 ≥ 天空 2 段 + 雾带 3 段 = 5（无其它渐变时）
      expect(canvas.__ctx.__calls.addColorStop ?? 0).toBeGreaterThanOrEqual(5)
    })
  })

  describe('RenderOptions 渲染降级（Task 9）', () => {
    /** 经典赛道视图（可选带 boost 粒子） */
    function buildClassicView(boostParticles?: BoostParticle[]): RenderView {
      const trackB = createTrackFromDef(TRACK_DEFS[0]) // classic
      return {
        track: trackB,
        curvePrefixSum: buildCurvePrefixSum(trackB),
        spriteIndex: buildSpriteIndex(createRoadsideSprites(trackB), SEGMENT_LENGTH),
        traffic: [],
        boostParticles,
      }
    }

    test('不传 renderOpts 与传空对象 {} 的渲染序列一致（缺省全效零回归）', () => {
      // 两个独立 harness 渲染同一雨天帧（timeSec=90 触发雨层）：
      // 一个不传 renderOpts，一个传 {}，绘制调用序列必须逐调用一致
      const canvasA = createMockCanvas(800, 600)
      const rendererA = new Renderer(canvasA, createStraightTrack(10), 800, 600)
      rendererA.render(0, [], 90)

      const canvasB = createMockCanvas(800, 600)
      const rendererB = new Renderer(canvasB, createStraightTrack(10), 800, 600)
      rendererB.render(0, [], 90, undefined, {})

      expect(drawingArgs(canvasB.__ctx)).toEqual(drawingArgs(canvasA.__ctx))
    })

    test('skipSmoke=true 时不调用 drawSmoke（arc 增量降为 0）', () => {
      const { canvas, renderer } = createHarness()
      const smoke: SmokeParticle[] = [
        { x: 0, z: 500, t: 0.2 },
        { x: 0.5, z: 900, t: 0.1 },
      ]
      // 直道 harness 无车流/景物/boost、timeSec=0 晴天：arc 仅来自烟雾层
      renderer.render(0, [], 0)
      const before = callCount(canvas.__ctx.__calls, 'arc')
      renderer.render(0, smoke, 0)
      const afterDefault = callCount(canvas.__ctx.__calls, 'arc')
      renderer.render(0, smoke, 0, undefined, { skipSmoke: true })
      const afterSkip = callCount(canvas.__ctx.__calls, 'arc')
      const defaultIncr = afterDefault - before
      const skipIncr = afterSkip - afterDefault
      // 默认帧每粒可见烟雾 1 次 arc；skip 帧烟雾层被跳过 → arc 增量必须为 0
      expect(defaultIncr).toBeGreaterThan(0)
      expect(skipIncr).toBe(0)
    })

    test('skipBoostParticles=true 时不调用 drawBoostParticles（arc 增量与无粒子帧一致）', () => {
      const { canvas, renderer } = createHarness()
      const baseView = buildClassicView()
      const boostView = buildClassicView([
        { x: 0.5, z: 500, t: 0 },
        { x: 0.3, z: 700, t: 0.3 },
      ])
      // 逐帧取 arc 增量：无粒子帧 / boost 帧 / skip boost 帧
      renderer.render(0, [], 0, baseView)
      const before = callCount(canvas.__ctx.__calls, 'arc')
      renderer.render(0, [], 0, baseView)
      const afterBase = callCount(canvas.__ctx.__calls, 'arc')
      renderer.render(0, [], 0, boostView)
      const afterBoost = callCount(canvas.__ctx.__calls, 'arc')
      renderer.render(0, [], 0, boostView, { skipBoostParticles: true })
      const afterSkip = callCount(canvas.__ctx.__calls, 'arc')
      const baseIncr = afterBase - before
      const boostIncr = afterBoost - afterBase
      const skipIncr = afterSkip - afterBoost
      // boost 帧比无粒子帧多出粒子 arc（每粒 1 次）；skip 帧与无粒子帧完全一致（粒子层被跳过）
      expect(boostIncr).toBeGreaterThan(baseIncr)
      expect(skipIncr).toBe(baseIncr)
    })

    test('skipRain=true（雨天）时不调用 drawRain（drawImage 增量与晴天一致）', () => {
      const { canvas, renderer } = createHarness()
      // 逐帧取 drawImage 增量：skip 雨帧 / 晴天帧（雨天未跳过时双幅 drawImage 平铺，见上方雨天测试）
      renderer.render(0, [], 90)
      const before = callCount(canvas.__ctx.__calls, 'drawImage')
      renderer.render(0, [], 90, undefined, { skipRain: true })
      const afterSkip = callCount(canvas.__ctx.__calls, 'drawImage')
      renderer.render(0, [], 0)
      const afterClear = callCount(canvas.__ctx.__calls, 'drawImage')
      const skipIncr = afterSkip - before
      const clearIncr = afterClear - afterSkip
      // skip 帧（雨天 + skipRain）与晴天帧增量一致：雨层 2 次 drawImage 被跳过
      expect(skipIncr).toBe(clearIncr)
    })

    test('drawDistance=60 时道路循环只渲染 60 段（fill 增量明显低于默认 120 段）', () => {
      const { canvas, renderer } = createHarness()
      renderer.render(0)
      const before = callCount(canvas.__ctx.__calls, 'fill')
      renderer.render(0)
      const afterDefault = callCount(canvas.__ctx.__calls, 'fill')
      renderer.render(0, [], 0, undefined, { drawDistance: 60 })
      const after60 = callCount(canvas.__ctx.__calls, 'fill')
      const defaultIncr = afterDefault - before
      const incr60 = after60 - afterDefault
      // 每段 3 个路面四边形（路面 + 双路缘）+ 中心虚线（每两段 1 次）：
      // 60 段帧的 fill 增量低于默认 120 段帧，且差值 ≥ 60 段 × 3 个四边形
      expect(incr60).toBeLessThan(defaultIncr)
      expect(defaultIncr - incr60).toBeGreaterThan(60 * 3)
    })
  })
})
