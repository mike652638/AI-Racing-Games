/** 最佳圈速存档（按赛道 ID 分 key，localStorage 不可用时安全降级；分屏 P2 用 -p2 后缀独立存档） */

const BEST_TIME_PREFIX = 'outrun-pseudo3d-best-'
const BEST_DRIFT_PREFIX = 'outrun-pseudo3d-best-drift-'

/** 玩家后缀：P2 追加 '-p2' 独立存档，P1 无后缀（与旧 key 完全一致，保证兼容） */
function playerSuffix(playerIndex: 0 | 1): string {
  return playerIndex === 1 ? '-p2' : ''
}

/** 生成指定玩家的赛道最佳时间存档 key（P1 兼容旧 key） */
export function bestTimeKeyFor(trackId: string, playerIndex: 0 | 1): string {
  return BEST_TIME_PREFIX + trackId + playerSuffix(playerIndex)
}

/** 生成指定玩家的赛道最佳时间存档 key（旧 API 委托） */
export function bestTimeKey(trackId: string): string {
  return bestTimeKeyFor(trackId, 0)
}

/** 指定玩家的赛道漂移最高分存档 key */
function bestDriftScoreKeyFor(trackId: string, playerIndex: 0 | 1): string {
  return BEST_DRIFT_PREFIX + trackId + playerSuffix(playerIndex)
}

/** 指定玩家的赛道漂移最高分存档 key（旧 API 委托） */
export function bestDriftScoreKey(trackId: string): string {
  return bestDriftScoreKeyFor(trackId, 0)
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

/** 指定玩家指定赛道最佳圈速（秒），无存档返回 null */
export function loadBestTimeFor(
  playerIndex: 0 | 1,
  trackId: string,
  storage: Storage | null = getStorage(),
): number | null {
  if (!storage) {
    return null
  }
  const raw = storage.getItem(bestTimeKeyFor(trackId, playerIndex))
  if (raw === null) {
    return null
  }
  const sec = Number(raw)
  return Number.isFinite(sec) ? sec : null
}

/** 写入指定玩家指定赛道最佳圈速；仅当快于该玩家旧纪录时写入，返回是否刷新纪录 */
export function saveBestTimeFor(
  playerIndex: 0 | 1,
  sec: number,
  trackId: string,
  storage: Storage | null = getStorage(),
): boolean {
  if (!storage) {
    return false
  }
  const best = loadBestTimeFor(playerIndex, trackId, storage)
  if (best !== null && best <= sec) {
    return false
  }
  storage.setItem(bestTimeKeyFor(trackId, playerIndex), String(sec))
  return true
}

/** 读取指定玩家指定赛道漂移最高分，无存档返回 null */
export function loadBestDriftScoreFor(
  playerIndex: 0 | 1,
  trackId: string,
  storage: Storage | null = getStorage(),
): number | null {
  if (!storage) {
    return null
  }
  const raw = storage.getItem(bestDriftScoreKeyFor(trackId, playerIndex))
  if (raw === null) {
    return null
  }
  const sec = Number(raw)
  return Number.isFinite(sec) ? sec : null
}

/** 写入指定玩家指定赛道漂移最高分；仅当更高时写入，返回是否刷新纪录 */
export function saveBestDriftScoreFor(
  playerIndex: 0 | 1,
  score: number,
  trackId: string,
  storage: Storage | null = getStorage(),
): boolean {
  if (!storage) {
    return false
  }
  const best = loadBestDriftScoreFor(playerIndex, trackId, storage)
  if (best !== null && best >= score) {
    return false
  }
  storage.setItem(bestDriftScoreKeyFor(trackId, playerIndex), String(score))
  return true
}

/** 指定赛道最佳圈速（秒），无存档返回 null（旧 API，委托 P1） */
export function loadBestTime(trackId: string, storage: Storage | null = getStorage()): number | null {
  return loadBestTimeFor(0, trackId, storage)
}

/** 写入指定赛道最佳圈速；仅当快于旧纪录时写入，返回是否刷新纪录（旧 API，委托 P1） */
export function saveBestTime(sec: number, trackId: string, storage: Storage | null = getStorage()): boolean {
  return saveBestTimeFor(0, sec, trackId, storage)
}

/** 读取指定赛道漂移最高分，无存档返回 null（旧 API，委托 P1） */
export function loadBestDriftScore(trackId: string, storage: Storage | null = getStorage()): number | null {
  return loadBestDriftScoreFor(0, trackId, storage)
}

/** 写入漂移最高分；仅当更高时写入，返回是否刷新纪录（旧 API，委托 P1） */
export function saveBestDriftScore(score: number, trackId: string, storage: Storage | null = getStorage()): boolean {
  return saveBestDriftScoreFor(0, score, trackId, storage)
}
