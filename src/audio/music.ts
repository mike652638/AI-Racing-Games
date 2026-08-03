/** 合成音乐播放器：WebAudio 无资源 chiptune 循环（低音 + 旋律 + 踩镲） */

const BPM = 120

/** 音符名 → 半音索引（相对 C） */
const NOTE_INDEX: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
}

/** 音符名转频率（'A4'=440Hz，支持 # 与 0-9 八度） */
export function noteToFreq(name: string): number {
  const match = /^([A-G]#?)(\d)$/.exec(name)
  if (!match || !(match[1] in NOTE_INDEX)) {
    throw new Error(`invalid note: ${name}`)
  }
  const semitone = NOTE_INDEX[match[1]] - 9
  const octave = Number(match[2]) - 4
  return 440 * 2 ** ((semitone + octave * 12) / 12)
}

/** BPM → 8 分音符时长（毫秒） */
export function tickMsForBpm(bpm: number): number {
  return 60000 / bpm / 2
}

/** 低音线：Am-F-C-G 四小节和声进行 */
export const BASS_LINE = ['A2', 'F2', 'C3', 'G2'] as const

/** 旋律线：8 个音循环 */
export const MELODY_LINE = ['A4', 'C5', 'E5', 'G5', 'E5', 'C5', 'A4', 'G4'] as const

/** 16 步循环的合成音乐播放器（与引擎音效共享 AudioContext） */
export class MusicPlayer {
  /** RAF 句柄：非 null 表示正在播放（代替 setInterval 定时器） */
  private timer: number | null = null
  private step = 0
  private nextTime = 0
  /** RAF 上一次回调的时间戳（毫秒） */
  private lastTime = 0
  /** 时间累积器（秒）：按固定步长触发调度 */
  private accumulator = 0
  /** 调度步长：30Hz，比 setInterval 更抗节流、更平滑 */
  private readonly STEP = 1 / 30

  constructor(private readonly ctx: AudioContext) {}

  get state(): 'stopped' | 'running' {
    return this.timer === null ? 'stopped' : 'running'
  }

  start(): void {
    if (this.timer !== null) return
    this.nextTime = this.ctx.currentTime + 0.1
    this.lastTime = performance.now()
    this.accumulator = 0
    this.timer = requestAnimationFrame(this.tick)
  }

  stop(): void {
    if (this.timer !== null) {
      cancelAnimationFrame(this.timer)
      this.timer = null
    }
  }

  /** RAF 驱动循环：按 30Hz 固定步长调用前瞻调度（页面隐藏时 RAF 自动暂停，恢复后 dt 受限不会突发） */
  private tick = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1) // 限制最大 dt，避免后台恢复时突发调度
    this.lastTime = now
    this.accumulator += dt

    while (this.accumulator >= this.STEP) {
      this.schedule()
      this.accumulator -= this.STEP
    }

    if (this.timer !== null) {
      this.timer = requestAnimationFrame(this.tick)
    }
  }

  /** 前瞻调度：把未来 0.2s 内的步进排入音频时钟 */
  private schedule(): void {
    const tickSec = tickMsForBpm(BPM) / 1000
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      this.playStep(this.step, this.nextTime)
      this.step = (this.step + 1) % 16
      this.nextTime += tickSec
    }
  }

  private playStep(step: number, when: number): void {
    const bass = noteToFreq(BASS_LINE[Math.floor(step / 4) % BASS_LINE.length])
    this.oscillator(bass, 'square', 0.1, when, tickMsForBpm(BPM) / 1000 * 0.9)
    if (step % 2 === 0) {
      const melody = noteToFreq(MELODY_LINE[Math.floor(step / 2) % MELODY_LINE.length])
      this.oscillator(melody, 'sawtooth', 0.06, when, tickMsForBpm(BPM) / 1000 * 0.5)
    }
    if (step % 4 === 0) {
      this.hat(when)
    }
  }

  private oscillator(
    freq: number,
    type: OscillatorType,
    gainValue: number,
    when: number,
    duration: number,
  ): void {
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(gainValue, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration)
    osc.connect(gain).connect(this.ctx.destination)
    osc.start(when)
    osc.stop(when + duration)
  }

  /** 白噪声踩镲：短促高频衰减 */
  private hat(when: number): void {
    const buffer = this.ctx.createBuffer(1, 4096, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }
    const src = this.ctx.createBufferSource()
    const gain = this.ctx.createGain()
    src.buffer = buffer
    gain.gain.setValueAtTime(0.04, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05)
    src.connect(gain).connect(this.ctx.destination)
    src.start(when)
  }
}
