/**
 * 跨层通用计时工具（M34 收敛 game-loop.ts 两处重复的 unref 兼容 setTimeout）：
 * 浏览器 setTimeout 返回 number，Node 环境返回 Timeout 对象——Node 中长定时器会挂起
 * 事件循环阻塞进程退出（CI/单测尤甚），unref 解除该持有。shared 为依赖最底层，ui/game 均可引用。
 */

/** setTimeout 包装：Node 环境自动 unref（浏览器 number 返回值直接忽略） */
export function unrefSafeTimeout(fn: () => void, ms: number): void {
  const timer = globalThis.setTimeout(fn, ms)
  if (timer && typeof timer === 'object' && typeof (timer as { unref?: () => void }).unref === 'function') {
    ;(timer as { unref: () => void }).unref()
  }
}
