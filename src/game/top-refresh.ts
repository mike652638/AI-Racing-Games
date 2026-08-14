import { getTrackDef, TRACK_DEFS } from '../engine/tracks'
import { formatTime } from '../ui/format'
import {
  achievementProgress,
  loadAchievements,
  loadBestTimeFor,
  loadDaily,
  loadMedal,
  pruneDriftTop,
  pruneMatchTop,
  saveDaily,
} from '../ui/save'
import {
  ACHIEVEMENTS,
  BEST_EMPTY_HINT,
  DAILY_PROGRESS_PREFIX,
  DRIFT_EMPTY_HINT,
  MATCH_EMPTY_HINT,
  MEDAL_LABEL,
} from '../ui/copy'
import { COMBO_MULTIPLIER_STEP } from '../shared/constants'
import { rollDailyToToday, todayDateString } from './daily'

/** M27 优化：当前正式赛道 id 白名单（惰性清理榜单中旧版本废弃/被篡改的 trackId 条目） */
const VALID_TRACK_IDS: ReadonlySet<string> = new Set(TRACK_DEFS.map((def) => def.id))

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

/**
 * M-3（菜单审计）：按行数同步 .scrollable 类——条目 >8 行才允许卡片内滚，
 * 其余情况 CSS overflow:hidden 消除嵌套滚动陷阱（滚轮悬停卡片不再被捕获）。
 * 内滚仅在展开态生效（LB-Z2：CSS 限定 .expanded .scrollable，收起态残留类不再可滚）。
 * 测试 stub 元素无 classList.toggle 时安全跳过。
 */
function syncScrollable(el: HTMLElement): void {
  if (typeof el.classList?.toggle !== 'function') return
  const lines = el.textContent ? el.textContent.split('\n').length : 0
  el.classList.toggle('scrollable', lines > 8)
}

/**
 * LB-Z3（榜单专项审计）：内容被 max-height 裁切时加 .clipped（CSS 底部渐隐提示）——
 * 实测收起态 5 条×2 行=196px 仅显 120px，第 4 条拦腰截断无提示误导用户以为只有 3 条。
 * 布局属性在测试 stub（无真实布局，scrollHeight=undefined）上安全回退不加类。
 */
function syncClipped(el: HTMLElement): void {
  if (typeof el.classList?.toggle !== 'function') return
  if (typeof el.scrollHeight !== 'number' || typeof el.clientHeight !== 'number') return
  el.classList.toggle('clipped', el.scrollHeight > el.clientHeight + 2)
}

/**
 * 刷新菜单漂移 TOP10 榜单（#drift-top，菜单静态元素）：收起时取前 5 条，展开时全量 10 条。
 * S 修复（trackId 校验）：未知 trackId（localStorage 被篡改/旧版本废弃赛道）不再原样回显
 * 到 DOM，统一降级为占位文案「未知赛道」（消除自我攻击面：篡改值仅影响本机展示）。
 */
export function refreshDriftTop(): void {
  const el = document.getElementById('drift-top')
  if (!el) {
    return
  }
  // M27 优化：惰性清理无效 trackId 条目（返回清理后榜单；无无效条目时零写回）
  const top = pruneDriftTop(VALID_TRACK_IDS).slice(0, isCardExpanded(el) ? 10 : 5)
  el.textContent =
    top.length === 0
      ? `暂无漂移记录\n${DRIFT_EMPTY_HINT}`
      : top
          .map(
            (e, i) =>
              // M20：极简单行格式——去掉所有「·」与「连击」字节省字符，
              // "1. P1  800分  经典赛道  x1.50" 在 11px 字号 + 224px 卡片宽下单行不换行
              `${i + 1}. ${e.player}  ${e.score}分  ${getTrackDef(e.trackId)?.name ?? '未知赛道'}` +
              // H4（H4）：最高连击档位 → ` x倍率`（1 + combo*COMBO_MULTIPLIER_STEP）；旧条目无 combo 不追加
              (e.combo ? `  x${(1 + e.combo * COMBO_MULTIPLIER_STEP).toFixed(2)}` : ''),
          )
          .join('\n')
  syncScrollable(el)
  syncClipped(el)
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
  // 2026-08-05 LB-2：编号重排——仅对有记录的赛道递增编号（1, 2, 3...），
  // 修复原"trackDefIndex +1"导致的"1, 3, 5"跳号（用户误以为数据丢失）。
  // trackDefIndex 仍可读，仅作为内部索引；显示名次用 rank 递增。
  let rank = 0
  TRACK_DEFS.forEach((def) => {
    const t1 = loadBestTimeFor(0, def.id)
    const t2 = loadBestTimeFor(1, def.id)
    // 双人均无纪录时跳过该赛道行（隐藏而非显示 "--"）
    if (t1 === null && t2 === null) return
    rank++
    const p1 = t1 !== null ? formatTime(t1) : '--'
    // M20：去掉「·」分隔符，与漂移/对局榜单统一紧凑单行格式——
    // 单行"1. 经典赛道  P1 0:49.899  P2 0:51.335" 在 340px 宽屏卡片内不换行
    const p2 = t2 !== null ? `  P2 ${formatTime(t2)}` : ''
    // M23 方案 7：赛道已得奖牌（S/A/B）在赛道名后展示（如 "1. 经典赛道 S  P1 0:49.899"）
    const medal = loadMedal(def.id)
    const medalMark = medal ? ` ${MEDAL_LABEL[medal]}` : ''
    lines.push(`${rank}. ${def.name}${medalMark}  P1 ${p1}${p2}`)
  })
  const visible = isCardExpanded(el) ? lines : lines.slice(0, 5)
  el.textContent = visible.length > 0 ? visible.join('\n') : `暂无最佳成绩\n${BEST_EMPTY_HINT}`
  syncScrollable(el)
  syncClipped(el)
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
  // M27 优化：惰性清理无效 trackId 条目（返回清理后榜单；无无效条目时零写回）
  const top = pruneMatchTop(VALID_TRACK_IDS).slice(0, isCardExpanded(el) ? 10 : 5)
  el.textContent =
    top.length === 0
      ? `暂无对局记录\n${MATCH_EMPTY_HINT}`
      : top
          .map(
            (e, i) =>
              // M20：紧凑单行格式（去掉「·」分隔符，多空格分隔）——
              // 与漂移榜单格式统一，单行容纳便于在 340px 宽屏卡片内不换行
              `${i + 1}. ${e.winner}胜  ${e.p1Score}:${e.p2Score}  ${getTrackDef(e.trackId)?.name ?? '未知赛道'}`,
          )
          .join('\n')
  syncScrollable(el)
  syncClipped(el)
}

/**
 * 刷新菜单成就进度（#achievement-progress，M23 方案 6）：
 * 显示「成就 X/N」+ 已解锁成就名称列表（title 提示悬停可见）。
 */
export function refreshAchievementProgress(): void {
  const el = document.getElementById('achievement-progress')
  if (!el) {
    return
  }
  const { unlocked, total } = achievementProgress()
  const names = [...loadAchievements()].map((id) => ACHIEVEMENTS[id]?.name ?? id).join(' / ')
  el.textContent = `成就 ${unlocked}/${total}`
  if (unlocked > 0) {
    el.title = `已解锁：${names}`
  } else {
    el.title = '完成目标解锁成就徽章'
  }
}

/**
 * 菜单板块整体刷新（M34 收敛 game-loop.ts 构造器末尾与 applyPhase MENU 块两处同源调用）：
 * 漂移榜/BEST 汇总/对局榜/成就进度 + 每日挑战进度（?daily=0 关闭时清空元素）。
 */
export function refreshMenuBoard(dailyModeEnabled: boolean): void {
  refreshDriftTop()
  refreshBestSummary()
  refreshMatchTop()
  // M23 方案 6：菜单成就进度刷新（构造时/回菜单时——本局可能有新解锁）
  refreshAchievementProgress()
  // M28 方案 14：菜单每日挑战进度刷新（构造时/回菜单时，含跨日滚动；?daily=0 关闭时清空元素）
  if (dailyModeEnabled) {
    refreshDailyProgress()
  } else {
    const dailyEl = document.getElementById('daily-progress')
    if (dailyEl) dailyEl.textContent = ''
  }
}

/**
 * 刷新菜单每日挑战进度（#daily-progress，M28 方案 14）：
 * 显示「今日挑战 · <赛道名> · 已完成/未完成 · 连续 N 天」。
 * 跨日自动滚动今日赛道并回写（rollDailyToToday），title 悬停展示详情。
 */
export function refreshDailyProgress(): void {
  const el = document.getElementById('daily-progress')
  if (!el) {
    return
  }
  const today = todayDateString()
  const daily = rollDailyToToday(loadDaily(), today)
  saveDaily(daily) // 跨日滚动持久化（同日期无写回副作用）
  const trackName = getTrackDef(daily.trackId)?.name ?? daily.trackId
  const status = daily.done ? '已完成' : '未完成'
  el.textContent = `${DAILY_PROGRESS_PREFIX} · ${trackName} · ${status} · 连续 ${daily.streak} 天`
  el.title = `今日挑战：在「${trackName}」完赛即可完成；连续签到 ${daily.streak} 天`
}
