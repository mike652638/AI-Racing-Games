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
    this.oscs = [0, 7].map((detune) => {
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
    this.oscs.forEach((osc) => osc.frequency.setTargetAtTime(frequency, now, 0.05))
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

  /** R8：显式释放节点（构造即 start 的振荡器，页面销毁时须 stop 防音频上下文占用）。
   *  幂等；stop() 仅静音不释放，destroy() 停止振荡器并断开节点图 */
  destroy(): void {
    this.oscs.forEach((osc) => {
      try {
        osc.stop()
      } catch {
        // 已停止的振荡器再 stop 抛错，忽略
      }
      if (typeof osc.disconnect === 'function') osc.disconnect()
    })
    if (typeof this.filter.disconnect === 'function') this.filter.disconnect()
    if (typeof this.gain.disconnect === 'function') this.gain.disconnect()
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

/** 碰撞冲击音（M16 增强）：白噪声 burst → lowpass 300Hz + 低频正弦冲击层（sine 55Hz 指数衰减 0.12s），
 *  两者混合输出；动态范围扩大（增益 = 0.32 × clamp(volume, 0.1, 1)）——低速轻微、高速重击（80ms 防刷屏） */
export class CollisionSound {
  private ctx: AudioContext
  private filter: BiquadFilterNode
  private noiseGain: GainNode
  private thumpGain: GainNode
  private outGain: GainNode
  private buffer: AudioBuffer
  private lastPlayTime = -Infinity
  private playCount = 0

  constructor(ctx: AudioContext, output: AudioNode = ctx.destination) {
    this.ctx = ctx
    // 噪声层：白噪声 → lowpass 300Hz（碰撞"砰"的冲击质感）
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 300
    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.value = 1
    this.filter.connect(this.noiseGain)
    // 低频冲击层：正弦波 → gain（碰撞"咚"的物理重击，低速时几乎无声）
    this.thumpGain = ctx.createGain()
    this.thumpGain.gain.value = 0
    // 混合输出
    this.outGain = ctx.createGain()
    this.outGain.gain.value = 0.32
    this.noiseGain.connect(this.outGain)
    this.thumpGain.connect(this.outGain)
    this.outGain.connect(output)
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
   *  volume 为碰撞强度（0-1 速度比），总增益 = 0.32 × clamp(volume, 0.1, 1)；
   *  低频冲击层增益 = 0.5 × clamp(volume, 0.15, 1)（高速撞击"咚"感更重，低速几乎纯噪声） */
  play(volume = 1): void {
    const now = this.ctx.currentTime
    if (now - this.lastPlayTime < 0.08) return
    this.lastPlayTime = now
    this.playCount++
    const v = Math.min(Math.max(volume, 0.1), 1)
    this.outGain.gain.value = 0.32 * v
    // 白噪声 burst
    const source = this.ctx.createBufferSource()
    source.buffer = this.buffer
    source.connect(this.filter)
    source.start(0)
    // 低频冲击层：55Hz 正弦，gain 指数衰减 0.12s（重击质感）
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 55
    const thump = Math.min(Math.max(volume, 0.15), 1) * 0.5
    this.thumpGain.gain.setValueAtTime(thump, now)
    this.thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
    osc.connect(this.thumpGain)
    osc.start(now)
    osc.stop(now + 0.15)
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

// ============ M15（M15）：漂移摩擦胎声与轻量胎噪（WebAudio 程序化合成） ============

/** 归一化辅助：钳制到 [0, 1]（speedRatio 可被 BOOST 推到 1.15，转向输入也可能越界） */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** 漂移胎声：带通滤波器中心频率下限（Hz）——低速漂移的摩擦嘶声基调 */
export const DRIFT_FREQ_MIN = 700
/** 漂移胎声：带通滤波器中心频率上限（Hz）——满速漂移更尖锐 */
export const DRIFT_FREQ_MAX = 2000
/** 漂移胎声增益上限（注入 sfxGain 前的最大幅度） */
export const DRIFT_GAIN_MAX = 0.3
/** 湿滑路面：胎声中心频率 ×0.75（水膜摩擦声变闷） */
export const DRIFT_WET_FREQ_MULT = 0.75
/** 湿滑路面：胎声增益 ×0.8（被雨声/水声压低） */
export const DRIFT_WET_GAIN_MULT = 0.8
/** 胎噪：低通滤波器截止频率（Hz）——只保留低频滚动噪声 */
export const TIRE_FILTER_FREQ = 1500
/** 胎噪增益上限（极小值，正常行驶时绝不喧宾夺主） */
export const TIRE_GAIN_MAX = 0.02

export interface DriftSoundParams {
  /** 带通滤波器中心频率（Hz） */
  frequency: number
  /** 增益（注入 sfxGain 前的实际幅度） */
  gain: number
}

/** 漂移摩擦胎声参数（纯函数，可单测）：速度主（0.6）转向辅（0.4）合成强度，湿滑降低频率/增益 */
export function computeDriftSoundParams(speedRatio: number, steerAbs: number, wet = false): DriftSoundParams {
  const ratio = clamp01(speedRatio)
  const steer = clamp01(steerAbs)
  const intensity = Math.min(1, 0.6 * ratio + 0.4 * steer)
  return {
    frequency: (DRIFT_FREQ_MIN + (DRIFT_FREQ_MAX - DRIFT_FREQ_MIN) * ratio) * (wet ? DRIFT_WET_FREQ_MULT : 1),
    gain: DRIFT_GAIN_MAX * intensity * (wet ? DRIFT_WET_GAIN_MULT : 1),
  }
}

/** 胎噪电平（纯函数，可单测）：返回最终增益（0..TIRE_GAIN_MAX）；速度主（0.6）转向次（0.3）湿滑加成（+0.1） */
export function computeTireSoundParams(speedRatio: number, steerAbs: number, wet = false): number {
  const ratio = clamp01(speedRatio)
  const steer = clamp01(steerAbs)
  const level = Math.min(1, 0.6 * ratio + 0.3 * steer + (wet ? 0.1 : 0))
  return TIRE_GAIN_MAX * level
}

/** 漂移摩擦胎声：2s 白噪声循环 → bandpass（速度越高中心频率越高）→ gain ≤0.3 → output。
 *  仿 RainSound 的 start/stop（幂等、防刷屏重建）+ EngineSound 的 setSpeedRatio 调制模式。 */
export class DriftSound {
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
    this.filter.frequency.value = DRIFT_FREQ_MIN
    this.filter.Q.value = 2
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.filter.connect(this.gain)
    this.gain.connect(output)
    // 2 秒白噪声 buffer（循环播放，模拟轮胎摩擦嘶声）
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

  /** 启动漂移胎声（幂等）：resume ctx + bufferSource 惰性创建；音量由 setIntensity 调制 */
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
  }

  /** 停止漂移胎声（幂等）：增益渐出，稍后停止源避免硬切爆音 */
  stop(): void {
    if (!this.started) return
    this.started = false
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
    this.source?.stop(this.ctx.currentTime + 0.2)
    this.source = null
  }

  /** 随车速比/转向/湿滑调制胎声：setTargetAtTime 平滑到 computeDriftSoundParams 目标 */
  setIntensity(speedRatio: number, steerAbs: number, wet = false): void {
    const { frequency, gain } = computeDriftSoundParams(speedRatio, steerAbs, wet)
    const now = this.ctx.currentTime
    this.filter.frequency.setTargetAtTime(frequency, now, 0.05)
    this.gain.gain.setTargetAtTime(gain, now, 0.05)
  }
}

/** 轻量胎噪：2s 白噪声循环 → lowpass 1500Hz → gain ≤0.02 → output。
 *  构造即启动循环源（EngineSound 模式），gain 0 静音，setLevel 随速度/转向/湿滑调制。 */
export class TireSound {
  private ctx: AudioContext
  private filter: BiquadFilterNode
  private gain: GainNode
  private buffer: AudioBuffer
  private source: AudioBufferSourceNode

  constructor(ctx: AudioContext, output: AudioNode = ctx.destination) {
    this.ctx = ctx
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = TIRE_FILTER_FREQ
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.filter.connect(this.gain)
    this.gain.connect(output)
    // 2 秒白噪声 buffer（循环播放，模拟轮胎滚动噪声）
    const length = Math.floor(ctx.sampleRate * 2)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    this.buffer = buffer
    // 构造即启动（EngineSound 模式）：gain 0 静音，setLevel 调制音量
    this.source = ctx.createBufferSource()
    this.source.buffer = this.buffer
    this.source.loop = true
    this.source.connect(this.filter)
    this.source.start()
  }

  /** 随车速比/转向/湿滑调制胎噪电平：setTargetAtTime 平滑到 computeTireSoundParams 目标（封顶 TIRE_GAIN_MAX） */
  setLevel(speedRatio: number, steerAbs: number, wet = false): void {
    this.gain.gain.setTargetAtTime(computeTireSoundParams(speedRatio, steerAbs, wet), this.ctx.currentTime, 0.05)
  }

  /** R8：显式释放节点（构造即 start 的循环源，页面销毁时须 stop 防音频上下文占用）。
   *  幂等；无 stop 方法（常驻低音量），destroy() 停止源并断开节点图 */
  destroy(): void {
    try {
      this.source.stop()
    } catch {
      // 已停止的源再 stop 抛错，忽略
    }
    if (typeof this.source.disconnect === 'function') this.source.disconnect()
    if (typeof this.filter.disconnect === 'function') this.filter.disconnect()
    if (typeof this.gain.disconnect === 'function') this.gain.disconnect()
  }
}
