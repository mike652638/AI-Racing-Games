import { describe, expect, test } from 'vitest'
import { formatSpeed, formatTime, formatLap, formatLapTimes, lapFromZ } from '../../src/ui/format'

describe('formatSpeed', () => {
  test('速度按 maxSpeed=6000 → 320km/h 线性换算', () => {
    expect(formatSpeed(0, 6000)).toBe('0')
    expect(formatSpeed(3000, 6000)).toBe('160')
    expect(formatSpeed(6000, 6000)).toBe('320')
  })
})

describe('formatTime', () => {
  test('MM:SS.mmm 格式', () => {
    expect(formatTime(65.4)).toBe('1:05.400')
    expect(formatTime(9.05)).toBe('0:09.050')
    expect(formatTime(0)).toBe('0:00.000')
  })
})

describe('formatLap / lapFromZ', () => {
  test('从行进距离推导圈数（1 基）', () => {
    expect(lapFromZ(0, 40000)).toBe(1)
    expect(lapFromZ(39999, 40000)).toBe(1)
    expect(lapFromZ(40000, 40000)).toBe(2)
    expect(lapFromZ(80000, 40000)).toBe(3)
  })
  test('formatLap 显示 1/3 形式', () => {
    expect(formatLap(1, 3)).toBe('LAP 1/3')
  })
})

describe('formatLapTimes', () => {
  test('格式化每圈用时列表', () => {
    expect(formatLapTimes([25.123, 50.456])).toEqual(['LAP 1: 0:25.123', 'LAP 2: 0:25.333'])
  })
  test('空数组返回空', () => {
    expect(formatLapTimes([])).toEqual([])
  })
})
