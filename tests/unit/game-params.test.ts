import { describe, expect, it } from 'vitest'
import { parseGameParams } from '../../src/game/game-params'

/** M34：URL 模式参数解析纯函数契约（拆分自 game-loop.ts 构造器，行为逐字节等价） */
describe('parseGameParams', () => {
  it('无参数时全部回退默认（单屏 / auto 天气 / dynamic 车流 / 无辅助线 / 每日挑战启用）', () => {
    const p = parseGameParams(new URLSearchParams(''))
    expect(p.splitMode).toBe(false)
    expect(p.perfMode).toBe(false)
    expect(p.hotseatMode).toBe(false)
    expect(p.challengeMode).toBe(false)
    expect(p.weatherMode).toBe('auto')
    expect(p.trafficDynamic).toBe(true)
    expect(p.guideStrength).toBe(0)
    expect(p.dailyModeEnabled).toBe(true)
    expect(p.routeId).toBeNull()
  })

  it('互斥矩阵：split 优先压制 hotseat/challenge/route', () => {
    const p = parseGameParams(new URLSearchParams('split=1&hotseat=1&challenge=1&route=1'))
    expect(p.splitMode).toBe(true)
    expect(p.hotseatMode).toBe(false)
    expect(p.challengeMode).toBe(false)
    // route 与 split/hotseat 互斥（challenge 判定自身已排除 route 场景，此处显式互斥）
    expect(p.routeId).toBeNull()
  })

  it('hotseat 压制 challenge；challenge 单独存在时生效', () => {
    expect(parseGameParams(new URLSearchParams('hotseat=1&challenge=1')).challengeMode).toBe(false)
    expect(parseGameParams(new URLSearchParams('challenge=1')).challengeMode).toBe(true)
    expect(parseGameParams(new URLSearchParams('hotseat=1')).hotseatMode).toBe(true)
  })

  it('perf 与 split 不互斥（共存时性能档仍生效）', () => {
    const p = parseGameParams(new URLSearchParams('split=1&perf=1'))
    expect(p.splitMode).toBe(true)
    expect(p.perfMode).toBe(true)
  })

  it('weather 四变体生效、无效值回退 auto', () => {
    expect(parseGameParams(new URLSearchParams('weather=random')).weatherMode).toBe('random')
    expect(parseGameParams(new URLSearchParams('weather=sunny')).weatherMode).toBe('sunny')
    expect(parseGameParams(new URLSearchParams('weather=rain')).weatherMode).toBe('rain')
    expect(parseGameParams(new URLSearchParams('weather=night')).weatherMode).toBe('night')
    expect(parseGameParams(new URLSearchParams('weather=storm')).weatherMode).toBe('auto')
    expect(parseGameParams(new URLSearchParams('weather=')).weatherMode).toBe('auto')
  })

  it('traffic 宽松解析：仅显式 static 关闭；无参/daily 组合/垃圾值一律回退 dynamic', () => {
    expect(parseGameParams(new URLSearchParams('traffic=static')).trafficDynamic).toBe(false)
    expect(parseGameParams(new URLSearchParams('traffic=dynamic')).trafficDynamic).toBe(true)
    expect(parseGameParams(new URLSearchParams('')).trafficDynamic).toBe(true)
    // daily 参数不影响 traffic 解析（各参数独立判定）
    expect(parseGameParams(new URLSearchParams('daily=0')).trafficDynamic).toBe(true)
    expect(parseGameParams(new URLSearchParams('traffic=static&daily=0')).trafficDynamic).toBe(false)
    // 垃圾值回退默认 dynamic（宽松解析契约）
    expect(parseGameParams(new URLSearchParams('traffic=garbage')).trafficDynamic).toBe(true)
    expect(parseGameParams(new URLSearchParams('traffic=off')).trafficDynamic).toBe(true)
  })

  it('guide=1 开启 0.8 强度；其余值关闭', () => {
    expect(parseGameParams(new URLSearchParams('guide=1')).guideStrength).toBe(0.8)
    expect(parseGameParams(new URLSearchParams('guide=0')).guideStrength).toBe(0)
    expect(parseGameParams(new URLSearchParams('guide=true')).guideStrength).toBe(0)
  })

  it('daily=0 关闭每日挑战；缺省启用', () => {
    expect(parseGameParams(new URLSearchParams('daily=0')).dailyModeEnabled).toBe(false)
    expect(parseGameParams(new URLSearchParams('daily=1')).dailyModeEnabled).toBe(true)
  })

  it('route 接受合法 id 与 1 基数字下标；无效值回退 null', () => {
    expect(parseGameParams(new URLSearchParams('route=classic-tour')).routeId).toBe('classic-tour')
    expect(parseGameParams(new URLSearchParams('route=pro-tour')).routeId).toBe('pro-tour')
    expect(parseGameParams(new URLSearchParams('route=extreme-tour')).routeId).toBe('extreme-tour')
    // 数字 1-3 为 ROUTE_DEFS 下标 1 基
    expect(parseGameParams(new URLSearchParams('route=1')).routeId).toBe('classic-tour')
    expect(parseGameParams(new URLSearchParams('route=3')).routeId).toBe('extreme-tour')
    // 无效值
    expect(parseGameParams(new URLSearchParams('route=nope')).routeId).toBeNull()
    expect(parseGameParams(new URLSearchParams('route=9')).routeId).toBeNull()
    expect(parseGameParams(new URLSearchParams('route=')).routeId).toBeNull()
  })

  it('route 与 hotseat 互斥（与 split 互斥已由上方矩阵用例覆盖）', () => {
    expect(parseGameParams(new URLSearchParams('hotseat=1&route=1')).routeId).toBeNull()
    expect(parseGameParams(new URLSearchParams('hotseat=1&route=1')).hotseatMode).toBe(true)
  })

  it('split/hotseat 为存在性判定（值为 0 也激活），进而压制 route', () => {
    expect(parseGameParams(new URLSearchParams('split=0')).splitMode).toBe(true)
    expect(parseGameParams(new URLSearchParams('hotseat=0')).hotseatMode).toBe(true)
    expect(parseGameParams(new URLSearchParams('route=classic-tour&split=0')).routeId).toBeNull()
  })
})
