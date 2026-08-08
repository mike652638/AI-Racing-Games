/**
 * M23 方案 6：成就/解锁系统（2026-08-07）。
 * 纯逻辑层：定义成就列表与「本局是否达成」判定（输入对局结算数据，输出新解锁成就 id 列表）。
 * 存档副作用（loadAchievements/unlockAchievement）在 finish-accounting 调用方执行。
 * 成就分为两类：对局内即时统计（首次 BOOST/完美氮气/连击/near-miss，由 frame-update 维护
 * PlayerState 统计字段）与结算类（奖牌/雨天/夜晚/全赛道，由 finish-accounting 传入）。
 */
import type { RaceState } from '../shared/types'
import { MEDAL_BASE_SEC } from '../shared/constants'
import type { MedalGrade } from '../shared/medal'
import type { TrackManager } from './track-manager'

/** 成就 id 列表（唯一标识；名称/描述文案在 copy.ts 的 ACHIEVEMENTS 定义，供 UI 展示） */
export type AchievementId =
  | 'first-boost'
  | 'perfect-boost'
  | 'combo-5'
  | 'near-miss-3'
  | 'medal-s'
  | 'rain-finish'
  | 'night-finish'
  | 'drift-score-2000'

/** 本局结算时用于成就判定的聚合数据（finish-accounting 在 record 分支构造传入） */
export interface AchievementContext {
  race: RaceState
  trackManager: TrackManager
  /** 本局 P1 判定的奖牌（medalP1，normal 完赛且达标时非 null） */
  medalP1: MedalGrade | null
  /** 本局 P1 是否完赛（含挑战模式限时收束） */
  finishedP1: boolean
  /** 当前对局是否下雨（weatherPhaseAt(P1 raceTime) === 2） */
  wet: boolean
}

/**
 * 判定本局新解锁的成就（去重：跳过已解锁）。纯函数——不读写存档，
 * 返回「应新解锁」的 id 列表，由调用方（finish-accounting）逐条 unlockAchievement 写入。
 * 阈值口径：
 * - first-boost：本局使用过 BOOST（frame-update 维护 boostUsedEver）
 * - perfect-boost：本局触发过完美氮气（boostPerfect 段状态）
 * - combo-5：本局漂移最高连击 ≥ 5（maxCombo）
 * - near-miss-3：本局贴身超车 ≥ 3 次
 * - medal-s：本局获得 S 级奖牌
 * - rain-finish：雨天完赛（P1）
 * - night-finish：夜晚赛道完赛（P1）
 * - drift-score-2000：本局漂移得分 ≥ 2000（含 near-miss 总分）
 */
export function evaluateAchievements(ctx: AchievementContext, alreadyUnlocked: ReadonlySet<string>): AchievementId[] {
  const { race, medalP1, finishedP1, wet } = ctx
  const unlocked: AchievementId[] = []
  const grant = (id: AchievementId): void => {
    if (!alreadyUnlocked.has(id)) {
      unlocked.push(id)
    }
  }

  // 对局内即时统计（P1 为主；分屏 P2 也统计，但成就判定以 P1 为基准）
  if (race.player1.boostUsedEver) grant('first-boost')
  if (race.player1.perfectBoostUsed) grant('perfect-boost')
  if (race.player1.maxCombo >= 5) grant('combo-5')
  if (race.player1.nearMissCount >= 3) grant('near-miss-3')

  // 结算类
  if (medalP1 === 'S') grant('medal-s')
  if (finishedP1 && wet) grant('rain-finish')
  const trackDef = race.tracks[0].def
  // M23 方案 11：night 判定 = 赛道本身夜晚 或 对局天气变体强制夜晚（与渲染 night 语义一致）
  if (finishedP1 && (trackDef.timeOfDay === 'night' || race.weatherOverride === 'night')) grant('night-finish')
  if (Math.round(race.player1.driftState.score + race.player1.nearMissScore) >= 2000) grant('drift-score-2000')

  return unlocked
}

/** 校验 trackId 是否为 9 条正式赛道之一（供「全赛道」类成就判定；当前方案用 MEDAL_BASE_SEC 存在性） */
export function isOfficialTrack(trackId: string): boolean {
  return trackId in MEDAL_BASE_SEC
}
