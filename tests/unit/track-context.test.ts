import { describe, expect, it } from 'vitest'
import { TRACK_DEFS } from '../../src/engine/tracks'
import { SEGMENT_LENGTH } from '../../src/engine/track'
import { TRAFFIC_SPAWN_SAFE_ZONE } from '../../src/engine/traffic'
import { createTrackContext, refreshTraffic } from '../../src/game/track-context'

describe('createTrackContext', () => {
  it('从赛道定义派生圈长/圈数/分段', () => {
    const ctx = createTrackContext(TRACK_DEFS[0]) // classic
    expect(ctx.totalLaps).toBe(3)
    expect(ctx.lapLength).toBe(ctx.segments.length * SEGMENT_LENGTH)
    expect(ctx.segments.length).toBeGreaterThan(100)
  })
  it('预计算曲率前缀和与景物段索引', () => {
    const ctx = createTrackContext(TRACK_DEFS[0])
    // buildCurvePrefixSum 返回长度为 track.length + 1 的 Float64Array（哨兵位）
    expect(ctx.curvePrefixSum.length).toBe(ctx.segments.length + 1)
    expect(ctx.spriteIndex.size).toBeGreaterThan(0)
    expect(ctx.sprites.length).toBeGreaterThan(0)
  })
  it('按圈长生成车流', () => {
    const ctx = createTrackContext(TRACK_DEFS[2]) // s-curve
    expect(ctx.traffic.length).toBeGreaterThan(0)
  })
  it('refreshTraffic 重建车流数组（引用替换）', () => {
    const ctx = createTrackContext(TRACK_DEFS[0])
    const old = ctx.traffic
    refreshTraffic(ctx)
    expect(ctx.traffic).not.toBe(old)
  })
  it('车流密度按赛道 trafficCount 生效（highway 16）', () => {
    const highway = createTrackContext(TRACK_DEFS[1])
    expect(highway.traffic.length).toBe(16)
  })
  it('车流密度按赛道 trafficCount 生效（s-curve 8）', () => {
    const scurve = createTrackContext(TRACK_DEFS[2])
    expect(scurve.traffic.length).toBe(8)
  })
  it('无 trafficCount 字段的赛道走默认密度（classic 14）', () => {
    const classic = createTrackContext(TRACK_DEFS[0])
    expect(classic.traffic.length).toBe(14)
  })
  it('不同赛道定义产生不同圈长（S 弯短于经典）', () => {
    const classic = createTrackContext(TRACK_DEFS[0])
    const scurve = createTrackContext(TRACK_DEFS[2])
    expect(scurve.lapLength).toBeLessThan(classic.lapLength)
  })
  it('出生安全窗口：全部 9 条赛道的初始车流均不在玩家出生点前方窗口内（防开局碰撞）', () => {
    for (const def of TRACK_DEFS) {
      const ctx = createTrackContext(def)
      for (const car of ctx.traffic) {
        expect(car.z, `${def.id} 赛道车流 z=${car.z} 落在出生窗口内`).toBeGreaterThanOrEqual(TRAFFIC_SPAWN_SAFE_ZONE)
      }
    }
  })
  it('出生安全窗口：refreshTraffic 重建后同样生效（重置回菜单再开赛不回归旧问题）', () => {
    const ctx = createTrackContext(TRACK_DEFS[0])
    refreshTraffic(ctx)
    for (const car of ctx.traffic) {
      expect(car.z).toBeGreaterThanOrEqual(TRAFFIC_SPAWN_SAFE_ZONE)
    }
  })
})
