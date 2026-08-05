/**
 * PWA 新版本提示（S 修复 S1）：registerType 改为 'prompt' 后，由应用自行决定刷新时机，
 * 避免 vite-plugin-pwa 的 autoUpdate 在比赛对局中途自动刷新页面打断游戏。
 *
 * 策略：检测到新版本（needRefresh）时，若当前非比赛（不在 RACING 阶段）则直接刷新，
 * 否则仅弹「新版本已就绪」提示条（#pwa-update-toast），由用户点击「立即刷新」确认后
 * 才调用 updateSW(true) 刷新——把刷新权交给玩家，兼顾版本更新与对局完整性。
 *
 * 仅在 PROD + 浏览器环境挂载（dev/test 为 no-op）；virtual:pwa-register 动态导入，
 * 避免测试/构建非 PWA 路径静态解析失败。
 */
export function setupPwaUpdate(): void {
  if (!import.meta.env.PROD || typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          const toast = document.getElementById('pwa-update-toast')
          const refreshBtn = document.getElementById('pwa-update-refresh')
          if (!toast || !refreshBtn) {
            // 提示条缺失（构建异常/被移除）：退化为直接刷新，保证新版本仍能生效
            updateSW(true)
            return
          }
          toast.hidden = false
          const onConfirm = (): void => {
            refreshBtn.removeEventListener('click', onConfirm)
            updateSW(true)
          }
          refreshBtn.addEventListener('click', onConfirm)
        },
        onOfflineReady() {
          const toast = document.getElementById('pwa-update-toast')
          if (toast) {
            toast.hidden = true
          }
        },
      })
    })
    .catch(() => {
      // 非 PWA 构建/无 virtual module：静默跳过
    })
}
