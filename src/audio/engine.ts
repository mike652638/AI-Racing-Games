export const MIN_FREQUENCY = 55
export const MAX_FREQUENCY = 220

export interface EngineParams {
  frequency: number
  gain: number
}

/** 速度比（0..1）→ 引擎声参数（纯函数，可单测） */
export function computeEngineParams(speedRatio: number): EngineParams {
  const ratio = Math.max(0, Math.min(1, speedRatio))
  return {
    frequency: MIN_FREQUENCY + (MAX_FREQUENCY - MIN_FREQUENCY) * ratio,
    gain: 0.06 + 0.14 * ratio,
  }
}

/** WebAudio 引擎声合成器（双锯齿波 + 低通滤波） */
export class EngineSound {
  private ctx: AudioContext
  private gain: GainNode
  private filter: BiquadFilterNode
  private oscs: OscillatorNode[]

  constructor(ctx: AudioContext, output: AudioNode = ctx.destination) {
    this.ctx = ctx
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 800
    this.oscs = [0, 7].map(detune => {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.detune.value = detune
      osc.connect(this.filter)
      osc.start()
      return osc
    })
    this.filter.connect(this.gain)
    this.gain.connect(output)
  }

  /** 当前 AudioContext 状态（调试/验证用） */
  get state(): AudioContextState {
    return this.ctx.state
  }

  setSpeedRatio(ratio: number): void {
    const { frequency, gain } = computeEngineParams(ratio)
    const now = this.ctx.currentTime
    this.oscs.forEach(osc => osc.frequency.setTargetAtTime(frequency, now, 0.05))
    this.filter.frequency.setTargetAtTime(300 + frequency * 6, now, 0.05)
    this.gain.gain.setTargetAtTime(gain, now, 0.05)
  }

  start(): void {
    this.ctx.resume()
    this.gain.gain.value = 0.05
  }

  stop(): void {
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
  }
}

/** 雨声环境音：2 秒白噪声循环 buffer → bandpass 800Hz → gain 0.05 → output（WebAudio 合成） */
export class RainSound {
  private ctx: AudioContext
  private filter: BiquadFilterNode
  private gain: GainNode
  private buffer: AudioBuffer
  private source: AudioBufferSourceNode | null = null
  private started = false

  constructor(ctx: AudioContext, output: AudioNode = ctx.destination) {
    this.ctx = ctx
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'bandpass'
    this.filter.frequency.value = 800
    this.filter.Q.value = 1
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.filter.connect(this.gain)
    this.gain.connect(output)
    // 2 秒白噪声 buffer（循环播放，模拟雨声底噪）
    const length = Math.floor(ctx.sampleRate * 2)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    this.buffer = buffer
  }

  /** 是否正在播放（debug hook / 冒烟断言用） */
  isPlaying(): boolean {
    return this.started
  }

  /** 启动雨声（幂等）：resume ctx + bufferSource 惰性创建 + gain 渐入 */
  start(): void {
    if (this.started) return
    this.started = true
    this.ctx.resume()
    const source = this.ctx.createBufferSource()
    source.buffer = this.buffer
    source.loop = true
    source.connect(this.filter)
    source.start()
    this.source = source
    this.gain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.5)
  }

  /** 停止雨声（幂等）：gain 渐出并停止 source */
  stop(): void {
    if (!this.started) return
    this.started = false
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3)
    this.source?.stop()
    this.source = null
  }
}

/** 碰撞冲击音：0.15s 白噪声 burst → lowpass 300Hz → gain 0.25 → output（80ms 防刷屏） */
export class CollisionSound {
  private ctx: AudioContext
  private filter: BiquadFilterNode
  private gain: GainNode
  private buffer: AudioBuffer
  private lastPlayTime = -Infinity
  private playCount = 0

  constructor(ctx: AudioContext, output: AudioNode = ctx.destination) {
    this.ctx = ctx
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 300
    this.gain = ctx.createGain()
    this.gain.gain.value = 0.25
    this.filter.connect(this.gain)
    this.gain.connect(output)
    // 0.15s 白噪声 burst buffer
    const length = Math.floor(ctx.sampleRate * 0.15)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    this.buffer = buffer
  }

  /** 已触发播放次数（测试/冒烟断言用） */
  get count(): number {
    return this.playCount
  }

  /** 触发碰撞音（每次重建 BufferSource；80ms 内重复触发跳过，防连续碰撞刷屏）。
   *  volume 为碰撞强度（0-1 速度比），增益 = 0.25 × clamp(volume, 0.4, 1)（高速撞击更响） */
  play(volume = 1): void {
    const now = this.ctx.currentTime
    if (now - this.lastPlayTime < 0.08) return
    this.lastPlayTime = now
    this.playCount++
    this.gain.gain.value = 0.25 * Math.min(Math.max(volume, 0.4), 1)
    const source = this.ctx.createBufferSource()
    source.buffer = this.buffer
    source.connect(this.filter)
    source.start(0)
  }
}

/** BOOST 氮气音效：sawtooth 200→600Hz 线性扫频 0.25s + gain 0.15 包络（每次 play 重建节点，无防刷屏） */
export class BoostSound {
  private ctx: AudioContext
  private output: AudioNode
  private playCount = 0

  constructor(ctx: AudioContext, output: AudioNode = ctx.destination) {
    this.ctx = ctx
    this.output = output
  }

  /** 已触发播放次数（测试/冒烟断言用） */
  get count(): number {
    return this.playCount
  }

  /** 触发 BOOST 音：200→600Hz 线性扫频（0.25s）+ attack 0.02s / decay 0.25s 增益包络 */
  play(): void {
    const t = this.ctx.currentTime
    this.playCount++
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(200, t)
    osc.frequency.linearRampToValueAtTime(600, t + 0.25)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.15, t + 0.02)
    gain.gain.linearRampToValueAtTime(0, t + 0.25)
    osc.connect(gain).connect(this.output)
    osc.start(t)
    osc.stop(t + 0.26)
  }
}
