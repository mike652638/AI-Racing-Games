import { describe, expect, it } from 'vitest'
import {
  bestTimeKey,
  bestTimeKeyFor,
  loadBestTime,
  loadBestTimeFor,
  saveBestTime,
  saveBestTimeFor,
  loadBestDriftScore,
  loadBestDriftScoreFor,
  saveBestDriftScore,
  saveBestDriftScoreFor,
  loadWins,
  recordWin,
  winsKeyFor,
} from '../../src/ui/save'

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  } as Storage
}

describe('save 存档', () => {
  it('无存档时 loadBestTime 返回 null', () => {
    const storage = fakeStorage()
    expect(loadBestTime('classic', storage)).toBeNull()
  })

  it('首次 saveBestTime 写入并返回 true', () => {
    const storage = fakeStorage()
    expect(saveBestTime(30.5, 'classic', storage)).toBe(true)
    expect(storage.getItem(bestTimeKey('classic'))).toBe('30.5')
    expect(loadBestTime('classic', storage)).toBe(30.5)
  })

  it('更慢的成绩不覆盖旧纪录', () => {
    const storage = fakeStorage()
    saveBestTime(30.5, 'classic', storage)
    expect(saveBestTime(31.2, 'classic', storage)).toBe(false)
    expect(loadBestTime('classic', storage)).toBe(30.5)
  })

  it('更快的成绩覆盖旧纪录并返回 true', () => {
    const storage = fakeStorage()
    saveBestTime(30.5, 'classic', storage)
    expect(saveBestTime(29.1, 'classic', storage)).toBe(true)
    expect(loadBestTime('classic', storage)).toBe(29.1)
  })

  it('storage 不可用（null）时安全返回', () => {
    expect(loadBestTime('classic', null)).toBeNull()
    expect(saveBestTime(30, 'classic', null)).toBe(false)
  })

  it('不同赛道独立存档', () => {
    const storage = fakeStorage()
    saveBestTime(25.0, 'highway', storage)
    saveBestTime(30.0, 's-curve', storage)
    expect(loadBestTime('highway', storage)).toBe(25.0)
    expect(loadBestTime('s-curve', storage)).toBe(30.0)
    saveBestTime(24.0, 'highway', storage)
    expect(loadBestTime('highway', storage)).toBe(24.0)
    expect(loadBestTime('s-curve', storage)).toBe(30.0)
  })
})

describe('drift score 存档', () => {
  it('无存档返回 null', () => {
    expect(loadBestDriftScore('classic', fakeStorage())).toBeNull()
  })
  it('首次写入并返回 true', () => {
    const s = fakeStorage()
    expect(saveBestDriftScore(100, 'classic', s)).toBe(true)
    expect(loadBestDriftScore('classic', s)).toBe(100)
  })
  it('更低分不覆盖', () => {
    const s = fakeStorage()
    saveBestDriftScore(200, 'classic', s)
    expect(saveBestDriftScore(150, 'classic', s)).toBe(false)
    expect(loadBestDriftScore('classic', s)).toBe(200)
  })
  it('不同赛道独立存档', () => {
    const s = fakeStorage()
    saveBestDriftScore(100, 'highway', s)
    saveBestDriftScore(200, 's-curve', s)
    expect(loadBestDriftScore('highway', s)).toBe(100)
    expect(loadBestDriftScore('s-curve', s)).toBe(200)
  })
})

describe('save 玩家维度（P1 旧 key / P2 -p2 后缀）', () => {
  it('bestTimeKeyFor 与旧 bestTimeKey 兼容，P2 追加 -p2 后缀', () => {
    expect(bestTimeKeyFor('classic', 0)).toBe(bestTimeKey('classic'))
    expect(bestTimeKeyFor('classic', 1)).toBe('outrun-pseudo3d-best-classic-p2')
  })

  it('P1/P2 互不覆盖：各自 key 独立读写', () => {
    const storage = fakeStorage()
    expect(saveBestTimeFor(0, 10, 'classic', storage)).toBe(true)
    expect(saveBestTimeFor(1, 12, 'classic', storage)).toBe(true)
    expect(loadBestTimeFor(0, 'classic', storage)).toBe(10)
    expect(loadBestTimeFor(1, 'classic', storage)).toBe(12)
    expect(storage.getItem(bestTimeKey('classic'))).toBe('10')
    expect(storage.getItem('outrun-pseudo3d-best-classic-p2')).toBe('12')
  })

  it('P2 写入只比较自身旧值，不覆盖 P1 纪录', () => {
    const storage = fakeStorage()
    saveBestTimeFor(0, 10, 'classic', storage)
    // P2 首次写 15（P2 无旧值 → 写入成功），不影响 P1 的 10
    expect(saveBestTimeFor(1, 15, 'classic', storage)).toBe(true)
    expect(loadBestTimeFor(0, 'classic', storage)).toBe(10)
    expect(loadBestTimeFor(1, 'classic', storage)).toBe(15)
    // P2 更慢成绩不覆盖自身
    expect(saveBestTimeFor(1, 20, 'classic', storage)).toBe(false)
    expect(loadBestTimeFor(1, 'classic', storage)).toBe(15)
  })

  it('漂移分同样玩家独立：P2 写入不影响 P1', () => {
    const storage = fakeStorage()
    expect(saveBestDriftScoreFor(1, 100, 'classic', storage)).toBe(true)
    expect(loadBestDriftScoreFor(0, 'classic', storage)).toBeNull()
    expect(loadBestDriftScoreFor(1, 'classic', storage)).toBe(100)
  })

  it('旧 API 委托一致性：saveBestTime 后 loadBestTimeFor(0) 可读', () => {
    const storage = fakeStorage()
    expect(saveBestTime(10, 'classic', storage)).toBe(true)
    expect(loadBestTimeFor(0, 'classic', storage)).toBe(10)
    // 旧漂移 API 同样委托到 P1
    expect(saveBestDriftScore(50, 'highway', storage)).toBe(true)
    expect(loadBestDriftScoreFor(0, 'highway', storage)).toBe(50)
  })

  it('storage 不可用时玩家维度安全降级', () => {
    expect(loadBestTimeFor(1, 'classic', null)).toBeNull()
    expect(saveBestTimeFor(1, 10, 'classic', null)).toBe(false)
    expect(loadBestDriftScoreFor(1, 'classic', null)).toBeNull()
  })
})

describe('胜场统计（WinStats API）', () => {
  it('首次 recordWin 记 1 胜且 streak=1', () => {
    const s = fakeStorage()
    const r = recordWin('hotseat', 'P1', s)
    expect(r.p1).toBe(1)
    expect(r.p2).toBe(0)
    expect(r.streak).toBe(1)
    expect(r.streakPlayer).toBe('P1')
    // 持久化可读回
    expect(loadWins('hotseat', s)).toEqual({ p1: 1, p2: 0, streak: 1, streakPlayer: 'P1' })
  })

  it('同玩家连赢 streak 递增', () => {
    const s = fakeStorage()
    recordWin('hotseat', 'P1', s)
    const r2 = recordWin('hotseat', 'P1', s)
    expect(r2.p1).toBe(2)
    expect(r2.streak).toBe(2)
    expect(r2.streakPlayer).toBe('P1')
  })

  it('换玩家连胜归 1（p2 胜场独立累计）', () => {
    const s = fakeStorage()
    recordWin('hotseat', 'P1', s)
    recordWin('hotseat', 'P1', s)
    const r = recordWin('hotseat', 'P2', s)
    expect(r.p2).toBe(1)
    expect(r.p1).toBe(2)
    expect(r.streak).toBe(1)
    expect(r.streakPlayer).toBe('P2')
  })

  it('hotseat 与 split 模式 key 独立', () => {
    const s = fakeStorage()
    recordWin('hotseat', 'P1', s)
    const r = recordWin('split', 'P2', s)
    expect(r.p1).toBe(0)
    expect(r.p2).toBe(1)
    // split 记录不影响 hotseat 记录
    expect(loadWins('hotseat', s).p1).toBe(1)
    expect(winsKeyFor('hotseat')).toBe('outrun-pseudo3d-wins-hotseat')
    expect(winsKeyFor('split')).toBe('outrun-pseudo3d-wins-split')
  })

  it('JSON 损坏 loadWins 回退默认', () => {
    const s = fakeStorage()
    s.setItem(winsKeyFor('hotseat'), '{broken json')
    expect(loadWins('hotseat', s)).toEqual({ p1: 0, p2: 0, streak: 0, streakPlayer: null })
    // 损坏存档不影响后续 recordWin（读默认值起步）
    expect(recordWin('hotseat', 'P2', s).p2).toBe(1)
  })

  it('storage 不可用安全降级（返回内存结果、不持久化）', () => {
    expect(loadWins('hotseat', null)).toEqual({ p1: 0, p2: 0, streak: 0, streakPlayer: null })
    const r = recordWin('hotseat', 'P1', null)
    expect(r.p1).toBe(1)
    expect(r.streak).toBe(1)
    expect(r.streakPlayer).toBe('P1')
  })
})
