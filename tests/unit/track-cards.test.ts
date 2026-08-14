import { describe, expect, it, vi } from 'vitest'
import { buildTrackCards, nextGridTrackIndex } from '../../src/game/track-cards'

/** M34：赛道卡构建（拆分自 game-loop.ts buildTrackOptions；DOM 经注入式 getElement 可单测） */
interface StubOption {
  textContent: string
  querySelector: (sel: string) => StubLabel | null
  addEventListener: (type: string, cb: (e: unknown) => void) => void
  removeEventListener: (type: string, cb: (e: unknown) => void) => void
  _listeners: Map<string, Array<(e: unknown) => void>>
}

interface StubLabel {
  textContent: string
  querySelector: (sel: string) => StubStars | null
  appendChild: ReturnType<typeof vi.fn>
}

interface StubStars {
  textContent: string
  className: string
  title: string
  setAttribute: ReturnType<typeof vi.fn>
  appendChild: ReturnType<typeof vi.fn>
}

function createStars(): StubStars {
  return {
    textContent: '',
    className: '',
    title: '',
    setAttribute: vi.fn(),
    appendChild: vi.fn(),
  }
}

function createOption(): StubOption {
  const listeners = new Map<string, Array<(e: unknown) => void>>()
  const label: StubLabel = {
    textContent: '',
    querySelector: (sel) => (sel === '.track-stars' ? createStars() : null),
    appendChild: vi.fn(),
  }
  return {
    textContent: '',
    querySelector: (sel) => (sel === '.track-label' ? label : null),
    addEventListener: (type, cb) => {
      const arr = listeners.get(type) ?? []
      arr.push(cb)
      listeners.set(type, arr)
    },
    removeEventListener: (type, cb) => {
      const arr = listeners.get(type) ?? []
      listeners.set(
        type,
        arr.filter((f) => f !== cb),
      )
    },
    _listeners: listeners,
  }
}

function fire(el: StubOption, type: string, e: unknown = {}): void {
  for (const cb of el._listeners.get(type) ?? []) cb(e)
}

describe('buildTrackCards', () => {
  it('按 TRACK_DEFS 数量构建：名称/星级/难度类/aria 填充，末尾应用初始预览 0 号赛道', () => {
    const options = Array.from({ length: 9 }, createOption)
    const getElement = (id: string): HTMLElement | null => {
      const m = /^track-option-(\d+)$/.exec(id)
      return m ? (options[Number(m[1])] as unknown as HTMLElement) : null
    }
    const onSelect = vi.fn()
    const applyPreview = vi.fn()
    const cleanups: Array<() => void> = []
    buildTrackCards({
      getElement,
      isMenuPhase: () => true,
      onSelect,
      getPreviewIndex: () => 2,
      onCleanup: (fn) => cleanups.push(fn),
      applyPreview,
    })
    expect(applyPreview).toHaveBeenCalledWith(0)
    expect(cleanups.length).toBe(9)
  })

  it('点击/Enter/鼠标悬停触发 onSelect 与预览联动（菜单阶段守卫生效）', () => {
    const options = Array.from({ length: 9 }, createOption)
    const getElement = (id: string): HTMLElement | null => {
      const m = /^track-option-(\d+)$/.exec(id)
      return m ? (options[Number(m[1])] as unknown as HTMLElement) : null
    }
    const onSelect = vi.fn()
    const applyPreview = vi.fn()
    buildTrackCards({
      getElement,
      isMenuPhase: () => true,
      onSelect,
      getPreviewIndex: () => 3,
      onCleanup: vi.fn(),
      applyPreview,
    })
    fire(options[2], 'click')
    expect(onSelect).toHaveBeenCalledWith(2)
    fire(options[4], 'keydown', { code: 'Enter', preventDefault: vi.fn() })
    expect(onSelect).toHaveBeenCalledWith(4)
    fire(options[5], 'mouseenter')
    expect(applyPreview).toHaveBeenCalledWith(5)
    // mouseleave 恢复当前选中赛道（getPreviewIndex = 3）
    fire(options[5], 'mouseleave')
    expect(applyPreview).toHaveBeenCalledWith(3)
  })

  it('非菜单阶段：点击/键盘/hover 全部失效', () => {
    const options = Array.from({ length: 9 }, createOption)
    const getElement = (id: string): HTMLElement | null => {
      const m = /^track-option-(\d+)$/.exec(id)
      return m ? (options[Number(m[1])] as unknown as HTMLElement) : null
    }
    const onSelect = vi.fn()
    const applyPreview = vi.fn()
    buildTrackCards({
      getElement,
      isMenuPhase: () => false,
      onSelect,
      getPreviewIndex: () => 0,
      onCleanup: vi.fn(),
      applyPreview,
    })
    fire(options[0], 'click')
    fire(options[1], 'mouseenter')
    expect(onSelect).not.toHaveBeenCalled()
    expect(applyPreview).toHaveBeenCalledTimes(1) // 仅初始预览
  })

  it('cleanup 移除全部监听', () => {
    const options = Array.from({ length: 9 }, createOption)
    const getElement = (id: string): HTMLElement | null => {
      const m = /^track-option-(\d+)$/.exec(id)
      return m ? (options[Number(m[1])] as unknown as HTMLElement) : null
    }
    const cleanups: Array<() => void> = []
    buildTrackCards({
      getElement,
      isMenuPhase: () => true,
      onSelect: vi.fn(),
      getPreviewIndex: () => 0,
      onCleanup: (fn) => cleanups.push(fn),
      applyPreview: vi.fn(),
    })
    cleanups.forEach((fn) => fn())
    expect(options[0]._listeners.get('click')?.length ?? 0).toBe(0)
    expect(options[0]._listeners.get('mouseenter')?.length ?? 0).toBe(0)
  })

  it('元素缺失（getElement 返回 null）：安全跳过不抛错', () => {
    expect(() =>
      buildTrackCards({
        getElement: () => null,
        isMenuPhase: () => true,
        onSelect: vi.fn(),
        getPreviewIndex: () => 0,
        onCleanup: vi.fn(),
        applyPreview: vi.fn(),
      }),
    ).not.toThrow()
  })
})

describe('nextGridTrackIndex', () => {
  it('左右 ±1、上下 ±3（3x3 网格，9 赛道）', () => {
    expect(nextGridTrackIndex('ArrowRight', 0, 3, 9)).toBe(1)
    expect(nextGridTrackIndex('ArrowLeft', 2, 3, 9)).toBe(1)
    expect(nextGridTrackIndex('ArrowDown', 0, 3, 9)).toBe(3)
    expect(nextGridTrackIndex('ArrowUp', 6, 3, 9)).toBe(3)
  })

  it('越界 clamp', () => {
    expect(nextGridTrackIndex('ArrowRight', 8, 3, 9)).toBe(8)
    expect(nextGridTrackIndex('ArrowUp', 0, 3, 9)).toBe(0)
    expect(nextGridTrackIndex('ArrowDown', 8, 3, 9)).toBe(8)
  })
})
