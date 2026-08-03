/** 行进距离 → 圈数（1 基）：game 层共用（主循环圈数记录与 HUD 圈数显示） */
export function lapFromZ(cameraZ: number, lapLength: number): number {
  return Math.floor(cameraZ / lapLength) + 1
}
