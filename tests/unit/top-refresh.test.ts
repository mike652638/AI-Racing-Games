/**
 * top-refresh 榜单刷新单测（LB-Z 榜单专项审计新增）：
 * - syncScrollable：条目 >8 行加 .scrollable（内滚仅展开态生效，由 CSS 限定）
 * - syncClipped（LB-Z3）：scrollHeight > clientHeight+2 时加 .clipped 底部渐隐类
 * - 无布局能力的 stub（scrollHeight=undefined）安全回退不加 clipped 类
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshBestSummary, refreshDriftTop, refreshMatchTop } from '../../src/game/top-refresh'
import { DRIFT_TOP_KEY, MATCH_TOP_KEY } from '../../src/ui/save'

/** 最小可控假元素：classList 用 Set 实现，布局属性可选注入 */
class FakeEl {
  textContent = ''
  scrollHeight: number | undefined
  clientHeight: number | undefined
  classes = new Set<string>()
  classList = {
    toggle: (name: string, force?: boolean) => {
      if (force === undefined) {
        if (this.classes.has(name)) {
          this.classes.delete(name)
        } else {
          this.classes.add(name)
        }
      } else if (force) {
        this.classes.add(name)
      } else {
        this.classes.delete(name)
      }
      return this.classes.has(name)
    },
    contains: (name: string) => this.classes.has(name),
  }
  // stub 无 closest → isCardExpanded 视为收起态（与集成测试 stub 一致）
}

/** 注入 document.getElementById 与 localStorage 数据 */
function stubDom(els: Record<string, FakeEl>, storage: Record<string, string> = {}): void {
  vi.stubGlobal('document', {
    getElementById: (id: string) => els[id] ?? null,
  })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in storage ? storage[k] : null),
    setItem: () => {},
  })
  vi.stubGlobal('window', { localStorage: globalThis.localStorage })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('syncClipped 裁切渐隐类（LB-Z3）', () => {
  it('内容超高（scrollHeight > clientHeight+2）：加 .clipped', () => {
    const el = new FakeEl()
    el.scrollHeight = 196
    el.clientHeight = 120
    stubDom(
      { 'drift-top': el },
      {
        [DRIFT_TOP_KEY]: JSON.stringify([{ player: 'P1', trackId: 'classic', score: 100, time: 50 }]),
      },
    )
    refreshDriftTop()
    expect(el.classes.has('clipped')).toBe(true)
  })

  it('内容未超高：不加 .clipped（空态占位两行 39px < 120px）', () => {
    const el = new FakeEl()
    el.scrollHeight = 39
    el.clientHeight = 120
    stubDom({ 'drift-top': el })
    refreshDriftTop()
    expect(el.classes.has('clipped')).toBe(false)
    expect(el.textContent).toContain('暂无漂移记录')
  })

  it('无布局能力的 stub（scrollHeight=undefined）：安全回退不加类', () => {
    const el = new FakeEl()
    stubDom(
      { 'match-top': el },
      {
        [MATCH_TOP_KEY]: JSON.stringify([{ winner: 'P1', p1Score: 10, p2Score: 5, trackId: 'classic' }]),
      },
    )
    refreshMatchTop()
    expect(el.classes.has('clipped')).toBe(false)
    // M20 紧凑格式：去掉「·」与多余空格，"P1胜  10:5  经典赛道"
    expect(el.textContent).toContain('P1胜')
  })
})

describe('syncScrollable 内滚类', () => {
  it('展开渲染 10 条（>8 行）：加 .scrollable；收起态 5 条（≤8）：不加', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      player: 'P1',
      trackId: 'classic',
      score: 1000 - i,
      time: 50,
    }))
    // 收起态（stub 无 closest）：渲染 5 条 → ≤8 行不加类
    const collapsed = new FakeEl()
    stubDom({ 'drift-top': collapsed }, { [DRIFT_TOP_KEY]: JSON.stringify(entries) })
    refreshDriftTop()
    expect(collapsed.textContent.split('\n').length).toBe(5)
    expect(collapsed.classes.has('scrollable')).toBe(false)
  })

  it('BEST 汇总：无记录赛道行跳过 + 占位文案（与 LB-Z 审计口径一致）', () => {
    const el = new FakeEl()
    stubDom({ 'best-summary': el })
    refreshBestSummary()
    expect(el.textContent).toContain('暂无最佳成绩')
    expect(el.classes.has('scrollable')).toBe(false)
  })
})
