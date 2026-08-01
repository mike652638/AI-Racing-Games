/** 速度（世界单位/秒）→ km/h 显示值：maxSpeed 对应 320 km/h */
export function formatSpeed(speed: number, maxSpeed: number): string {
  return String(Math.round((speed / maxSpeed) * 320))
}

/** 秒 → M:SS.mmm */
export function formatTime(sec: number): string {
  const totalMs = Math.max(0, Math.round(sec * 1000))
  const minutes = Math.floor(totalMs / 60000)
  const rest = totalMs % 60000
  const seconds = Math.floor(rest / 1000)
  const ms = rest % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

/** 圈数显示 */
export function formatLap(lap: number, totalLaps: number): string {
  return `LAP ${lap}/${totalLaps}`
}

/** 行进距离 → 圈数（1 基） */
export function lapFromZ(cameraZ: number, lapLength: number): number {
  return Math.floor(cameraZ / lapLength) + 1
}
