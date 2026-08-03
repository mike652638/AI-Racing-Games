/** 最佳圈速存档（按赛道 ID 分 key，localStorage 不可用时安全降级；分屏 P2 用 -p2 后缀独立存档） */

const BEST_TIME_PREFIX = 'outrun-pseudo3d-best-'
const BEST_DRIFT_PREFIX = 'outrun-pseudo3d-best-drift-'

/** 胜场统计存档 key 前缀（按模式分 key：热座/分屏各自独立累计） */
export const WIN_STATS_PREFIX = 'outrun-pseudo3d-wins-'

/** 漂移得分 TOP10 排行榜存档 key（跨玩家共享，按 score 降序） */
export const DRIFT_TOP_KEY = 'outrun-pseudo3d-drift-top'
/** 排行榜最大条目数 */
export const DRIFT_TOP_MAX = 10

/** 漂移得分排行榜条目：玩家、赛道、得分与完赛用时 */
export interface DriftEntry {
  player: 'P1' | 'P2'
  trackId: string
  score: number
  time: number
}

/** 双人模式的胜场统计：各玩家胜场数与当前连胜（连胜玩家 + 连胜场次） */
export interface WinStats {
  p1: number
  p2: number
  /** 当前连胜场次（换胜者归 1；无连胜记录时 0） */
  streak: number
  /** 当前连胜的玩家（无连胜记录时 null） */
  streakPlayer: 'P1' | 'P2' | null
}

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

/** 生成指定模式的胜场统计存档 key（hotseat 与 split 独立） */
export function winsKeyFor(mode: 'hotseat' | 'split'): string {
  return WIN_STATS_PREFIX + mode
}

/** 读取指定模式的胜场统计；无存档/JSON 损坏/storage 不可用时回退默认（{p1:0,p2:0,streak:0,streakPlayer:null}） */
export function loadWins(mode: 'hotseat' | 'split', storage: Storage | null = getStorage()): WinStats {
  const fallback: WinStats = { p1: 0, p2: 0, streak: 0, streakPlayer: null }
  if (!storage) {
    return fallback
  }
  const raw = storage.getItem(winsKeyFor(mode))
  if (raw === null) {
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WinStats>
    if (
      typeof parsed.p1 === 'number' &&
      typeof parsed.p2 === 'number' &&
      typeof parsed.streak === 'number' &&
      (parsed.streakPlayer === 'P1' || parsed.streakPlayer === 'P2' || parsed.streakPlayer === null)
    ) {
      return {
        p1: parsed.p1,
        p2: parsed.p2,
        streak: parsed.streak,
        streakPlayer: parsed.streakPlayer,
      }
    }
  }
  catch {
    // JSON 损坏回退默认
  }
  return fallback
}

/** 记录一局胜场：读旧 → 对应玩家胜场 +1 → 连胜（同玩家 +1，换玩家归 1）→ 写回 → 返回新统计。
 *  storage 不可用时仅返回内存结果（不持久化），保证调用方渲染不崩溃。 */
export function recordWin(
  mode: 'hotseat' | 'split',
  winner: 'P1' | 'P2',
  storage: Storage | null = getStorage(),
): WinStats {
  const old = loadWins(mode, storage)
  const next: WinStats = {
    p1: old.p1 + (winner === 'P1' ? 1 : 0),
    p2: old.p2 + (winner === 'P2' ? 1 : 0),
    streak: winner === old.streakPlayer ? old.streak + 1 : 1,
    streakPlayer: winner,
  }
  if (storage) {
    storage.setItem(winsKeyFor(mode), JSON.stringify(next))
  }
  return next
}

/** 读取漂移 TOP10：JSON 损坏/storage 不可用/非数组回退 []；解析成功按 score 降序返回 */
export function loadDriftTop(storage: Storage | null = getStorage()): DriftEntry[] {
  if (!storage) {
    return []
  }
  const raw = storage.getItem(DRIFT_TOP_KEY)
  if (raw === null) {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    const entries = parsed.filter(
      (e): e is DriftEntry =>
        e !== null &&
        typeof e === 'object' &&
        (e.player === 'P1' || e.player === 'P2') &&
        typeof e.trackId === 'string' &&
        typeof e.score === 'number' &&
        typeof e.time === 'number',
    )
    return entries.sort((a, b) => b.score - a.score)
  }
  catch {
    // JSON 损坏回退空数组
    return []
  }
}

/** 插入一条漂移得分：读旧 → 追加 → score 降序（Array#sort 稳定，同分保持插入序）→ 截断 TOP_MAX → 写回。
 *  entered = 新条目是否留在榜内（低分被挤出时为 false）；storage 不可用时仅返回内存榜单。 */
export function addDriftScore(
  entry: DriftEntry,
  storage: Storage | null = getStorage(),
): { top: DriftEntry[]; entered: boolean } {
  const top = loadDriftTop(storage)
  top.push(entry)
  top.sort((a, b) => b.score - a.score)
  const truncated = top.slice(0, DRIFT_TOP_MAX)
  if (storage) {
    storage.setItem(DRIFT_TOP_KEY, JSON.stringify(truncated))
  }
  return { top: truncated, entered: truncated.includes(entry) }
}
