import { project, type Projected, type ProjectionOptions, type Camera3D } from './projection'
import { DRAW_DISTANCE } from './road-geometry'
import { SEGMENT_LENGTH } from './track'
import type { TrafficCar } from './traffic'

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
  bottom: Projected
  top: Projected
  width: number
  height: number
  color: string
}

/** 计算可见车流投影（过滤后方/超距车辆，远→近排序），纯函数 */
export function projectTraffic(
  traffic: TrafficCar[],
  cameraZ: number,
  cameraX: number,
  opts: ProjectionOptions,
  camera: Camera3D,
): TrafficProjection[] {
  const farZ = cameraZ + DRAW_DISTANCE * SEGMENT_LENGTH
  const seen = traffic.filter((car) => car.z > cameraZ && car.z <= farZ).sort((a, b) => b.z - a.z)

  const result: TrafficProjection[] = []
  for (const car of seen) {
    const cx = car.offset - cameraX
    const bottom = project(opts, camera, { x: cx, y: 0, z: car.z })
    if (!bottom) {
      continue
    }
    const top = project(opts, camera, { x: cx, y: CAR_WORLD_HEIGHT, z: car.z })
    if (!top) {
      continue
    }
    // 宽度基于世界宽度 × 投影比例；高度用 bottom.y − top.y 精确像素差（确保车底贴合路面投影点）
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
      bottom,
      top,
      width,
      height,
      color: TRAFFIC_COLORS[car.colorIndex % TRAFFIC_COLORS.length],
    })
  }
  return result
}
