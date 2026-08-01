import { describe, expect, it } from 'vitest'
import { BASS_LINE, MELODY_LINE, noteToFreq, tickMsForBpm } from '../../src/audio/music'

describe('noteToFreq 音符转频率', () => {
  it('A4 为 440Hz', () => {
    expect(noteToFreq('A4')).toBe(440)
  })

  it('C4 约 261.63Hz', () => {
    expect(noteToFreq('C4')).toBeCloseTo(261.63, 2)
  })

  it('A2 为 110Hz（低八度）', () => {
    expect(noteToFreq('A2')).toBe(110)
  })

  it('G5 约 783.99Hz（高八度）', () => {
    expect(noteToFreq('G5')).toBeCloseTo(783.99, 2)
  })

  it('非法音符抛错', () => {
    expect(() => noteToFreq('H9')).toThrow()
  })
})

describe('tickMsForBpm 节拍换算', () => {
  it('120 BPM 的 8 分音符为 250ms', () => {
    expect(tickMsForBpm(120)).toBe(250)
  })

  it('60 BPM 的 8 分音符为 500ms', () => {
    expect(tickMsForBpm(60)).toBe(500)
  })
})

describe('音乐序列', () => {
  it('低音线为 4 小节和声进行且全部低于 300Hz', () => {
    expect(BASS_LINE).toHaveLength(4)
    for (const note of BASS_LINE) {
      expect(noteToFreq(note)).toBeLessThan(300)
    }
  })

  it('旋律线为 8 个音且音域在 200-2000Hz', () => {
    expect(MELODY_LINE).toHaveLength(8)
    for (const note of MELODY_LINE) {
      const freq = noteToFreq(note)
      expect(freq).toBeGreaterThan(200)
      expect(freq).toBeLessThan(2000)
    }
  })
})
