import { lapFromZ } from '../shared/lap'
import {
  addDriftScore,
  addMatchResult,
  loadAchievements,
  loadDaily,
  recordWin,
  saveDaily,
  saveMedal,
  unlockAchievement,
  type WinStats,
} from '../ui/save'
import { MEDAL_BASE_SEC } from '../shared/constants'
import { medalForTotalSec, type MedalGrade } from '../shared/medal'
import { resolveWeatherPhase } from '../engine/lighting'
import { evaluateAchievements, type AchievementId } from './achievements'
import { markDailyFinished, rollDailyToToday, shouldCompleteDaily, todayDateString } from './daily'
import type { ModeStrategy } from './mode-strategy'
import type { RaceState } from '../shared/types'
import type { TrackManager } from './track-manager'

/**
 * 结算记账纯函数（Task E 抽取自 game-loop.ts applyPhase 的结算块）：
 * finishedP1/finishedP2 判定、recordWin/addDriftScore/addMatchResult 的调用参数计算、
 * 漂移获胜者判定（分屏双完赛按漂移得分比较，得分平局归 P1）。
 * DOM 副作用（refreshDriftTop/refreshMatchTop 榜单刷新、applyPhaseToScreens）留在 GameLoop。
 */
export interface FinishAccountingArgs {
  race: RaceState
  trackManager: TrackManager
  mode: ModeStrategy
  /** 热座当前回合玩家（round 2 时按 P1/P2 用时比较胜负） */
  hotseatPlayer: 1 | 2
  /** 热座 P1 回合完赛用时快照（交棒时快照，供 round 2 结算胜负比较） */
  prevP1Time: number | null
  /**
   * 是否执行记账写入（recordWin/addDriftScore/addMatchResult）：
   * 仅首次进入完赛时 true（finishShown 守卫防 ESC 重入重复计数）；
   * finishedP1/finishedP2/driftWinner 恒计算（applyPhaseToScreens 各阶段均需）。
   */
  record: boolean
  /** M28 方案 14：每日挑战模式是否启用（?daily=1；缺省启用可配置关闭，与 record 同守卫） */
  dailyModeEnabled?: boolean
}

/** 结算记账结果：双人完赛标记、漂移竞速胜者与最新胜场统计（非分胜负时为 null） */
export interface FinishAccountingResult {
  finishedP1: boolean
  finishedP2: boolean
  /** 分屏漂移竞速胜者：仅分屏且双完赛时按漂移得分比较（平局归 P1）；否则 null（热座/单屏恒 null） */
  driftWinner: 'P1' | 'P2' | null
  /** 胜场统计：仅首次进入完赛且分胜负时记录（平手/单人恒 null） */
  winStats: WinStats | null
  /**
   * P1 漂移榜名次（2026-08-05 审计 F-3）：直接消费 addDriftScore 返回的插入位置，
   * 替代旧版 screens.ts 的 findIndex 同分回查（同分误判/挤出榜外显示空）；
   * 0 = 未入 TOP10 或未记录（record=false/零分/挤出榜外）。
   */
  driftRankP1: number
  /**
   * M23 方案 7：本次 P1 完赛结算判定的奖牌等级（S/A/B，按 bot 基准总用时门槛）。
   * 仅 normal 完赛（非挑战）时判定并保存；未完赛/挑战模式为 null。
   */
  medalP1: MedalGrade | null
  /** M23 方案 7：P2 完赛判定的奖牌等级（分屏/热座 P2 回合有效），否则 null */
  medalP2: MedalGrade | null
  /** M23 方案 6：本局新解锁的成就 id（仅 record=true 时检测；防重复解锁由 unlockAchievement 幂等兜底） */
  newlyUnlockedAchievements: AchievementId[]
  /** M28 方案 14：本局是否完成今日挑战（首次进入完赛且赛道匹配时 true；供 GameLoop 展示结算与菜单刷新） */
  dailyDoneToday: boolean
}

/**
 * 结算记账（纯函数）：语义与旧 GameLoop.applyPhase 的结算块逐行一致——
 * 完赛标记按各玩家本世界圈长/总圈数计算（单屏时 P2 恒 false）；
 * 热座与分屏共用 finishedP2（P2 回合玩家2 跑完触发，P1 回合玩家2 静止不会误触）。
 * 记账部分（record 为 true 时）：热座 round 2 按 P1/P2 用时比较（平手不记）、
 * 分屏双完赛复用 driftWinner、单人恒 null；漂移 TOP10 各完赛玩家正分记录
 * （热座 round 1 只记 P1、round 2 只记 P2，天然不重复）；分屏双完赛记录漂移对局。
 */
export function accountFinish(args: FinishAccountingArgs): FinishAccountingResult {
  const { race, trackManager, mode, hotseatPlayer, prevP1Time, record } = args
  // M28 方案 14：每日挑战模式（缺省启用；完赛时检测今日赛道完成并累计 streak）
  const dailyModeEnabled = args.dailyModeEnabled !== false

  // 完赛标记：按各玩家本世界圈长/总圈数计算（单屏时 P2 恒 false；FINISHED 时 cameraZ 已随帧推进可靠）。
  // M28 方案 9：路线模式完赛——终点阶段跑满 1 圈（lapFromZ > 1）即完赛（每段独立赛道，
  // 不按各段 def.laps 判定——GameLoop 段切换会把 cameraZ 保持在段内推进）。
  const routeMode = mode.routeMode
  const finishedP1 = routeMode
    ? race.routeIsFinish && lapFromZ(race.player1.cameraZ, trackManager.getLapLength(0)) > 1
    : lapFromZ(race.player1.cameraZ, trackManager.getLapLength(0)) > trackManager.getTotalLaps(0)
  const finishedP2 =
    (mode.splitMode || mode.hotseatMode) &&
    lapFromZ(race.player2.cameraZ, trackManager.getLapLength(1)) > trackManager.getTotalLaps(1)
  // 分屏漂移竞速胜者：仅分屏且双完赛时按漂移得分比较（平局归 P1）；否则 null（热座/单屏恒 null）
  const driftWinner =
    mode.splitMode && finishedP1 && finishedP2
      ? Math.round(race.player1.driftState.score) >= Math.round(race.player2.driftState.score)
        ? 'P1'
        : 'P2'
      : null

  // M23 方案 7：奖牌判定——按各玩家世界赛道 bot 基准总用时门槛（仅 normal 完赛，
  // 挑战模式无圈数概念不判；分屏/热座 P2 按玩家2 世界赛道判定）。
  // 判定在 record 块内执行（首次进入完赛）并写入存档（只升不降）。
  let medalP1: MedalGrade | null = null
  let medalP2: MedalGrade | null = null
  // M23 方案 6：本局新解锁成就列表（record 分支内填充）
  const newlyUnlockedAchievements: AchievementId[] = []
  // M28 方案 14：本局是否完成今日挑战（record 分支内填充；默认 false）
  let dailyDoneToday = false

  let winStats: WinStats | null = null
  let driftRankP1 = 0
  if (record) {
    // M28 方案 9：路线模式完赛仅累计跨段时间/得分（结算展示），不写漂移榜/奖牌/胜场——
    // 每段不同赛道，单赛道语义的榜单与奖牌不适用；成就在 record 块末尾仍评估（天气/完赛类）
    if (mode.routeMode) {
      race.routeCumulativeTime += race.player1.raceTime
      race.routeCumulativeDriftScore += Math.round(race.player1.driftState.score + race.player1.nearMissScore)
      // 成就评估复用下方公共块（提前 return 会在注释下方，保留结构）
      const alreadyUnlocked = loadAchievements()
      for (const id of evaluateAchievements(
        {
          race,
          trackManager,
          medalP1: null,
          finishedP1,
          wet: resolveWeatherPhase(race.weatherOverride, race.player1.raceTime) === 2,
        },
        alreadyUnlocked,
      )) {
        if (unlockAchievement(id)) {
          newlyUnlockedAchievements.push(id)
        }
      }
      return {
        finishedP1,
        finishedP2,
        driftWinner,
        winStats,
        driftRankP1,
        medalP1,
        medalP2,
        newlyUnlockedAchievements,
        dailyDoneToday,
      }
    }
    if (finishedP1 && !mode.challengeMode) {
      const base1 = MEDAL_BASE_SEC[trackManager.getTrackId(0)]
      if (base1 !== undefined) {
        const grade = medalForTotalSec(base1, race.player1.raceTime)
        if (grade !== null) {
          saveMedal(trackManager.getTrackId(0), grade)
          medalP1 = grade
        }
      }
    }
    if (finishedP2 && (mode.splitMode || mode.hotseatMode)) {
      const base2 = MEDAL_BASE_SEC[trackManager.getTrackId(1)]
      if (base2 !== undefined) {
        const grade = medalForTotalSec(base2, race.player2.raceTime)
        if (grade !== null) {
          saveMedal(trackManager.getTrackId(1), grade)
          medalP2 = grade
        }
      }
    }
    // 胜场统计：仅首次进入完赛时记录（finishShown 守卫防 ESC 重入重复计数）——
    // 热座 round 2 按 P1/P2 用时比较（平手不记）、分屏双完赛复用 driftWinner、单人恒 null；
    // 漂移 TOP10 同守卫：各完赛玩家正分记录（热座 round 1 只记 P1、round 2 只记 P2，天然不重复）
    let winner: 'P1' | 'P2' | null = null
    if (mode.hotseatMode && hotseatPlayer === 2 && prevP1Time !== null) {
      const t1 = prevP1Time
      const t2 = race.player2.raceTime
      winner = t1 < t2 ? 'P1' : t1 > t2 ? 'P2' : null
    } else if (mode.splitMode && finishedP1 && finishedP2) {
      winner = driftWinner
    }
    if (winner) {
      winStats = recordWin(mode.hotseatMode ? 'hotseat' : 'split', winner)
    }
    // G1（G1）：挑战模式无圈数完赛标记——P1 记分条件放宽为「完赛或挑战模式」且正分
    if ((finishedP1 || mode.challengeMode) && Math.round(race.player1.driftState.score) > 0) {
      const p1Entry = {
        player: 'P1' as const,
        trackId: trackManager.getTrackId(0),
        score: Math.round(race.player1.driftState.score),
        time: race.player1.raceTime,
        // H4（H4）：记录最高连击档位（排行榜权重展示）
        combo: Math.round(race.player1.driftState.combo),
      }
      // F-3（2026-08-05 审计）：名次直接取插入后的榜内位置（引用 indexOf 精确匹配本条），
      // 被挤出 TOP10（entered=false）保持 0 → 结算面板显示「未进 TOP10」
      const { top, entered } = addDriftScore(p1Entry)
      if (entered) driftRankP1 = top.indexOf(p1Entry) + 1
    }
    // 挑战模式单屏：P2 恒不参与记分（finishedP2 恒 false，条件天然跳过）
    if (finishedP2 && (mode.splitMode || mode.hotseatMode) && Math.round(race.player2.driftState.score) > 0) {
      addDriftScore({
        player: 'P2',
        trackId: trackManager.getTrackId(1),
        score: Math.round(race.player2.driftState.score),
        time: race.player2.raceTime,
        combo: Math.round(race.player2.driftState.combo),
      })
    }
    // M11 F2：分屏双完赛记录漂移对局（最近 10 局，driftWinner 在双完赛时恒非 null，平局归 P1）
    if (mode.splitMode && finishedP1 && finishedP2) {
      addMatchResult({
        winner: driftWinner ?? 'P1',
        p1Score: Math.round(race.player1.driftState.score),
        p2Score: Math.round(race.player2.driftState.score),
        trackId: trackManager.getTrackId(0),
      })
    }
    // M23 方案 6：成就检测与解锁（首次进入完赛时评估；unlockAchievement 幂等兜底防重复）
    // M23 方案 11：wet 判定走 resolveWeatherPhase 单一真源（对局天气变体覆盖）
    const alreadyUnlocked = loadAchievements()
    for (const id of evaluateAchievements(
      {
        race,
        trackManager,
        medalP1,
        finishedP1,
        wet: resolveWeatherPhase(race.weatherOverride, race.player1.raceTime) === 2,
      },
      alreadyUnlocked,
    )) {
      if (unlockAchievement(id)) {
        newlyUnlockedAchievements.push(id)
      }
    }
    // M28 方案 14：每日挑战完成判定——今日赛道 + P1 完赛即完成（roll 到今日→判定→完成→存档）。
    // 分屏 P2 也判定（P2 世界赛道 == 今日赛道且 P2 完赛）；返回 dailyDoneToday 供结算/菜单刷新。
    const today = todayDateString()
    const daily = rollDailyToToday(loadDaily(), today)
    saveDaily(daily) // 即使未完成也确保日期已滚动（跨日首次进入即刷新今日赛道）
    if (shouldCompleteDaily(daily, finishedP1, trackManager.getTrackId(0), dailyModeEnabled)) {
      const done = markDailyFinished(daily)
      saveDaily(done)
      dailyDoneToday = true
    } else if (
      dailyModeEnabled &&
      (mode.splitMode || mode.hotseatMode) &&
      finishedP2 &&
      trackManager.getTrackId(1) === daily.trackId
    ) {
      const done = markDailyFinished(daily)
      saveDaily(done)
      dailyDoneToday = true
    }
  }

  return {
    finishedP1,
    finishedP2,
    driftWinner,
    winStats,
    driftRankP1,
    medalP1,
    medalP2,
    newlyUnlockedAchievements,
    dailyDoneToday,
  }
}
