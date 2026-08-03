import { describe, expect, test } from 'vitest'
import {
  computeEngineParams,
  EngineSound,
  MIN_FREQUENCY,
  MAX_FREQUENCY,
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

describe('EngineSound 输出注入', () => {
  /** 最小 AudioContext 替身：记录 gain.connect 的目标（输出注入断言用） */
  function mockCtx(): {
    ctx: AudioContext
    getConnected: () => unknown
  } {
    let connected: unknown = null
    const ctx = {
      destination: { id: 'dest' },
      currentTime: 0,
      state: 'running',
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
        connect: (): void => undefined,
      }),
      createOscillator: (): unknown => ({
        type: '',
        detune: { value: 0 },
        connect: (): void => undefined,
        start: (): void => undefined,
      }),
    }
    return { ctx: ctx as unknown as AudioContext, getConnected: (): unknown => connected }
  }

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
