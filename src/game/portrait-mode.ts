/**
 * 竖屏兼容交互（C+E，2026-08-05；rt4 批次自 game-loop.ts 拆分）：
 * 竖屏不再强制横屏——「竖屏继续」激活 body.portrait-mode（菜单紧凑布局 + HUD 竖屏适配）
 * 并会话记忆；「横屏体验」仅关闭遮罩等待用户手动旋转。测试/无 DOM 环境防御式跳过。
 *
 * M20 P1-1 修复（2026-08-06）：portrait-mode 语义只属于「竖屏视口」——
 * 1) 会话记忆恢复时先校验当前确为竖屏（此前宽屏桌面带残留记忆会错套紧凑布局，
 *    实测 1600×900 下 #track-select 被 portrait-mode 规则压成 400px 导致内容偏左）；
 * 2) resize/orientationchange 时自动同步——旋转回横屏自动移除 class（保留记忆，
 *    转回竖屏自动恢复），避免布局与视口方向长期不一致。
 */
const PORTRAIT_MODE_KEY = 'portrait-mode-ok'

/** 当前视口是否为竖屏（portrait-mode 仅竖屏有语义；异常环境降级为 false） */
function isPortraitViewport(): boolean {
  try {
    return typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  } catch {
    return false
  }
}

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

  // 会话内已选择过竖屏：仅当前确为竖屏视口时应用 portrait-mode（M20 P1-1），
  // 并隐藏遮罩，避免竖屏重进页面时遮罩闪出。
  let remembered = false
  try {
    remembered = window.sessionStorage.getItem(PORTRAIT_MODE_KEY) === '1'
  } catch {
    /* 忽略 */
  }
  if (remembered && isPortraitViewport()) setPortraitMode(true)

  // M20 P1-1：视口方向变化时自动同步 portrait-mode——横屏移除 class（保留会话记忆，
  // 转回竖屏且记忆存在时自动恢复），保证布局始终匹配当前方向。
  const syncOnResize = (): void => {
    if (isPortraitViewport()) {
      let rememberedNow = false
      try {
        rememberedNow = window.sessionStorage.getItem(PORTRAIT_MODE_KEY) === '1'
      } catch {
        /* 忽略 */
      }
      if (rememberedNow) setPortraitMode(true)
    } else {
      document.body.classList.remove('portrait-mode')
    }
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', syncOnResize)
    window.addEventListener('orientationchange', syncOnResize)
    onCleanup(() => {
      window.removeEventListener('resize', syncOnResize)
      window.removeEventListener('orientationchange', syncOnResize)
    })
  }
}
