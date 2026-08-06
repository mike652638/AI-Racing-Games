/**
 * 榜单卡片展开交互（M18 可访问性；rt4 批次自 game-loop.ts 拆分）。
 *
 * M20 重构：改为整体控制——
 * - 移除每张卡片独立 click/keydown toggle（去掉 tabindex / role=button）
 * - master 按钮 #lb-toggle-all 一次性展开/收起三张卡片
 * - 桌面/横屏默认全部展开（class="expanded" + aria-expanded="true"）；
 *   竖屏默认收起（P3-⑤：三卡纵向堆叠占高约 300px，首屏空间优先赛道选择）
 * - 折叠时隐藏卡片 body；展开时按 data-target 刷新对应榜单内容
 */
export interface LeaderboardRefreshers {
  driftTop: () => void
  matchTop: () => void
  bestSummary: () => void
}

/**
 * 绑定整体 master 切换按钮 + 初始化卡片状态。
 * onCleanup：监听清理登记回调（GameLoop.destroy 时统一移除，S 修复 S3 契约）。
 */
export function bindLeaderboardCards(refreshers: LeaderboardRefreshers, onCleanup: (fn: () => void) => void): void {
  const cards = document.querySelectorAll?.('.lb-card') ?? []
  const master = document.getElementById('lb-toggle-all') as HTMLButtonElement | null

  /** 同步 master 按钮文案与状态——根据当前所有卡片中是否有任一收起判断 */
  const syncMaster = (): void => {
    if (!master) return
    const anyCollapsed = Array.from(cards).some((c) => !c.classList.contains('expanded'))
    // 按钮文案：当前任一收起 → 显示「展开」；全部展开 → 显示「收起」
    const nextText = anyCollapsed ? '展开' : '收起'
    const textEl = master.querySelector?.('.lb-toggle-text')
    if (textEl) textEl.textContent = nextText
    if (typeof master.setAttribute === 'function') {
      master.setAttribute('aria-expanded', String(!anyCollapsed))
    }
    if (typeof master.classList?.toggle === 'function') {
      master.classList.toggle('collapsed', anyCollapsed)
    }
  }

  /** 应用展开/收起 + 刷新对应榜单 */
  const applyAll = (expand: boolean): void => {
    cards.forEach((card) => {
      const el = card as HTMLElement
      if (typeof el.classList?.toggle === 'function') {
        el.classList.toggle('expanded', expand)
      }
      if (typeof el.setAttribute === 'function') {
        el.setAttribute('aria-expanded', String(expand))
      }
      const target = el.getAttribute?.('data-target')
      // 仅展开时刷新（收起态下 body 已折叠，无需渲染）
      if (expand) {
        if (target === 'drift-top') refreshers.driftTop()
        else if (target === 'match-top') refreshers.matchTop()
        else if (target === 'best-summary') refreshers.bestSummary()
      }
    })
    syncMaster()
  }

  if (master && typeof master.addEventListener === 'function') {
    const onClick = (): void => {
      const anyCollapsed = Array.from(cards).some((c) => !c.classList.contains('expanded'))
      // 任一收起 → 全部展开；全部展开 → 全部收起
      applyAll(anyCollapsed)
    }
    master.addEventListener('click', onClick)
    onCleanup(() => master.removeEventListener('click', onClick))
  }

  // M20：页面初始化默认全部展开 + 刷新三个榜单 + 同步 master 按钮；
  // P3-⑤（2026-08-06）：竖屏默认收起——三卡纵向堆叠在竖屏首屏占高约 300px，
  // 赛道选择与开始按钮优先；用户点 master 展开时按需刷新（收起态无需渲染）。
  // 竖屏判定与 portrait-mode.ts 的 isPortraitViewport 同源（异常环境降级为横屏行为）。
  let portrait = false
  try {
    portrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  } catch {
    /* 忽略 */
  }
  applyAll(!portrait)
}
