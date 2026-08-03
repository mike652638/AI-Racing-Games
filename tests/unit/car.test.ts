import { describe, expect, it } from 'vitest'
import {
  type CarConfig, type CarInput, type CarState,
  createCarConfig, updateCar, collidePlayers,
} from '../../src/physics/car'

const config: CarConfig = createCarConfig({
  maxSpeed: 100,
  acceleration: 50,
  braking: 80,
  deceleration: 20,
  offRoadDeceleration: 40,
  roadHalfWidth: 1,
  turnRate: 0.5,
})

const idle: CarInput = { throttle: 0, brake: false, steer: 0 }

function state(position = 0, speed = 0): CarState {
  return { position, speed }
}

describe('速度模型', () => {
  it('全油门按加速度提速', () => {
    const s = state()
    updateCar(1, { ...idle, throttle: 1 }, s, config)
    expect(s.speed).toBe(50)
  })

  it('部分油门按比例提速', () => {
    const s = state()
    updateCar(1, { ...idle, throttle: 0.5 }, s, config)
    expect(s.speed).toBe(25)
  })

  it('速度不超过最高速度', () => {
    const s = state(0, 95)
    updateCar(1, { ...idle, throttle: 1 }, s, config)
    expect(s.speed).toBe(100)
  })

  it('刹车使速度下降', () => {
    const s = state(0, 100)
    updateCar(1, { ...idle, brake: true }, s, config)
    expect(s.speed).toBe(20)
  })

  it('松油门自然减速', () => {
    const s = state(0, 100)
    updateCar(1, idle, s, config)
    expect(s.speed).toBe(80)
  })

  it('速度不会减为负值', () => {
    const s = state(0, 10)
    updateCar(1, idle, s, config)
    expect(s.speed).toBe(0)
  })
})

describe('转向模型', () => {
  it('右转使横向位置右移', () => {
    const s = state(0, 100)
    updateCar(1, { ...idle, steer: 1 }, s, config)
    expect(s.position).toBeCloseTo(0.4)
  })

  it('左转使横向位置左移', () => {
    const s = state(0, 100)
    updateCar(1, { ...idle, steer: -1 }, s, config)
    expect(s.position).toBeCloseTo(-0.4)
  })

  it('静止时转向无效', () => {
    const s = state(0, 0)
    updateCar(1, { ...idle, steer: 1 }, s, config)
    expect(s.position).toBe(0)
  })

  it('速度越高转向越快', () => {
    const slow = state(0, 50)
    const fast = state(0, 100)
    updateCar(1, { ...idle, steer: 1 }, slow, config)
    updateCar(1, { ...idle, steer: 1 }, fast, config)
    expect(fast.position).toBeGreaterThan(slow.position)
  })
})

describe('路缘限制与出界减速', () => {
  it('出界后横向位置被限制在路面内', () => {
    const s = state(1.5, 100)
    updateCar(1, idle, s, config)
    expect(s.position).toBe(1)
  })

  it('出界时速度被额外衰减（自然减速+出界衰减）', () => {
    const s = state(1.5, 100)
    updateCar(1, idle, s, config)
    expect(s.speed).toBe(40)
  })

  it('出界减速不会产生负速度', () => {
    const s = state(1.5, 30)
    updateCar(1, idle, s, config)
    expect(s.speed).toBe(0)
  })

  it('转向冲出路面同样触发路缘限制', () => {
    const s = state(0.8, 100)
    updateCar(1, { ...idle, steer: 1 }, s, config)
    expect(s.position).toBe(1)
    expect(s.speed).toBe(40)
  })

  it('路面内正常行驶不受路缘影响', () => {
    const s = state(0.5, 100)
    updateCar(1, idle, s, config)
    expect(s.speed).toBe(80)
    expect(s.position).toBe(0.5)
  })
})

describe('collidePlayers', () => {
  it('同位置碰撞', () => {
    expect(collidePlayers(0, 0, 0, 0)).toBe(true)
  })
  it('z 超出容差不碰撞', () => {
    expect(collidePlayers(0, 0, 200, 0)).toBe(false)
  })
  it('x 超出容差不碰撞', () => {
    expect(collidePlayers(0, 0, 0, 1.5)).toBe(false)
  })
})

describe('wet 雨天物理（G3）', () => {
  // 用默认配置（maxSpeed 6000、turnRate 0.8、braking 3600）：speed 3000 时单帧转向增量 0.4 < roadHalfWidth 1，不出界
  const cfg = createCarConfig()

  it('wet 时转向抓地力降 15%（position 增量为非 wet 的 0.85 倍）', () => {
    const base = state(0, 3000)
    updateCar(1, { throttle: 0, brake: false, steer: 1 }, base, cfg)
    // 松油门分支先减速（3000-1200=1800）再算转向：基准增量 = steer 1 * turnRate 0.8 * (1800/6000) * 1 = 0.24
    expect(base.position).toBeCloseTo(0.24, 6)
    const wet = state(0, 3000)
    updateCar(1, { throttle: 0, brake: false, steer: 1 }, wet, cfg, undefined, true)
    expect(wet.position).toBeCloseTo(base.position * 0.85, 6)
  })

  it('wet 时制动力降 30%（brake 1 秒速度降幅 = braking * 0.7，刹车距离变长）', () => {
    const s = state(0, 3000)
    updateCar(1, { throttle: 0, brake: true, steer: 0 }, s, cfg, undefined, true)
    expect(s.speed).toBeCloseTo(3000 - cfg.braking * 0.7, 6)
  })
})

describe('BOOST 氮气加速（G4）', () => {
  // 用模块级 config（maxSpeed 100、acceleration 50、deceleration 20）：boost 上限 = 100 * 1.15 = 115
  it('input.boost=true 时加速突破 maxSpeed（boost 分支独立上限 1.15×）', () => {
    const s = state(0, 95)
    // 全油门 + boost：throttle 分支 clamp 到 100 → boost 分支 100 + 50*0.6*1 = 130 → clamp 115
    updateCar(1, { throttle: 1, brake: false, steer: 0, boost: true }, s, config)
    expect(s.speed).toBeGreaterThan(config.maxSpeed)
    expect(s.speed).toBeCloseTo(115, 6)
  })

  it('boost 加速不越 1.15×maxSpeed 上限', () => {
    const s = state(0, 100)
    updateCar(1, { throttle: 1, brake: false, steer: 0, boost: true }, s, config)
    expect(s.speed).toBeCloseTo(115, 6)
    // 满 boost 上限再 boost 仍钳制
    const s2 = state(0, 115)
    updateCar(1, { throttle: 1, brake: false, steer: 0, boost: true }, s2, config)
    expect(s2.speed).toBeCloseTo(115, 6)
  })
})
