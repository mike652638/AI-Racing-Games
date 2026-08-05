import { describe, expect, it } from 'vitest'
import { renderRoadSurface, type RoadSurfaceResources } from '../../src/engine/road-surface'
import { SEGMENT_LENGTH, trackIndexForCameraZ } from '../../src/engine/track'
import { createMockCanvas, type MockCanvas } from '../__mocks__/canvas'
import { createStraightTrack } from '../helpers/track'
import { shadeColor } from '../../src/engine/road-strip'

const opts = { width: 800, height: 600, horizon: 210, depth: 672 }
const camera = { x: 0, y: 1, z: 0 }
/** 直道路缘色（roadColors：偶数段红 #d03030 / 奇数段白 #e8e8e8） */
const SIDE_EVEN = '#d03030'
const SIDE_ODD = '#e8e8e8'
/** M18 路缘立体感期望色（与 road-surface.ts 常量一致：内侧暗 0.75 / 外侧亮 1.15） */
const DIVIDER_EVEN = shadeColor(SIDE_EVEN, 0.75) // '#9c2424'
const DIVIDER_ODD = shadeColor(SIDE_ODD, 0.75) // '#aeaeae'
const HIGHLIGHT_EVEN = shadeColor(SIDE_EVEN, 1.15) // '#ef3737'
const HIGHLIGHT_ODD = shadeColor(SIDE_ODD, 1.15) // '#ffffff'

/**
 * 渲染道路层（fallback 逐段 drawQuad 路径：空缓存资源强制回退），
 * 捕获 fill 时刻的 fillStyle（mock 的 fill 不记录颜色快照，测试内补丁）。
 */
function renderFallback(cameraZ: number, fillStyles: string[]): MockCanvas {
  const canvas = createMockCanvas(800, 600)
  const ctx = canvas.__ctx
  const orig = (ctx as unknown as { fill: (...a: unknown[]) => void }).fill
  ;(ctx as unknown as { fill: (...a: unknown[]) => void }).fill = (...a: unknown[]) => {
    fillStyles.push(String(ctx.fillStyle))
    orig(...a)
  }
  const track = createStraightTrack(200)
  const resources: RoadSurfaceResources = {
    cachedTrack: null,
    roadStripCache: new Map(),
    stripForSegment: new Uint16Array(0),
    roadStrips: [],
  }
  const baseIndex = trackIndexForCameraZ(track, cameraZ)
  const baseZ = Math.floor(cameraZ / SEGMENT_LENGTH) * SEGMENT_LENGTH
  renderRoadSurface(ctx, opts, camera, resources, track, baseIndex, baseZ, cameraZ, 120, false)
  return canvas
}

describe('M18 路缘柔和过渡（road-surface）', () => {
  it('近处段绘制内侧暗色分隔线 + 外侧高光条（红/白路缘各两档色）', () => {
    const styles: string[] = []
    renderFallback(0, styles)
    // 偶数段红路缘：暗分隔线 + 亮高光
    expect(styles).toContain(DIVIDER_EVEN)
    expect(styles).toContain(HIGHLIGHT_EVEN)
    // 奇数段白路缘：暗分隔线 + 亮高光（白 ×1.15 钳制为纯白）
    expect(styles).toContain(DIVIDER_ODD)
    expect(styles).toContain(HIGHLIGHT_ODD)
  })

  it('远端段自动跳过（路缘压缩到 6px 以下不绘制细节，控制每帧成本）', () => {
    // cameraZ=100000：可视段 z≥100200，scale≈0.0067 → 路缘宽度 < 6px → 无任何细节色
    const styles: string[] = []
    renderFallback(100000, styles)
    expect(styles).not.toContain(DIVIDER_EVEN)
    expect(styles).not.toContain(HIGHLIGHT_EVEN)
    expect(styles).not.toContain(DIVIDER_ODD)
    expect(styles).not.toContain(HIGHLIGHT_ODD)
  })

  it('近处帧确定性：同参数重复渲染绘制序列稳定（fill 次数恒定）', () => {
    const a: string[] = []
    const b: string[] = []
    renderFallback(0, a)
    renderFallback(0, b)
    expect(a).toEqual(b)
  })
})
