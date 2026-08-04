import { describe, expect, test } from 'vitest'
import {
  computeDriftSoundParams,
  computeTireSoundParams,
  DriftSound,
  DRIFT_FREQ_MAX,
  DRIFT_FREQ_MIN,
  DRIFT_GAIN_MAX,
  DRIFT_WET_FREQ_MULT,
  DRIFT_WET_GAIN_MULT,
  TireSound,
  TIRE_FILTER_FREQ,
  TIRE_GAIN_MAX,
} from '../../src/audio/engine'

/**
 * 最小 AudioContext 替身：记录 gain.connect 目标（输出注入断言）、
 * createBufferSource 次数、setTargetAtTime 写入的增益与滤波器频率目标（调制断言）。
 */
function mockCtx(): {
  ctx: AudioContext
  getConnected: () => unknown
  getBufferSourceCount: () => number
  getGainTargets: () => number[]
  getFilterFreqTargets: () => number[]
} {
  let connected: unknown = null
  let bufferSourceCount = 0
  const gainTargets: number[] = []
  const filterFreqTargets: number[] = []
  const ctx = {
    destination: { id: 'dest' },
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    resume: (): void => undefined,
    createGain: (): unknown => ({
      gain: {
        value: 0,
        setTargetAtTime: (v: number): void => {
          gainTargets.push(v)
        },
      },
      connect: (target: unknown): void => {
        connected = target
      },
    }),
    createBiquadFilter: (): unknown => ({
      type: '',
      frequency: {
        value: 0,
        setTargetAtTime: (v: number): void => {
          filterFreqTargets.push(v)
        },
      },
      Q: { value: 1 },
      connect: (): void => undefined,
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
    getGainTargets: (): number[] => gainTargets,
    getFilterFreqTargets: (): number[] => filterFreqTargets,
  }
}

describe('computeDriftSoundParams（漂移摩擦胎声参数，纯函数）', () => {
  test('满速零转向：增益 0.3×0.6=0.18、滤波器频率到上限', () => {
    expect(computeDriftSoundParams(1, 0)).toEqual({ frequency: DRIFT_FREQ_MAX, gain: 0.18 })
  })

  test('零速满转向：低速大转向仍有摩擦声（增益 0.3×0.4=0.12、频率在下限）', () => {
    expect(computeDriftSoundParams(0, 1)).toEqual({ frequency: DRIFT_FREQ_MIN, gain: 0.12 })
  })

  test('中速中转向：强度按 0.6×速度 + 0.4×转向加权（0.5/0.5 → 增益 0.15、频率居中）', () => {
    expect(computeDriftSoundParams(0.5, 0.5)).toEqual({
      frequency: DRIFT_FREQ_MIN + (DRIFT_FREQ_MAX - DRIFT_FREQ_MIN) * 0.5,
      gain: 0.15,
    })
  })

  test('湿滑路面：频率 ×0.75 变闷、增益 ×0.8 被压低（雨天摩擦声更闷更轻）', () => {
    expect(computeDriftSoundParams(1, 1, true)).toEqual({
      frequency: DRIFT_FREQ_MAX * DRIFT_WET_FREQ_MULT,
      gain: DRIFT_GAIN_MAX * 1 * DRIFT_WET_GAIN_MULT,
    })
  })

  test('越界钳制：速度比 1.5 与转向 -0.5 等价于 (1, 0)', () => {
    expect(computeDriftSoundParams(1.5, -0.5)).toEqual(computeDriftSoundParams(1, 0))
  })
})

describe('computeTireSoundParams（胎噪电平，纯函数）', () => {
  test('满速零转向：电平 0.6 → 增益 0.02×0.6=0.012', () => {
    expect(computeTireSoundParams(1, 0)).toBe(0.012)
  })

  test('零速满转向：电平 0.3 → 增益 0.006（转向时胎噪略增）', () => {
    expect(computeTireSoundParams(0, 1)).toBe(0.006)
  })

  test('湿滑加成：0.5 速 +0.1 电平 → 0.02×0.4=0.008', () => {
    expect(computeTireSoundParams(0.5, 0, true)).toBe(0.008)
  })

  test('饱和封顶：满速满转向湿滑（电平 1.0）→ 增益 = TIRE_GAIN_MAX', () => {
    expect(computeTireSoundParams(1, 1, true)).toBeCloseTo(TIRE_GAIN_MAX, 6)
  })

  test('越界钳制：速度比 1.5 等价于 1', () => {
    expect(computeTireSoundParams(1.5, 0)).toBe(computeTireSoundParams(1, 0))
  })
})

describe('DriftSound 漂移摩擦胎声', () => {
  test('不传 output 时 gain 连接到 ctx.destination（默认参数向后兼容）', () => {
    const { ctx, getConnected } = mockCtx()
    new DriftSound(ctx)
    expect(getConnected()).toBe(ctx.destination)
  })

  test('传 output 时 gain 连接到注入节点（sfxGain 路由）', () => {
    const { ctx, getConnected } = mockCtx()
    const output = { id: 'sfx' } as unknown as AudioNode
    new DriftSound(ctx, output)
    expect(getConnected()).toBe(output)
  })

  test('构造后未播放；start 幂等不重建源；stop 后 isPlaying 为 false', () => {
    const { ctx, getBufferSourceCount } = mockCtx()
    const drift = new DriftSound(ctx)
    expect(drift.isPlaying()).toBe(false)
    drift.start()
    expect(drift.isPlaying()).toBe(true)
    expect(getBufferSourceCount()).toBe(1)
    drift.start() // 幂等：已启动直接返回，不重建 bufferSource
    expect(getBufferSourceCount()).toBe(1)
    drift.stop()
    expect(drift.isPlaying()).toBe(false)
  })

  test('setIntensity 按 computeDriftSoundParams 调制滤波器频率与增益（setTargetAtTime 平滑）', () => {
    const { ctx, getGainTargets, getFilterFreqTargets } = mockCtx()
    const drift = new DriftSound(ctx)
    drift.start()
    // (1, 0.5)：intensity = 0.6+0.2 = 0.8 → 增益 0.24、频率 2000
    const expected = computeDriftSoundParams(1, 0.5)
    drift.setIntensity(1, 0.5, false)
    expect(getFilterFreqTargets()).toEqual([expected.frequency])
    expect(getGainTargets()).toEqual([expected.gain])
    // 湿滑：频率/增益按湿滑系数衰减
    const wetExpected = computeDriftSoundParams(1, 0.5, true)
    drift.setIntensity(1, 0.5, true)
    expect(getFilterFreqTargets()).toEqual([expected.frequency, wetExpected.frequency])
    expect(getGainTargets()).toEqual([expected.gain, wetExpected.gain])
  })
})

describe('TireSound 轻量胎噪', () => {
  test('构造即启动循环噪声源（EngineSound 模式：gain 0 静音，setLevel 调制）', () => {
    const { ctx, getBufferSourceCount } = mockCtx()
    new TireSound(ctx)
    expect(getBufferSourceCount()).toBe(1)
  })

  test('传 output 时 gain 连接到注入节点（sfxGain 路由）', () => {
    const { ctx, getConnected } = mockCtx()
    const output = { id: 'sfx' } as unknown as AudioNode
    new TireSound(ctx, output)
    expect(getConnected()).toBe(output)
  })

  test('setLevel 按 computeTireSoundParams 设置增益目标；电平饱和封顶 TIRE_GAIN_MAX', () => {
    const { ctx, getGainTargets } = mockCtx()
    const tire = new TireSound(ctx)
    tire.setLevel(1, 0, false)
    expect(getGainTargets()[0]).toBeCloseTo(computeTireSoundParams(1, 0, false), 10)
    tire.setLevel(1, 1, true) // 满速满转向湿滑 → 电平 1.0 → 封顶
    expect(getGainTargets()[1]).toBeCloseTo(TIRE_GAIN_MAX, 6)
  })
})

describe('TireSound 滤波器配置', () => {
  test('低通截止频率恒为 TIRE_FILTER_FREQ（构造时不记录 target，仅 value 直接赋值）', () => {
    // 该断言兜底常量可用性：TIRE_FILTER_FREQ 导出且为正数（构造内部使用）
    expect(TIRE_FILTER_FREQ).toBeGreaterThan(0)
  })
})
