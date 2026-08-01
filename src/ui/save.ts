/** 最佳圈速存档（localStorage，不可用时安全降级） */

export const BEST_TIME_KEY = 'outrun-pseudo3d-best-time'

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return window.localStorage
    }
  }
  catch {
    // localStorage 被禁用（隐私模式等）
  }
  return null
}

/** 读取最佳圈速（秒），无存档返回 null */
export function loadBestTime(storage: Storage | null = getStorage()): number | null {
  if (!storage) {
    return null
  }
  const raw = storage.getItem(BEST_TIME_KEY)
  if (raw === null) {
    return null
  }
  const sec = Number(raw)
  return Number.isFinite(sec) ? sec : null
}

/** 写入最佳圈速；仅当快于旧纪录时写入，返回是否刷新纪录 */
export function saveBestTime(sec: number, storage: Storage | null = getStorage()): boolean {
  if (!storage) {
    return false
  }
  const best = loadBestTime(storage)
  if (best !== null && best <= sec) {
    return false
  }
  storage.setItem(BEST_TIME_KEY, String(sec))
  return true
}
