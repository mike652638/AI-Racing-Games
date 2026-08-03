/** 圈数计算：下沉到 game/lap.ts，此处 re-export 保持消费方（hud 等）兼容 */
export { lapFromZ } from '../game/lap'

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

/**
 * 累计时间数组 → 每圈单圈用时格式化
 * lapTimes[0] = 第 1 圈用时，lapTimes[i] - lapTimes[i-1] = 第 i+1 圈用时
 */
export function formatLapTimes(lapTimes: number[]): string[] {
  return lapTimes.map((cum, i) => {
    const lapSec = i === 0 ? cum : cum - lapTimes[i - 1]
    return `LAP ${i + 1}: ${formatTime(lapSec)}`
  })
}
