import { afterEach, describe, expect, test, vi } from 'vitest'
import { renderFrame, type FrameRenderContext } from '../../src/game/frame-render'
import { PHASE_MENU, PHASE_RACING } from '../../src/game/phase'
import { createRaceState } from '../../src/game/state'
import { createCarConfig } from '../../src/physics/car'
import { createMockCanvas } from '../__mocks__/canvas'
import { Minimap } from '../../src/ui/minimap'
import { type HudElements } from '../../src/ui/hud'
import type { Renderer, RenderView } from '../../src/engine/renderer'
import type { TrackManager } from '../../src/game/track-manager'
import type { TrackContext } from '../../src/game/track-context'

/** 圈长 1000 × 3 圈的 TrackManager 替身（渲染仅使用 getLapLength 推进预览相机） */
const TRACK_MANAGER = {
  getLapLength: () => 1000,
  getTotalLaps: () => 3,
} as unknown as TrackManager

/** Renderer 方法级替身：覆写 4 个渲染方法为 vi.fn（保留 .mock 访问且结构兼容 Renderer） */
type RendererStub = Renderer & {
  setCameraX: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
  renderRegion: ReturnType<typeof vi.fn>
  drawDivider: ReturnType<typeof vi.fn>
}
function makeRendererStub(): RendererStub {
  return {
    setCameraX: vi.fn(),
    render: vi.fn(),
    renderRegion: vi.fn(),
    drawDivider: vi.fn(),
  } as unknown as RendererStub
}

/** 用对象字面量模拟 HUD DOM 元素：仅暴露 updateHud 使用的 hidden/textContent/classList */
function createMockHudElements(): HudElements {
  const element = () => ({ hidden: false, textContent: '' })
  const container = () => ({ classList: { toggle: vi.fn() } })
  return {
    hudContainer: container() as unknown as HTMLDivElement,
    hud2Container: container() as unknown as HTMLDivElement,
    hudBest: element(),
    hudSpeed: element(),
    hudSpeedUnit: element(),
    hudLap: element(),
    hudTime: element(),
    hudSpeed2: element(),
    hudSpeedUnit2: element(),
    hudLap2: element(),
    hudTime2: element(),
    hudBest2: element(),
    driftIndicator: element(),
    driftScoreValue: element(),
  } as unknown as HudElements
}

/** 小地图替身：与 race.tracks[0] 引用一致（不触发重建），update 记录调用；canvas 仅需可写 hidden */
function makeMinimapStub(trackContext: TrackContext, canvas: unknown = { hidden: false }) {
  return {
    trackContext,
    canvas,
    update: vi.fn(),
  } as unknown as Minimap
}

/** 构造完整 FrameRenderContext（默认单屏 RACING、零粒子、无小地图） */
function makeCtx(over: Partial<FrameRenderContext> = {}): FrameRenderContext {
  return {
    phase: PHASE_RACING,
    splitMode: false,
    renderer: makeRendererStub(),
    race: createRaceState(),
    trackManager: TRACK_MANAGER,
    previewCameraZ: [0, 0] as [number, number],
    boostParticles: [],
    minimap: null,
    hudElements: createMockHudElements(),
    carConfig: createCarConfig(),
    bestTime: null,
    bestTime2: null,
    hotseatMode: false,
    hotseatPlayer: 1,
    ...over,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('菜单预览渲染分支', () => {
  test('单屏菜单：render 一次全幅预览，双预览相机按圈长推进', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    const renderer = makeRendererStub()
    const ctx = makeCtx({ phase: PHASE_MENU, splitMode: false, renderer })
    renderFrame(1, ctx) // dt=1：previewCameraZ[0] = 0 + 500*1 = 500
    expect(renderer.render).toHaveBeenCalledTimes(1)
    expect(renderer.renderRegion).not.toHaveBeenCalled()
    expect(renderer.drawDivider).not.toHaveBeenCalled()
    expect(ctx.previewCameraZ[0]).toBe(500)
    expect(ctx.previewCameraZ[1]).toBe(500)
    const [cameraZ, smoke, timeSec, view] = renderer.render.mock.calls[0] as [
      number,
      unknown[],
      number,
      RenderView,
    ]
    expect(cameraZ).toBe(500)
    expect(smoke).toEqual([])
    expect(timeSec).toBe(0)
    expect(view.track).toBe(ctx.race.tracks[0].segments)
    // 相机横向摆动（以 P1 预览位置为准）
    expect(renderer.setCameraX).toHaveBeenCalledWith(Math.sin(500 * 0.001) * 0.3)
  })

  test('分屏菜单：renderRegion ×2 + drawDivider 一次，render 不调用', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    const renderer = makeRendererStub()
    const ctx = makeCtx({ phase: PHASE_MENU, splitMode: true, renderer })
    renderFrame(0.05, ctx)
    expect(renderer.render).not.toHaveBeenCalled()
    expect(renderer.renderRegion).toHaveBeenCalledTimes(2)
    expect(renderer.drawDivider).toHaveBeenCalledWith(400) // w/2
    // 两区域：左侧 [0, 400)、右侧 [400, 400)，各用各自世界相机
    const first = renderer.renderRegion.mock.calls[0] as [number, number, number, unknown[], number, RenderView]
    const second = renderer.renderRegion.mock.calls[1] as [number, number, number, unknown[], number, RenderView]
    expect(first[1]).toBe(0)
    expect(first[2]).toBe(400)
    expect(first[3]).toEqual([])
    expect(first[4]).toBe(0)
    expect(second[1]).toBe(400)
    expect(second[2]).toBe(400)
    expect(second[4]).toBe(0)
    // viewFor 模块级单例复用（Task B6）：两区域共用同一 view 对象，字段被后一次调用覆盖
    expect(first[5]).toBe(second[5])
  })
})

describe('比赛渲染分支', () => {
  test('单屏比赛：render 一次带玩家相机/烟雾/计时与 BOOST 粒子', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    const renderer = makeRendererStub()
    const ctx = makeCtx({ phase: PHASE_RACING, splitMode: false, renderer })
    ctx.race.player1.cameraZ = 123
    ctx.race.player1.raceTime = 4.5
    ctx.race.player1.carState.position = 0.5
    const particles = ctx.boostParticles
    renderFrame(0.05, ctx)
    expect(renderer.render).toHaveBeenCalledTimes(1)
    expect(renderer.renderRegion).not.toHaveBeenCalled()
    expect(renderer.setCameraX).toHaveBeenCalledWith(0.5)
    const [cameraZ, smoke, timeSec, view] = renderer.render.mock.calls[0] as [
      number,
      unknown[],
      number,
      RenderView,
    ]
    expect(cameraZ).toBe(123)
    expect(smoke).toBe(ctx.race.player1.driftState.smoke)
    expect(timeSec).toBe(4.5)
    expect(view.track).toBe(ctx.race.tracks[0].segments)
    expect(view.boostParticles).toBe(particles)
  })

  test('分屏比赛：renderRegion ×2（P1 左/P2 右）+ drawDivider，render 不调用', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    const renderer = makeRendererStub()
    const ctx = makeCtx({ phase: PHASE_RACING, splitMode: true, renderer })
    ctx.race.player1.cameraZ = 123
    ctx.race.player1.raceTime = 4.5
    ctx.race.player2.cameraZ = 456
    ctx.race.player2.raceTime = 9.5
    ctx.race.player2.carState.position = -0.5
    renderFrame(0.05, ctx)
    expect(renderer.render).not.toHaveBeenCalled()
    expect(renderer.renderRegion).toHaveBeenCalledTimes(2)
    expect(renderer.drawDivider).toHaveBeenCalledWith(400)
    const [p1Camera, p1X, p1W, p1Smoke, p1Time, p1View] = renderer.renderRegion.mock.calls[0] as [
      number,
      number,
      number,
      unknown[],
      number,
      RenderView,
    ]
    expect([p1Camera, p1X, p1W, p1Time]).toEqual([123, 0, 400, 4.5])
    expect(p1Smoke).toBe(ctx.race.player1.driftState.smoke)
    const [p2Camera, p2X, p2W, p2Smoke, p2Time, p2View] = renderer.renderRegion.mock.calls[1] as [
      number,
      number,
      number,
      unknown[],
      number,
      RenderView,
    ]
    expect([p2Camera, p2X, p2W, p2Time]).toEqual([456, 400, 400, 9.5])
    expect(p2Smoke).toBe(ctx.race.player2.driftState.smoke)
    // viewFor 模块级单例复用：两区域共用同一 view 对象（字段被后一次调用覆盖）
    expect(p1View).toBe(p2View)
    expect(renderer.setCameraX).toHaveBeenNthCalledWith(1, ctx.race.player1.carState.position)
    expect(renderer.setCameraX).toHaveBeenNthCalledWith(2, -0.5)
  })
})

describe('updateHud 调用', () => {
  test('单屏比赛：P1 HUD 点亮（速度文本非空、圈数 LAP 1/3）', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    const ctx = makeCtx({ phase: PHASE_RACING, splitMode: false })
    renderFrame(0.05, ctx)
    const hud = ctx.hudElements
    expect(hud.hudSpeed.hidden).toBe(false)
    expect(hud.hudSpeed.textContent).not.toBe('')
    expect(hud.hudLap.textContent).toBe('LAP 1/3')
    expect(hud.hudTime.textContent).toBe('0:00.000')
  })

  test('菜单阶段：updateHud 隐藏全部 HUD 元素', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    const ctx = makeCtx({ phase: PHASE_MENU, splitMode: false })
    renderFrame(0.05, ctx)
    expect(ctx.hudElements.hudSpeed.hidden).toBe(true)
    expect(ctx.hudElements.hudLap.hidden).toBe(true)
  })

  test('分屏比赛：两个 HUD 容器切换 split 布局类（热座模式透传当前回合）', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    const ctx = makeCtx({ phase: PHASE_RACING, splitMode: true, hotseatMode: true, hotseatPlayer: 2 })
    renderFrame(0.05, ctx)
    expect(ctx.hudElements.hudContainer!.classList.toggle).toHaveBeenCalledWith('split', true)
    expect(ctx.hudElements.hud2Container!.classList.toggle).toHaveBeenCalledWith('split', true)
  })
})

describe('小地图', () => {
  test('单屏比赛：update 每帧调用、canvas 可见、引用原样返回', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    // race 与 minimap 须同源（minimap.trackContext === race.tracks[0] 判定一致才不触发重建）
    const race = createRaceState()
    const minimap = makeMinimapStub(race.tracks[0])
    const result = renderFrame(0.05, makeCtx({ phase: PHASE_RACING, splitMode: false, race, minimap }))
    expect(minimap.update).toHaveBeenCalledTimes(1)
    expect(minimap.update).toHaveBeenCalledWith(0) // player1.cameraZ
    expect(minimap.canvas.hidden).toBe(false)
    expect(result.minimap).toBe(minimap)
  })

  test('分屏比赛：小地图隐藏且不更新（单屏专属）', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    const race = createRaceState()
    const minimap = makeMinimapStub(race.tracks[0])
    const result = renderFrame(0.05, makeCtx({ phase: PHASE_RACING, splitMode: true, race, minimap }))
    expect(minimap.update).not.toHaveBeenCalled()
    expect(minimap.canvas.hidden).toBe(true)
    expect(result.minimap).toBe(minimap)
  })

  test('菜单阶段：小地图隐藏且不更新', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    const race = createRaceState()
    const minimap = makeMinimapStub(race.tracks[0])
    renderFrame(0.05, makeCtx({ phase: PHASE_MENU, splitMode: false, race, minimap }))
    expect(minimap.update).not.toHaveBeenCalled()
    expect(minimap.canvas.hidden).toBe(true)
  })

  test('赛道切换后重建：trackContext 不一致时构造新 Minimap 并返回（showMinimap 为 false 不触发绘制）', () => {
    vi.stubGlobal('window', { innerWidth: 800 })
    const race = createRaceState()
    // stale 的 trackContext 与 race.tracks[0] 不同引用 → 触发重建；canvas 需支持 getContext（mock canvas）
    const stale = makeMinimapStub({} as TrackContext, createMockCanvas())
    const result = renderFrame(0.05, makeCtx({ phase: PHASE_MENU, splitMode: true, race, minimap: stale }))
    // 分屏菜单 showMinimap=false：新 Minimap 仅构造（不调用 update 避免 canvas mock 缺失 arcTo）
    expect(stale.update).not.toHaveBeenCalled()
    expect(result.minimap).not.toBe(stale)
    expect(result.minimap).toBeInstanceOf(Minimap)
    expect(result.minimap!.trackContext).toBe(race.tracks[0])
  })
})
