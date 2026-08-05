/**
 * 榜单卡片展开交互（M18 可访问性；rt4 批次自 game-loop.ts 拆分）：
 * 点击 / Enter / Space 切换 .expanded + aria-expanded；互斥展开——展开一个时自动收起其他
 * （UX-5：防三面板同展把开始按钮顶出视口）；展开后按 data-target 刷新对应榜单内容。
 */
export interface LeaderboardRefreshers {
  driftTop: () => void
  matchTop: () => void
  bestSummary: () => void
}

/**
 * 绑定全部 .lb-card-clickable 卡片。
 * onCleanup：监听清理登记回调（GameLoop.destroy 时统一移除，S 修复 S3 契约）。
 */
export function bindLeaderboardCards(refreshers: LeaderboardRefreshers, onCleanup: (fn: () => void) => void): void {
  const cards = document.querySelectorAll?.('.lb-card-clickable') ?? []
  const updateAria = (c: Element): void => {
    if (typeof c.setAttribute === 'function') {
      c.setAttribute('aria-expanded', String(c.classList.contains('expanded')))
    }
  }
  const toggleCard = (card: Element): void => {
    const willExpand = !card.classList.contains('expanded')
    if (willExpand) {
      cards.forEach((other) => {
        if (other !== card) {
          other.classList.remove('expanded')
          updateAria(other)
        }
      })
    }
    card.classList.toggle('expanded')
    updateAria(card)
    const target = card.getAttribute?.('data-target')
    if (target === 'drift-top') refreshers.driftTop()
    else if (target === 'match-top') refreshers.matchTop()
    else if (target === 'best-summary') refreshers.bestSummary()
  }
  cards.forEach((card) => {
    const onCardClick = (): void => toggleCard(card)
    const onCardKeydown = (e: Event): void => {
      const ke = e as KeyboardEvent
      if (ke.code === 'Enter' || ke.code === 'Space') {
        e.preventDefault()
        toggleCard(card)
      }
    }
    card.addEventListener('click', onCardClick)
    card.addEventListener('keydown', onCardKeydown)
    onCleanup(() => {
      card.removeEventListener('click', onCardClick)
      card.removeEventListener('keydown', onCardKeydown)
    })
  })
}
