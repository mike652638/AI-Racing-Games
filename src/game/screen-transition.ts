/**
 * 屏幕退场过渡（M18；rt4 批次自 game-loop.ts 拆分）：
 * 为目标元素加 .leaving 触发 CSS 淡出，动画结束后隐藏并移除类；
 * 元素已离开/已隐藏或处于测试 mock 环境则幂等跳过/立即隐藏。纯 DOM 工具函数，无状态。
 */
export function transitionScreenOut(screen: HTMLElement | undefined): void {
  if (!screen || screen.hidden) return
  // 测试 mock 元素无 classList/addEventListener/contains：直接隐藏，避免崩溃
  if (
    !screen.classList ||
    typeof screen.classList.contains !== 'function' ||
    typeof screen.addEventListener !== 'function'
  ) {
    screen.hidden = true
    return
  }
  if (screen.classList.contains('leaving')) return
  screen.classList.add('leaving')
  const cleanup = (): void => {
    screen.removeEventListener('transitionend', cleanup)
    screen.classList.remove('leaving')
    screen.hidden = true
  }
  screen.addEventListener('transitionend', cleanup)
  const timer = globalThis.setTimeout(cleanup, 250)
  // Node 测试环境：unref 定时器，避免测试进程为等待 250ms 清理而保留大量 DOM 引用
  if (timer && typeof timer === 'object' && typeof (timer as { unref?: () => void }).unref === 'function') {
    ;(timer as { unref: () => void }).unref()
  }
}
