import {
  createSmoothTrack,
  DEFAULT_CONTROL_POINTS,
  type CurveControlPoint,
  type Segment,
} from './track'

export interface TrackDef {
  /** 唯一标识（URL/存档用） */
  id: string
  /** 显示名称 */
  name: string
  /** 难度等级（1=★ 2=★★ 3=★★★），菜单星级显示 */
  difficulty: 1 | 2 | 3
  /** 赛道控制点 */
  controlPoints: CurveControlPoint[]
  /** 圈数 */
  laps: number
  /** 车流密度（条/圈），缺省时使用 TRAFFIC_DEFAULT_COUNT */
  trafficCount?: number
  /** 时段（'night' 夜晚赛道，缺省视为 'day'），渲染层据此切换夜晚色板与车灯 */
  timeOfDay?: 'day' | 'night'
}

/** 高速公路：长直道 + 大半径缓弯 */
const HIGHWAY_CONTROL_POINTS: CurveControlPoint[] = [
  { z: 0, curve: 0 },
  { z: 12000, curve: 0 },
  { z: 15000, curve: 0.015 },
  { z: 45000, curve: 0.015 },
  { z: 48000, curve: 0 },
  { z: 70000, curve: 0 },
  { z: 73000, curve: -0.015 },
  { z: 103000, curve: -0.015 },
  { z: 106000, curve: 0 },
  { z: 120000, curve: 0 },
]

/** S 弯挑战：短距离密集连续弯 */
const SCURVE_CONTROL_POINTS: CurveControlPoint[] = [
  { z: 0, curve: 0 },
  { z: 5000, curve: 0 },
  { z: 7000, curve: 0.03 },
  { z: 15000, curve: 0.03 },
  { z: 17000, curve: 0 },
  { z: 20000, curve: 0 },
  { z: 22000, curve: -0.03 },
  { z: 30000, curve: -0.03 },
  { z: 32000, curve: 0 },
  { z: 36000, curve: 0 },
  { z: 38000, curve: 0.02 },
  { z: 50000, curve: 0.02 },
  { z: 52000, curve: 0 },
  { z: 54000, curve: 0 },
  { z: 56000, curve: -0.02 },
  { z: 68000, curve: -0.02 },
  { z: 70000, curve: 0 },
  { z: 72000, curve: 0 },
]

/** 环岛巡回：混合节奏——长直道 + 中缓弯（±0.003）+ 连续小 S（±0.002），总曲率接近 0（+0.015） */
const ISLAND_CONTROL_POINTS: CurveControlPoint[] = [
  { z: 0, curve: 0 },
  { z: 8000, curve: 0 },
  { z: 10000, curve: 0.003 },
  { z: 20000, curve: 0.003 },
  { z: 34000, curve: 0 },
  { z: 36000, curve: -0.003 },
  { z: 46000, curve: -0.003 },
  { z: 58000, curve: 0 },
  { z: 60000, curve: 0.002 },
  { z: 66000, curve: 0.002 },
  { z: 68000, curve: -0.002 },
  { z: 74000, curve: -0.002 },
  { z: 76000, curve: 0 },
  { z: 90000, curve: 0 },
]

/** 峡谷疾驰：超长直道 + 两个大半径反向弯（±0.015），总曲率回环为 0 */
const CANYON_CONTROL_POINTS: CurveControlPoint[] = [
  { z: 0, curve: 0 },
  { z: 8000, curve: 0 },
  { z: 22000, curve: 0 },
  { z: 24000, curve: 0.015 },
  { z: 44000, curve: 0.015 },
  { z: 46000, curve: 0 },
  { z: 60000, curve: 0 },
  { z: 62000, curve: -0.015 },
  { z: 82000, curve: -0.015 },
  { z: 84000, curve: 0 },
  { z: 110000, curve: 0 },
]

/** 沙漠疾驰：长直道 + 两个宽缓反向弯（±0.002），总曲率回环为 0 */
const DESERT_CONTROL_POINTS: CurveControlPoint[] = [
  { z: 0, curve: 0 },
  { z: 20000, curve: 0 },
  { z: 30000, curve: 0.002 },
  { z: 50000, curve: 0.002 },
  { z: 60000, curve: 0 },
  { z: 80000, curve: 0 },
  { z: 90000, curve: -0.002 },
  { z: 110000, curve: -0.002 },
  { z: 120000, curve: 0 },
  { z: 125000, curve: 0 },
]

/** 森林穿梭：连续中弯成对交替（±0.005），总曲率回环为 0 */
const FOREST_CONTROL_POINTS: CurveControlPoint[] = [
  { z: 0, curve: 0 },
  { z: 10000, curve: 0 },
  { z: 15000, curve: 0.005 },
  { z: 25000, curve: 0.005 },
  { z: 30000, curve: 0 },
  { z: 35000, curve: -0.005 },
  { z: 45000, curve: -0.005 },
  { z: 50000, curve: 0 },
  { z: 55000, curve: 0.005 },
  { z: 65000, curve: 0.005 },
  { z: 70000, curve: 0 },
  { z: 75000, curve: -0.005 },
  { z: 85000, curve: -0.005 },
  { z: 89000, curve: 0 },
]

/** 海岸公路：长弯与直道交替（±0.004），总曲率回环为 0 */
const COAST_CONTROL_POINTS: CurveControlPoint[] = [
  { z: 0, curve: 0 },
  { z: 15000, curve: 0 },
  { z: 20000, curve: 0.004 },
  { z: 40000, curve: 0.004 },
  { z: 45000, curve: 0 },
  { z: 60000, curve: 0 },
  { z: 65000, curve: -0.004 },
  { z: 85000, curve: -0.004 },
  { z: 90000, curve: 0 },
  { z: 95000, curve: 0 },
]

/** 山岳险道：S 弯 + 大弯组合（±0.01），总曲率回环为 0 */
const ALPINE_CONTROL_POINTS: CurveControlPoint[] = [
  { z: 0, curve: 0 },
  { z: 8000, curve: 0 },
  { z: 10000, curve: 0.01 },
  { z: 18000, curve: 0.01 },
  { z: 20000, curve: 0 },
  { z: 22000, curve: -0.01 },
  { z: 30000, curve: -0.01 },
  { z: 32000, curve: 0 },
  { z: 40000, curve: 0 },
  { z: 44000, curve: 0.01 },
  { z: 54000, curve: 0.01 },
  { z: 56000, curve: 0 },
  { z: 60000, curve: 0 },
  { z: 64000, curve: -0.01 },
  { z: 74000, curve: -0.01 },
  { z: 76000, curve: 0 },
]

export const TRACK_DEFS: TrackDef[] = [
  // classic 不写 trafficCount，走默认密度（TRAFFIC_DEFAULT_COUNT = 8）
  { id: 'classic', name: '经典赛道', difficulty: 1, controlPoints: DEFAULT_CONTROL_POINTS, laps: 3 },
  { id: 'highway', name: '高速公路', difficulty: 2, controlPoints: HIGHWAY_CONTROL_POINTS, laps: 3, trafficCount: 12 },
  { id: 's-curve', name: 'S 弯挑战', difficulty: 2, controlPoints: SCURVE_CONTROL_POINTS, laps: 2, trafficCount: 6 },
  { id: 'island', name: '环岛巡回', difficulty: 2, controlPoints: ISLAND_CONTROL_POINTS, laps: 3, trafficCount: 10 },
  { id: 'canyon', name: '峡谷疾驰', difficulty: 3, controlPoints: CANYON_CONTROL_POINTS, laps: 2, trafficCount: 8, timeOfDay: 'night' },
  { id: 'desert', name: '沙漠疾驰', difficulty: 1, controlPoints: DESERT_CONTROL_POINTS, laps: 3, trafficCount: 10 },
  { id: 'forest', name: '森林穿梭', difficulty: 2, controlPoints: FOREST_CONTROL_POINTS, laps: 2, trafficCount: 8 },
  { id: 'coast', name: '海岸公路', difficulty: 2, controlPoints: COAST_CONTROL_POINTS, laps: 3, trafficCount: 12 },
  { id: 'alpine', name: '山岳险道', difficulty: 3, controlPoints: ALPINE_CONTROL_POINTS, laps: 2, trafficCount: 6, timeOfDay: 'night' },
]

/** 按赛道定义生成分段数据 */
export function createTrackFromDef(def: TrackDef): Segment[] {
  return createSmoothTrack(def.controlPoints)
}

/** 按 id 查找赛道定义，未命中返回 null */
export function getTrackDef(id: string): TrackDef | null {
  return TRACK_DEFS.find((def) => def.id === id) ?? null
}
