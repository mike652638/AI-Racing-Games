/** 最佳圈速存档（按赛道 ID 分 key，localStorage 不可用时安全降级；分屏 P2 用 -p2 后缀独立存档） */

const BEST_TIME_PREFIX = 'outrun-pseudo3d-best-'
const BEST_DRIFT_PREFIX = 'outrun-pseudo3d-best-drift-'

/** 胜场统计存档 key 前缀（按模式分 key：热座/分屏各自独立累计） */
export const WIN_STATS_PREFIX = 'outrun-pseudo3d-wins-'

/** 漂移得分 TOP10 排行榜存档 key（跨玩家共享，按 score 降序） */
export const DRIFT_TOP_KEY = 'outrun-pseudo3d-drift-top'
/** 排行榜最大条目数 */
export const DRIFT_TOP_MAX = 10

/** 分屏漂移对局记录 TOP10 存档 key（最近 10 局，新局在头部） */
export const MATCH_TOP_KEY = 'outrun-pseudo3d-match-top'
/** 对局记录最大条目数 */
export const MATCH_TOP_MAX = 10

/**
 * 复合 JSON 存档格式版本（2026-08-05 版本化加固，审计 R3）：
 * 写入方统一以 { v, data } 信封持久化；读取方经 parseVersioned 迁移——
 * 旧裸格式（v0，无 v 字段）自动按当前 schema 解析，未来字段演进只需升版本并补充迁移分支。
 */
export const SAVE_VERSION = 1

/** 分屏漂移对局记录条目：胜者、双方漂移得分与赛道 */
export interface MatchEntry {
  winner: 'P1' | 'P2'
  p1Score: number
  p2Score: number
  trackId: string
}

/** 漂移得分排行榜条目：玩家、赛道、得分、完赛用时与最高连击档位（H4：可选，旧条目无此字段不丢） */
export interface DriftEntry {
  player: 'P1' | 'P2'
  trackId: string
  score: number
  time: number
  /** 最高连击档位（漂移连击排行榜权重展示；可选，旧 4 字段条目兼容） */
  combo?: number
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
  } catch {
    // localStorage 被禁用（隐私模式等）
  }
  return null
}

/** 版本化 JSON 存档信封：v 为 SAVE_VERSION 版本号，data 为业务数据（旧裸格式无 v 字段 = v0） */
interface VersionedPayload<T> {
  v: number
  data: T
}

/**
 * 解析版本化 JSON 存档（审计 R3 版本化加固）：
 * 1) 无存档/storage 不可用/JSON 损坏 → null（调用方回退默认）；
 * 2) 新版信封 { v, data } → 直接取 data；
 * 3) 旧版裸格式（v0）→ 原样传入（迁移函数内按当前 schema 兼容解析）。
 * migrate 负责字段校验与未来版本迁移（升 SAVE_VERSION 后在此补分支）。
 */
function parseVersioned<T>(storage: Storage | null, key: string, migrate: (raw: unknown) => T | null): T | null {
  if (!storage) {
    return null
  }
  const raw = storage.getItem(key)
  if (raw === null) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof (parsed as VersionedPayload<unknown>).v === 'number' &&
      'data' in (parsed as Record<string, unknown>)
    ) {
      // 新版信封：按 data 解析（v 版本号暂未分叉，统一走 migrate；未来补 per-version 迁移）
      return migrate((parsed as VersionedPayload<unknown>).data)
    }
    // 旧版裸格式（v0）：原样解析
    return migrate(parsed)
  } catch {
    // JSON 损坏回退 null（调用方回退默认）
    return null
  }
}

/** 写入版本化 JSON 存档（统一 v0 → 当前版本信封） */
function writeVersioned<T>(storage: Storage | null, key: string, data: T): void {
  if (!storage) {
    return
  }
  storage.setItem(key, JSON.stringify({ v: SAVE_VERSION, data } satisfies VersionedPayload<T>))
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

/** WinStats 迁移解析：字段校验通过返回副本，否则 null（调用方回退默认）。兼容旧裸格式与新版信封 data */
function migrateWins(raw: unknown): WinStats | null {
  const parsed = raw as Partial<WinStats>
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
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
  return null
}

/** 读取指定模式的胜场统计；无存档/JSON 损坏/storage 不可用时回退默认（{p1:0,p2:0,streak:0,streakPlayer:null}） */
export function loadWins(mode: 'hotseat' | 'split', storage: Storage | null = getStorage()): WinStats {
  const fallback: WinStats = { p1: 0, p2: 0, streak: 0, streakPlayer: null }
  return parseVersioned(storage, winsKeyFor(mode), migrateWins) ?? fallback
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
  writeVersioned(storage, winsKeyFor(mode), next)
  return next
}

/** DriftEntry 迁移解析：非数组/条目校验失败回退 []；成功按 score 降序返回。兼容旧裸数组与新版信封 data */
function migrateDriftTop(raw: unknown): DriftEntry[] | null {
  if (!Array.isArray(raw)) {
    return null
  }
  const entries = raw.filter(
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

/** 读取漂移 TOP10：JSON 损坏/storage 不可用/非数组回退 []；解析成功按 score 降序返回 */
export function loadDriftTop(storage: Storage | null = getStorage()): DriftEntry[] {
  return parseVersioned(storage, DRIFT_TOP_KEY, migrateDriftTop) ?? []
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
  writeVersioned(storage, DRIFT_TOP_KEY, truncated)
  return { top: truncated, entered: truncated.includes(entry) }
}

/** MatchEntry 迁移解析：非数组/条目校验失败回退 []；逐条校验（winner ∈ {P1,P2}、score 有限数、trackId 字符串），保持存储顺序。兼容旧裸数组与新版信封 data */
function migrateMatchTop(raw: unknown): MatchEntry[] | null {
  if (!Array.isArray(raw)) {
    return null
  }
  return raw.filter(
    (e): e is MatchEntry =>
      e !== null &&
      typeof e === 'object' &&
      (e.winner === 'P1' || e.winner === 'P2') &&
      typeof e.p1Score === 'number' &&
      Number.isFinite(e.p1Score) &&
      typeof e.p2Score === 'number' &&
      Number.isFinite(e.p2Score) &&
      typeof e.trackId === 'string',
  )
}

/** 读取分屏漂移对局记录：JSON 损坏/storage 不可用/非数组回退 []；逐条校验（winner ∈ {P1,P2}、score 有限数、trackId 字符串），保持存储顺序 */
export function loadMatchTop(storage: Storage | null = getStorage()): MatchEntry[] {
  return parseVersioned(storage, MATCH_TOP_KEY, migrateMatchTop) ?? []
}

/** 插入一局对局记录（最近 10 局语义）：新局插入数组头部（unshift）→ 截断 MATCH_TOP_MAX → 写回。
 *  entered = 新条目是否留在榜内（被挤出时为 false）；storage 不可用时仅返回内存榜单。 */
export function addMatchResult(
  entry: MatchEntry,
  storage: Storage | null = getStorage(),
): { top: MatchEntry[]; entered: boolean } {
  const top = loadMatchTop(storage)
  top.unshift(entry)
  const truncated = top.slice(0, MATCH_TOP_MAX)
  writeVersioned(storage, MATCH_TOP_KEY, truncated)
  return { top: truncated, entered: truncated.includes(entry) }
}
