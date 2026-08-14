import { TRACK_DEFS } from '../engine/tracks'
import { loadMedal } from '../ui/save'
import { MEDAL_LABEL } from '../ui/copy'

/**
 * 赛道选项卡构建（M34 拆分自 game-loop.ts buildTrackOptions）：星级 filled/empty 双 span、
 * 难度色相类/aria、奖牌徽章与 click/keydown/hover 四类监听。回调与守卫注入式传递（可单测）。
 */

/** 赛道难度星级文案（下标即难度；纯星级，title/aria-label 各自加"难度："前缀，2026-08-05 D-2 修复重复前缀） */
const DIFFICULTY_HINT: Record<number, string> = {
  1: '★☆☆',
  2: '★★☆',
  3: '★★★',
}

export interface TrackCardArgs {
  /** 元素查询（track-option-${i}） */
  getElement: (id: string) => HTMLElement | null
  /** 菜单阶段守卫（点击/键盘/hover 仅在 PHASE_MENU 生效） */
  isMenuPhase: () => boolean
  /** 选择赛道回调（等价键盘 1-9；热座双人同步由调用方负责） */
  onSelect: (trackIndex: number) => void
  /** hover 预览恢复目标读取（mouseleave 恢复当前选中赛道） */
  getPreviewIndex: () => number
  /** 清理登记（destroy() 时移除监听） */
  onCleanup: (fn: () => void) => void
  /** 中央缩略图预览应用（hover 临时预览与初始显示） */
  applyPreview: (trackIndex: number) => void
}

/** 构建赛道选项元素（按 TRACK_DEFS 数量动态构建）：按钮文本 序号+名称+难度星级，点击等价键盘 1-9 */
export function buildTrackCards(args: TrackCardArgs): HTMLDivElement[] {
  const { getElement, isMenuPhase, onSelect, getPreviewIndex, onCleanup, applyPreview } = args
  const trackOptions = Array.from(
    { length: TRACK_DEFS.length },
    (_, i) => getElement(`track-option-${i}`) as HTMLDivElement | null,
  )
  trackOptions.forEach((option, i) => {
    const def = TRACK_DEFS[i]
    // m4：优先写入结构化 .track-label（序号徽章 + 名称 + 星级 span），缺失时回退纯文本
    const label = option?.querySelector('.track-label')
    const nameEl = label?.querySelector<HTMLElement>('.track-name')
    const starsEl = label?.querySelector<HTMLElement>('.track-stars')
    const text = `${i + 1} ${def.name} ${'★'.repeat(def.difficulty)}${'☆'.repeat(3 - def.difficulty)}`
    if (option && nameEl && starsEl) {
      nameEl.textContent = def.name
      // M-4（菜单审计）：星级拆分 filled/empty 双 span——空星 ☆ 降不透明度（CSS .stars-empty），
      // 难度一眼可辨；diff-N 色相编码与 aria-label 保持不变。
      // innerHTML 收敛（2026-08-05 rt4 批次）：静态星级串改 DOM API 构建，零 HTML 注入面
      starsEl.textContent = ''
      const filled = document.createElement('span')
      filled.className = 'stars-filled'
      filled.textContent = '★'.repeat(def.difficulty)
      const empty = document.createElement('span')
      empty.className = 'stars-empty'
      empty.textContent = '☆'.repeat(3 - def.difficulty)
      starsEl.appendChild(filled)
      starsEl.appendChild(empty)
      // 星级颜色编码（diff-1 绿 / diff-2 金 / diff-3 粉红）+ 难度 title 提示
      starsEl.className = `track-stars diff-${def.difficulty}`
      starsEl.title = `难度：${DIFFICULTY_HINT[def.difficulty]}`
      if (typeof starsEl.setAttribute === 'function') {
        starsEl.setAttribute('aria-label', `难度：${DIFFICULTY_HINT[def.difficulty]}`)
      }
      // M23 方案 7：赛道已得奖牌（S/A/B）在星级后追加徽章（无奖牌不加，避免空 DOM）
      const medal = loadMedal(def.id)
      if (medal && typeof label?.appendChild === 'function') {
        const medalEl = document.createElement('span')
        medalEl.className = 'track-medal'
        medalEl.textContent = MEDAL_LABEL[medal]
        medalEl.title = `赛道奖牌 ${MEDAL_LABEL[medal]}`
        label.appendChild(medalEl)
      }
    } else if (label) label.textContent = text
    else if (option) option.textContent = text
    if (!option) return
    // 菜单点击选赛道（触屏/鼠标均可）：等价于键盘 1-9；热座双人同步 P2 世界
    const onClick = (): void => {
      if (!isMenuPhase()) return
      onSelect(i)
    }
    option.addEventListener('click', onClick)
    // 键盘可访问性：聚焦按钮上 Enter/Space 等效点击（菜单阶段）
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.code === 'Enter' || e.code === 'Space') && isMenuPhase()) {
        e.preventDefault()
        onSelect(i)
      }
    }
    option.addEventListener('keydown', onKeyDown)
    // P3-③（2026-08-06）：hover 预览联动——悬停某赛道卡临时预览该赛道，
    // 移出（或悬停下方开始按钮）恢复显示当前选中赛道（previewTrackIndex 由 selectTrackFor 同步）
    const onMouseEnter = (): void => {
      if (!isMenuPhase()) return
      applyPreview(i)
    }
    const onMouseLeave = (): void => {
      if (!isMenuPhase()) return
      applyPreview(getPreviewIndex())
    }
    option.addEventListener('mouseenter', onMouseEnter)
    option.addEventListener('mouseleave', onMouseLeave)
    // S 修复 S3：监听经清理函数登记（destroy() 时移除）
    onCleanup(() => {
      option.removeEventListener('click', onClick)
      option.removeEventListener('keydown', onKeyDown)
      option.removeEventListener('mouseenter', onMouseEnter)
      option.removeEventListener('mouseleave', onMouseLeave)
    })
  })
  // 低优①：中央信息区赛道缩略图（controlPoints 积分生成 SVG 轨迹，初始显示 0 号赛道）
  applyPreview(0)
  return trackOptions as HTMLDivElement[]
}

/** 菜单方向键 3x3 网格导航目标下标（M34 提取自 game-loop.ts onKeyDown；越界 clamp） */
export function nextGridTrackIndex(code: string, cur: number, cols: number, count: number): number {
  const move = code === 'ArrowLeft' ? -1 : code === 'ArrowRight' ? 1 : code === 'ArrowUp' ? -cols : cols
  return Math.min(count - 1, Math.max(0, cur + move))
}
