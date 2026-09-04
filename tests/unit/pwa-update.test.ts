import { describe, expect, it, vi } from 'vitest'
import { handleNeedRefresh, handleOfflineReady, setupPwaUpdate } from '../../src/game/pwa-update'

/**
 * PWA 更新提示（2026-09-04 补零覆盖）。
 * 该模块此前无任何测试触达——由新增的 `scripts/check-test-coverage.mjs` 可达性门禁发现。
 *
 * 测试策略：`setupPwaUpdate` 本体受 `import.meta.env.PROD` 门控且动态导入虚拟模块
 * `virtual:pwa-register`（vitest 无法 mock），故把提示条的交互决策抽为纯函数
 * `handleNeedRefresh` / `handleOfflineReady`，在此覆盖真实逻辑；装配函数只验证 no-op 门控。
 */

/** 提示条元素替身：记录 click 监听以便触发「立即刷新」 */
function createEls() {
  const listeners: Array<() => void> = []
  const toast = { hidden: true }
  const refreshBtn = {
    addEventListener: (_type: string, cb: () => void): void => {
      listeners.push(cb)
    },
    removeEventListener: (_type: string, cb: () => void): void => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
  return {
    toast,
    refreshBtn,
    count: (): number => listeners.length,
    /** 触发当前所有 click 监听（模拟玩家点击「立即刷新」） */
    click: (): void => {
      for (const cb of [...listeners]) cb()
    },
  }
}

describe('handleNeedRefresh 新版本提示', () => {
  it('显示提示条并挂确认监听，但暂不刷新（把刷新时机交给玩家）', () => {
    const els = createEls()
    const updateSW = vi.fn()

    handleNeedRefresh({ toast: els.toast, refreshBtn: els.refreshBtn }, updateSW)

    expect(els.toast.hidden).toBe(false)
    expect(els.count()).toBe(1)
    expect(updateSW).not.toHaveBeenCalled()
  })

  it('玩家点击「立即刷新」后执行刷新，并移除监听防重复触发', () => {
    const els = createEls()
    const updateSW = vi.fn()

    handleNeedRefresh({ toast: els.toast, refreshBtn: els.refreshBtn }, updateSW)
    els.click()

    expect(updateSW).toHaveBeenCalledTimes(1)
    expect(updateSW).toHaveBeenCalledWith(true)
    // 监听已移除：再次点击不再重复刷新
    els.click()
    expect(updateSW).toHaveBeenCalledTimes(1)
  })

  it('提示条缺失（构建异常/被移除）：退化为直接刷新，保证新版本仍能生效', () => {
    const updateSW = vi.fn()
    handleNeedRefresh({ toast: null, refreshBtn: null }, updateSW)
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('按钮缺失但提示条存在：同样直接刷新（无法确认即不阻塞更新）', () => {
    const els = createEls()
    const updateSW = vi.fn()
    handleNeedRefresh({ toast: els.toast, refreshBtn: null }, updateSW)
    expect(updateSW).toHaveBeenCalledWith(true)
    expect(els.toast.hidden).toBe(true) // 不显示无法操作的提示条
  })
})

describe('handleOfflineReady 离线就绪', () => {
  it('隐藏提示条（不打扰玩家）', () => {
    const els = createEls()
    els.toast.hidden = false
    handleOfflineReady({ toast: els.toast })
    expect(els.toast.hidden).toBe(true)
  })

  it('提示条缺失时安全 no-op', () => {
    expect(() => handleOfflineReady({ toast: null })).not.toThrow()
  })
})

describe('setupPwaUpdate 环境门控', () => {
  it('非 PROD（测试环境）：不注册 SW、不触碰 DOM、安全 no-op', () => {
    expect(() => setupPwaUpdate()).not.toThrow()
  })
})
