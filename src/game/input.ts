import { PLAYER1_MAPPING, PLAYER2_MAPPING, inputFromKeys } from '../physics/input'
import type { CarInput } from '../physics/car'

export function createInputManager(win: Window): {
  pressed: Set<string>
  getP1Input: () => CarInput
  getP2Input: () => CarInput
  destroy: () => void
} {
  const pressed = new Set<string>()

  const onKeyDown = (e: KeyboardEvent) => pressed.add(e.code)
  const onKeyUp = (e: KeyboardEvent) => pressed.delete(e.code)

  win.addEventListener('keydown', onKeyDown)
  win.addEventListener('keyup', onKeyUp)

  return {
    pressed,
    getP1Input(): CarInput {
      return inputFromKeys(pressed, PLAYER1_MAPPING)
    },
    getP2Input(): CarInput {
      return inputFromKeys(pressed, PLAYER2_MAPPING)
    },
    destroy() {
      win.removeEventListener('keydown', onKeyDown)
      win.removeEventListener('keyup', onKeyUp)
    },
  }
}
