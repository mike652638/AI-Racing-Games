import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameLoop, resolvePerformanceConfig, viewFor } from '../../src/game/game-loop'
import { createTrackContext } from '../../src/game/track-context'
import { PHASE_FINISHED, PHASE_MENU, PHASE_PAUSED, PHASE_RACING, type Phase } from '../../src/game/phase'
import { Renderer } from '../../src/engine/renderer'
import { buildRoadStrips } from '../../src/engine/road-strip'
import { createRoadsideSprites, spritesInRangeIndexed, type Sprite } from '../../src/engine/sprites'
import { createStraightTrack } from '../helpers/track'
import { createTrackFromDef, TRACK_DEFS } from '../../src/engine/tracks'
import { DRIFT_TOP_KEY } from '../../src/ui/save'
import { refreshBestSummary } from '../../src/game/top-refresh'
import { createMockCanvas, type MockCanvas } from '../__mocks__/canvas'

/** 最小 DOM 元素替身：覆盖 GameLoop 构造/updateHud/screens/joystick 触达的属性 */
interface StubElement {
  textContent: string
  hidden: boolean
  className: string
  style: Record<string, string>
  classList: {
    toggle: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }
  appendChild: ReturnType<typeof vi.fn>
  /** m4：兼容 buildTrackOptions 中 querySelector('.track-label') */
  querySelector: (selector: string) => StubElement | null
  addEventListener: (type: string, cb: (e: unknown) => void) => void
  setPointerCapture: ReturnType<typeof vi.fn>
  clientWidth: number
  clientHeight: number
  /** P6（P6）：音量 slider 的 value（input range 0-100） */
  value: string
  /** P6（P6）：记录的事件监听器（fireElementEvent 触发用） */
  _listeners?: Map<string, Array<(e: unknown) => void>>
}

function createElementStub(): StubElement {
  // 记录式事件监听（仿 windowStub 模式）：GameLoop 构造器绑定的元素事件可被 fireElementEvent 触发
  const listeners = new Map<string, Array<(e: unknown) => void>>()
  return {
    textContent: '',
    hidden: false,
    className: '',
    style: {},
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(),
    // m4：兼容 buildTrackOptions 中 querySelector('.track-label') 的兜底
    querySelector: () => null,
    addEventListener: (type: string, cb: (e: unknown) => void): void => {
      const arr = listeners.get(type) ?? []
      arr.push(cb)
      listeners.set(type, arr)
    },
    setPointerCapture: vi.fn(),
    clientWidth: 0,
    clientHeight: 0,
    value: '',
    _listeners: listeners,
  }
}

/** WebAudio 节点替身：EngineSound 构造/调速所需的最小方法集 */
function createAudioNode(): {
  connect: () => unknown
  type: string
  buffer: unknown
  frequency: { value: number; setTargetAtTime: () => void; setValueAtTime: () => void }
  detune: { value: number }
  Q: { value: number }
  gain: {
    value: number
    setTargetAtTime: () => void
    setValueAtTime: () => void
    exponentialRampToValueAtTime: () => void
  }
  start: () => void
  stop: () => void
} {
  const node = {
    connect: (): unknown => node,
    type: '',
    buffer: null,
    frequency: { value: 0, setTargetAtTime: (): void => undefined, setValueAtTime: (): void => undefined },
    detune: { value: 0 },
    Q: { value: 1 },
    gain: {
      value: 0,
      setTargetAtTime: (): void => undefined,
      setValueAtTime: (): void => undefined,
      exponentialRampToValueAtTime: (): void => undefined,
    },
    start: (): void => undefined,
    stop: (): void => undefined,
  }
  return node
}

interface Environment {
  fireKey: (code: string, shiftKey?: boolean) => void
  driveFrames: (count: number) => void
  phase: () => Phase | undefined
  debugValue: (key: string) => unknown
  getCanvas: () => MockCanvas
  getElement: (id: string) => StubElement
  /** P6（P6）：触发指定元素记录的事件监听器（pause-volume input / pause-restart click 等） */
  fireElementEvent: (id: string, type: string) => void
}

/**
 * stub 全局 DOM/window/RAF/AudioContext，返回事件触发与帧驱动工具。
 * - search: window.location.search 字符串（'' 单屏、'?split=1' 分屏、'?hotseat=1' 热座）；
 *   兼容旧布尔签名——true 等价 '?split=1'、false 等价 ''（既有用例零改动）
 * - initialStorage: 可选 localStorage 初始数据（如 { 'outrun-pseudo3d-best-classic': '42.5' }）；
 *   不传时全局 localStorage 不存在，save.ts getStorage() 安全降级 null（与既有用例行为一致）
 * - window：location、innerWidth/Height、addEventListener 记录监听器供 fireKey 触发
 * - document：getElementById 按 id 返回元素替身（'game' 返回 canvas mock）
 * - requestAnimationFrame：记录回调；GameLoop 构造时唯一注册的 rAF 回调即 frame，
 *   测试据此驱动帧循环（MusicPlayer.tick 等其它回调不驱动）
 * - AudioContext：EngineSound 构造所需的最小 WebAudio 替身
 */
function stubEnvironment(search: string | boolean = '', initialStorage?: Record<string, string>): Environment {
  const query = typeof search === 'boolean' ? (search ? '?split=1' : '') : search
  const listeners = new Map<string, Array<(e: { code: string; shiftKey: boolean }) => void>>()
  const elements = new Map<string, StubElement>()
  const rafCallbacks: FrameRequestCallback[] = []
  let gameCanvas: MockCanvas | null = null
  let now = performance.now()

  // localStorage stub：仅当 initialStorage 传入时挂载（save.ts getStorage 双重检查：
  // 全局 typeof localStorage + window.localStorage，两者都必须提供才会启用存储）
  const storageBackend = new Map<string, string>(Object.entries(initialStorage ?? {}))
  const fakeStorage: Storage = {
    getItem: (k: string) => storageBackend.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storageBackend.set(k, String(v))
    },
    removeItem: (k: string) => {
      storageBackend.delete(k)
    },
    clear: () => storageBackend.clear(),
    key: (i: number) => [...storageBackend.keys()][i] ?? null,
    get length() {
      return storageBackend.size
    },
  }

  const windowStub = {
    location: { search: query },
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    localStorage: fakeStorage,
    addEventListener: (type: string, cb: (e: { code: string; shiftKey: boolean }) => void): void => {
      const arr = listeners.get(type) ?? []
      arr.push(cb)
      listeners.set(type, arr)
    },
    removeEventListener: (type: string, cb: (e: { code: string; shiftKey: boolean }) => void): void => {
      const arr = listeners.get(type)
      if (arr) {
        const idx = arr.indexOf(cb)
        if (idx >= 0) arr.splice(idx, 1)
      }
    },
  }

  const documentStub = {
    getElementById: (id: string): unknown => {
      if (id === 'game') {
        gameCanvas ??= createMockCanvas(800, 600)
        return gameCanvas
      }
      if (!elements.has(id)) {
        const stub = createElementStub()
        // 结算面板 P2 行（#finish-*-2）与漂移竞速横幅（#finish-drift-winner）
        // 及胜场统计行（#finish-wins）与 index.html 一致：初始 hidden。
        // 视觉缺陷回归：fillFinishPanel 必须显式控制这些元素的显隐，
        // 仅写 textContent 会导致截图不可见（stub 默认 hidden=false 掩盖此缺陷）。
        if (id.startsWith('finish-') && (id.endsWith('-2') || id === 'finish-drift-winner' || id === 'finish-wins')) {
          stub.hidden = true
        }
        elements.set(id, stub)
      }
      return elements.get(id)
    },
    createElement: (tag: string): unknown => (tag === 'canvas' ? createMockCanvas() : createElementStub()),
    body: createElementStub(),
  }

  class FakeAudioContext {
    state = 'running'
    currentTime = 0
    sampleRate = 44100
    destination = {}
    createGain = (): unknown => createAudioNode()
    createBiquadFilter = (): unknown => createAudioNode()
    createOscillator = (): unknown => createAudioNode()
    createBuffer = (channels: number, length: number, rate: number): unknown => ({
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      getChannelData: (): Float32Array => new Float32Array(length),
    })
    createBufferSource = (): unknown => ({
      buffer: null,
      loop: false,
      connect: (): void => undefined,
      start: (): void => undefined,
      stop: (): void => undefined,
    })
    resume = (): void => undefined
  }

  vi.stubGlobal('window', windowStub as unknown as Window & typeof globalThis)
  vi.stubGlobal('document', documentStub as unknown as Document)
  if (initialStorage !== undefined) {
    // save.ts getStorage 的全局 typeof localStorage 检查需要全局变量存在才走 window.localStorage
    vi.stubGlobal('localStorage', fakeStorage)
  }
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb)
    return rafCallbacks.length
  })
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined)
  vi.stubGlobal('AudioContext', FakeAudioContext as unknown as typeof AudioContext)

  /** 触发键盘事件；shiftKey 供分屏 P2 键位（Shift+1-5）测试，默认 false 兼容既有用例 */
  const fireKey = (code: string, shiftKey = false): void => {
    for (const cb of listeners.get('keydown') ?? []) cb({ code, shiftKey })
  }
  /** 驱动 GameLoop 帧回调：固定 50ms/帧（dt=0.05），与真实帧节奏一致 */
  const driveFrames = (count: number): void => {
    const frame = rafCallbacks[0] as FrameRequestCallback
    for (let i = 0; i < count; i++) {
      now += 50
      frame(now)
    }
  }
  const phase = (): Phase | undefined =>
    (windowStub as unknown as { __gameDebug?: { phase: Phase } }).__gameDebug?.phase
  /** 读取 window.__gameDebug 任意字段（installDebugHook 注入的运行时状态） */
  const debugValue = (key: string): unknown =>
    (windowStub as unknown as { __gameDebug?: Record<string, unknown> }).__gameDebug?.[key]
  /** 触发元素记录的事件监听器（GameLoop 构造器绑定，如 pause-volume 的 input、pause-restart 的 click） */
  const fireElementEvent = (id: string, type: string): void => {
    const el = elements.get(id)
    const cbs = el?._listeners?.get(type) ?? []
    for (const cb of cbs) cb({})
  }

  return {
    fireKey,
    driveFrames,
    phase,
    debugValue,
    getCanvas: () => (gameCanvas ??= createMockCanvas(800, 600)),
    getElement: (id: string) => elements.get(id) ?? createElementStub(),
    fireElementEvent,
  }
}

/** node 测试环境无 OffscreenCanvas：roadStripCache 预渲染（renderRoadStripToCanvas 内部 new OffscreenCanvas）所需最小 mock */
class MockOffscreenCanvas {
  width: number
  height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  getContext() {
    return {
      fillStyle: '',
      fillRect: vi.fn(),
    }
  }
}

describe('GameLoop 主循环集成冒烟测试', () => {
  let env: Environment

  beforeEach(() => {
    env = stubEnvironment()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('构造后初始阶段为菜单', () => {
    new GameLoop()
    expect(env.phase()).toBe(PHASE_MENU)
  })

  it('菜单阶段驱动帧渲染预览画面（不抛错且有绘制输出）', () => {
    new GameLoop()
    const before = env.getCanvas().__ctx.__calls.fill ?? 0
    env.driveFrames(5)
    expect(env.getCanvas().__ctx.__calls.fill ?? 0).toBeGreaterThan(before)
    expect(env.phase()).toBe(PHASE_MENU)
  })

  it('按键输入后从菜单进入比赛阶段', () => {
    new GameLoop()
    env.fireKey('Space')
    expect(env.phase()).toBe(PHASE_RACING)
  })

  it('Escape 在比赛与暂停间往返切换', () => {
    new GameLoop()
    env.fireKey('Space')
    env.fireKey('Escape')
    expect(env.phase()).toBe(PHASE_PAUSED)
    env.fireKey('Escape')
    expect(env.phase()).toBe(PHASE_RACING)
  })

  it('比赛阶段驱动帧推进车辆并点亮 HUD', () => {
    new GameLoop()
    env.fireKey('Space')
    env.driveFrames(60) // 3 秒满油门：速度达到上限，HUD 应显示速度
    const hudSpeed = env.getElement('hud-speed')
    expect(hudSpeed.hidden).toBe(false)
    expect(hudSpeed.textContent).not.toBe('')
    expect(env.phase()).toBe(PHASE_RACING)
  })

  it('全油门跑完总圈数后进入结算阶段', () => {
    new GameLoop()
    env.fireKey('Space')
    env.fireKey('KeyW')
    // 经典赛道 3 圈 ≈ 276000 世界单位；实测最小通过 975 帧，1075 帧×50ms ≈ 53.75s
    // 满油门（最小通过值 ×1.1 安全余量，覆盖碰撞减速与首帧 dt 偏差）
    env.driveFrames(1075)
    expect(env.phase()).toBe(PHASE_FINISHED)
    // 单屏不触碰 P2 结算行：保持初始 hidden（视觉缺陷回归）
    expect(env.getElement('finish-time-2').hidden).toBe(true)
  })

  it('分屏模式：菜单与比赛渲染后 drawDivider 均被调用（出现 4px 全高分隔线）', () => {
    // 重新构造分屏环境（window.location.search = '?split=1'），覆盖 beforeEach 的单屏 stub
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    const canvas = splitEnv.getCanvas()
    // 过滤出"4px 宽、y=0 起、全高 600"的 fillRect，即 drawDivider 绘制的分隔线（P3：3px 加宽至 4px）
    const countDivider = (): number =>
      (canvas.__ctx.__args.fillRect ?? []).filter((a) => a[1] === 0 && a[2] === 4 && a[3] === 600).length

    // 菜单分屏：左/右两次 renderRegion + 一次 drawDivider
    splitEnv.driveFrames(3)
    const menuDivider = countDivider()
    expect(menuDivider).toBeGreaterThan(0)

    // 进入比赛分屏后每帧同样绘制分隔线
    splitEnv.fireKey('Space')
    splitEnv.driveFrames(2)
    expect(countDivider()).toBeGreaterThan(menuDivider)
    expect(splitEnv.phase()).toBe(PHASE_RACING)
  })

  it('分屏模式：P1/P2 独立按键选择各自赛道（Digit2→highway、Shift+Digit3→s-curve）', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    expect(splitEnv.debugValue('selectedTrack')).toBe('classic')
    expect(splitEnv.debugValue('selectedTrack2')).toBe('classic')

    splitEnv.fireKey('Digit2')
    expect(splitEnv.debugValue('selectedTrack')).toBe('highway')
    expect(splitEnv.debugValue('selectedTrack2')).toBe('classic')

    // P2 键位为 Shift+1-9（原 7/8/9 废弃）：Shift+Digit1→index0(classic)、Shift+Digit2→index1(highway)、Shift+Digit3→index2(s-curve)
    splitEnv.fireKey('Digit2', true)
    expect(splitEnv.debugValue('selectedTrack')).toBe('highway')
    expect(splitEnv.debugValue('selectedTrack2')).toBe('highway')

    splitEnv.fireKey('Digit3', true)
    expect(splitEnv.debugValue('selectedTrack2')).toBe('s-curve')

    // 选赛道不退出菜单（返回后仍在 PHASE_MENU）
    expect(splitEnv.phase()).toBe(PHASE_MENU)
  })

  it('单人模式：菜单数字键不开始比赛（Digit0 忽略、Digit3 切 s-curve），非数字键仍可开始', () => {
    new GameLoop()
    // 9 条赛道键位 1-9 全有效，Digit0 为无效数字键（原 Digit7 在 5 条时代是无效键，E5 扩 9 条后变为有效）
    env.fireKey('Digit0')
    expect(env.debugValue('selectedTrack')).toBe('classic')
    expect(env.debugValue('selectedTrack2')).toBe('classic')
    // 修复后：无效数字键静默忽略，不触发"任意键开始"逻辑（缺陷①回归）
    expect(env.phase()).toBe(PHASE_MENU)
    env.fireKey('Digit3')
    expect(env.debugValue('selectedTrack')).toBe('s-curve')
    expect(env.phase()).toBe(PHASE_MENU)
    // 非数字键仍可开始比赛
    env.fireKey('Space')
    expect(env.phase()).toBe(PHASE_RACING)
  })

  it('单人模式：Digit4/Digit5 选择新赛道（island/canyon）且不退出菜单', () => {
    new GameLoop()
    env.fireKey('Digit4')
    expect(env.debugValue('selectedTrack')).toBe('island')
    expect(env.getElement('track-name').textContent).toBe('环岛巡回')
    env.fireKey('Digit5')
    expect(env.debugValue('selectedTrack')).toBe('canyon')
    expect(env.getElement('track-name').textContent).toBe('峡谷疾驰')
    expect(env.phase()).toBe(PHASE_MENU)
  })

  it('单人模式：Digit6/Digit9 选择新赛道（desert/alpine）且不退出菜单', () => {
    new GameLoop()
    env.fireKey('Digit6')
    expect(env.debugValue('selectedTrack')).toBe('desert')
    expect(env.getElement('track-name').textContent).toBe('沙漠疾驰')
    env.fireKey('Digit9')
    expect(env.debugValue('selectedTrack')).toBe('alpine')
    expect(env.getElement('track-name').textContent).toBe('山岳险道')
    expect(env.phase()).toBe(PHASE_MENU)
  })

  it('分屏模式：Shift+1-5 选择 P2 赛道且不影响 P1（Shift+Digit3 → s-curve）', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    splitEnv.fireKey('Digit3', true)
    expect(splitEnv.debugValue('selectedTrack2')).toBe('s-curve')
    expect(splitEnv.debugValue('selectedTrack')).toBe('classic')
    expect(splitEnv.getElement('p2-track-name').textContent).toBe('S 弯挑战')
    expect(splitEnv.phase()).toBe(PHASE_MENU)
  })

  it('分屏模式：Shift+无效数字被吞掉（菜单阶段不触发开始、不切 P2 赛道）', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    // 9 条赛道 Shift+1-9 全有效，Shift+Digit0 为无效组合（原 Shift+Digit6 在 5 条时代无效，E5 扩 9 条后变为有效）
    splitEnv.fireKey('Digit0', true)
    expect(splitEnv.debugValue('selectedTrack2')).toBe('classic')
    expect(splitEnv.phase()).toBe(PHASE_MENU)
  })

  it('菜单阶段：修饰键单独按下不触发开始（ShiftLeft 吞掉，回归缺陷）', () => {
    new GameLoop()
    // 缺陷回归：P2 选赛道（Shift+1-5）先按 Shift，Shift 键自身不能触发"任意键开始"
    env.fireKey('ShiftLeft')
    expect(env.phase()).toBe(PHASE_MENU)
    env.fireKey('ControlLeft')
    expect(env.phase()).toBe(PHASE_MENU)
    // 非修饰键仍可开始
    env.fireKey('Space')
    expect(env.phase()).toBe(PHASE_RACING)
  })

  it('分屏模式：ShiftLeft + Shift+Digit3 完整按键序列选 P2 赛道（Shift 本身不开始）', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    splitEnv.fireKey('ShiftLeft')
    expect(splitEnv.phase()).toBe(PHASE_MENU)
    splitEnv.fireKey('Digit3', true)
    expect(splitEnv.debugValue('selectedTrack2')).toBe('s-curve')
    expect(splitEnv.debugValue('selectedTrack')).toBe('classic')
    expect(splitEnv.phase()).toBe(PHASE_MENU)
  })

  it('分屏模式：p2-track-name 菜单可见，Shift+Digit3 后文本更新为 S 弯挑战', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    // 缺陷②回归：分屏构造后 P2 赛道名元素应可见
    expect(splitEnv.getElement('p2-track-name').hidden).toBe(false)
    splitEnv.fireKey('Digit3', true)
    expect(splitEnv.getElement('p2-track-name').textContent).toBe('S 弯挑战')
  })

  it('单人模式：p2-track-name 保持隐藏', () => {
    new GameLoop()
    expect(env.getElement('p2-track-name').hidden).toBe(true)
  })

  it('分屏模式：P1 全油门跑完 2 圈（forest）进入结算，P2 静止不污染判定', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    // P1 选 forest（Digit7，2 圈短赛道，较 classic 3 圈减少约 40% 帧数；
    // 脆弱性优化：短赛道使本用例回到默认 5000ms 超时内，无需放宽）
    splitEnv.fireKey('Digit7')
    expect(splitEnv.debugValue('selectedTrack')).toBe('forest')
    // KeyW 同时被 input manager 记录（pressed 含 KeyW）→ P1 全油门；
    // P2 无方向键输入保持静止（cameraZ=0，lapFromZ 恒为第 1 圈，不触发 finishedP2）
    splitEnv.fireKey('Space')
    splitEnv.fireKey('KeyW')
    splitEnv.driveFrames(700)
    expect(splitEnv.phase()).toBe(PHASE_FINISHED)
    // C3 双人结算：P1 完赛填 P1 行（E1：分屏加 'P1 ' 前缀），P2 静止显示"未完赛"（视觉缺陷回归：P2 行须可见）
    expect(splitEnv.getElement('finish-time').textContent.startsWith('P1 总用时')).toBe(true)
    expect(splitEnv.getElement('finish-time-2').textContent).toBe('P2 未完赛')
    expect(splitEnv.getElement('finish-time-2').hidden).toBe(false)
    // D3 漂移竞速横幅：未双完赛（P2 未完赛）时保持隐藏
    expect(splitEnv.getElement('finish-drift-winner').hidden).toBe(true)
    // P1（P1）：分屏时 P1 圈速行加 'P1 ' 前缀（formatLapTimes 输出 LAP 1: ...）
    expect(splitEnv.getElement('finish-laps').textContent.startsWith('P1 LAP')).toBe(true)
  })

  it('分屏模式：P2 全油门跑完 forest 2 圈进入结算，面板填 P2 数据、P1 未完赛', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    // P2 选 forest（Shift+Digit7，短赛道降帧数；断言语义与赛道无关）
    splitEnv.fireKey('Digit7', true)
    expect(splitEnv.debugValue('selectedTrack2')).toBe('forest')
    // Enter 开始比赛（P1/P2 均不触发方向键），随后 ArrowUp 驱动 P2 全油门；
    // P1 无输入保持静止（raceTime 仍随帧递增，但 cameraZ=0 不跨圈 → 未完赛）
    splitEnv.fireKey('Enter')
    splitEnv.fireKey('ArrowUp')
    splitEnv.driveFrames(700)
    expect(splitEnv.phase()).toBe(PHASE_FINISHED)
    const time2 = splitEnv.getElement('finish-time-2')
    expect(time2.textContent.startsWith('P2 总用时')).toBe(true)
    // 视觉缺陷回归：P2 结算行必须显式可见（index.html 初始 hidden，仅写 textContent 不够）
    expect(time2.hidden).toBe(false)
    expect(splitEnv.getElement('finish-speed-2').hidden).toBe(false)
    expect(splitEnv.getElement('finish-laps-2').hidden).toBe(false)
    expect(splitEnv.getElement('finish-time').textContent).toBe('P1 未完赛')
    // P2 圈速行非空（formatLapTimes(lapTimes2) 输出）
    expect(splitEnv.getElement('finish-laps-2').textContent).not.toBe('')
    // P1（P1）：分屏时 P2 圈速行恒加 'P2 ' 前缀
    expect(splitEnv.getElement('finish-laps-2').textContent.startsWith('P2 LAP')).toBe(true)
  })

  it('分屏模式：双人完赛时漂移竞速横幅显示 P1 获胜（得分平局归 P1）', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    // 双人同选 forest（Digit7 / Shift+Digit7）：短赛道 2 圈将帧数从 1075 降至 700，
    // 回到默认 5000ms 超时内（原 15000/30000ms 放宽已消除）
    splitEnv.fireKey('Digit7')
    splitEnv.fireKey('Digit7', true)
    // KeyW 驱动 P1（P1 键盘映射）、ArrowUp 驱动 P2（P2 键盘映射）同时全油门零转向。
    // 两玩家速度轨迹同步、两世界车流同 seed 同步推进 → 双完赛必然同一帧触发，
    // 首次 PHASE_FINISHED 填充时双方均已完成（driftWinner 按双完赛计算）。
    splitEnv.fireKey('Space')
    splitEnv.fireKey('KeyW')
    splitEnv.fireKey('ArrowUp')
    splitEnv.driveFrames(700)
    expect(splitEnv.phase()).toBe(PHASE_FINISHED)
    // E1：分屏结算 P1 行加 'P1 ' 前缀（与 P2 行对称，圈速行除外）
    expect(splitEnv.getElement('finish-time').textContent.startsWith('P1 总用时')).toBe(true)
    expect(splitEnv.getElement('finish-speed').textContent.startsWith('P1 平均速度')).toBe(true)
    expect(splitEnv.getElement('finish-best').textContent.startsWith('P1')).toBe(true)
    expect(splitEnv.getElement('finish-score').textContent.startsWith('P1 漂移得分')).toBe(true)
    // 双方均零漂移（无转向输入）：Math.round(0) >= Math.round(0) → P1 获胜；
    // 横幅须可见、文本含 'P1 获胜' 且精确匹配（含 DRIFT 竞速 前缀）
    const banner = splitEnv.getElement('finish-drift-winner')
    expect(banner.hidden).toBe(false)
    expect(banner.textContent).toContain('P1 获胜')
    expect(banner.textContent).toBe('DRIFT 竞速 · P1 获胜！')
  })

  it('F2（F2）：分屏双人完赛后 #match-top 对局榜渲染（构造时占位）', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    // 构造时无对局记录 → 占位文本（stub getElementById 通配实现自动建 match-top，textContent 可写）
    expect(splitEnv.getElement('match-top').textContent).toBe('暂无对局记录')
    // 双人同选 forest（短赛道降帧数），与横幅用例同轨迹双完赛
    splitEnv.fireKey('Digit7')
    splitEnv.fireKey('Digit7', true)
    // KeyW 驱动 P1、ArrowUp 驱动 P2 全油门零转向 → 双完赛
    splitEnv.fireKey('Space')
    splitEnv.fireKey('KeyW')
    splitEnv.fireKey('ArrowUp')
    splitEnv.driveFrames(700)
    expect(splitEnv.phase()).toBe(PHASE_FINISHED)
    // 双完赛 → 记录 1 局：首行 `1. P1 胜 · 0:0 · 森林穿梭`（零漂移得分平局归 P1）
    const top = splitEnv.getElement('match-top').textContent
    expect(top.startsWith('1. ')).toBe(true)
    expect(top).toContain('胜 ·')
    expect(top).toContain('森林穿梭')
  })

  it('热座模式：P1 回合输入仅推进 P1（player2CameraZ 不变）', () => {
    const hotEnv = stubEnvironment('?hotseat=1')
    new GameLoop()
    expect(hotEnv.debugValue('hotseatPlayer')).toBe(1)
    hotEnv.fireKey('Enter')
    hotEnv.fireKey('KeyW')
    // P1 全油门跑 10s：P1 相机推进，P2 静止（热座输入只路由到当前玩家）
    hotEnv.driveFrames(200)
    expect(hotEnv.debugValue('player2CameraZ')).toBe(0)
    expect(hotEnv.phase()).toBe(PHASE_RACING)
  })

  it('热座模式：P1 跑完 3 圈回车交棒 P2，P2 跑完后结算显示胜负', () => {
    const hotEnv = stubEnvironment('?hotseat=1')
    new GameLoop()
    expect(hotEnv.debugValue('hotseatPlayer')).toBe(1)

    // P1 选赛道：热座双人同一赛道（Digit2 → highway 同步到 P2 世界）
    hotEnv.fireKey('Digit2')
    expect(hotEnv.debugValue('selectedTrack')).toBe('highway')
    expect(hotEnv.debugValue('selectedTrack2')).toBe('highway')

    // Enter 开始 P1 回合
    hotEnv.fireKey('Enter')
    expect(hotEnv.phase()).toBe(PHASE_RACING)
    hotEnv.driveFrames(1)
    expect(hotEnv.getElement('hud-player-tag').textContent).toBe('P1 驾驶中')

    // KeyW 驱动 P1 跑完 3 圈（highway 车流 12 辆碰撞减速多）：实测最小通过 1265 帧，
    // 1400 帧（×1.1 安全余量）= 70s 满油门
    hotEnv.fireKey('KeyW')
    hotEnv.driveFrames(1400)
    expect(hotEnv.phase()).toBe(PHASE_FINISHED)
    // round 1 结算：P1 行正常填充，finish-hint 提示交棒
    expect(hotEnv.getElement('finish-time').textContent.startsWith('总用时')).toBe(true)
    expect(hotEnv.getElement('finish-hint').hidden).toBe(false)
    expect(hotEnv.getElement('finish-hint').textContent).toBe('按回车，P2 开始')
    // round 1 不触碰 P2 结算行（splitMode=false 天然跳过）
    expect(hotEnv.getElement('finish-time-2').hidden).toBe(true)

    // Enter 交棒：进入 P2 回合且双方状态已重置（不会立刻再次判完赛）
    hotEnv.fireKey('Enter')
    expect(hotEnv.phase()).toBe(PHASE_RACING)
    expect(hotEnv.debugValue('hotseatPlayer')).toBe(2)
    hotEnv.driveFrames(10)
    expect(hotEnv.phase()).toBe(PHASE_RACING)
    expect(hotEnv.getElement('hud-player-tag').textContent).toBe('P2 驾驶中')

    // KeyW（热座共用 P1 键盘映射 input1）驱动 P2 跑完 3 圈（highway 档，同 P1 段）
    hotEnv.driveFrames(1400)
    expect(hotEnv.phase()).toBe(PHASE_FINISHED)
    // round 2 结算：P1 行显示上一回合用时（不写纪录），P2 行正常全填
    expect(hotEnv.getElement('finish-time').textContent.startsWith('P1 用时')).toBe(true)
    expect(hotEnv.getElement('finish-time-2').textContent.startsWith('P2 总用时')).toBe(true)
    expect(hotEnv.getElement('finish-time-2').hidden).toBe(false)
    // finish-hint 显示胜负（用可预测帧数驱动时 P1/P2 用时接近，三选一断言）
    expect(hotEnv.getElement('finish-hint').hidden).toBe(false)
    expect(['P1 更快！', 'P2 更快！', '平手！']).toContain(hotEnv.getElement('finish-hint').textContent)
    // P1（P1）：热座 round 2 结算 finish-wins 与 finish-hint 并存可见（非平手分胜负）
    expect(hotEnv.getElement('finish-wins').hidden).toBe(false)
  }, 15000)

  it('热座模式：P1 回合 P2 世界车流静止、P2 回合车流推进', () => {
    const hotEnv = stubEnvironment('?hotseat=1')
    new GameLoop()
    // Enter 开始 P1 回合；预热 10 帧（50ms/帧）后快照 P2 世界首车 z
    hotEnv.fireKey('Enter')
    hotEnv.driveFrames(10)
    const v0 = hotEnv.debugValue('p2TrafficZ')
    // P1 回合：tracks[1] 车流不推进（车流更新仅分屏分支），10 帧后 z 保持不变
    hotEnv.driveFrames(10)
    expect(hotEnv.debugValue('p2TrafficZ')).toBe(v0)

    // P1 跑完 3 圈（默认 classic 赛道）进入结算后回车交棒（交棒仅 FINISHED 且 hotseatPlayer===1 生效）
    hotEnv.fireKey('KeyW')
    // classic 3 圈：实测最小通过 975 帧，1075 帧（×1.1 安全余量）
    hotEnv.driveFrames(1075)
    expect(hotEnv.phase()).toBe(PHASE_FINISHED)
    hotEnv.fireKey('Enter')
    expect(hotEnv.debugValue('hotseatPlayer')).toBe(2)

    // P2 回合：tracks[1] 车流随帧环形推进（refreshTraffic 确定性重建后起点与 v0 相同，
    // 10 帧推进量 = speed*dt 累计 960-1440 单位，远小于圈长无回绕），z 必然变化
    hotEnv.driveFrames(10)
    expect(hotEnv.debugValue('p2TrafficZ')).not.toBe(v0)
  }, 15000)

  it('热座双人完赛后结算显示胜场统计（P2 回合多预热 10 帧 → P1 更快 → P1 胜场 1 连胜 1）', () => {
    const hotEnv = stubEnvironment('?hotseat=1')
    new GameLoop()
    // 沿用既有热座流程：Digit2 选赛道（双人同一赛道）→ Enter 开始 → KeyW 驱动 P1 跑完 3 圈
    hotEnv.fireKey('Digit2')
    hotEnv.fireKey('Enter')
    hotEnv.fireKey('KeyW')
    // highway 3 圈：实测最小通过 1265 帧，1400 帧（×1.1 安全余量）
    hotEnv.driveFrames(1400)
    expect(hotEnv.phase()).toBe(PHASE_FINISHED)
    // 交棒：P2 回合多跑 10 帧预热（raceTime 多 0.5s），P2 必然比 P1 快照更慢 → 胜者 P1
    hotEnv.fireKey('Enter')
    hotEnv.driveFrames(10)
    hotEnv.driveFrames(1400)
    expect(hotEnv.phase()).toBe(PHASE_FINISHED)
    // round 2 结算：finish-wins 显示胜场统计（P1 1:0，首次连胜 1）；平手（极端对称）时不记、保持隐藏
    const winsEl = hotEnv.getElement('finish-wins')
    if (hotEnv.getElement('finish-hint').textContent === '平手！') {
      expect(winsEl.hidden).toBe(true)
    } else {
      expect(winsEl.hidden).toBe(false)
      expect(winsEl.textContent).toContain('胜场统计')
      expect(winsEl.textContent).toMatch(/P1 \d : \d P2/)
      expect(winsEl.textContent).toMatch(/连胜 1/)
    }
    // 双段 1400 帧热座模拟并行时可能超出默认 5000ms，显式放宽超时（与既有 15000ms 先例一致）
  }, 15000)

  it('单人模式：菜单 #drift-top 显示暂无漂移记录，0 漂移完赛后渲染不崩溃', () => {
    new GameLoop()
    // 构造时 refreshDriftTop：无记录 → 占位文本（#drift-top 为菜单静态元素，默认可见）
    expect(env.getElement('drift-top').textContent).toBe('暂无漂移记录')
    // 全油门无转向 → 漂移得分 0 → 不入榜，完赛后榜单仍为占位文本（不抛错）
    env.fireKey('Space')
    env.fireKey('KeyW')
    // classic 3 圈：实测最小通过 975 帧，1075 帧（×1.1 安全余量）满油门
    env.driveFrames(1075)
    expect(env.phase()).toBe(PHASE_FINISHED)
    expect(env.getElement('drift-top').textContent).toBe('暂无漂移记录')
  }, 15000)

  it('P3（P3）：构造后菜单 BEST 汇总全无记录时显示占位文本', () => {
    new GameLoop()
    const summary = env.getElement('best-summary')
    // 无任何存档（P1/P2 均 null）→ 占位文本（元素存在即可断言，stub 对未知 id 自动建最小替身）
    expect(summary.textContent).toBe('暂无最佳成绩')
  })

  it('P3（P3）：预设 9 条赛道存档后 BEST 汇总收起态渲染前 5 条且对应行含格式化时间', () => {
    // 注入全部 9 条赛道的 P1 best（key: outrun-pseudo3d-best-<id>，P1 无后缀）
    const storage = Object.fromEntries(TRACK_DEFS.map((def) => [`outrun-pseudo3d-best-${def.id}`, '42.5']))
    const env2 = stubEnvironment('', storage)
    new GameLoop()
    const summary = env2.getElement('best-summary')
    // 收起态（stub 无 closest → isCardExpanded false）：仅渲染前 5 条
    const lines = summary.textContent.split('\n')
    expect(lines.length).toBe(5)
    for (const def of TRACK_DEFS.slice(0, 5)) {
      expect(summary.textContent).toContain(def.name)
    }
    // 首行（TRACK_DEFS[0] = classic）格式：`1. 经典赛道  P1 0:42.500`（formatTime(42.5) → '0:42.500'）
    expect(lines[0]).toContain(TRACK_DEFS[0].name)
    expect(lines[0]).toContain('P1 0:42.500')
    // 未注入 P2 存档 → P2 部分不出现（t2 null 时无 '· P2' 后缀）
    expect(lines[0]).not.toContain('P2')
  })

  it('P3（P3）：BEST 汇总展开态渲染全部 9 条赛道（卡片 expanded 时 refreshBestSummary 全量输出）', () => {
    const storage = Object.fromEntries(TRACK_DEFS.map((def) => [`outrun-pseudo3d-best-${def.id}`, '42.5']))
    const env2 = stubEnvironment('', storage)
    new GameLoop()
    const summary = env2.getElement('best-summary')
    // 模拟展开态：注入 closest 返回含 expanded 的 .lb-card 假对象（isCardExpanded → true）
    ;(summary as unknown as { closest: () => { classList: { contains: () => boolean } } }).closest = () => ({
      classList: { contains: () => true },
    })
    refreshBestSummary()
    const lines = summary.textContent.split('\n')
    expect(lines.length).toBe(TRACK_DEFS.length)
    for (const def of TRACK_DEFS) {
      expect(summary.textContent).toContain(def.name)
    }
  })

  it('P6（P6）：暂停菜单 PAUSED 阶段按 R 返回菜单且 startScreen 可见', () => {
    new GameLoop()
    // 菜单 → 比赛（任意键开始）
    env.fireKey('Enter')
    expect(env.phase()).toBe(PHASE_RACING)
    // Escape 暂停
    env.fireKey('Escape')
    expect(env.phase()).toBe(PHASE_PAUSED)
    // 暂停菜单按 R → 回菜单（applyPhase MENU 块自动 resetRace + 榜单刷新）
    env.fireKey('KeyR')
    expect(env.phase()).toBe(PHASE_MENU)
    expect(env.getElement('start-screen').hidden).toBe(false)
  })

  it('P6（P6）：重开按钮 click 事件返回菜单', () => {
    new GameLoop()
    env.fireKey('Enter')
    env.fireKey('Escape')
    expect(env.phase()).toBe(PHASE_PAUSED)
    env.fireElementEvent('pause-restart', 'click')
    expect(env.phase()).toBe(PHASE_MENU)
  })

  it('F3（F3）：比赛阶段点击 #pause-btn 进入暂停', () => {
    new GameLoop()
    env.fireKey('Enter')
    expect(env.phase()).toBe(PHASE_RACING)
    // 触屏暂停按钮 click（构造器绑定，stub 记录式事件经 fireElementEvent 触发）→ 暂停
    env.fireElementEvent('pause-btn', 'click')
    expect(env.phase()).toBe(PHASE_PAUSED)
  })

  it('F3（F3）：暂停菜单点击 #pause-resume 恢复比赛', () => {
    new GameLoop()
    env.fireKey('Enter')
    env.fireKey('Escape')
    expect(env.phase()).toBe(PHASE_PAUSED)
    // 暂停菜单「继续」按钮 click → 恢复比赛
    env.fireElementEvent('pause-resume', 'click')
    expect(env.phase()).toBe(PHASE_RACING)
  })

  it('P6（P6）：音量 slider input 事件更新主音量（debug hook volume getter）', () => {
    const env2 = stubEnvironment('')
    new GameLoop()
    // 初始音量 0.6（无存档回退默认）
    expect(env2.debugValue('volume')).toBe(0.6)
    // slider 拉到 80/100 → input 事件 → setVolume(0.8)
    const slider = env2.getElement('pause-volume')
    slider.value = '80'
    env2.fireElementEvent('pause-volume', 'input')
    expect(env2.debugValue('volume')).toBe(0.8)
  })

  it('G7（G7）：音乐音量 slider input 更新 musicVolume 并持久化（key 独立于总音量）', () => {
    // 传空对象激活 localStorage stub（持久化断言需要可写存储）
    const env2 = stubEnvironment('', {})
    new GameLoop()
    // slider 拉到 40/100 → input 事件 → setMusicVolume(0.4) → 写 outrun-pseudo3d-music-volume
    const slider = env2.getElement('pause-music-volume')
    slider.value = '40'
    env2.fireElementEvent('pause-music-volume', 'input')
    const saved = (window as unknown as { localStorage: Storage }).localStorage.getItem('outrun-pseudo3d-music-volume')
    expect(saved).toBe('0.4')
  })

  it('G7（G7）：音效音量 slider input 更新 sfxVolume 并持久化', () => {
    const env2 = stubEnvironment('', {})
    new GameLoop()
    const slider = env2.getElement('pause-sfx-volume')
    slider.value = '80'
    env2.fireElementEvent('pause-sfx-volume', 'input')
    const saved = (window as unknown as { localStorage: Storage }).localStorage.getItem('outrun-pseudo3d-sfx-volume')
    expect(saved).toBe('0.8')
  })

  it('P2（P2）：三个音量 slider input 同步数值标签（#pause-*-value，百分比整数格式）', () => {
    const env2 = stubEnvironment('', {})
    new GameLoop()
    // 构造器初始同步：slider 当前值写进数值标签（stub value 初始空 → '0%'，元素缺失时静默跳过不抛错）
    expect(env2.getElement('pause-volume-value').textContent).toBe('0%')
    expect(env2.getElement('pause-music-volume-value').textContent).toBe('0%')
    expect(env2.getElement('pause-sfx-volume-value').textContent).toBe('0%')
    // 主音量 slider → 80/100 → 数值标签 '80%'
    const vol = env2.getElement('pause-volume')
    vol.value = '80'
    env2.fireElementEvent('pause-volume', 'input')
    expect(env2.getElement('pause-volume-value').textContent).toBe('80%')
    // 音乐 slider → 40/100 → 数值标签 '40%'
    const music = env2.getElement('pause-music-volume')
    music.value = '40'
    env2.fireElementEvent('pause-music-volume', 'input')
    expect(env2.getElement('pause-music-volume-value').textContent).toBe('40%')
    // 音效 slider → 100/100 → 数值标签 '100%'
    const sfx = env2.getElement('pause-sfx-volume')
    sfx.value = '100'
    env2.fireElementEvent('pause-sfx-volume', 'input')
    expect(env2.getElement('pause-sfx-volume-value').textContent).toBe('100%')
  })

  it('G1（G1）：挑战模式限时刷分——驱动到限时后 finished 且结算面板显示挑战文案', () => {
    const chEnv = stubEnvironment('?challenge=1')
    new GameLoop()
    // 构造后 menu-hint 含挑战文案（与 split/hotseat 模式同级改写；Batch 3 文案格式：[限时说明] · 驾驶 · 开始）
    expect(chEnv.getElement('menu-hint').textContent).toContain('限时刷分')
    chEnv.fireKey('Space')
    // P1 全油门（KeyW 作为油门输入，非开始命令）
    chEnv.fireKey('KeyW')
    // 首帧挑战剩余时间 60s（raceTime 0）
    const first = chEnv.debugValue('challengeTimeLeft')
    expect(first).toBe(60)
    // P2（P2）：挑战实时得分 HUD——帧块惰性获取并填充 #challenge-score（格式「得分 N」），RACING 阶段可见
    chEnv.driveFrames(2)
    expect(chEnv.getElement('challenge-score').textContent).toMatch(/^得分 \d+$/)
    expect(chEnv.getElement('challenge-score').hidden).toBe(false)
    // 1250 帧 ≈ 62.5s：P1 全油门约 47s 先正常完赛（challenge 模式无圈数限制仍按完赛收束），
    // 结算面板走挑战分支 → finish-time '挑战结束'
    chEnv.driveFrames(1248)
    expect(chEnv.debugValue('phase')).toBe('finished')
    expect(chEnv.getElement('finish-time').textContent).toBe('挑战结束')
    // 挑战剩余时间递减（finished 后帧循环停止推进 raceTime，定格在完赛时刻）
    const last = chEnv.debugValue('challengeTimeLeft')
    expect(typeof last).toBe('number')
    expect((last as number) < (first as number)).toBe(true)
  }, 15000)

  it('H4（H4）：注入含 combo 的漂移榜条目后 #drift-top 渲染含「连击 x」后缀', () => {
    // 直接注入 localStorage drift-top（含 combo 条目），构造后 refreshDriftTop 渲染格式断言
    const storage = {
      [DRIFT_TOP_KEY]: JSON.stringify([
        { player: 'P1', trackId: 'classic', score: 300, time: 30, combo: 4 },
        { player: 'P2', trackId: 'highway', score: 100, time: 40 },
      ]),
    }
    const env2 = stubEnvironment('', storage)
    new GameLoop()
    const top = env2.getElement('drift-top').textContent
    // 首行（score 降序第一）：`1. P1 · 300 分 · 经典赛道 · 连击 x2.00`（1 + 4*0.25 = 2.00）
    expect(top.startsWith('1. P1 · 300 分')).toBe(true)
    expect(top).toContain('连击 x2.00')
    // 旧条目无 combo → 不追加连击后缀
    expect(top).not.toContain('连击 x1')
  })

  it('F4（F4）：驱动到雨段（~100s）rainPlaying 为 true、阴/晴段为 false', { timeout: 15000 }, () => {
    new GameLoop()
    // Enter 开始比赛：音频惰性创建块实例化 RainSound/CollisionSound（注入 masterGain）
    env.fireKey('Enter')
    expect(env.phase()).toBe(PHASE_RACING)
    // raceTime 每帧 +dt（约 0.05s，首帧略小故断言点远离 45s 边界）
    env.driveFrames(1000) // raceTime ≈ 50s → phase 1（阴）
    expect(env.debugValue('rainPlaying')).toBe(false)
    env.driveFrames(1000) // raceTime ≈ 100s → phase 2（雨）
    expect(env.debugValue('rainPlaying')).toBe(true)
    env.driveFrames(1000) // raceTime ≈ 150s → phase 0（晴）
    expect(env.debugValue('rainPlaying')).toBe(false)
  })
})

/**
 * Task 10 集成测试：验证性能优化（Tasks 1-9）协同工作。
 * 各优化已在各自测试文件（sprites/game-loop/renderer-state.test.ts）有独立单测，
 * 此处以集成视角验证真实数据流（TrackContext 预计算、Renderer 实例、GameLoop 导出纯函数）
 * 下各项优化契约成立——对象复用（viewFor/spritesInRangeIndexed out 参数）、字符串缓存
 * （getFillStyle）、离屏缓存（roadStripCache 预热）与降级配置（resolvePerformanceConfig）。
 */
describe('性能优化集成验证（Task 10）', () => {
  let env: Environment

  beforeEach(() => {
    // stubEnvironment 提供 document.createElement（Renderer 构造离屏山形缓存需要）
    env = stubEnvironment()
    // 与 renderer-state.test.ts 同模式：道路段离屏缓存用 new OffscreenCanvas（node 无此全局，此处 stub）
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas)
  })

  it('resolvePerformanceConfig 四模式返回正确配置且性能档共享只读实例', () => {
    // 默认全效档：120 段 + 渲染全部特效
    expect(resolvePerformanceConfig(false, false)).toEqual({
      drawDistance: 120,
      skipSmoke: false,
      skipBoostParticles: false,
      skipRain: false,
    })
    // 分屏档：80 段 + 跳过全部特效
    expect(resolvePerformanceConfig(true, false)).toEqual({
      drawDistance: 80,
      skipSmoke: true,
      skipBoostParticles: true,
      skipRain: true,
    })
    // 性能档：60 段 + 跳过全部特效（最激进降级）
    const low = resolvePerformanceConfig(false, true)
    expect(low).toEqual({
      drawDistance: 60,
      skipSmoke: true,
      skipBoostParticles: true,
      skipRain: true,
    })
    // 分屏与性能共存时性能档优先，且连续调用返回同一共享实例（仿 _viewCache 复用，无每帧分配）
    expect(resolvePerformanceConfig(true, true)).toBe(low)
  })

  it('spritesInRangeIndexed out 参数：复用同一引用、返回数量与填充一致（真实 TrackContext 数据）', () => {
    const ctx = createTrackContext(TRACK_DEFS[0])
    const out: Sprite[] = []
    // 传 out：返回匹配数量，数组内容与数量一致
    const count1 = spritesInRangeIndexed(ctx.spriteIndex, ctx.segments, 1500, 900, out)
    expect(count1).toBeGreaterThan(0)
    expect(out).toHaveLength(count1)
    // 二次调用：同一引用（未新建数组）、数量稳定
    const ref = out
    const count2 = spritesInRangeIndexed(ctx.spriteIndex, ctx.segments, 1500, 900, out)
    expect(out).toBe(ref)
    expect(count2).toBe(count1)
    expect(out).toHaveLength(count2)
    // 不传 out：返回新数组（向后兼容路径），内容与复用版一致
    const fresh = spritesInRangeIndexed(ctx.spriteIndex, ctx.segments, 1500, 900)
    expect(fresh).not.toBe(out)
    expect(fresh).toEqual(out)
  })

  it('viewFor 返回同一引用且字段随 TrackContext 覆盖更新（分屏双世界复用零分配）', () => {
    const ctxA = createTrackContext(TRACK_DEFS[0])
    const ctxB = createTrackContext(TRACK_DEFS[1])
    const v1 = viewFor(ctxA)
    // 同一 context 连续调用：同一引用
    expect(viewFor(ctxA)).toBe(v1)
    expect(v1.track).toBe(ctxA.segments)
    // 切换 context（分屏 P1/P2 渲染依次消费）：同一引用、字段覆盖为 ctxB
    const v2 = viewFor(ctxB)
    expect(v2).toBe(v1)
    expect(v1.track).toBe(ctxB.segments)
    expect(v1.curvePrefixSum).toBe(ctxB.curvePrefixSum)
    expect(v1.spriteIndex).toBe(ctxB.spriteIndex)
    expect(v1.traffic).toBe(ctxB.traffic)
    expect(v1.night).toBe(ctxB.def.timeOfDay === 'night')
  })

  it('getFillStyle 缓存：同 rgba 归一化键命中同一字符串、命中不新增项', () => {
    const renderer = new Renderer(env.getCanvas(), createStraightTrack(10), 800, 600)
    const r = renderer as unknown as {
      getFillStyle: (r: number, g: number, b: number, a: number) => string
      _fillStyleCache: Map<string, string>
    }
    // 连续浮点 alpha 经 toFixed(3) 归一化到同一键 → 同一字符串实例（烟雾/尾焰粒子每帧不重建模板字符串）
    const first = r.getFillStyle(200, 200, 210, 0.4721)
    const second = r.getFillStyle(200, 200, 210, 0.4724)
    expect(second).toBe(first)
    expect(first).toBe('rgba(200, 200, 210, 0.472)')
    expect(r._fillStyleCache.size).toBe(1)
    // 命中路径不新增缓存项（相同参数再次调用返回同一实例）
    expect(r.getFillStyle(200, 200, 210, 0.4721)).toBe(first)
    expect(r._fillStyleCache.size).toBe(1)
    // 不同归一化键（0.4726 → toFixed(3) 进位为 0.473）→ 新键新串
    const other = r.getFillStyle(200, 200, 210, 0.4726)
    expect(other).toBe('rgba(200, 200, 210, 0.473)')
    expect(r._fillStyleCache.size).toBe(2)
  })

  it('roadStripCache：setTrack 传 roadStrips 时按条数预渲染填充，不传时不触碰', () => {
    const renderer = new Renderer(env.getCanvas(), createStraightTrack(10), 800, 600)
    const trackB = createTrackFromDef(TRACK_DEFS[0]) // classic
    const roadStrips = buildRoadStrips(trackB)
    renderer.setTrack(trackB, createRoadsideSprites(trackB), roadStrips)
    const cache = (renderer as unknown as { roadStripCache: Map<number, unknown> }).roadStripCache
    // 缓存条目数 = 曲率分段数，每项为预渲染的离屏 canvas（node 环境为 MockOffscreenCanvas）
    expect(cache.size).toBe(roadStrips.length)
    for (const c of cache.values()) {
      expect(c).toBeInstanceOf(OffscreenCanvas)
      expect(c).toHaveProperty('width')
      expect(c).toHaveProperty('height')
    }
    // 不传 roadStrips 的 setTrack 不清空既有缓存（渐进式集成：渲染路径零回归，缓存仅预热）
    renderer.setTrack(createStraightTrack(10), [])
    expect(cache.size).toBe(roadStrips.length)
  })
})
