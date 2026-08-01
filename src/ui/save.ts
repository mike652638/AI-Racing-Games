/** 最佳圈速存档（按赛道 ID 分 key，localStorage 不可用时安全降级） */

const BEST_TIME_PREFIX = 'outrun-pseudo3d-best-'

/** 生成赛道对应存档 key */
export function bestTimeKey(trackId: string): string {
  return BEST_TIME_PREFIX + trackId
}

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

/** 读取指定赛道最佳圈速（秒），无存档返回 null */
export function loadBestTime(trackId: string, storage: Storage | null = getStorage()): number | null {
  if (!storage) {
    return null
  }
  const raw = storage.getItem(bestTimeKey(trackId))
  if (raw === null) {
    return null
  }
  const sec = Number(raw)
  return Number.isFinite(sec) ? sec : null
}

/** 写入指定赛道最佳圈速；仅当快于旧纪录时写入，返回是否刷新纪录 */
export function saveBestTime(sec: number, trackId: string, storage: Storage | null = getStorage()): boolean {
  if (!storage) {
    return false
  }
  const best = loadBestTime(trackId, storage)
  if (best !== null && best <= sec) {
    return false
  }
  storage.setItem(bestTimeKey(trackId), String(sec))
  return true
}
