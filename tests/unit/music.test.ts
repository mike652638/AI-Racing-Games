import { describe, expect, it } from 'vitest'
import {
  BASS_LINE,
  MELODY_LINE,
  nextStep,
  noteToFreq,
  stepEvents,
  tickMsForBpm,
} from '../../src/audio/music'

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

describe('调度纯函数', () => {
  it('stepEvents(0)：低音 BASS_LINE[0]、旋律 MELODY_LINE[0]、踩镲', () => {
    const ev = stepEvents(0)
    expect(ev.bass).toBe(BASS_LINE[0])
    expect(ev.melody).toBe(MELODY_LINE[0])
    expect(ev.hat).toBe(true)
  })

  it('stepEvents(1)：仅低音（无旋律无踩镲）', () => {
    const ev = stepEvents(1)
    expect(ev.bass).toBe(BASS_LINE[Math.floor(1 / 4) % 4])
    expect(ev.melody).toBeNull()
    expect(ev.hat).toBe(false)
  })

  it('stepEvents(2)：旋律为 MELODY_LINE[1]', () => {
    const ev = stepEvents(2)
    expect(ev.melody).toBe(MELODY_LINE[1])
  })

  it('nextStep 循环推进：0→1、15→0', () => {
    expect(nextStep(0)).toBe(1)
    expect(nextStep(15)).toBe(0)
  })
})
