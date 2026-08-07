import { describe, expect, it } from 'vitest'
import {
  buildTrackPreviewBackgroundSvg,
  buildTrackPreviewSvg,
  integrateControlPoints,
} from '../../src/game/track-preview'
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

describe('buildTrackPreviewSvg（菜单赛道缩略图 SVG，2026-08-06 重绘：环境背景 + 扩展尺寸）', () => {
  it('9 条赛道均生成非空 SVG（含背景装饰 + 轨迹 path + 起点圆点）', () => {
    for (const def of TRACK_DEFS) {
      const svg = buildTrackPreviewSvg(def)
      expect(svg).not.toBeNull()
      // 背景装饰：天空渐变 defs
      expect(svg!).toContain('<defs>')
      expect(svg!).toContain('<linearGradient')
      // 轨迹 path：class tp-route + 主题色描边
      expect(svg!).toContain('class="tp-route"')
      expect(svg!).toContain('stroke="#ffd75e"')
      // 起点圆点：class tp-start
      expect(svg!).toContain('class="tp-start"')
    }
  })

  it('默认尺寸扩展为 560×140（viewBox 内归一化：轨迹坐标 ∈ [0, 560]）', () => {
    const svg = buildTrackPreviewSvg(TRACK_DEFS[0])!
    const d = svg.match(/class="tp-route" d="([^"]+)"/)
    expect(d).not.toBeNull()
    const nums = [...d![1].matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(560)
    }
  })

  it('空控制点返回 null（元素缺失安全语义）', () => {
    const def = { controlPoints: [] } as unknown as TrackDef
    expect(buildTrackPreviewSvg(def)).toBeNull()
  })

  it('颜色参数：自定义主题色生效（stroke/fill/color 同色），缺省金黄向后兼容（2026-08-05）', () => {
    const colored = buildTrackPreviewSvg(TRACK_DEFS[0], 560, 140, 14, '#6ec6ff')!
    expect(colored).toContain('stroke="#6ec6ff"')
    expect(colored).toContain('fill="#6ec6ff"')
    expect(colored).toContain('color="#6ec6ff"')
    // 缺省不传色仍为金黄（既有断言依赖）
    const def = buildTrackPreviewSvg(TRACK_DEFS[0])!
    expect(def).toContain('stroke="#ffd75e"')
  })

  it('环境背景差异：沙漠/海岸/雪山/森林赛道生成各自地形特征（2026-08-06 新增）', () => {
    const desert = buildTrackPreviewSvg(TRACK_DEFS[5])! // desert → 沙丘
    const coast = buildTrackPreviewSvg(TRACK_DEFS[7])! // coast → 海面
    const alpine = buildTrackPreviewSvg(TRACK_DEFS[8])! // alpine → 雪山
    const forest = buildTrackPreviewSvg(TRACK_DEFS[6])! // forest → 树冠
    // 沙丘：Q 曲线沙丘（沙漠 grassHue=45 → 明黄沙色）
    expect(desert).toMatch(/hsl\(45 60% 62%\)/)
    // 海面：地平线以下海洋色填充（coast skyHue=195 → 海蓝）+ 波浪浅色
    expect(coast).toMatch(/hsl\(195 55% 40%\)/)
    expect(coast).toContain('#cfe8ff')
    // 雪山：白色山尖三角
    expect(alpine).toContain('#e8f2ff')
    // 森林：树冠圆点（treeColor 填充）
    expect(forest).toMatch(/<circle cx="[0-9.]+" cy="[0-9.]+" r="6" fill="#1f4a1f"/)
    // 白天赛道含太阳光晕 r="16"（山岳为夜间，用星点 r=2.5）
    expect(desert).toContain('r="16"')
    expect(alpine).not.toContain('r="16"')
  })

  it('夜间赛道（canyon/alpine）天空为深色夜空（2026-08-06 新增）', () => {
    const canyon = buildTrackPreviewSvg(TRACK_DEFS[4])! // canyon night
    const alpine = buildTrackPreviewSvg(TRACK_DEFS[8])! // alpine night
    // 夜间 skyTop 为低明度（hsl ... 12% 16%）
    expect(canyon).toContain('hsl(15 12% 16%)')
    expect(alpine).toContain('hsl(205 12% 16%)')
  })
})

describe('buildTrackPreviewBackgroundSvg（宽屏菜单背景层赛道预览，2026-08-06 新增）', () => {
  it('9 条赛道均生成非空 SVG，且使用独立渐变 ID 避免与中央预览冲突', () => {
    for (const def of TRACK_DEFS) {
      const svg = buildTrackPreviewBackgroundSvg(def)
      expect(svg).not.toBeNull()
      expect(svg!).toContain('id="tp-sky-bg"')
      expect(svg!).toContain('fill="url(#tp-sky-bg)"')
      expect(svg!).toContain('class="tp-route"')
      expect(svg!).toContain('class="tp-start"')
    }
  })

  it('默认尺寸扩展为 1920×480（轨迹坐标 ∈ [0, 1920]）', () => {
    const svg = buildTrackPreviewBackgroundSvg(TRACK_DEFS[0])!
    const d = svg.match(/class="tp-route" d="([^"]+)"/)
    expect(d).not.toBeNull()
    const nums = [...d![1].matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(1920)
    }
  })

  it('背景层天空顶部透明、不绘制太阳/星星，rect 无圆角（与菜单星空融合）', () => {
    const desert = buildTrackPreviewBackgroundSvg(TRACK_DEFS[5])! // desert day
    // 天空渐变顶部 stop-opacity="0"，让菜单星空透出来
    expect(desert).toContain('stop-opacity="0"')
    // 背景层不绘制太阳（无 r="16" 光晕）
    expect(desert).not.toContain('r="16"')
    // 背景层天空 rect 无圆角
    expect(desert).not.toMatch(/<rect[^>]*rx="10"[^>]*fill="url\(#tp-sky-bg\)"/)
  })

  it('背景层地面压暗、地平线更低，以适配底部氛围层', () => {
    const plains = buildTrackPreviewBackgroundSvg(TRACK_DEFS[0])! // plains day
    // 地面使用低明度 hsl(... 16% 12%)
    expect(plains).toMatch(/hsl\([0-9]+ 16% 12%\)/)
    // 地平线约 240（480 * 0.5），地面 rect 从 horizonY 开始
    expect(plains).toMatch(/<rect x="28" y="240" width="1864" height="212"/)
  })

  it('空控制点返回 null', () => {
    const def = { controlPoints: [] } as unknown as TrackDef
    expect(buildTrackPreviewBackgroundSvg(def)).toBeNull()
  })
})
