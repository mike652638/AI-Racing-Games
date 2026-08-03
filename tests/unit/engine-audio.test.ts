import { describe, expect, test } from 'vitest'
import {
  computeEngineParams,
  EngineSound,
  MIN_FREQUENCY,
  MAX_FREQUENCY,
  RainSound,
  CollisionSound,
  BoostSound,
} from '../../src/audio/engine'

describe('computeEngineParams', () => {
  test('怠速与红线频率', () => {
    expect(computeEngineParams(0).frequency).toBe(MIN_FREQUENCY)
    expect(computeEngineParams(1).frequency).toBe(MAX_FREQUENCY)
  })
  test('频率随速度比单调上升', () => {
    const a = computeEngineParams(0.2)
    const b = computeEngineParams(0.8)
    expect(b.frequency).toBeGreaterThan(a.frequency)
  })
  test('增益限制在 (0, 1]', () => {
    expect(computeEngineParams(0).gain).toBeGreaterThan(0)
    expect(computeEngineParams(1).gain).toBeLessThanOrEqual(1)
  })
  test('速度比越界时钳制', () => {
    expect(computeEngineParams(-0.5).frequency).toBe(MIN_FREQUENCY)
    expect(computeEngineParams(1.5).frequency).toBe(MAX_FREQUENCY)
  })
})

/** 最小 AudioContext 替身：记录 gain.connect 的目标（输出注入断言用）、createBufferSource 次数与 oscillator 频率 ramp 目标 */
function mockCtx(): {
  ctx: AudioContext
  getConnected: () => unknown
  getBufferSourceCount: () => number
  getRampTargets: () => number[]
} {
  let connected: unknown = null
  let bufferSourceCount = 0
  const rampTargets: number[] = []
  const ctx = {
    destination: { id: 'dest' },
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    resume: (): void => undefined,
    createGain: (): unknown => ({
      gain: {
        value: 0,
        setTargetAtTime: (): void => undefined,
        setValueAtTime: (): void => undefined,
        linearRampToValueAtTime: (): void => undefined,
      },
      connect: (target: unknown): void => {
        connected = target
      },
    }),
    createBiquadFilter: (): unknown => ({
      type: '',
      frequency: { value: 0, setTargetAtTime: (): void => undefined },
      Q: { value: 1 },
      connect: (): void => undefined,
    }),
    createOscillator: (): unknown => ({
      type: '',
      detune: { value: 0 },
      frequency: {
        value: 0,
        setValueAtTime: (v: number): void => {
          rampTargets.push(v)
        },
        linearRampToValueAtTime: (v: number): void => {
          rampTargets.push(v)
        },
      },
      // BoostSound 链式 osc.connect(gain).connect(output) 需要 connect 返回可链对象
      connect: (): { connect: (t: unknown) => void } => ({ connect: (): void => undefined }),
      start: (): void => undefined,
      stop: (): void => undefined,
    }),
    createBuffer: (channels: number, length: number, rate: number): unknown => ({
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      getChannelData: (): Float32Array => new Float32Array(length),
    }),
    createBufferSource: (): unknown => {
      bufferSourceCount++
      return {
        buffer: null,
        loop: false,
        connect: (): void => undefined,
        start: (): void => undefined,
        stop: (): void => undefined,
      }
    },
  }
  return {
    ctx: ctx as unknown as AudioContext,
    getConnected: (): unknown => connected,
    getBufferSourceCount: (): number => bufferSourceCount,
    getRampTargets: (): number[] => rampTargets,
  }
}

describe('EngineSound 输出注入', () => {
  test('不传 output 时 gain 连接到 ctx.destination（默认参数向后兼容）', () => {
    const { ctx, getConnected } = mockCtx()
    new EngineSound(ctx)
    expect(getConnected()).toBe(ctx.destination)
  })

  test('传 output 时 gain 连接到注入节点（masterGain 路由）', () => {
    const { ctx, getConnected } = mockCtx()
    const output = { id: 'master' } as unknown as AudioNode
    new EngineSound(ctx, output)
    expect(getConnected()).toBe(output)
  })
})

describe('RainSound 雨声环境音', () => {
  test('构造后未播放；start 幂等不重建源；stop 后 isPlaying 为 false', () => {
    const { ctx, getBufferSourceCount } = mockCtx()
    const rain = new RainSound(ctx)
    expect(rain.isPlaying()).toBe(false)
    rain.start()
    expect(rain.isPlaying()).toBe(true)
    expect(getBufferSourceCount()).toBe(1)
    rain.start() // 幂等：已启动直接返回，不重建 bufferSource
    expect(getBufferSourceCount()).toBe(1)
    rain.stop()
    expect(rain.isPlaying()).toBe(false)
  })
})

describe('CollisionSound 碰撞冲击音', () => {
  test('play 触发且 80ms 内重复触发被跳过（防刷屏）', () => {
    const { ctx } = mockCtx()
    const cs = new CollisionSound(ctx)
    cs.play()
    expect(cs.count).toBe(1)
    cs.play() // currentTime 未推进（0），间隔 < 80ms → 跳过
    expect(cs.count).toBe(1)
    ;(ctx as unknown as { currentTime: number }).currentTime = 0.2
    cs.play()
    expect(cs.count).toBe(2)
  })
})

describe('BoostSound BOOST 氮气音效', () => {
  test('play 触发扫频振荡器：频率 ramp 含目标 600 且每次调用重建（count 递增）', () => {
    const { ctx, getRampTargets } = mockCtx()
    const bs = new BoostSound(ctx)
    bs.play()
    expect(bs.count).toBe(1)
    // sawtooth 200 → 600Hz 线性扫频：ramp 记录含起始 200 与目标 600
    expect(getRampTargets()).toContain(200)
    expect(getRampTargets()).toContain(600)
    bs.play() // 无防刷屏：每次 play 重建振荡器，count 持续递增
    expect(bs.count).toBe(2)
    expect(getRampTargets().filter((v) => v === 600)).toHaveLength(2)
  })
})
