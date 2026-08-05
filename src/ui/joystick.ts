/**
 * 可视化虚拟摇杆：在 canvas 附近显示底盘+圆钮，
 * touch 拖动映射为 steer（左右）+ throttle/brake（上下）。
 * 鼠标/笔事件不影响键盘操作（仅处理 pointerType=touch）。
 */
export interface JoystickInput {
  steer: number
  throttle: number
  brake: boolean
  /** BOOST（G4：触屏摇杆恒不产出，undefined 与 CarInput.boost 兼容） */
  boost?: boolean
}

const DEADZONE = 0.15
const RADIUS = 60

/**
 * 触屏设备判定（U-1，2026-08-05 审计修复）：触屏能力（maxTouchPoints/ontouchstart）
 * 与主输入方式（hover:none 或 pointer:coarse）取交集——
 * 旧版仅凭能力判定，带触屏的 Windows 笔记本（maxTouchPoints>0 但 hover:hover/pointer:fine）
 * 会常驻幽灵摇杆；matchMedia 不可用（部分测试环境）时回退能力判定保持旧行为。
 */
export function detectTouchPrimaryInput(): boolean {
  const hasTouchCapability =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 0 || (typeof window !== 'undefined' && 'ontouchstart' in window))
  if (!hasTouchCapability) return false
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(hover: none), (pointer: coarse)').matches
}

/** JoystickUI 构造选项（U-4：分屏模式不常驻摇杆，触屏玩法为四分区触控） */
export interface JoystickUIOptions {
  /** 分屏模式：不加 touch-visible 常驻类（四分区已有 #touch-hint 引导） */
  splitMode?: boolean
}

export function offsetToInput(dx: number, dy: number, radius: number): JoystickInput {
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
  /** 触屏设备：摇杆常驻右下角（touch-visible 类 + fixed 定位），非触屏保持按下才显示 */
  private readonly isTouchDevice: boolean

  constructor(options: JoystickUIOptions = {}) {
    this.isTouchDevice = detectTouchPrimaryInput()
    this.base = document.createElement('div')
    this.base.className = 'joystick-base'
    if (this.isTouchDevice && !options.splitMode) {
      this.base.classList.add('touch-visible')
    }
    this.knob = document.createElement('div')
    this.knob.className = 'joystick-knob'
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
      const baseSize = this.base.clientWidth
      this.base.style.left = `${e.clientX - baseSize / 2}px`
      this.base.style.top = `${e.clientY - baseSize / 2}px`
      this.base.style.display = 'block'
      this.base.classList.add('active')
      canvas.setPointerCapture(e.pointerId)
    })

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || e.pointerId !== this.activeId) return
      const dx = e.clientX - this.startX
      const dy = e.clientY - this.startY
      this.input = offsetToInput(dx, dy, RADIUS)
      const clampedDx = Math.max(-RADIUS, Math.min(RADIUS, dx))
      const clampedDy = Math.max(-RADIUS, Math.min(RADIUS, dy))
      this.knob.style.transform = `translate(calc(-50% + ${clampedDx}px), calc(-50% + ${clampedDy}px))`
    })

    const endTouch = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || e.pointerId !== this.activeId) return
      this.activeId = null
      this.input = { steer: 0, throttle: 0, brake: false }
      this.base.classList.remove('active')
      if (this.isTouchDevice) {
        // 触屏设备常驻：清除内联定位，摇杆回到 CSS fixed 右下角（不再 display:none）
        this.base.style.left = ''
        this.base.style.top = ''
      } else {
        this.base.style.display = 'none'
      }
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

  /** 清空指针跟踪与输入缓存（F3：进入暂停时调用，防止恢复首帧残留输入） */
  reset(): void {
    this.activeId = null
    this.input = { steer: 0, throttle: 0, brake: false }
    this.base.classList.remove('active')
    if (this.isTouchDevice) {
      // 触屏设备常驻：清除内联定位回到右下角，不隐藏摇杆
      this.base.style.left = ''
      this.base.style.top = ''
    } else {
      this.base.style.display = 'none'
    }
  }
}
