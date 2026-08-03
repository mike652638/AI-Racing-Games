import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameLoop } from '../../src/game/game-loop'
import { PHASE_FINISHED, PHASE_MENU, PHASE_PAUSED, PHASE_RACING, type Phase } from '../../src/game/phase'
import { createMockCanvas, type MockCanvas } from '../__mocks__/canvas'

/** 最小 DOM 元素替身：覆盖 GameLoop 构造/updateHud/screens/joystick 触达的属性 */
interface StubElement {
  textContent: string
  hidden: boolean
  className: string
  style: Record<string, string>
  classList: { toggle: ReturnType<typeof vi.fn> }
  appendChild: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  setPointerCapture: ReturnType<typeof vi.fn>
  clientWidth: number
  clientHeight: number
}

function createElementStub(): StubElement {
  return {
    textContent: '',
    hidden: false,
    className: '',
    style: {},
    classList: { toggle: vi.fn() },
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    setPointerCapture: vi.fn(),
    clientWidth: 0,
    clientHeight: 0,
  }
}

/** WebAudio 节点替身：EngineSound 构造/调速所需的最小方法集 */
function createAudioNode(): {
  connect: () => unknown
  type: string
  buffer: unknown
  frequency: { value: number; setTargetAtTime: () => void; setValueAtTime: () => void }
  detune: { value: number }
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
}

/**
 * stub 全局 DOM/window/RAF/AudioContext，返回事件触发与帧驱动工具。
 * - search: window.location.search 字符串（'' 单屏、'?split=1' 分屏、'?hotseat=1' 热座）；
 *   兼容旧布尔签名——true 等价 '?split=1'、false 等价 ''（既有用例零改动）
 * - window：location、innerWidth/Height、addEventListener 记录监听器供 fireKey 触发
 * - document：getElementById 按 id 返回元素替身（'game' 返回 canvas mock）
 * - requestAnimationFrame：记录回调；GameLoop 构造时唯一注册的 rAF 回调即 frame，
 *   测试据此驱动帧循环（MusicPlayer.tick 等其它回调不驱动）
 * - AudioContext：EngineSound 构造所需的最小 WebAudio 替身
 */
function stubEnvironment(search: string | boolean = ''): Environment {
  const query = typeof search === 'boolean' ? (search ? '?split=1' : '') : search
  const listeners = new Map<string, Array<(e: { code: string; shiftKey: boolean }) => void>>()
  const elements = new Map<string, StubElement>()
  const rafCallbacks: FrameRequestCallback[] = []
  let gameCanvas: MockCanvas | null = null
  let now = performance.now()

  const windowStub = {
    location: { search: query },
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
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
        // 结算面板 P2 行（#finish-*-2）与漂移竞速横幅（#finish-drift-winner）与 index.html 一致：初始 hidden。
        // 视觉缺陷回归：fillFinishPanel 必须显式控制这些元素的显隐，
        // 仅写 textContent 会导致截图不可见（stub 默认 hidden=false 掩盖此缺陷）。
        if (id.startsWith('finish-') && (id.endsWith('-2') || id === 'finish-drift-winner')) stub.hidden = true
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
    resume = (): void => undefined
  }

  vi.stubGlobal('window', windowStub as unknown as Window & typeof globalThis)
  vi.stubGlobal('document', documentStub as unknown as Document)
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

  return {
    fireKey,
    driveFrames,
    phase,
    debugValue,
    getCanvas: () => (gameCanvas ??= createMockCanvas(800, 600)),
    getElement: (id: string) => elements.get(id) ?? createElementStub(),
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
    env.fireKey('KeyW')
    expect(env.phase()).toBe(PHASE_RACING)
  })

  it('Escape 在比赛与暂停间往返切换', () => {
    new GameLoop()
    env.fireKey('KeyW')
    env.fireKey('Escape')
    expect(env.phase()).toBe(PHASE_PAUSED)
    env.fireKey('Escape')
    expect(env.phase()).toBe(PHASE_RACING)
  })

  it('比赛阶段驱动帧推进车辆并点亮 HUD', () => {
    new GameLoop()
    env.fireKey('KeyW')
    env.driveFrames(60) // 3 秒满油门：速度达到上限，HUD 应显示速度
    const hudSpeed = env.getElement('hud-speed')
    expect(hudSpeed.hidden).toBe(false)
    expect(hudSpeed.textContent).not.toBe('')
    expect(env.phase()).toBe(PHASE_RACING)
  })

  it('全油门跑完总圈数后进入结算阶段', () => {
    new GameLoop()
    env.fireKey('KeyW')
    // 经典赛道 3 圈 ≈ 276000 世界单位；125 秒满油门（2500 帧×50ms）远超所需，
    // 途中可能与车流碰撞减速，帧数留足余量
    env.driveFrames(2500)
    expect(env.phase()).toBe(PHASE_FINISHED)
    // 单屏不触碰 P2 结算行：保持初始 hidden（视觉缺陷回归）
    expect(env.getElement('finish-time-2').hidden).toBe(true)
  })

  it('分屏模式：菜单与比赛渲染后 drawDivider 均被调用（出现 2px 全高分隔线）', () => {
    // 重新构造分屏环境（window.location.search = '?split=1'），覆盖 beforeEach 的单屏 stub
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    const canvas = splitEnv.getCanvas()
    // 过滤出"2px 宽、y=0 起、全高 600"的 fillRect，即 drawDivider 绘制的分隔线
    const countDivider = (): number =>
      (canvas.__ctx.__args.fillRect ?? []).filter(
        (a) => a[1] === 0 && a[2] === 2 && a[3] === 600,
      ).length

    // 菜单分屏：左/右两次 renderRegion + 一次 drawDivider
    splitEnv.driveFrames(3)
    const menuDivider = countDivider()
    expect(menuDivider).toBeGreaterThan(0)

    // 进入比赛分屏后每帧同样绘制分隔线
    splitEnv.fireKey('KeyW')
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

    // P2 键位为 Shift+1-5（原 7/8/9 废弃）：Shift+Digit1→index0(classic)、Shift+Digit2→index1(highway)、Shift+Digit3→index2(s-curve)
    splitEnv.fireKey('Digit2', true)
    expect(splitEnv.debugValue('selectedTrack')).toBe('highway')
    expect(splitEnv.debugValue('selectedTrack2')).toBe('highway')

    splitEnv.fireKey('Digit3', true)
    expect(splitEnv.debugValue('selectedTrack2')).toBe('s-curve')

    // 选赛道不退出菜单（返回后仍在 PHASE_MENU）
    expect(splitEnv.phase()).toBe(PHASE_MENU)
  })

  it('单人模式：菜单数字键不开始比赛（Digit7 忽略、Digit3 切 s-curve），非数字键仍可开始', () => {
    new GameLoop()
    env.fireKey('Digit7')
    expect(env.debugValue('selectedTrack')).toBe('classic')
    expect(env.debugValue('selectedTrack2')).toBe('classic')
    // 修复后：无效数字键静默忽略，不触发"任意键开始"逻辑（缺陷①回归）
    expect(env.phase()).toBe(PHASE_MENU)
    env.fireKey('Digit3')
    expect(env.debugValue('selectedTrack')).toBe('s-curve')
    expect(env.phase()).toBe(PHASE_MENU)
    // 非数字键仍可开始比赛
    env.fireKey('KeyW')
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
    splitEnv.fireKey('Digit6', true)
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
    env.fireKey('KeyW')
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

  it('分屏模式：P1 全油门跑完 3 圈（classic）进入结算，P2 静止不污染判定', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    // KeyW 同时被 input manager 记录（pressed 含 KeyW）→ P1 全油门；
    // P2 无方向键输入保持静止（cameraZ=0，lapFromZ 恒为第 1 圈，不触发 finishedP2）
    splitEnv.fireKey('KeyW')
    splitEnv.driveFrames(2500)
    expect(splitEnv.phase()).toBe(PHASE_FINISHED)
    // C3 双人结算：P1 完赛填 P1 行（E1：分屏加 'P1 ' 前缀），P2 静止显示"未完赛"（视觉缺陷回归：P2 行须可见）
    expect(splitEnv.getElement('finish-time').textContent.startsWith('P1 总用时')).toBe(true)
    expect(splitEnv.getElement('finish-time-2').textContent).toBe('P2 未完赛')
    expect(splitEnv.getElement('finish-time-2').hidden).toBe(false)
    // D3 漂移竞速横幅：未双完赛（P2 未完赛）时保持隐藏
    expect(splitEnv.getElement('finish-drift-winner').hidden).toBe(true)
  })

  it('分屏模式：P2 全油门跑完 s-curve 2 圈进入结算，面板填 P2 数据、P1 未完赛', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    // Enter 开始比赛（P1/P2 均不触发方向键），随后 ArrowUp 驱动 P2 全油门；
    // P1 无输入保持静止（raceTime 仍随帧递增，但 cameraZ=0 不跨圈 → 未完赛）
    splitEnv.fireKey('Enter')
    splitEnv.fireKey('ArrowUp')
    splitEnv.driveFrames(2500)
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
  })

  it('分屏模式：双人完赛时漂移竞速横幅显示 P1 获胜（得分平局归 P1）', () => {
    const splitEnv = stubEnvironment(true)
    new GameLoop()
    // KeyW 驱动 P1（P1 键盘映射）、ArrowUp 驱动 P2（P2 键盘映射）同时全油门零转向。
    // 两玩家速度轨迹同步、两世界车流同 seed 同步推进 → 双完赛必然同一帧触发，
    // 首次 PHASE_FINISHED 填充时双方均已完成（driftWinner 按双完赛计算）。
    // 4000 帧 = 200s，远超经典赛道 3 圈约 47s 所需，途中与车流碰撞减速也留足余量。
    splitEnv.fireKey('KeyW')
    splitEnv.fireKey('ArrowUp')
    splitEnv.driveFrames(4000)
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

    // KeyW 驱动 P1 跑完 3 圈
    hotEnv.fireKey('KeyW')
    hotEnv.driveFrames(2500)
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

    // KeyW（热座共用 P1 键盘映射 input1）驱动 P2 跑完 3 圈
    hotEnv.driveFrames(2500)
    expect(hotEnv.phase()).toBe(PHASE_FINISHED)
    // round 2 结算：P1 行显示上一回合用时（不写纪录），P2 行正常全填
    expect(hotEnv.getElement('finish-time').textContent.startsWith('P1 用时')).toBe(true)
    expect(hotEnv.getElement('finish-time-2').textContent.startsWith('P2 总用时')).toBe(true)
    expect(hotEnv.getElement('finish-time-2').hidden).toBe(false)
    // finish-hint 显示胜负（用可预测帧数驱动时 P1/P2 用时接近，三选一断言）
    expect(hotEnv.getElement('finish-hint').hidden).toBe(false)
    expect(['P1 更快！', 'P2 更快！', '平手！']).toContain(
      hotEnv.getElement('finish-hint').textContent,
    )
  })

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

    // P1 跑完 3 圈进入结算后回车交棒（交棒仅 FINISHED 且 hotseatPlayer===1 生效）
    hotEnv.fireKey('KeyW')
    hotEnv.driveFrames(2500)
    expect(hotEnv.phase()).toBe(PHASE_FINISHED)
    hotEnv.fireKey('Enter')
    expect(hotEnv.debugValue('hotseatPlayer')).toBe(2)

    // P2 回合：tracks[1] 车流随帧环形推进（refreshTraffic 确定性重建后起点与 v0 相同，
    // 10 帧推进量 = speed*dt 累计 960-1440 单位，远小于圈长无回绕），z 必然变化
    hotEnv.driveFrames(10)
    expect(hotEnv.debugValue('p2TrafficZ')).not.toBe(v0)
  })
})
