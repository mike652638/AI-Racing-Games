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

/** 指定赛道最佳圈速（秒），无存档返回 null */
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

/** 漂移最高分存档 key */
export function bestDriftScoreKey(trackId: string): string {
  return 'outrun-pseudo3d-best-drift-' + trackId
}

/** 读取指定赛道漂移最高分，无存档返回 null */
export function loadBestDriftScore(trackId: string, storage: Storage | null = getStorage()): number | null {
  if (!storage) {
    return null
  }
  const raw = storage.getItem(bestDriftScoreKey(trackId))
  if (raw === null) {
    return null
  }
  const sec = Number(raw)
  return Number.isFinite(sec) ? sec : null
}

/** 写入漂移最高分；仅当更高时写入，返回是否刷新纪录 */
export function saveBestDriftScore(score: number, trackId: string, storage: Storage | null = getStorage()): boolean {
  if (!storage) {
    return false
  }
  const best = loadBestDriftScore(trackId, storage)
  if (best !== null && best >= score) {
    return false
  }
  storage.setItem(bestDriftScoreKey(trackId), String(score))
  return true
}
