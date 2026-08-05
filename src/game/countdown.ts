import { COUNTDOWN_HINTS } from '../ui/copy'

/**
 * 起步倒计时覆盖层（2026-08-05 自 game-loop.startCountdown 下沉）：
 * 游戏开始显示 3→2→1→GO 数字动画 + 操作提示（M16：copy.ts 常量与 README 同源填充）。
 * 元素缺失安全跳过；800ms/档，GO 后 500ms 隐藏覆盖层。
 * S 修复（S4）：返回 cancel() 句柄——重复 startGame/离开菜单时由调用方取消，
 * 防止叠加多个并行 interval（旧实现句柄丢失，interval 无法清理）。
 */
export function runCountdown(overlay: HTMLElement): { cancel: () => void } {
  const numberEl = overlay.querySelector('.countdown-number') as HTMLElement | null
  if (!numberEl) {
    return { cancel: () => {} }
  }
  const hintsEl = overlay.querySelector('.countdown-hints') as HTMLElement | null
  if (hintsEl) {
    // innerHTML 收敛（2026-08-05 rt4 批次）：COUNTDOWN_HINTS 为 copy.ts 内部静态文案，
    // 改 DOM API 构建 <p> 列表，保持零 HTML 注入面（语义与原 innerHTML 逐字节一致）
    hintsEl.textContent = ''
    COUNTDOWN_HINTS.forEach((hint) => {
      const p = document.createElement('p')
      p.textContent = hint
      hintsEl.appendChild(p)
    })
  }
  overlay.hidden = false
  let count = 3
  let hideTimer: number | null = null
  let cancelled = false
  const showNumber = (n: number): void => {
    numberEl.textContent = n > 0 ? String(n) : 'GO!'
    // 重置动画
    numberEl.style.animation = 'none'
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    numberEl.offsetHeight // 触发 reflow
    numberEl.style.animation = ''
  }
  showNumber(count)
  const intervalId = window.setInterval(() => {
    count--
    if (count > 0) {
      showNumber(count)
    } else {
      showNumber(0)
      window.clearInterval(intervalId)
      hideTimer = window.setTimeout(() => {
        if (!cancelled) {
          overlay.hidden = true
        }
      }, 500)
    }
  }, 800)
  const cancel = (): void => {
    if (cancelled) {
      return
    }
    cancelled = true
    window.clearInterval(intervalId)
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer)
    }
    overlay.hidden = true
  }
  return { cancel }
}
