import { project, type Projected, type ProjectionOptions, type Camera3D } from './projection'
import { DRAW_DISTANCE } from './road-geometry'
import { SEGMENT_LENGTH } from './track'
import { ringForwardDistance, type TrafficCar } from './traffic'

/** 车流车身配色（按 colorIndex 循环取用） */
export const TRAFFIC_COLORS = ['#d84a4a', '#4a8ad8', '#d8c04a', '#4ad88a']

/** 车流世界宽度（单位，约 1.8m，对应 2 单位路宽 ≈ 7m 两车道） */
const CAR_WORLD_WIDTH = 0.5
/** 车流世界高度（单位，约 1.4m，对应轿车实际车高） */
const CAR_WORLD_HEIGHT = 0.4
/** 极近距离车流的最大绘制高度（像素，P2）：防 1/cameraDepth 投影在贴脸时产生超大车流遮挡画面。
 *  与 sprites.ts clampSpriteHeight（MAX_LAMP_HEIGHT_PX=200）同一档位、同一思路：
 *  仅约束绘制尺寸，不影响投影数学（project 保持原语义）。 */
export const MAX_TRAFFIC_HEIGHT_PX = 200

export interface TrafficProjection {
  car: TrafficCar
  /**
   * 投影所用的绝对世界 z（= cameraZ + 环形前向距离；未启用环形语义时 = car.z）。
   * 与景物 `windowedSprite` 返回的绝对化 z 同坐标系，供渲染层景深归并比较使用；
   * car.z 本体仍是 [0, lapLength) 内的真实环形位置，两者在多圈时不再相等。
   */
  z: number
  bottom: Projected
  top: Projected
  width: number
  height: number
  color: string
}

/** 可见车流排序复用缓冲（审计 R5 性能加固）：每帧 filter+sort 会分配临时数组，
 *  改用模块级缓冲原地过滤+排序，消除帧内一次数组分配；函数返回的 result 仍为新数组，
 *  调用方（renderer 双指针归并）在帧内立即消费，复用安全 */
const _seenScratch: TrafficCar[] = []
/** 与 _seenScratch 平行的绝对化世界 z（cameraZ + 环形前向距离） */
const _seenZScratch: number[] = []

/**
 * 计算可见车流投影（过滤后方/超距车辆，远→近排序），纯函数。
 *
 * lapLength 可选尾参：传入时启用环形语义（跨圈正确），缺省时与旧行为逐位一致。
 * 必须传入的理由：car.z 恒在 [0, lapLength) 内循环，而玩家 cameraZ 单调累加从不取模，
 * 第二圈起 `car.z > cameraZ` 恒为假 → 车流完全不渲染。启用后先取环形前向距离、
 * 再绝对化为 `cameraZ + rel`（与 sprites.windowedSprite 同一模式），投影与归并均正确。
 */
export function projectTraffic(
  traffic: TrafficCar[],
  cameraZ: number,
  cameraX: number,
  opts: ProjectionOptions,
  camera: Camera3D,
  lapLength?: number,
): TrafficProjection[] {
  const farDist = DRAW_DISTANCE * SEGMENT_LENGTH
  const ring = lapLength !== undefined && lapLength > 0 ? lapLength : 0
  _seenScratch.length = 0
  _seenZScratch.length = 0
  for (const car of traffic) {
    if (ring > 0) {
      const rel = ringForwardDistance(cameraZ, car.z, ring)
      // rel === 0 表示恰好重合（已贴身），仍应渲染
      if (rel <= farDist) {
        _seenScratch.push(car)
        _seenZScratch.push(cameraZ + rel)
      }
    } else if (car.z > cameraZ && car.z <= cameraZ + farDist) {
      _seenScratch.push(car)
      _seenZScratch.push(car.z)
    }
  }
  // 远→近排序（画家算法）：车流量级 ≤ 数十，插入排序原地完成，
  // 避免 Array.sort 的临时数组与比较闭包（与过滤缓冲共同保持帧内零分配）
  for (let i = 1; i < _seenScratch.length; i++) {
    const car = _seenScratch[i]
    const z = _seenZScratch[i]
    let j = i - 1
    while (j >= 0 && _seenZScratch[j] < z) {
      _seenScratch[j + 1] = _seenScratch[j]
      _seenZScratch[j + 1] = _seenZScratch[j]
      j--
    }
    _seenScratch[j + 1] = car
    _seenZScratch[j + 1] = z
  }

  const result: TrafficProjection[] = []
  for (let i = 0; i < _seenScratch.length; i++) {
    const car = _seenScratch[i]
    const z = _seenZScratch[i]
    const cx = car.offset - cameraX
    const bottom = project(opts, camera, { x: cx, y: 0, z })
    if (!bottom) {
      continue
    }
    const top = project(opts, camera, { x: cx, y: CAR_WORLD_HEIGHT, z })
    if (!top) {
      continue
    }
    // 宽度基于世界宽度 × 投影比例；高度用 bottom.y − top.y 精确像素差（确保车底贴合路面投影点）。
    // 车流近距防护走既有 MAX_TRAFFIC_HEIGHT_PX（保宽高比 clamp，P2），
    // 不叠加 clampSpriteScale——双重 clamp 会破坏宽高比契约（M18 实测取舍）
    let width = Math.max(CAR_WORLD_WIDTH * bottom.scale * (opts.width / 2), 3)
    let height = Math.max(bottom.y - top.y, 3)
    // 极近距离高度 clamp（P2）：与 clampSpriteHeight 同一思路——渲染层保护，不动 project 数学。
    // 保持宽高比：高度超限时按同一 factor 同时缩放宽高，避免只压高度导致车变矮胖；3px 下限保留。
    if (height > MAX_TRAFFIC_HEIGHT_PX) {
      const factor = MAX_TRAFFIC_HEIGHT_PX / height
      height *= factor
      width *= factor
    }
    result.push({
      car,
      z,
      bottom,
      top,
      width,
      height,
      color: TRAFFIC_COLORS[car.colorIndex % TRAFFIC_COLORS.length],
    })
  }
  return result
}
