import { describe, expect, it } from 'vitest'
import { createDefaultTrack, totalCurve, type CurveControlPoint } from '../../src/engine/track'
import { createTrackFromDef, getTrackDef, TRACK_DEFS } from '../../src/engine/tracks'

describe('TRACK_DEFS 关卡配置', () => {
  it('提供 5 条赛道且 id 唯一', () => {
    expect(TRACK_DEFS).toHaveLength(5)
    const ids = new Set(TRACK_DEFS.map((def) => def.id))
    expect(ids.size).toBe(5)
  })

  it('每条赛道首尾控制点曲率为 0 且圈数大于 0', () => {
    for (const def of TRACK_DEFS) {
      const points: CurveControlPoint[] = def.controlPoints
      expect(points[0].curve).toBe(0)
      expect(points[points.length - 1].curve).toBe(0)
      expect(def.laps).toBeGreaterThan(0)
      expect(def.name.length).toBeGreaterThan(0)
    }
  })

  it('各赛道控制点互不相同', () => {
    const json = TRACK_DEFS.map((def) => JSON.stringify(def.controlPoints))
    expect(new Set(json).size).toBe(TRACK_DEFS.length)
  })
})

describe('createTrackFromDef', () => {
  it('classic 赛道与 createDefaultTrack 完全一致', () => {
    const classic = createTrackFromDef(TRACK_DEFS[0])
    expect(classic).toEqual(createDefaultTrack())
  })

  it('highway 赛道回环总曲率约等于 0', () => {
    const track = createTrackFromDef(getTrackDef('highway')!)
    expect(Math.abs(totalCurve(track))).toBeLessThan(0.01)
    expect(track.length).toBeGreaterThan(0)
  })

  it('s-curve 赛道回环总曲率约等于 0', () => {
    const track = createTrackFromDef(getTrackDef('s-curve')!)
    expect(Math.abs(totalCurve(track))).toBeLessThan(0.01)
    expect(track.length).toBeGreaterThan(0)
  })
})

describe('getTrackDef', () => {
  it('命中返回对应定义', () => {
    expect(getTrackDef('classic')?.name).toBe('经典赛道')
  })

  it('未命中返回 null', () => {
    expect(getTrackDef('nonexistent')).toBeNull()
  })
})
