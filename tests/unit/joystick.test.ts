import { afterEach, describe, it, expect, vi } from 'vitest'
import { detectTouchPrimaryInput, JoystickUI, offsetToInput } from '../../src/ui/joystick'

describe('offsetToInput', () => {
  const R = 60

  it('returns zero when below deadzone', () => {
    const r = offsetToInput(5, 3, R)
    expect(r.steer).toBe(0)
    expect(r.throttle).toBe(0)
    expect(r.brake).toBe(false)
  })

  it('maps positive dx to right steer', () => {
    const r = offsetToInput(R * 0.8, 0, R)
    expect(r.steer).toBeGreaterThan(0.5)
    expect(r.throttle).toBe(0)
  })

  it('maps negative dx to left steer', () => {
    const r = offsetToInput(-R * 0.8, 0, R)
    expect(r.steer).toBeLessThan(-0.5)
  })

  it('maps upward drag to throttle', () => {
    const r = offsetToInput(0, -R * 0.8, R)
    expect(r.throttle).toBeGreaterThan(0.5)
    expect(r.brake).toBe(false)
  })

  it('maps downward drag to brake', () => {
    const r = offsetToInput(0, R * 0.8, R)
    expect(r.brake).toBe(true)
    expect(r.throttle).toBe(0)
  })

  it('clamps magnitude to 1 at full extension', () => {
    const r = offsetToInput(R * 2, 0, R)
    expect(Math.abs(r.steer)).toBeLessThanOrEqual(1)
  })

  it('combines steer and throttle for diagonal', () => {
    const r = offsetToInput(R * 0.7, -R * 0.7, R)
    expect(r.steer).toBeGreaterThan(0.3)
    expect(r.throttle).toBeGreaterThan(0.3)
  })
})

describe('JoystickUI', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('F3（F3）：reset 清空指针跟踪与输入缓存（isActive false、getInput 零输入）', () => {
    // stub 文档：createElement/body 返回带 style/classList/appendChild/clientWidth 的最小元素替身
    const elementStub = () => ({
      style: {},
      className: '',
      classList: { add: vi.fn(), remove: vi.fn() },
      appendChild: vi.fn(),
      clientWidth: 0,
    })
    vi.stubGlobal('document', {
      createElement: (): unknown => elementStub(),
      body: elementStub(),
    } as unknown as Document)
    // 记录 canvas 事件监听器：模拟触屏按下/拖动激活摇杆
    const listeners = new Map<string, Array<(e: unknown) => void>>()
    const canvas = {
      addEventListener: (type: string, cb: (e: unknown) => void): void => {
        const arr = listeners.get(type) ?? []
        arr.push(cb)
        listeners.set(type, arr)
      },
      setPointerCapture: vi.fn(),
    }
    const fire = (type: string, e: unknown): void => {
      for (const cb of listeners.get(type) ?? []) cb(e)
    }
    const joystick = new JoystickUI()
    joystick.attach(canvas as unknown as HTMLCanvasElement)
    // 触屏按下 + 拖动 → 激活且有转向输入
    fire('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 100, clientY: 100 })
    expect(joystick.isActive()).toBe(true)
    fire('pointermove', { pointerType: 'touch', pointerId: 7, clientX: 160, clientY: 100 })
    expect(joystick.getInput().steer).toBeGreaterThan(0)
    // reset → 指针跟踪清空 + 输入归零（供暂停进入时清理残留输入）
    joystick.reset()
    expect(joystick.isActive()).toBe(false)
    expect(joystick.getInput()).toEqual({ steer: 0, throttle: 0, brake: false })
  })
})

describe('detectTouchPrimaryInput 触屏判定（U-1，2026-08-05 审计）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** stub navigator/window 的触屏能力与主输入方式媒体查询 */
  function stubEnv(touchPoints: number, mediaMatches: boolean): void {
    vi.stubGlobal('navigator', { maxTouchPoints: touchPoints })
    vi.stubGlobal('window', {
      matchMedia: (q: string) => ({ matches: mediaMatches, media: q }),
    })
  }

  it('触屏能力 + 主输入触屏（hover:none 命中）→ true', () => {
    stubEnv(5, true)
    expect(detectTouchPrimaryInput()).toBe(true)
  })

  it('触屏能力但主输入键鼠（hover:hover + pointer:fine）→ false（带触屏的 Windows 笔记本不再常驻摇杆）', () => {
    stubEnv(10, false)
    expect(detectTouchPrimaryInput()).toBe(false)
  })

  it('无触屏能力 → false（即便媒体查询命中）', () => {
    stubEnv(0, true)
    expect(detectTouchPrimaryInput()).toBe(false)
  })

  it('matchMedia 不可用 → 回退能力判定保持旧行为', () => {
    vi.stubGlobal('navigator', { maxTouchPoints: 3 })
    vi.stubGlobal('window', {})
    expect(detectTouchPrimaryInput()).toBe(true)
  })
})
