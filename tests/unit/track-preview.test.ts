import { describe, expect, it } from 'vitest'
import { buildTrackPreviewSvg, integrateControlPoints } from '../../src/game/track-preview'
import { TRACK_DEFS, type TrackDef } from '../../src/engine/tracks'

describe('integrateControlPoints（控制点积分生成轨迹点列）', () => {
  it('纯直道（曲率恒 0）：x 恒为 0、z 累计至总长、采样约 160 点', () => {
    const pts = integrateControlPoints([
      { z: 1000, curve: 0 },
      { z: 1000, curve: 0 },
    ])
    expect(pts.length).toBe(160)
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThan(1e-9)
    }
    expect(pts[pts.length - 1].z).toBeCloseTo(2000, 5)
  })

  it('含弯道控制点：x 偏离中心线（曲率积分产生横向位移）', () => {
    const pts = integrateControlPoints([
      { z: 1000, curve: 0 },
      { z: 1000, curve: 0.002 },
    ])
    const maxX = Math.max(...pts.map((p) => Math.abs(p.x)))
    expect(maxX).toBeGreaterThan(0)
  })

  it('确定性：同输入两次调用输出逐点一致', () => {
    const cp = TRACK_DEFS[0].controlPoints
    const a = integrateControlPoints(cp)
    const b = integrateControlPoints(cp)
    expect(b).toEqual(a)
  })
})

describe('buildTrackPreviewSvg（菜单赛道缩略图 SVG）', () => {
  it('9 条赛道均生成非空 SVG（path 起点 M + 金色描边 + 起点圆点）', () => {
    for (const def of TRACK_DEFS) {
      const svg = buildTrackPreviewSvg(def)
      expect(svg).not.toBeNull()
      expect(svg!.startsWith('<path d="M')).toBe(true)
      expect(svg!).toContain('stroke="#ffd75e"')
      expect(svg!).toContain('<circle')
    }
  })

  it('坐标归一化在 viewBox 内（W=200/H=64、pad=8 边界）', () => {
    const svg = buildTrackPreviewSvg(TRACK_DEFS[0])!
    const nums = [...svg.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(200)
    }
  })

  it('空控制点返回 null（元素缺失安全语义）', () => {
    const def = { controlPoints: [] } as unknown as TrackDef
    expect(buildTrackPreviewSvg(def)).toBeNull()
  })

  it('颜色参数：自定义主题色生效（stroke/fill/color 同色），缺省金黄向后兼容（2026-08-05）', () => {
    const colored = buildTrackPreviewSvg(TRACK_DEFS[0], 200, 64, 8, '#6ec6ff')!
    expect(colored).toContain('stroke="#6ec6ff"')
    expect(colored).toContain('fill="#6ec6ff"')
    expect(colored).toContain('color="#6ec6ff"')
    // 缺省不传色仍为金黄（既有断言依赖）
    const def = buildTrackPreviewSvg(TRACK_DEFS[0])!
    expect(def).toContain('stroke="#ffd75e"')
  })
})
