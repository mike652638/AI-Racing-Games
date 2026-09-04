import { mulberry32 } from './scenery'

export interface TrafficCar {
  /** 世界 z（沿赛道位置） */
  z: number
  /** 横向偏移（相对中心线，±1 内） */
  offset: number
  /**
   * 巡航目标偏移：未触发避让时 offset 渐变恢复的目标位置。
   * createTraffic 初始 = 出生 offset；可选字段——旧调用（手工构造）未赋值时视为当前 offset（不产生恢复位移）。
   */
  cruiseOffset?: number
  /** 巡航速度（世界单位/秒） */
  speed: number
  /** 车身配色索引 */
  colorIndex: number
  /** 最近一次避让/恢复变道方向（-1 左 / 1 右 / 0 未在变道），渲染层车灯随其转向；避让与恢复途中均指示当前转向方向，恢复完成或未在变道时归零；createTraffic 初始化 0 */
  shiftDir: -1 | 0 | 1
}

/** 碰撞纵向容差（世界单位） */
export const TRAFFIC_Z_TOL = 80
/** 碰撞横向容差（offset 单位，2026-08-05 审计修复：原 0.9 > 车流最大 offset 0.85，
 *  玩家居中时与任意车 z 重叠即碰撞、车道躲避几乎失效；车流世界宽 0.5（半宽 0.25）+
 *  玩家车约同宽 → 合理容差 ≈ 0.5 + 少量余量；收窄后避让 AI（clamp ±0.85）可真正生效 */
export const TRAFFIC_X_TOL = 0.55
/** 车流基础巡航速度 */
export const TRAFFIC_CRUISE_SPEED = 2400
/**
 * M23 方案 13：车流橡皮筋动态难度（？traffic=dynamic，缺省启用）——
 * 车流巡航速度随玩家速度平滑调整：玩家快 → 车流提速（保持超车挑战），玩家慢 → 车流减速（便于追赶）。
 * 系数钳位范围与平滑响应速率（speedFactor 每秒向目标收敛比例）。
 */
export const TRAFFIC_RUBBER_MIN = 0.85
export const TRAFFIC_RUBBER_MAX = 1.15
export const TRAFFIC_RUBBER_SMOOTH = 1.2
/**
 * 玩家速度到车流橡皮筋目标系数的线性映射（归一化到 maxSpeed，clamp 到 [MIN, MAX]）：
 * 玩家全速 → 车流提速至 MAX（保持挑战）；玩家低速/静止 → 车流减速至 MIN（起步/追赶友好）。
 */
export function trafficRubberTarget(playerSpeed: number, maxSpeed: number): number {
  const t = Math.max(0, Math.min(1, playerSpeed / maxSpeed))
  return TRAFFIC_RUBBER_MIN + t * (TRAFFIC_RUBBER_MAX - TRAFFIC_RUBBER_MIN)
}
/**
 * 出生安全窗口（世界单位，2026-08-05 运行时实测修复）：玩家出生点（z=0）前方该窗口内不生成车流，
 * 避免开局即「碰撞 ×1」/静止时被连续撞击（见 docs/reports/research_report_runtime_visual_auto.md 问题 1）。
 * 仅游戏运行时（track-context）启用；createTraffic 缺省 0 保持旧行为与 bot 基线确定性不变。
 */
export const TRAFFIC_SPAWN_SAFE_ZONE = 1600

/** 避让触发纵向距离（世界单位）：车在玩家前方该距离内视为逼近 */
const AVOID_Z_DIST = 350
/** 避让触发横向容差：|车 offset - 玩家 x| 小于该值视为同车道/近车道 */
const AVOID_X_TOL = 1.2
/** 避让变道步进速率（offset/秒） */
const AVOID_STEP = 0.8
/** 避让变道目标 offset 幅度（clamp |offset| ≤ 该值） */
const AVOID_LANE_EDGE = 0.85

/**
 * 环形前向距离（跨圈语义的单一真源）：从 from 沿赛道前进到 to 的距离，结果恒 ∈ [0, lapLength)。
 *
 * 与直接写 `(to - from + lapLength) % lapLength` 的区别：JS 的 `%` 对负数返回负值，
 * 而玩家 cameraZ 是单调累加、从不取模的（frame-pure / simulate），故第三圈起
 * `(car.z - cameraZ + lapLength)` 为大负数、取模后仍为负，所有依赖 `d > 0` 的判定
 * （车流避让、near-miss）会静默失效。本函数对任意大小的 from/to 均正确回绕。
 * 第一圈（from < lapLength）时与旧表达式逐位等价，既有确定性（bot 基线）不受影响。
 */
export function ringForwardDistance(from: number, to: number, lapLength: number): number {
  return (((to - from) % lapLength) + lapLength) % lapLength
}

/**
 * 环形最短带符号距离：结果 ∈ [-lapLength/2, lapLength/2]，用于「是否足够接近」类判定（碰撞）。
 * 正值 = to 在 from 前方半圈内，负值 = 在后方半圈内；|结果| 即两者在环上的最短距离。
 */
export function ringDelta(from: number, to: number, lapLength: number): number {
  const d = ringForwardDistance(from, to, lapLength)
  return d <= lapLength / 2 ? d : d - lapLength
}

/**
 * 按种子确定性生成均匀分布的环形车流。
 * spawnSafeZone（尾参，缺省 0 = 旧行为）：启用时把落在玩家出生点前方窗口 [0, spawnSafeZone) 内的车
 * 重映射至 [spawnSafeZone, lapLength)（均匀压缩，rnd() 消费顺序不变，确定性保持），防开局碰撞。
 */
export function createTraffic(lapLength: number, seed = 777, count = 8, spawnSafeZone = 0): TrafficCar[] {
  const rnd = mulberry32(seed)
  const cars: TrafficCar[] = []
  for (let i = 0; i < count; i++) {
    // 注意：保持 rnd() 消费顺序与旧版对象字面量求值顺序一致（z → offset 符号 → offset 幅度 → speed → colorIndex），
    // 否则会改变确定性车流分布（tests/unit/collision.test.ts 依赖默认车流的精确分布）。
    const zRaw = ((i * lapLength) / count + rnd() * 200) % lapLength
    // 出生安全窗口：缺省 0 时 zRaw % lapLength 与旧版逐位一致；启用时窗口内车辆整体后移出窗
    const z = spawnSafeZone > 0 ? spawnSafeZone + (zRaw % (lapLength - spawnSafeZone)) : zRaw
    const offset = (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.4)
    const speed = TRAFFIC_CRUISE_SPEED * (0.8 + rnd() * 0.4)
    const colorIndex = Math.floor(rnd() * 4)
    cars.push({
      z,
      offset,
      // 巡航目标偏移 = 出生 offset（未触发避让时的恢复目标）
      cruiseOffset: offset,
      speed,
      colorIndex,
      shiftDir: 0,
    })
  }
  return cars
}

/**
 * 车流沿赛道推进（in-place，环形回绕）。
 * player 可选尾参：传入玩家位置时对逼近的同车道车辆执行避让变道——
 * 车在玩家前方 d ∈ (0, AVOID_Z_DIST) 且横向接近时，向远离玩家的一侧渐变 offset
 * （步进 AVOID_STEP*dt，clamp |offset| ≤ AVOID_LANE_EDGE）。
 * 触发条件消失（远离 / 横向错开）后，车辆以同样步进速率渐变恢复回自己的巡航偏移
 * （cruiseOffset，createTraffic 初始 = 出生 offset）；恢复途中 shiftDir 指示恢复方向，恢复完成后归零。
 * 不传 player 时行为与旧版完全一致（traffic 既有调用零改动）。
 */
export function updateTraffic(
  traffic: TrafficCar[],
  dt: number,
  lapLength: number,
  player?: { z: number; x: number },
  speedFactor = 1,
): void {
  for (const car of traffic) {
    // M23 方案 13：橡皮筋动态难度——speedFactor 缺省 1 时行为与旧版逐字节一致
    // （simulate/bot 确定性不破坏）；传入时车流按系数提速/减速（避让/恢复逻辑不受影响）
    car.z = (car.z + car.speed * speedFactor * dt) % lapLength
    if (!player) {
      continue
    }
    // 车相对玩家前方距离（环形语义：车在玩家后方时该值接近 lapLength，天然不触发；
    // d === 0 视为恰好相遇/已超过，严格 > 0 不触发）。
    // 2026-09-04 修复：改用 ringForwardDistance——旧式 `(car.z - player.z + L) % L` 在
    // player.z > 2L（第三圈起）时因 JS 负数取模返回负值，导致避让 AI 静默失效。
    const d = ringForwardDistance(player.z, car.z, lapLength)
    if (d > 0 && d < AVOID_Z_DIST && Math.abs(car.offset - player.x) < AVOID_X_TOL) {
      // —— 触发避让：向远离玩家的一侧渐变（步进 AVOID_STEP*dt，clamp ±AVOID_LANE_EDGE）——
      const target = player.x > 0 ? -AVOID_LANE_EDGE : AVOID_LANE_EDGE
      const step = AVOID_STEP * dt
      const delta = target > car.offset ? Math.min(step, target - car.offset) : Math.max(-step, target - car.offset)
      car.offset += delta
      car.offset = Math.max(-AVOID_LANE_EDGE, Math.min(AVOID_LANE_EDGE, car.offset))
      // 记录避让方向（车灯随变道转向）：目标侧为负 → -1，为正 → 1
      car.shiftDir = player.x > 0 ? -1 : 1
    } else {
      // —— 未触发避让（远离 / 横向不接近）：渐变恢复巡航偏移 ——
      // 恢复速率同避让（AVOID_STEP*dt，clamp ±AVOID_LANE_EDGE）；恢复途中 shiftDir 指示恢复方向
      // （目标在右侧 → 1，左侧 → -1，车灯随转向），已到达巡航偏移（含浮点误差）时归零。
      // 旧调用未给 cruiseOffset 赋值时目标即当前 offset，不产生恢复位移（与旧版行为一致）。
      const target = car.cruiseOffset ?? car.offset
      const rest = target - car.offset
      if (Math.abs(rest) < 1e-9) {
        // 已处于巡航偏移：车灯回中
        car.shiftDir = 0
      } else {
        const step = AVOID_STEP * dt
        const delta = rest > 0 ? Math.min(step, rest) : Math.max(-step, rest)
        car.shiftDir = delta > 0 ? 1 : -1
        car.offset += delta
        car.offset = Math.max(-AVOID_LANE_EDGE, Math.min(AVOID_LANE_EDGE, car.offset))
      }
    }
  }
}

/**
 * 玩家与车流碰撞检测：返回碰撞车辆或 null。
 *
 * lapLength 可选尾参：传入时启用环形语义（跨圈正确），缺省时与旧行为逐位一致（裸差值比较）。
 * 必须传入的理由：玩家 cameraZ 单调累加不取模、car.z 每帧 `% lapLength`，两者量级会在第二圈
 * 起拉开一个圈长，裸比较使车流碰撞整体失效（车流形同虚设）。环形化后每圈都能正常碰撞。
 */
export function collideWithPlayer(
  traffic: TrafficCar[],
  playerZ: number,
  playerX: number,
  zTol = TRAFFIC_Z_TOL,
  xTol = TRAFFIC_X_TOL,
  lapLength?: number,
): TrafficCar | null {
  const ring = lapLength !== undefined && lapLength > 0 ? lapLength : 0
  for (const car of traffic) {
    if (Math.abs(car.offset - playerX) >= xTol) {
      continue
    }
    const dz = ring > 0 ? ringDelta(playerZ, car.z, ring) : car.z - playerZ
    if (Math.abs(dz) < zTol) {
      return car
    }
  }
  return null
}
