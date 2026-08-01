/**
 * 可视化虚拟摇杆：在 canvas 附近显示底盘+圆钮，
 * touch 拖动映射为 steer（左右）+ throttle/brake（上下）。
 * 鼠标/笔事件不影响键盘操作（仅处理 pointerType=touch）。
 */
export interface JoystickInput {
  steer: number
  throttle: number
  brake: boolean
}

const DEADZONE = 0.15
const RADIUS = 60

export function offsetToInput(
  dx: number,
  dy: number,
  radius: number,
): JoystickInput {
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < DEADZONE * radius) {
    return { steer: 0, throttle: 0, brake: false }
  }
  const nx = dx / dist
  const ny = dy / dist
  const magnitude = Math.min(dist / radius, 1)
  return {
    steer: nx * magnitude,
    throttle: -ny * magnitude > 0 ? -ny * magnitude : 0,
    brake: ny * magnitude > 0.2,
  }
}

export class JoystickUI {
  private base: HTMLDivElement
  private knob: HTMLDivElement
  private container: HTMLElement
  private activeId: number | null = null
  private startX = 0
  private startY = 0
  private input: JoystickInput = { steer: 0, throttle: 0, brake: false }

  constructor() {
    this.base = document.createElement('div')
    this.base.style.cssText =
      'position:fixed;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.12);border:2px solid rgba(255,255,255,0.25);display:none;z-index:100;pointer-events:none;'
    this.knob = document.createElement('div')
    this.knob.style.cssText =
      'position:absolute;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.45);left:38px;top:38px;'
    this.base.appendChild(this.knob)
    this.container = document.body
  }

  attach(canvas: HTMLCanvasElement): void {
    this.container.appendChild(this.base)

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return
      this.activeId = e.pointerId
      this.startX = e.clientX
      this.startY = e.clientY
      this.base.style.left = `${e.clientX - 60}px`
      this.base.style.top = `${e.clientY - 60}px`
      this.base.style.display = 'block'
      canvas.setPointerCapture(e.pointerId)
    })

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || e.pointerId !== this.activeId) return
      const dx = e.clientX - this.startX
      const dy = e.clientY - this.startY
      this.input = offsetToInput(dx, dy, RADIUS)
      const clampedDx = Math.max(-RADIUS, Math.min(RADIUS, dx))
      const clampedDy = Math.max(-RADIUS, Math.min(RADIUS, dy))
      this.knob.style.left = `${38 + clampedDx}px`
      this.knob.style.top = `${38 + clampedDy}px`
    })

    const endTouch = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || e.pointerId !== this.activeId) return
      this.activeId = null
      this.input = { steer: 0, throttle: 0, brake: false }
      this.base.style.display = 'none'
    }
    canvas.addEventListener('pointerup', endTouch)
    canvas.addEventListener('pointercancel', endTouch)
  }

  getInput(): JoystickInput {
    return this.input
  }

  isActive(): boolean {
    return this.activeId !== null
  }
}
