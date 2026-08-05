/**
 * 共享类型层（2026-08-05 类型提升）：ui 对 game 的类型级依赖（RaceState/TrackContext）
 * 提升至 shared，ui 改从本模块导入——game↔ui 仅剩的 import type 依赖消除，
 * ui → game 方向完全断开（类型层亦然）。
 *
 * 依赖说明：本模块仅 `import type`（编译期擦除，运行时无任何依赖）；
 * shared 仍为运行时最底层（constants/phase/lap 真源），类型转发不构成运行时环。
 * game/state.ts 与 game/track-context.ts 保留同名 re-export 兼容层，既有导入路径不受影响。
 */
import type { RoadStrip } from '../engine/road-strip'
import type { Segment } from '../engine/track'
import type { Sprite } from '../engine/sprites'
import type { TrackDef } from '../engine/tracks'
import type { TrafficCar } from '../engine/traffic'
import type { PlayerState } from '../game/player-state'
import type { Phase } from './phase'

/**
 * 单个玩家的完整赛道世界上下文：赛道定义、分段数据、圈长/圈数、
 * 渲染用预计算（曲率前缀和/景物段索引/景物列表）与运行时车流。
 * 分屏模式下 P1/P2 各持一份（互不共享，车流独立推进与碰撞）；
 * 单人模式仅 [0] 生效。预计算在创建时完成，运行时零重建。
 */
export interface TrackContext {
  /** 赛道定义（来源 src/engine/tracks） */
  def: TrackDef
  /** 赛道分段数据（createTrackFromDef(def)） */
  segments: Segment[]
  /** 单圈长度（世界单位）= segments.length * SEGMENT_LENGTH */
  lapLength: number
  /** 总圈数 = def.laps */
  totalLaps: number
  /** 曲率前缀和（渲染 O(1) 查询累计曲率） */
  curvePrefixSum: Float64Array
  /** 景物段索引（键 = floor(z / SEGMENT_LENGTH)） */
  spriteIndex: Map<number, Sprite[]>
  /** 路边景物列表（道路两侧树木/路灯） */
  sprites: Sprite[]
  /** 道路段缓存（按曲率分段的条带，渲染层离屏绘制后逐段复用） */
  roadStrips: RoadStrip[]
  /** 本世界车流（in-place 推进） */
  traffic: TrafficCar[]
}

/**
 * 对局可变状态容器：集中管理双玩家的独立状态（PlayerState）、碰撞计数、
 * 圈速记录、双赛道上下文（TrackContext）等所有运行时可变数据，
 * 便于统一重置与单测。
 */
export interface RaceState {
  /** P1 玩家独立状态（车辆/漂移/相机/计时/冷却） */
  player1: PlayerState
  /** P2 玩家独立状态（分屏时有效） */
  player2: PlayerState
  /** 双玩家赛道上下文（分屏各用其一；单人模式仅 [0] 生效） */
  tracks: [TrackContext, TrackContext]
  /** 碰撞总次数（P1/P2 各自世界内的车流碰撞累计） */
  collisionCount: number
  /** 每圈累计用时（lapTimes[i] 为第 i+1 圈完成时刻） */
  lapTimes: number[]
  /** 当前已完成圈数（1 基，lapFromZ 推进） */
  lastLap: number
  /** P2 每圈累计用时（分屏时独立记录，P2 圈速用） */
  lapTimes2: number[]
  /** P2 当前已完成圈数（1 基） */
  lastLap2: number
  /** 游戏阶段（菜单/比赛/暂停/结算） */
  phase: Phase
  /**
   * 起步倒计时剩余冻结时长（秒，2026-08-05 审计 F-1）：
   * >0 时比赛未正式开始（raceTime/车流/玩家物理冻结，帧更新段按 dt 递减）；
   * 归零瞬间正式起计（GO）。菜单/重置态为 0；热座交棒不走倒计时恒为 0。
   */
  countdownRemaining: number
  /** 结算面板是否已填充（避免重复写入记录） */
  finishShown: boolean
}
