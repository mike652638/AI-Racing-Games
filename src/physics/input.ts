import type { CarInput } from './car'

export interface PlayerMapping {
  up: string
  down: string
  left: string
  right: string
}

/** P1：WASD */
export const PLAYER1_MAPPING: PlayerMapping = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
}

/** P2：方向键 */
export const PLAYER2_MAPPING: PlayerMapping = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
}

/** 从按键集合生成车辆输入（左右同按抵消） */
export function inputFromKeys(pressed: Set<string>, mapping: PlayerMapping): CarInput {
  return {
    throttle: pressed.has(mapping.up) ? 1 : 0,
    brake: pressed.has(mapping.down),
    steer: (pressed.has(mapping.right) ? 1 : 0) - (pressed.has(mapping.left) ? 1 : 0),
  }
}
