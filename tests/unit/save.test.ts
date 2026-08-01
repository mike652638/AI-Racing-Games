import { describe, expect, it } from 'vitest'
import {
  bestTimeKey,
  loadBestTime,
  saveBestTime,
  loadBestDriftScore,
  saveBestDriftScore,
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
