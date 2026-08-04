import { COUNTDOWN_HINTS } from '../ui/copy'

/**
 * 起步倒计时覆盖层（2026-08-05 自 game-loop.startCountdown 下沉）：
 * 游戏开始显示 3→2→1→GO 数字动画 + 操作提示（M16：copy.ts 常量与 README 同源填充）。
 * 元素缺失安全跳过；800ms/档，GO 后 500ms 隐藏覆盖层。
 */
export function runCountdown(overlay: HTMLElement): void {
  const numberEl = overlay.querySelector('.countdown-number') as HTMLElement | null
  if (!numberEl) return
  const hintsEl = overlay.querySelector('.countdown-hints') as HTMLElement | null
  if (hintsEl) {
    hintsEl.innerHTML = COUNTDOWN_HINTS.map((hint) => `<p>${hint}</p>`).join('')
  }
  overlay.hidden = false
  let count = 3
  const showNumber = (n: number): void => {
    numberEl.textContent = n > 0 ? String(n) : 'GO!'
    // 重置动画
    numberEl.style.animation = 'none'
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    numberEl.offsetHeight // 触发 reflow
    numberEl.style.animation = ''
  }
  showNumber(count)
  const timer = window.setInterval(() => {
    count--
    if (count > 0) {
      showNumber(count)
    } else {
      showNumber(0)
      window.clearInterval(timer)
      window.setTimeout(() => {
        overlay.hidden = true
      }, 500)
    }
  }, 800)
}
