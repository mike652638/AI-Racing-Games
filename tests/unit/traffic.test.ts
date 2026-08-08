import { describe, expect, test } from 'vitest'
import {
  collideWithPlayer,
  createTraffic,
  TRAFFIC_RUBBER_MAX,
  TRAFFIC_RUBBER_MIN,
  TRAFFIC_SPAWN_SAFE_ZONE,
  trafficRubberTarget,
  updateTraffic,
  type TrafficCar,
} from '../../src/engine/traffic'

describe('createTraffic', () => {
  test('生成指定数量且确定性（同 seed 同结果）', () => {
    const a = createTraffic(20000, 777, 8)
    const b = createTraffic(20000, 777, 8)
    expect(a).toHaveLength(8)
    expect(a).toEqual(b)
  })
  test('车辆均匀分布（间隔≈lapLength/count）', () => {
    const traffic = createTraffic(20000, 777, 8)
    const sorted = [...traffic].sort((x, y) => x.z - y.z)
    const gaps = sorted.map((c, i) => (sorted[(i + 1) % sorted.length].z - c.z + 20000) % 20000)
    gaps.forEach((g) => expect(g).toBeGreaterThan(1800))
    gaps.forEach((g) => expect(g).toBeLessThan(3200))
  })
  test('offset 在 ±1 内（不骑中央线）', () => {
    const traffic = createTraffic(20000, 777, 8)
    traffic.forEach((c) => expect(Math.abs(c.offset)).toBeLessThan(1))
  })
  test('count 参数自定义车流数量', () => {
    expect(createTraffic(20000, 777, 3)).toHaveLength(3)
  })
  test('speed 为正', () => {
    const traffic = createTraffic(20000, 777, 8)
    traffic.forEach((c) => expect(c.speed).toBeGreaterThan(0))
  })
  test('cruiseOffset 初始化为出生 offset（巡航目标偏移）', () => {
    const traffic = createTraffic(20000, 777, 8)
    traffic.forEach((c) => expect(c.cruiseOffset).toBe(c.offset))
  })
})

describe('createTraffic 出生安全窗口（防开局碰撞，2026-08-05）', () => {
  test('缺省不启用：出生窗口内允许存在车辆（旧行为不变，bot 基线确定性锚点）', () => {
    const traffic = createTraffic(20000, 777, 8)
    // 首车 z = rnd()*200 ∈ [0,200)，必然落在窗口内——证明缺省路径与旧版一致
    expect(traffic.some((c) => c.z < TRAFFIC_SPAWN_SAFE_ZONE)).toBe(true)
  })
  test('启用后：全部车辆落在 [TRAFFIC_SPAWN_SAFE_ZONE, lapLength) 内', () => {
    const traffic = createTraffic(20000, 777, 8, TRAFFIC_SPAWN_SAFE_ZONE)
    expect(traffic).toHaveLength(8)
    traffic.forEach((c) => {
      expect(c.z).toBeGreaterThanOrEqual(TRAFFIC_SPAWN_SAFE_ZONE)
      expect(c.z).toBeLessThan(20000)
    })
  })
  test('启用后确定性保持：同 seed 两次生成逐位一致', () => {
    const a = createTraffic(20000, 777, 8, TRAFFIC_SPAWN_SAFE_ZONE)
    const b = createTraffic(20000, 777, 8, TRAFFIC_SPAWN_SAFE_ZONE)
    expect(a).toEqual(b)
  })
  test('启用后 rnd() 消费顺序不变：仅 z 重映射，offset/speed/colorIndex 与缺省版逐车一致', () => {
    const base = createTraffic(20000, 777, 8)
    const safe = createTraffic(20000, 777, 8, TRAFFIC_SPAWN_SAFE_ZONE)
    safe.forEach((c, i) => {
      expect(c.offset).toBe(base[i].offset)
      expect(c.speed).toBe(base[i].speed)
      expect(c.colorIndex).toBe(base[i].colorIndex)
    })
  })
  test('启用后车辆仍保持间隔（窗口压缩不产生叠车）', () => {
    const lapLength = 20000
    const traffic = createTraffic(lapLength, 777, 8, TRAFFIC_SPAWN_SAFE_ZONE)
    const sorted = [...traffic].sort((x, y) => x.z - y.z)
    const gaps = sorted.map((c, i) => (sorted[(i + 1) % sorted.length].z - c.z + lapLength) % lapLength)
    gaps.forEach((g) => expect(g).toBeGreaterThan(500))
  })
})

describe('updateTraffic', () => {
  test('按速度推进 z', () => {
    const car: TrafficCar = { z: 100, offset: 0.7, speed: 1200, colorIndex: 0, shiftDir: 0, cruiseOffset: 0.7 }
    updateTraffic([car], 0.5, 20000)
    expect(car.z).toBeCloseTo(700, 6)
  })
  test('超过 lapLength 环形回绕', () => {
    const car: TrafficCar = { z: 19800, offset: 0.7, speed: 1200, colorIndex: 0, shiftDir: 0, cruiseOffset: 0.7 }
    updateTraffic([car], 1, 20000)
    expect(car.z).toBeCloseTo(1000, 6)
  })
  test('M23 方案 13：speedFactor 缺省 1 与旧版逐字节一致（确定性零破坏）', () => {
    const car: TrafficCar = { z: 100, offset: 0.6, speed: 1200, colorIndex: 0, shiftDir: 0, cruiseOffset: 0.6 }
    updateTraffic([car], 0.5, 20000)
    expect(car.z).toBeCloseTo(700, 6)
    expect(car.offset).toBe(0.6)
  })
  test('M23 方案 13：speedFactor 传参加速推进（z = speed * factor * dt）', () => {
    const car: TrafficCar = { z: 100, offset: 0.7, speed: 1200, colorIndex: 0, shiftDir: 0, cruiseOffset: 0.7 }
    updateTraffic([car], 0.5, 20000, undefined, 1.2)
    expect(car.z).toBeCloseTo(820, 6)
  })
  test('M23 方案 13：speedFactor 不影响避让/恢复逻辑（offset 与 shiftDir 同旧行为）', () => {
    const car: TrafficCar = { z: 100, offset: 0.6, speed: 1200, colorIndex: 0, shiftDir: 0, cruiseOffset: 0.6 }
    const player = { z: 0, x: 0.5 }
    updateTraffic([car], 0.05, 20000, player, 1.15)
    // 避让：target=-0.85，步进 0.8*0.05=0.04/帧
    expect(car.offset).toBeCloseTo(0.56, 6)
    expect(car.shiftDir).toBe(-1)
  })
})

describe('M23 方案 13：trafficRubberTarget 橡皮筋目标系数', () => {
  test('玩家全速（speed=maxSpeed）→ 车流提速至 MAX', () => {
    expect(trafficRubberTarget(6000, 6000)).toBe(TRAFFIC_RUBBER_MAX)
  })
  test('玩家静止（speed=0）→ 车流减速至 MIN', () => {
    expect(trafficRubberTarget(0, 6000)).toBe(TRAFFIC_RUBBER_MIN)
  })
  test('玩家半速 → 线性中值', () => {
    const mid = TRAFFIC_RUBBER_MIN + 0.5 * (TRAFFIC_RUBBER_MAX - TRAFFIC_RUBBER_MIN)
    expect(trafficRubberTarget(3000, 6000)).toBeCloseTo(mid, 6)
  })
  test('speed 超 maxSpeed 钳位到 MAX（不越界）', () => {
    expect(trafficRubberTarget(99999, 6000)).toBe(TRAFFIC_RUBBER_MAX)
  })
  test('speed 为负钳位到 MIN（不越界）', () => {
    expect(trafficRubberTarget(-100, 6000)).toBe(TRAFFIC_RUBBER_MIN)
  })
})

describe('collideWithPlayer', () => {
  test('纵向横向均接近时命中', () => {
    const car: TrafficCar = { z: 1000, offset: 0.7, speed: 1200, colorIndex: 0, shiftDir: 0, cruiseOffset: 0.7 }
    expect(collideWithPlayer([car], 1050, 0.7)).toBe(car)
  })
  test('横向错开（offset 差 > xTol）不命中', () => {
    const car: TrafficCar = { z: 1000, offset: -0.7, speed: 1200, colorIndex: 0, shiftDir: 0, cruiseOffset: -0.7 }
    expect(collideWithPlayer([car], 1050, 0.7)).toBeNull()
  })
  test('纵向错过（|dz| > zTol）不命中', () => {
    const car: TrafficCar = { z: 1000, offset: 0.7, speed: 1200, colorIndex: 0, shiftDir: 0, cruiseOffset: 0.7 }
    expect(collideWithPlayer([car], 2000, 0.7)).toBeNull()
  })
  test('无车不命中', () => {
    expect(collideWithPlayer([], 1000, 0)).toBeNull()
  })
})

describe('车流避让与恢复', () => {
  /** 避让/恢复逻辑参数镜像 traffic.ts 私有常量（防魔法数字漂移；dt=0.05 → 单帧步进 0.8*0.05=0.04） */
  const DT = 0.05

  /**
   * 构造单辆静止车流（speed=0 让 z 不随帧推进，d 保持恒定便于断言）。
   * cruiseOffset 默认 = offset（与 createTraffic 的初始化语义一致），可显式指定以模拟避让后的状态。
   */
  const stillCar = (z: number, offset: number, cruiseOffset = offset): TrafficCar => ({
    z,
    offset,
    cruiseOffset,
    speed: 0,
    colorIndex: 0,
    shiftDir: 0,
  })

  test('玩家逼近同车道车流时 offset 朝远离侧渐变（player.x>0 → 负方向）', () => {
    const car = stillCar(100, 0.6)
    const player = { z: 0, x: 0.5 }
    // 车在玩家前方 d=100 < 350，|0.6-0.5|=0.1 < 1.2 → 避让；target=-0.85，步进 0.8*0.05=0.04/帧
    updateTraffic([car], DT, 20000, player)
    updateTraffic([car], DT, 20000, player)
    expect(car.offset).toBeCloseTo(0.6 - 0.08, 6)
    // 两次调用后仍未越过中线（0.08 步进远小于目标距离）
    expect(car.offset).toBeGreaterThan(0)
  })

  test('车远离（d=2000）且已处于巡航偏移（offset === cruiseOffset）时 offset 不变', () => {
    const car = stillCar(2000, 0.6)
    const player = { z: 0, x: 0.5 }
    // 未触发避让 + 已处于巡航偏移 → 无恢复位移，offset 保持
    updateTraffic([car], DT, 20000, player)
    updateTraffic([car], DT, 20000, player)
    expect(car.offset).toBe(0.6)
  })

  test('异车道边界（|offset 差| = 1.2 不 < 1.2）不触发避让', () => {
    const car = stillCar(100, -0.7)
    const player = { z: 0, x: 0.5 }
    // 纵向 d=100 满足、横向 |-0.7-0.5|=1.2 恰好等于容差 → 不触发（严格小于）；offset 已处于巡航偏移 → 不变
    updateTraffic([car], DT, 20000, player)
    updateTraffic([car], DT, 20000, player)
    expect(car.offset).toBe(-0.7)
  })

  test('不带 player 参数时行为与旧版一致（offset 恒等、z 正常推进）', () => {
    const car: TrafficCar = { z: 100, offset: 0.6, speed: 1200, colorIndex: 0, shiftDir: 0, cruiseOffset: 0.6 }
    updateTraffic([car], 0.5, 20000)
    expect(car.z).toBeCloseTo(700, 6)
    expect(car.offset).toBe(0.6)
  })

  test('玩家逼近同车道时 shiftDir 记录远离侧（player.x>0 → -1）', () => {
    const car = stillCar(100, 0.6)
    const player = { z: 0, x: 0.5 }
    updateTraffic([car], DT, 20000, player)
    expect(car.shiftDir).toBe(-1)
  })

  test('车远离且已处于巡航偏移时 shiftDir 保持 0（车灯回中）', () => {
    const car = stillCar(2000, 0.6)
    const player = { z: 0, x: 0.5 }
    updateTraffic([car], DT, 20000, player)
    expect(car.shiftDir).toBe(0)
  })

  test('避让后玩家远离 → 车以 AVOID_STEP 速率恢复 cruiseOffset，完成后 shiftDir 归零', () => {
    const car = stillCar(100, 0.6) // cruiseOffset = 0.6
    const player = { z: 0, x: 0.5 }
    // 两帧避让：offset 0.6 → 0.52（远离玩家的负方向），shiftDir = -1
    updateTraffic([car], DT, 20000, player)
    updateTraffic([car], DT, 20000, player)
    expect(car.offset).toBeCloseTo(0.52, 6)
    expect(car.shiftDir).toBe(-1)
    // 玩家远离（d=2000 远超触发距离）→ 触发条件消失，开始恢复
    const far = { z: 2000, x: 0.5 }
    updateTraffic([car], DT, 20000, far)
    // 恢复速率 = AVOID_STEP*dt = 0.04/帧；目标 0.6 > 当前 → 向右恢复，shiftDir = 1
    expect(car.offset).toBeCloseTo(0.56, 6)
    expect(car.shiftDir).toBe(1)
    updateTraffic([car], DT, 20000, far)
    // 恢复到巡航偏移
    expect(car.offset).toBeCloseTo(0.6, 6)
    updateTraffic([car], DT, 20000, far)
    expect(car.offset).toBeCloseTo(0.6, 6)
    // 恢复完成后车灯回中
    expect(car.shiftDir).toBe(0)
  })

  test('避让后玩家横向错开（仍正前方但 x 远离）同样触发恢复', () => {
    const car = stillCar(100, 0.6)
    const player = { z: 0, x: 0.5 }
    updateTraffic([car], DT, 20000, player)
    updateTraffic([car], DT, 20000, player)
    expect(car.offset).toBeCloseTo(0.52, 6)
    // 玩家仍在正前方 d=100，但横向 |0.52-3|=2.48 ≥ 1.2 → 不触发避让，进入恢复
    updateTraffic([car], DT, 20000, { z: 0, x: 3 })
    expect(car.offset).toBeCloseTo(0.56, 6)
    expect(car.shiftDir).toBe(1)
  })

  test('恢复方向：当前 offset 高于巡航偏移时向左恢复（shiftDir = -1）', () => {
    // 模拟右侧避让后 offset=0.5、巡航偏移 -0.6（左侧巡航）；玩家远离 → 向左恢复
    const car = stillCar(100, 0.5, -0.6)
    updateTraffic([car], DT, 20000, { z: 2000, x: 0.5 })
    expect(car.offset).toBeCloseTo(0.46, 6)
    expect(car.shiftDir).toBe(-1)
  })

  test('恢复途中 offset 被 clamp 到 ±AVOID_LANE_EDGE（0.85）内', () => {
    // 手工构造越界 offset=-0.9（超出 clamp 边界）、巡航偏移 0.8 → 恢复步进被 clamp 到 -0.85
    const car = stillCar(100, -0.9, 0.8)
    updateTraffic([car], DT, 20000, { z: 2000, x: 0.5 })
    expect(car.offset).toBe(-0.85)
    expect(car.shiftDir).toBe(1)
    // 继续恢复（尚未到达巡航偏移，仍在恢复途中）
    updateTraffic([car], DT, 20000, { z: 2000, x: 0.5 })
    expect(car.offset).toBeCloseTo(-0.81, 6)
  })
})
