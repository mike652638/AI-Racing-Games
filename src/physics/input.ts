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

export interface TouchPoint {
  x: number
  y: number
}

/**
 * 触屏四分区映射为车辆输入：
 * 左上=刹车、右上=油门、左下=左转、右下=右转；多点取并集
 */
export function touchToCarInput(
  touches: TouchPoint[],
  width: number,
  height: number,
): CarInput {
  let up = false
  let down = false
  let left = false
  let right = false
  for (const touch of touches) {
    const onLeft = touch.x < width / 2
    const onTop = touch.y < height / 2
    if (onLeft && onTop) down = true
    else if (!onLeft && onTop) up = true
    else if (onLeft && !onTop) left = true
    else right = true
  }
  return {
    throttle: up ? 1 : 0,
    brake: down,
    steer: (right ? 1 : 0) - (left ? 1 : 0),
  }
}
