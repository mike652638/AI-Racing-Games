import { describe, expect, it } from 'vitest'
import { touchToCarInput, type TouchPoint } from '../../src/physics/input'

const W = 1000
const H = 800

describe('touchToCarInput 四分区触控映射', () => {
  it('右上象限 = 油门', () => {
    const input = touchToCarInput([{ x: 750, y: 200 }], W, H)
    expect(input.throttle).toBe(1)
    expect(input.brake).toBe(false)
    expect(input.steer).toBe(0)
  })

  it('左上象限 = 刹车', () => {
    const input = touchToCarInput([{ x: 250, y: 200 }], W, H)
    expect(input.throttle).toBe(0)
    expect(input.brake).toBe(true)
  })

  it('左下象限 = 左转', () => {
    const input = touchToCarInput([{ x: 250, y: 600 }], W, H)
    expect(input.steer).toBe(-1)
  })

  it('右下象限 = 右转', () => {
    const input = touchToCarInput([{ x: 750, y: 600 }], W, H)
    expect(input.steer).toBe(1)
  })

  it('多点触控取并集：右上油门 + 右下右转', () => {
    const points: TouchPoint[] = [
      { x: 750, y: 200 },
      { x: 750, y: 600 },
    ]
    const input = touchToCarInput(points, W, H)
    expect(input.throttle).toBe(1)
    expect(input.steer).toBe(1)
  })

  it('分界线中心点归入右下象限（右转）', () => {
    const input = touchToCarInput([{ x: W / 2, y: H / 2 }], W, H)
    expect(input.steer).toBe(1)
  })

  it('无触点全为 0', () => {
    const input = touchToCarInput([], W, H)
    // G4：触屏无 boost 键，恒产出 boost:false（与键盘条件产出不同，恒有字段）
    expect(input).toEqual({ throttle: 0, brake: false, steer: 0, boost: false })
  })
})
