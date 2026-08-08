/**
 * M23 方案 7：赛道 S/A/B 奖牌判定单测。
 * 门槛口径：总用时 ≤ base × MEDAL_GOLD_MULT → S；≤ ×SILVER_MULT → A；≤ ×BRONZE_MULT → B。
 */
import { describe, expect, it } from 'vitest'
import { higherMedal, MEDAL_GRADE_ORDER, medalForTotalSec, type MedalGrade } from '../../src/shared/medal'
import { MEDAL_BASE_SEC, MEDAL_BRONZE_MULT, MEDAL_GOLD_MULT, MEDAL_SILVER_MULT } from '../../src/shared/constants'

describe('medalForTotalSec 奖牌判定', () => {
  it('快于金牌线 → S 级', () => {
    // base 100：≤ 100 → S
    expect(medalForTotalSec(100, 90)).toBe('S')
    expect(medalForTotalSec(100, 99.99)).toBe('S')
  })

  it('边界值（恰等于金牌线）→ S 级', () => {
    expect(medalForTotalSec(100, 100 * MEDAL_GOLD_MULT)).toBe('S')
  })

  it('介于金线与银线之间 → A 级', () => {
    expect(medalForTotalSec(100, 105)).toBe('A')
    expect(medalForTotalSec(100, 100 * MEDAL_SILVER_MULT - 0.01)).toBe('A')
  })

  it('介于银线与铜线之间 → B 级', () => {
    expect(medalForTotalSec(100, 120)).toBe('B')
    expect(medalForTotalSec(100, 100 * MEDAL_BRONZE_MULT - 0.01)).toBe('B')
  })

  it('慢于铜牌线 → null（不获牌）', () => {
    expect(medalForTotalSec(100, 200)).toBeNull()
  })

  it('非正 base（未配置赛道）→ null', () => {
    expect(medalForTotalSec(0, 50)).toBeNull()
    expect(medalForTotalSec(-1, 50)).toBeNull()
  })

  it('全部 9 赛道均已配置 bot 基准总用时（正数）', () => {
    expect(Object.keys(MEDAL_BASE_SEC).length).toBeGreaterThanOrEqual(9)
    for (const base of Object.values(MEDAL_BASE_SEC)) {
      expect(base).toBeGreaterThan(0)
    }
  })
})

describe('higherMedal 取高档', () => {
  it('双非空取更高级', () => {
    expect(higherMedal('S', 'A')).toBe('S')
    expect(higherMedal('A', 'B')).toBe('A')
    expect(higherMedal('B', 'S')).toBe('S')
    expect(higherMedal('A', 'A')).toBe('A')
  })

  it('任一 null 取另一档', () => {
    expect(higherMedal(null, 'S')).toBe('S')
    expect(higherMedal('B', null)).toBe('B')
  })

  it('双 null → null', () => {
    expect(higherMedal(null, null)).toBeNull()
  })

  it('MEDAL_GRADE_ORDER 与类型一致（S > A > B）', () => {
    const grades: MedalGrade[] = ['S', 'A', 'B']
    expect(MEDAL_GRADE_ORDER).toEqual(grades)
  })
})
