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

  constructor(ctx: AudioContext) {
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
    this.gain.connect(ctx.destination)
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
