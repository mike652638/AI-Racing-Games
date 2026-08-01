import { describe, expect, it } from 'vitest'
import {
  BEST_TIME_KEY,
  loadBestTime,
  saveBestTime,
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
    expect(loadBestTime(storage)).toBeNull()
  })

  it('首次 saveBestTime 写入并返回 true', () => {
    const storage = fakeStorage()
    expect(saveBestTime(30.5, storage)).toBe(true)
    expect(storage.getItem(BEST_TIME_KEY)).toBe('30.5')
    expect(loadBestTime(storage)).toBe(30.5)
  })

  it('更慢的成绩不覆盖旧纪录', () => {
    const storage = fakeStorage()
    saveBestTime(30.5, storage)
    expect(saveBestTime(31.2, storage)).toBe(false)
    expect(loadBestTime(storage)).toBe(30.5)
  })

  it('更快的成绩覆盖旧纪录并返回 true', () => {
    const storage = fakeStorage()
    saveBestTime(30.5, storage)
    expect(saveBestTime(29.1, storage)).toBe(true)
    expect(loadBestTime(storage)).toBe(29.1)
  })

  it('storage 不可用（null）时安全返回', () => {
    expect(loadBestTime(null)).toBeNull()
    expect(saveBestTime(30, null)).toBe(false)
  })
})
