import { getTrackDef, TRACK_DEFS } from '../engine/tracks'
import { formatTime } from '../ui/format'
import { loadBestTimeFor, loadDriftTop, loadMatchTop } from '../ui/save'

/**
 * 菜单排行榜 DOM 刷新（Task D 拆分自 game-loop.ts）：
 * 三个无 this 依赖的独立函数，直接 document.getElementById 防御式访问，
 * 行为与拆分前类方法逐字节一致。调用点：GameLoop 构造器末尾与 applyPhase 内。
 */

/** 榜单卡片是否处于展开态（.expanded，点击卡片切换；元素无 closest 能力时视为收起） */
function isCardExpanded(el: HTMLElement): boolean {
  if (typeof el.closest !== 'function') {
    return false
  }
  const card = el.closest('.lb-card')
  if (!card || typeof card.classList.contains !== 'function') {
    return false
  }
  return card.classList.contains('expanded')
}

/** 刷新菜单漂移 TOP10 榜单（#drift-top，菜单静态元素）：收起时取前 5 条，展开时全量 10 条 */
export function refreshDriftTop(): void {
  const el = document.getElementById('drift-top')
  if (!el) {
    return
  }
  const top = loadDriftTop().slice(0, isCardExpanded(el) ? 10 : 5)
  el.textContent =
    top.length === 0
      ? '暂无漂移记录'
      : top
          .map(
            (e, i) =>
              `${i + 1}. ${e.player} · ${e.score} 分 · ${getTrackDef(e.trackId)?.name ?? e.trackId}` +
              // H4（H4）：最高连击档位 → ` · 连击 x倍率`（1 + combo*0.25）；旧条目无 combo 不追加
              (e.combo ? ` · 连击 x${(1 + e.combo * 0.25).toFixed(2)}` : ''),
          )
          .join('\n')
}

/**
 * 刷新菜单各赛道 BEST 汇总（#best-summary，菜单静态元素）：遍历 TRACK_DEFS 读 P1/P2 最佳圈速，
 * 仅显示有至少一条纪录的赛道行（无记录赛道隐藏，不显示 "--"）。
 * 卡片可点击展开：收起时取前 5 条有记录的赛道行、展开时全部（与 #drift-top/#match-top 同交互）。
 * 全部赛道均无任何纪录时显示占位文本（与 #drift-top 的"暂无漂移记录"风格一致）。
 */
export function refreshBestSummary(): void {
  const el = document.getElementById('best-summary')
  if (!el) {
    return
  }
  const lines: string[] = []
  TRACK_DEFS.forEach((def, i) => {
    const t1 = loadBestTimeFor(0, def.id)
    const t2 = loadBestTimeFor(1, def.id)
    // 双人均无纪录时跳过该赛道行（隐藏而非显示 "--"）
    if (t1 === null && t2 === null) return
    const p1 = t1 !== null ? formatTime(t1) : '--'
    const p2 = t2 !== null ? ` · P2 ${formatTime(t2)}` : ''
    lines.push(`${i + 1}. ${def.name}  P1 ${p1}${p2}`)
  })
  const visible = isCardExpanded(el) ? lines : lines.slice(0, 5)
  el.textContent = visible.length > 0 ? visible.join('\n') : '暂无最佳成绩'
}

/**
 * 刷新菜单分屏漂移对局 TOP10（#match-top，菜单静态元素）：收起时取前 5 条、展开时全量 10 条
 * （`${i+1}. ${winner} 胜 · ${p1Score}:${p2Score} · ${getTrackDef(trackId)?.name ?? trackId}`），
 * 无记录显示占位文本（仿 refreshDriftTop 模式）。
 */
export function refreshMatchTop(): void {
  const el = document.getElementById('match-top')
  if (!el) {
    return
  }
  const top = loadMatchTop().slice(0, isCardExpanded(el) ? 10 : 5)
  el.textContent =
    top.length === 0
      ? '暂无对局记录'
      : top
          .map(
            (e, i) =>
              `${i + 1}. ${e.winner} 胜 · ${e.p1Score}:${e.p2Score} · ${getTrackDef(e.trackId)?.name ?? e.trackId}`,
          )
          .join('\n')
}
