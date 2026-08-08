import type { CarInput } from '../physics/car'
import { touchToCarInput } from '../physics/input'

/**
 * 分屏四分区触控输入（M21 遗留技术债修复，2026-08-08）：
 * U-4 注释声明的「分屏模式触屏玩法为四分区触控」此前仅停留在注释，
 * touchToCarInput 从未接入生产——分屏触屏实际走「触摸临时出现摇杆、仅控制 P1」路径。
 * 本类监听 canvas pointer 事件（仅 touch），按屏幕左右半屏归属 P1/P2，
 * 各自半屏内四分区映射（右上油门 / 左上刹车 / 左下左转 / 右下右转），
 * 与 physics/input.ts 的 touchToCarInput 纯函数同源（复用既有单测语义）。
 * 非分屏（splitMode=false）时全部触点归 P1，作为单屏四分区回退（生产暂不启用）。
 */
export interface TouchQuadrantPoint {
  x: number
  y: number
}

export class TouchQuadrantInput {
  private readonly active = new Map<number, TouchQuadrantPoint>()
  private readonly splitMode: boolean
  private canvas: HTMLCanvasElement | null = null
  private detachFns: Array<() => void> = []

  constructor(splitMode: boolean) {
    this.splitMode = splitMode
  }

  attach(canvas: HTMLCanvasElement): void {
    if (this.detachFns.length > 0) this.detach()
    this.canvas = canvas
    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      this.active.set(e.pointerId, { x: e.clientX, y: e.clientY })
      canvas.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      if (this.active.has(e.pointerId)) {
        this.active.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }
    }
    const endTouch = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return
      this.active.delete(e.pointerId)
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', endTouch)
    canvas.addEventListener('pointercancel', endTouch)
    this.detachFns.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', endTouch)
      canvas.removeEventListener('pointercancel', endTouch)
    })
  }

  /** 解除绑定并清空触点（destroy 调用） */
  detach(): void {
    this.detachFns.forEach((fn) => {
      try {
        fn()
      } catch {
        // 单项清理失败不影响其余
      }
    })
    this.detachFns = []
    this.reset()
  }

  /** 清空触点（进入暂停时调用，防恢复首帧残留输入） */
  reset(): void {
    this.active.clear()
  }

  /** 画布视口尺寸（getBoundingClientRect 优先；stub 环境无该方法时回退 canvas.width/height，再回退 window） */
  private view(): { width: number; height: number; left: number; top: number } {
    if (this.canvas) {
      const rect = (
        this.canvas as HTMLCanvasElement & { getBoundingClientRect?: () => DOMRect }
      ).getBoundingClientRect?.()
      if (rect && rect.width > 0 && rect.height > 0)
        return { width: rect.width, height: rect.height, left: rect.left, top: rect.top }
      if (this.canvas.width > 0 && this.canvas.height > 0)
        return { width: this.canvas.width, height: this.canvas.height, left: 0, top: 0 }
    }
    return { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 }
  }

  /** 某玩家半屏的触点（坐标归一化到该半屏：P1 保持原点、P2 减半屏宽） */
  private pointsInHalf(half: 1 | 2): TouchQuadrantPoint[] {
    const { width, left, top } = this.view()
    if (!this.splitMode) {
      // 非分屏：全部触点归 P1
      if (half === 2) return []
      return Array.from(this.active.values()).map((p) => ({ x: p.x - left, y: p.y - top }))
    }
    const mid = width / 2
    const points: TouchQuadrantPoint[] = []
    for (const p of this.active.values()) {
      const lx = p.x - left
      const ly = p.y - top
      const onLeft = lx < mid
      if (half === 1 && onLeft) points.push({ x: lx, y: ly })
      else if (half === 2 && !onLeft) points.push({ x: lx - mid, y: ly })
    }
    return points
  }

  isP1Active(): boolean {
    return this.pointsInHalf(1).length > 0
  }

  getP1Input(): CarInput {
    const { width, height } = this.view()
    const halfW = this.splitMode ? width / 2 : width
    return touchToCarInput(this.pointsInHalf(1), halfW, height)
  }

  isP2Active(): boolean {
    return this.pointsInHalf(2).length > 0
  }

  getP2Input(): CarInput {
    const { width, height } = this.view()
    const halfW = this.splitMode ? width / 2 : width
    return touchToCarInput(this.pointsInHalf(2), halfW, height)
  }
}
