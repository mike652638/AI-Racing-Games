import { describe, it, expect } from 'vitest'
import { TouchQuadrantInput } from '../../src/ui/touch-quadrant'

/** 构造最小 canvas 替身：记录事件监听器、返回固定视口 rect */
function makeCanvas(
  width = 1000,
  height = 800,
): {
  canvas: unknown
  fire: (type: string, e: unknown) => void
} {
  const listeners = new Map<string, Array<(e: unknown) => void>>()
  const canvas = {
    addEventListener: (type: string, cb: (e: unknown) => void): void => {
      const arr = listeners.get(type) ?? []
      arr.push(cb)
      listeners.set(type, arr)
    },
    removeEventListener: (type: string, cb: (e: unknown) => void): void => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((fn) => fn !== cb),
      )
    },
    setPointerCapture: (): void => {},
    getBoundingClientRect: (): { width: number; height: number; left: number; top: number } => ({
      width,
      height,
      left: 0,
      top: 0,
    }),
  }
  const fire = (type: string, e: unknown): void => {
    for (const cb of listeners.get(type) ?? []) cb(e)
  }
  return { canvas, fire }
}

/** 触屏 pointer 事件替身 */
function touchEvent(pointerId: number, x: number, y: number): unknown {
  return { pointerType: 'touch', pointerId, clientX: x, clientY: y }
}

describe('TouchQuadrantInput 分屏四分区触控（M21 遗留技术债修复）', () => {
  it('分屏：左半屏右上触点 → P1 油门，P2 零输入', () => {
    const { canvas, fire } = makeCanvas(1000, 800)
    const tq = new TouchQuadrantInput(true)
    tq.attach(canvas as unknown as HTMLCanvasElement)
    fire('pointerdown', touchEvent(1, 250, 200)) // 左半屏右上 = 油门
    expect(tq.isP1Active()).toBe(true)
    expect(tq.getP1Input()).toEqual({ throttle: 1, brake: false, steer: 0, boost: false })
    expect(tq.isP2Active()).toBe(false)
    expect(tq.getP2Input()).toEqual({ throttle: 0, brake: false, steer: 0, boost: false })
  })

  it('分屏：右半屏触点 → P2 输入，P1 零输入（左右半屏隔离）', () => {
    const { canvas, fire } = makeCanvas(1000, 800)
    const tq = new TouchQuadrantInput(true)
    tq.attach(canvas as unknown as HTMLCanvasElement)
    fire('pointerdown', touchEvent(1, 750, 600)) // 右半屏右下 = 右转
    expect(tq.isP1Active()).toBe(false)
    expect(tq.getP1Input()).toEqual({ throttle: 0, brake: false, steer: 0, boost: false })
    expect(tq.isP2Active()).toBe(true)
    expect(tq.getP2Input()).toEqual({ throttle: 0, brake: false, steer: 1, boost: false })
  })

  it('分屏：P1 左下左转 + P2 右上油门 多点并存（双人同时操控）', () => {
    const { canvas, fire } = makeCanvas(1000, 800)
    const tq = new TouchQuadrantInput(true)
    tq.attach(canvas as unknown as HTMLCanvasElement)
    fire('pointerdown', touchEvent(1, 200, 600)) // P1 左下 = 左转
    fire('pointerdown', touchEvent(2, 750, 200)) // P2 右上 = 油门
    expect(tq.getP1Input().steer).toBe(-1)
    expect(tq.getP1Input().throttle).toBe(0)
    expect(tq.getP2Input().throttle).toBe(1)
    expect(tq.getP2Input().steer).toBe(0)
  })

  it('分屏：pointermove 更新触点、pointerup 清空对应触点', () => {
    const { canvas, fire } = makeCanvas(1000, 800)
    const tq = new TouchQuadrantInput(true)
    tq.attach(canvas as unknown as HTMLCanvasElement)
    fire('pointerdown', touchEvent(1, 200, 400)) // P1 左下 = 左转
    fire('pointermove', touchEvent(1, 750, 200)) // 移到右半屏右上 → 变为 P2 油门
    expect(tq.isP1Active()).toBe(false)
    expect(tq.getP2Input().throttle).toBe(1)
    fire('pointerup', touchEvent(1, 750, 200))
    expect(tq.isP2Active()).toBe(false)
    expect(tq.getP2Input()).toEqual({ throttle: 0, brake: false, steer: 0, boost: false })
  })

  it('reset 清空全部触点（暂停进入时防残留输入）', () => {
    const { canvas, fire } = makeCanvas(1000, 800)
    const tq = new TouchQuadrantInput(true)
    tq.attach(canvas as unknown as HTMLCanvasElement)
    fire('pointerdown', touchEvent(1, 250, 200))
    expect(tq.isP1Active()).toBe(true)
    tq.reset()
    expect(tq.isP1Active()).toBe(false)
    expect(tq.getP1Input()).toEqual({ throttle: 0, brake: false, steer: 0, boost: false })
  })

  it('非 pointerType=touch 事件被忽略（不影响键盘）', () => {
    const { canvas, fire } = makeCanvas(1000, 800)
    const tq = new TouchQuadrantInput(true)
    tq.attach(canvas as unknown as HTMLCanvasElement)
    fire('pointerdown', { pointerType: 'mouse', pointerId: 1, clientX: 250, clientY: 200 })
    expect(tq.isP1Active()).toBe(false)
    expect(tq.getP1Input()).toEqual({ throttle: 0, brake: false, steer: 0, boost: false })
  })

  it('detach 后事件不再响应（destroy 清理）', () => {
    const { canvas, fire } = makeCanvas(1000, 800)
    const tq = new TouchQuadrantInput(true)
    tq.attach(canvas as unknown as HTMLCanvasElement)
    tq.detach()
    fire('pointerdown', touchEvent(1, 250, 200))
    expect(tq.isP1Active()).toBe(false)
  })
})

describe('TouchQuadrantInput 非分屏回退（全部触点归 P1）', () => {
  it('splitMode=false：任意位置触点 → P1 输入，P2 恒零', () => {
    const { canvas, fire } = makeCanvas(1000, 800)
    const tq = new TouchQuadrantInput(false)
    tq.attach(canvas as unknown as HTMLCanvasElement)
    fire('pointerdown', touchEvent(1, 750, 200)) // 整屏右上 = 油门
    expect(tq.isP1Active()).toBe(true)
    expect(tq.getP1Input()).toEqual({ throttle: 1, brake: false, steer: 0, boost: false })
    expect(tq.isP2Active()).toBe(false)
    expect(tq.getP2Input()).toEqual({ throttle: 0, brake: false, steer: 0, boost: false })
  })
})
