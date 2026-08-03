import { describe, expect, test } from 'vitest'
import {
  computeEngineParams,
  EngineSound,
  MIN_FREQUENCY,
  MAX_FREQUENCY,
  RainSound,
  CollisionSound,
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

/** 最小 AudioContext 替身：记录 gain.connect 的目标（输出注入断言用）与 createBufferSource 次数 */
function mockCtx(): {
  ctx: AudioContext
  getConnected: () => unknown
  getBufferSourceCount: () => number
} {
  let connected: unknown = null
  let bufferSourceCount = 0
  const ctx = {
    destination: { id: 'dest' },
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    resume: (): void => undefined,
    createGain: (): unknown => ({
      gain: { value: 0, setTargetAtTime: (): void => undefined },
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
      connect: (): void => undefined,
      start: (): void => undefined,
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
