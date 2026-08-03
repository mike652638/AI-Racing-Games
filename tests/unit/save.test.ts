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
