import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Renderer, type RenderView } from '../../src/engine/renderer'
import { SEGMENT_LENGTH } from '../../src/engine/track'
import { getEnvironmentProfile } from '../../src/engine/environment'
import { buildCurvePrefixSum, buildSpriteIndex, createRoadsideSprites } from '../../src/engine/sprites'
import { createStraightTrack } from '../helpers/track'
import { createMockCanvas, type MockCanvas } from '../__mocks__/canvas'

/**
 * 远山离屏缓存的环境一致性回归（2026-09-04 P0-3 修复）。
 *
 * 背景：`setViewport` 原先用硬编码的 plains 配色（#27425e/#1f3046）重建远山位图，
 * 却不重置 `currentEnv`；而 `renderWithOpts` 的懒重建判据是 `envForMountains !== currentEnv`，
 * 于是 resize 后下一帧会误判"环境未变"直接跳过重建 → canyon/alpine 等非 plains 环境下
 * 改变窗口尺寸后，远山配色退化为 plains，直到再次切换赛道/环境才恢复。
 *
 * 修复：构造 / setViewport / 环境切换三处统一走 `rebuildMountains()`，配色唯一真源为
 * `getEnvironmentProfile(currentEnv)`（plains 的配置与旧硬编码逐位一致，故零视觉回归）。
 */

function stubDocument(): void {
  vi.stubGlobal('document', {
    createElement: (): MockCanvas => createMockCanvas(),
  })
}

/** OffscreenCanvas 最小 mock（road-strip 缓存构建需要） */
class MockOffscreenCanvas {
  width: number
  height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  getContext() {
    return { fillStyle: '', fillRect: vi.fn() }
  }
}

function makeView(environment: NonNullable<RenderView['environment']>): RenderView {
  const track = createStraightTrack(10)
  const sprites = createRoadsideSprites(track)
  return {
    track,
    curvePrefixSum: buildCurvePrefixSum(track),
    spriteIndex: buildSpriteIndex(sprites, SEGMENT_LENGTH),
    traffic: [],
    environment,
  }
}

/** 读取 day 路径远山主色（离屏缓存 layerDefs 的 color 字段） */
function mountainFarColor(renderer: Renderer): string {
  return (renderer as unknown as { mountains: { color: string }[] }).mountains[0].color
}

/** 读取 day 路径远山离屏位图宽度（缓存 key 含宽度的断言用） */
function mountainFarWidth(renderer: Renderer): number {
  return (renderer as unknown as { mountains: { offscreen: { width: number } }[] }).mountains[0].offscreen.width
}

describe('远山缓存环境一致性（P0-3）', () => {
  beforeEach(() => {
    stubDocument()
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('前置条件：canyon 与 plains 的远山配色不同（保证本组断言有区分度）', () => {
    expect(getEnvironmentProfile('canyon').mountainFar).not.toBe(getEnvironmentProfile('plains').mountainFar)
  })

  it('构造后默认 plains 配色，且 plains 配置与历史硬编码 #27425e 一致（零回归）', () => {
    const canvas = createMockCanvas(800, 600)
    const renderer = new Renderer(canvas, createStraightTrack(10), 800, 600)
    expect(mountainFarColor(renderer)).toBe('#27425e')
    expect(getEnvironmentProfile('plains').mountainFar).toBe('#27425e')
  })

  it('canyon 环境渲染后远山切换为 canyon 配色', () => {
    const canvas = createMockCanvas(800, 600)
    const renderer = new Renderer(canvas, createStraightTrack(10), 800, 600)
    renderer.render(0, [], 0, makeView('canyon'))
    expect(mountainFarColor(renderer)).toBe(getEnvironmentProfile('canyon').mountainFar)
  })

  it('P0-3：canyon 环境下 setViewport 改变尺寸后远山仍保持 canyon 配色（修复前退化为 plains）', () => {
    const canvas = createMockCanvas(800, 600)
    const renderer = new Renderer(canvas, createStraightTrack(10), 800, 600)
    const canyon = makeView('canyon')
    renderer.render(0, [], 0, canyon)
    expect(mountainFarColor(renderer)).toBe(getEnvironmentProfile('canyon').mountainFar)

    renderer.setViewport(canvas, 400, 300)

    // 修复前此处为 plains 的 #27425e（硬编码重建 + currentEnv 未重置 → 懒重建被跳过）
    expect(mountainFarColor(renderer)).toBe(getEnvironmentProfile('canyon').mountainFar)
    expect(mountainFarColor(renderer)).not.toBe(getEnvironmentProfile('plains').mountainFar)

    // 且后续渲染（环境未变）不会再退化
    renderer.render(0, [], 0, canyon)
    expect(mountainFarColor(renderer)).toBe(getEnvironmentProfile('canyon').mountainFar)
  })

  it('P0-3：plains（默认）环境 setViewport 后配色不变——无视觉回归', () => {
    const canvas = createMockCanvas(800, 600)
    const renderer = new Renderer(canvas, createStraightTrack(10), 800, 600)
    renderer.setViewport(canvas, 400, 300)
    expect(mountainFarColor(renderer)).toBe('#27425e')
  })

  it('P0-3：环境切换 → resize → 再切回，配色始终跟随当前环境', () => {
    const canvas = createMockCanvas(800, 600)
    const renderer = new Renderer(canvas, createStraightTrack(10), 800, 600)
    renderer.render(0, [], 0, makeView('alpine'))
    expect(mountainFarColor(renderer)).toBe(getEnvironmentProfile('alpine').mountainFar)

    renderer.setViewport(canvas, 1024, 768)
    expect(mountainFarColor(renderer)).toBe(getEnvironmentProfile('alpine').mountainFar)

    renderer.render(0, [], 0, makeView('desert'))
    expect(mountainFarColor(renderer)).toBe(getEnvironmentProfile('desert').mountainFar)

    renderer.setViewport(canvas, 640, 480)
    expect(mountainFarColor(renderer)).toBe(getEnvironmentProfile('desert').mountainFar)
  })

  it('修复：缓存 key 含宽度——分屏半屏宽渲染按渲染宽度重建（不沿用全屏宽缓存）', () => {
    const canvas = createMockCanvas(800, 600)
    const renderer = new Renderer(canvas, createStraightTrack(10), 800, 600)
    const canyon = makeView('canyon')
    // 全屏渲染（width=800）触发懒重建
    renderer.render(0, [], 0, canyon)
    expect(mountainFarWidth(renderer)).toBe(800)
    expect(mountainFarColor(renderer)).toBe(getEnvironmentProfile('canyon').mountainFar)
    // 分屏半屏宽 400：环境未变但宽度变 → 必须重建（修复前沿用全屏 800 宽缓存，位图与绘制宽度错配）
    renderer.renderRegion(0, 0, 400, [], 0, canyon)
    expect(mountainFarWidth(renderer)).toBe(400)
    expect(mountainFarColor(renderer)).toBe(getEnvironmentProfile('canyon').mountainFar)
    // 同宽再渲染：不重建（缓存稳定，宽度保持 400）
    renderer.renderRegion(0, 0, 400, [], 0, canyon)
    expect(mountainFarWidth(renderer)).toBe(400)
    // 回到全屏宽度：重建回 800
    renderer.render(0, [], 0, canyon)
    expect(mountainFarWidth(renderer)).toBe(800)
  })
})
