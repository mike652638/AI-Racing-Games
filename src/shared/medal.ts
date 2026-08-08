/**
 * 赛道 S/A/B 奖牌判定（M23 方案 7：基于 bot 基准总用时的金/银/铜门槛）。
 * 独立共享层纯函数：无 DOM / 无存档副作用，被 ui/save（存档）、game/finish-accounting
 * （结算判定）、game/top-refresh（菜单展示）共用，避免判定逻辑散落多份。
 * 门槛口径：总用时 ≤ base × MEDAL_GOLD_MULT → S；≤ ×SILVER_MULT → A；≤ ×BRONZE_MULT → B。
 */
import { MEDAL_BRONZE_MULT, MEDAL_GOLD_MULT, MEDAL_SILVER_MULT } from './constants'

/** 奖牌等级（S = 金，A = 银，B = 铜），按等级从高到低排列（存档只升不降的判序依据） */
export type MedalGrade = 'S' | 'A' | 'B'

/** 奖牌等级优先级：索引越小等级越高（S=0 > A=1 > B=2） */
export const MEDAL_GRADE_ORDER: readonly MedalGrade[] = ['S', 'A', 'B']

/** 按 bot 基准总用时判定奖牌等级；未达标（慢于铜牌线）返回 null */
export function medalForTotalSec(baseSec: number, totalSec: number): MedalGrade | null {
  if (totalSec <= baseSec * MEDAL_GOLD_MULT) return 'S'
  if (totalSec <= baseSec * MEDAL_SILVER_MULT) return 'A'
  if (totalSec <= baseSec * MEDAL_BRONZE_MULT) return 'B'
  return null
}

/** 取两档奖牌中更高档（优先级 MEDAL_GRADE_ORDER 判定）；任一为 null 取另一档，双 null 返回 null */
export function higherMedal(a: MedalGrade | null, b: MedalGrade | null): MedalGrade | null {
  if (a === null) return b
  if (b === null) return a
  return MEDAL_GRADE_ORDER.indexOf(a) <= MEDAL_GRADE_ORDER.indexOf(b) ? a : b
}
