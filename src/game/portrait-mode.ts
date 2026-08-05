/**
 * 竖屏兼容交互（C+E，2026-08-05；rt4 批次自 game-loop.ts 拆分）：
 * 竖屏不再强制横屏——「竖屏继续」激活 body.portrait-mode（菜单紧凑布局 + HUD 竖屏适配）
 * 并会话记忆；「横屏体验」仅关闭遮罩等待用户手动旋转。测试/无 DOM 环境防御式跳过。
 */
const PORTRAIT_MODE_KEY = 'portrait-mode-ok'

/**
 * 绑定旋转遮罩两按钮并恢复会话记忆。
 * onCleanup：监听清理登记回调（GameLoop.destroy 时统一移除，S 修复 S3 契约）。
 */
export function bindPortraitMode(onCleanup: (fn: () => void) => void): void {
  const hint = document.getElementById('rotate-hint')
  // 测试 mock 环境无该元素：跳过（不影响既有行为）
  if (!hint || !document.body.classList || typeof document.body.classList.toggle !== 'function') return

  const setPortraitMode = (on: boolean): void => {
    document.body.classList.toggle('portrait-mode', on)
    hint.hidden = true
    try {
      if (on) window.sessionStorage.setItem(PORTRAIT_MODE_KEY, '1')
      else window.sessionStorage.removeItem(PORTRAIT_MODE_KEY)
    } catch {
      /* sessionStorage 不可用（隐私模式/测试环境）时静默降级：仅本次会话生效 */
    }
  }

  const playPortrait = document.getElementById('rotate-play-portrait')
  const playLandscape = document.getElementById('rotate-play-landscape')
  if (playPortrait && typeof playPortrait.addEventListener === 'function') {
    const onClick = (): void => setPortraitMode(true)
    playPortrait.addEventListener('click', onClick)
    onCleanup(() => playPortrait.removeEventListener('click', onClick))
  }
  if (playLandscape && typeof playLandscape.addEventListener === 'function') {
    const onClick = (): void => setPortraitMode(false)
    playLandscape.addEventListener('click', onClick)
    onCleanup(() => playLandscape.removeEventListener('click', onClick))
  }

  // 会话内已选择过竖屏：直接应用 portrait-mode 并隐藏遮罩，避免竖屏重进页面时遮罩闪出
  let remembered = false
  try {
    remembered = window.sessionStorage.getItem(PORTRAIT_MODE_KEY) === '1'
  } catch {
    /* 忽略 */
  }
  if (remembered) setPortraitMode(true)
}
