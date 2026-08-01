import {
  PLAYER1_MAPPING,
  PLAYER2_MAPPING,
  touchToCarInput,
  inputFromKeys,
  type TouchPoint,
} from '../physics/input'
import type { CarInput } from '../physics/car'

export function createInputManager(
  win: Window,
  canvas: HTMLCanvasElement,
): {
  pressed: Set<string>
  touchPoints: Map<number, TouchPoint>
  getP1Input: () => CarInput
  getP2Input: () => CarInput
  destroy: () => void
} {
  const pressed = new Set<string>()
  const touchPoints = new Map<number, TouchPoint>()

  const onKeyDown = (e: KeyboardEvent) => pressed.add(e.code)
  const onKeyUp = (e: KeyboardEvent) => pressed.delete(e.code)

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    canvas.setPointerCapture(e.pointerId)
    touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !touchPoints.has(e.pointerId)) return
    touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    touchPoints.delete(e.pointerId)
  }

  win.addEventListener('keydown', onKeyDown)
  win.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)

  return {
    pressed,
    touchPoints,
    getP1Input(): CarInput {
      if (touchPoints.size > 0) {
        return touchToCarInput(
          [...touchPoints.values()],
          win.innerWidth,
          win.innerHeight,
        )
      }
      return inputFromKeys(pressed, PLAYER1_MAPPING)
    },
    getP2Input(): CarInput {
      return inputFromKeys(pressed, PLAYER2_MAPPING)
    },
    destroy() {
      win.removeEventListener('keydown', onKeyDown)
      win.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    },
  }
}
