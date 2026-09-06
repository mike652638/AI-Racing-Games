/**
 * 共享类型层（2026-08-05 类型提升）：ui 对 game 的类型级依赖（RaceState/TrackContext）
 * 提升至 shared，ui 改从本模块导入——game↔ui 仅剩的 import type 依赖消除，
 * ui → game 方向完全断开（类型层亦然）。
 *
 * 2026-08-15 二次提升：PlayerState 接口自 game/player-state 迁入本层（其字段类型
 * CarState/DriftState 来自 physics，随迁为类型级依赖）——shared 对 game 的
 * 唯一类型反指消除，shared → game 零引用（含类型层）。
 *
 * 依赖说明：本模块仅 `import type`（编译期擦除，运行时无任何依赖）；
 * shared 仍为运行时最底层（constants/phase/lap 真源），类型转发不构成运行时环。
 * game/state.ts、game/track-context.ts 与 game/player-state.ts 以 import type
 * 自本模块引入类型（原同名 re-export 兼容层已于 2026-08-22 移除）。
 */
import type { RoadStrip } from '../engine/road-strip'
import type { Segment } from '../engine/track'
import type { Sprite } from '../engine/sprites'
import type { TrackDef } from '../engine/tracks'
import type { TrafficCar } from '../engine/traffic'
import type { WeatherOverride } from '../engine/lighting'
import type { CarState } from '../physics/car'
import type { DriftState } from '../physics/drift'

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
 * 单个玩家的独立对局状态（2026-08-15 自 game/player-state 提升）：车辆、漂移、
 * 相机进度、个人计时与碰撞冷却。分屏模式下 P1/P2 各持有一份实例，
 * 主循环分别更新，互不影响。（原 game/player-state.ts 的类型 re-export 已于
 * 2026-08-22 移除，该文件以 import type 自本模块引入。）
 */
export interface PlayerState {
  /** 车辆状态（横向位置 + 速度） */
  carState: CarState
  /** 漂移状态（含烟雾粒子数组） */
  driftState: DriftState
  /** 相机 z（沿赛道累计距离） */
  cameraZ: number
  /** 个人比赛用时（秒） */
  raceTime: number
  /** 碰撞冷却（秒），冷却期内不重复触发碰撞惩罚 */
  collisionCooldown: number
  /** BOOST 蓄力值（0-1，漂移激活期间累积，按键消耗，G4） */
  boostCharge: number
  /** 上一帧该玩家 boost 是否激活（边沿检测：本帧激活且上帧未激活 → 完美氮气判定，P0） */
  boostActive: boolean
  /** 本次 BOOST 激活段是否为完美氮气（激活边沿 charge ≥ 阈值锁定，boost 结束后重置，P0） */
  boostPerfect: boolean
  /** near-miss 冷却（秒，P0：贴身超车触发后冷却防刷） */
  nearMissCooldown: number
  /** near-miss 累计得分（P0：独立于漂移得分——不污染漂移 TOP10 语义；挑战 HUD 实时总分 = 漂移 + near-miss） */
  nearMissScore: number
  /** M23 方案 6：本局是否使用过 BOOST（对局内统计，成就「首次氮气」检测） */
  boostUsedEver: boolean
  /** M23 方案 6：本局是否触发过完美氮气（成就「完美爆发」检测） */
  perfectBoostUsed: boolean
  /** M23 方案 6：本局最高连击档位（对局内统计，成就「连击大师」检测；driftState.combo 会因断连归零） */
  maxCombo: number
  /** M23 方案 6：本局 near-miss 累计次数（对局内统计，成就「贴地飞行」检测） */
  nearMissCount: number
  /** M23 方案 8：挑战模式已通过检查点数（cameraZ / 检查点间距取整，frame-update 推进） */
  challengeCheckpoints: number
  /** M23 方案 8：挑战模式检查点累计奖励时长（秒，每过 1 个检查点 +CHALLENGE_CHECKPOINT_BONUS） */
  challengeBonus: number
  /** M23 方案 13：车流橡皮筋动态系数（当前玩家世界 speedFactor，frame-update 平滑收敛；初始 1） */
  trafficRubber: number
  /** M23 方案 12：near-miss 速度线脉冲强度（0-1 指数衰减，触发后逐帧衰减；0 = 无脉冲） */
  nearMissPulse: number
  /** M23 方案 12：完美氮气金色闪光强度（0-1 指数衰减；0 = 无闪光） */
  perfectBoostFlash: number
  /** M23 方案 12：漂移小喷蓝色闪光强度（0-1 指数衰减；0 = 无闪光） */
  miniTurboFlash: number
  /** M23 方案 12：漂移得分浮动飘字（得分累积到整数位变化时生成；非空时逐帧推进/超期清除）。
   *  M29 方案 12 二次打磨：combo 字段为生成时连击档位（≥5 时飘字放大+橙色高亮） */
  driftPopup: { t: number; amount: number; combo?: number } | null
  /** M23 方案 12：上次漂移得分整数位（帧间 diff 判定生成飘字，避免每帧重复生成） */
  lastDriftScoreInt: number
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
  /**
   * 起步倒计时剩余冻结时长（秒，2026-08-05 审计 F-1）：
   * >0 时比赛未正式开始（raceTime/车流/玩家物理冻结，帧更新段按 dt 递减）；
   * 归零瞬间正式起计（GO）。菜单/重置态为 0；热座交棒不走倒计时恒为 0。
   */
  countdownRemaining: number
  /** 结算面板是否已填充（避免重复写入记录） */
  finishShown: boolean
  /**
   * M23 方案 11：对局天气变体覆盖（URL `?weather=` 驱动；'auto' 缺省沿用三态时间循环）。
   * 渲染（renderer 天气/雨滴 + 夜晚色板）、物理（雨天 wet）、雨声与成就判定共用同一真源。
   */
  weatherOverride: WeatherOverride
  /**
   * M28 方案 9：路线模式（OutRun 式分段递进 + 岔路）当前阶段 id。
   * null = 非路线模式（单屏/分屏/热座/挑战沿用环形赛道跑圈）。
   * 路线模式下每段复用一条赛道（TrackManager 已选），玩家跑完该段 1 圈
   * （lapFromZ > totalLaps，totalLaps 由 GameLoop 段切换时强制 1）→ 段末岔路选择。
   */
  routeStageId: string | null
  /** M28 方案 9：路线模式累计用时（秒）——段末累加当前段 raceTime，跨段持续累计（结算总用时） */
  routeCumulativeTime: number
  /** M28 方案 9：路线模式累计漂移得分（跨段持续累计，结算展示） */
  routeCumulativeDriftScore: number
  /** M28 方案 9：路线阶段总数（STAGE 指示 Y；startGame 设置，段切换不变） */
  routeStageCount: number
  /** M28 方案 9：当前阶段序号（STAGE 指示 X，从 1 起；段切换更新） */
  routeStageIndex: number
  /** M28 方案 9：当前阶段是否为终点（完赛判定：终点段跑满 1 圈即完赛；段切换更新） */
  routeIsFinish: boolean
}

/**
 * 每日挑战存档状态（2026-09-06 自 game/daily 提升：ui/save.ts 以 import type 消费，
 * 类型提升到 shared 后 ui → game 依赖方向进一步收紧；运行时仅类型，零依赖）。
 * 持久化由 ui/save.ts 负责；date 为 YYYY-MM-DD 本地日期字符串。
 */
export interface DailyState {
  /** 挑战日期（YYYY-MM-DD，本地时区） */
  date: string
  /** 今日赛道 id（由 daily.dailyTrackIdFor 确定性生成） */
  trackId: string
  /** 今日挑战是否已完成（该赛道完赛即完成，只升不降直到日期变更） */
  done: boolean
  /** 连续完成挑战天数（断签归 1；今天完成第 1 天为 1） */
  streak: number
}
