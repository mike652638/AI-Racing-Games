import type { BoostParticle, RenderView } from '../engine/renderer'
import { TRACK_DEFS } from '../engine/tracks'
import { updateCar, type CarConfig, type CarInput } from '../physics/car'
import { driftSpeedFactor, effectiveTurnRate, updateDrift } from '../physics/drift'
import { BOOST_CHARGE_RATE, BOOST_DRAIN_RATE } from './constants'
import { lapFromZ } from './lap'
import type { PlayerState } from './player-state'
import type { TrackContext } from './track-context'

/**
 * 是否调度下一帧（M16 纯函数化，替代 frame() 内 `if (!ur.shouldRender) return` 裸判断）：
 * updateFrame 返回 shouldRender=false（完赛/挑战限时触发 finish）时不再自续 RAF，
 * 等价旧帧内 return（跳过渲染段与 rAF 自续，保持既有行为）。
 * 提取为纯函数便于单测锁定「shouldRender=false 时帧循环停止、true 时继续」的契约，
 * 防止未来重构再次引入热座交棒后 RAF 链断裂（P0 回归）类问题。
 */
export function shouldScheduleNextFrame(shouldRender: boolean): boolean {
  return shouldRender
}

/** 圈数记录包装已移除（H5）：updatePlayerFrame 现返回新 lastLap，调用方直接赋值 race.lastLap */

/**
 * 渲染降级参数（Task 8 性能优化）：按模式（分屏/性能/默认）返回不同负载档位。
 * drawDistance 控制可视道路段数（渲染深度），skip* 跳过对应粒子/特效渲染。
 */
export interface PerformanceConfig {
  /** 可视道路段数（默认 120，分屏 80，性能模式 60） */
  drawDistance: number
  /** 是否跳过漂移烟雾渲染 */
  skipSmoke: boolean
  /** 是否跳过 BOOST 尾焰粒子渲染 */
  skipBoostParticles: boolean
  /** 是否跳过雨丝渲染 */
  skipRain: boolean
}

/** 全效档（默认）：120 段 + 渲染全部特效 */
const PERF_HIGH: PerformanceConfig = {
  drawDistance: 120,
  skipSmoke: false,
  skipBoostParticles: false,
  skipRain: false,
}
/** 分屏档：80 段 + 跳过全部特效（双区域渲染负载减半） */
const PERF_MID: PerformanceConfig = {
  drawDistance: 80,
  skipSmoke: true,
  skipBoostParticles: true,
  skipRain: true,
}
/** 性能档：60 段 + 跳过全部特效（最激进降级） */
const PERF_LOW: PerformanceConfig = {
  drawDistance: 60,
  skipSmoke: true,
  skipBoostParticles: true,
  skipRain: true,
}

/**
 * 按模式解析降级参数（纯函数，Task 8）：
 * - 性能模式（?perf）优先：最激进档位（60 段 + 全跳过）——用户显式请求降级，与分屏共存时也取该档
 * - 分屏模式：80 段 + 全跳过
 * - 默认：120 段 + 全渲染
 * 返回只读共享实例（仿 _viewCache 复用模式），调用方勿修改。
 */
export function resolvePerformanceConfig(splitMode: boolean, perfMode: boolean): PerformanceConfig {
  if (perfMode) {
    return PERF_LOW
  }
  if (splitMode) {
    return PERF_MID
  }
  return PERF_HIGH
}

/**
 * BOOST 蓄力/消耗（G4，纯函数）：漂移激活期间按 BOOST_CHARGE_RATE 蓄力（封顶 1）；
 * inputBoost 按下且 charge > 0 时激活 boost 并按 BOOST_DRAIN_RATE 消耗（不越 0）。
 * 帧块调用后把返回的 boost 并入传给 updatePlayerFrame 的 input（{ ...input, boost }）。
 */
export function updateBoostCharge(
  charge: number,
  dt: number,
  inputBoost: boolean,
  driftActive: boolean,
): { charge: number; boost: boolean } {
  if (driftActive) {
    charge = Math.min(1, charge + dt * BOOST_CHARGE_RATE)
  }
  const boost = inputBoost && charge > 0
  if (boost) {
    charge = Math.max(0, charge - dt * BOOST_DRAIN_RATE)
  }
  return { charge, boost }
}

/**
 * 菜单预览相机每秒推进的世界单位数。
 * 文档初稿为 50，但相对 24000 视距（DRAW_DISTANCE×SEGMENT_LENGTH）每帧仅 0.8 单位，
 * 肉眼不可感知；微调至 500（每帧约 8 单位，横向 sin 摆动周期约 12.6 秒），
 * 仍属"缓慢滚动"语义且三赛道预览差异可辨。
 */
export const PREVIEW_CAMERA_SPEED = 500

/** 菜单预览相机推进一帧：超过圈长则回绕到圈内（保持 previewCameraZ ∈ [0, lapLength]） */
export function advancePreviewCameraZ(current: number, dt: number, lapLength: number): number {
  const next = current + PREVIEW_CAMERA_SPEED * dt
  return next > lapLength ? next - lapLength : next
}

/**
 * 切换赛道时的预览起点：按赛道序号等分圈长（等分数 = TRACK_DEFS.length）。
 * 各赛道起点附近（z < 8000）都是直道，index*5000 无法区分不同赛道；
 * 按圈长 1/N 等分后落在不同曲率区段，预览画面差异明显。
 */
export function initialPreviewCameraZ(index: number, lapLength: number): number {
  const count = TRACK_DEFS.length
  return Math.floor((index * lapLength) / count)
}

/**
 * viewFor 渲染视图缓存（Task B6 对象池复用）：模块级单例，复用而非每帧新建 RenderView。
 * 渲染为同步消费（renderWithOpts 内局部使用、不跨帧持有），分屏两区域先后渲染互不冲突；
 * 消费者均为内部代码，按只读使用、不做防御性拷贝。初始占位对象字段会被 viewFor 全量覆盖。
 */
const _viewCache: RenderView = {
  track: [],
  curvePrefixSum: new Float64Array(0),
  spriteIndex: new Map(),
  traffic: [],
}

/**
 * 从赛道上下文构造渲染视图：分段/曲率前缀和/景物索引/车流。
 * 分屏双世界各持一份 TrackContext，渲染时用各自 view（单次渲染零重建，
 * 预计算在 TrackContext 创建时完成）。Task B6：复用模块级 _viewCache 赋值各字段后
 * 返回同一引用（两次调用之间渲染已完成，覆盖安全；导出供单测验证引用复用）。
 */
export function viewFor(
  ctx: TrackContext,
  boostParticles?: BoostParticle[],
  speedRatio = 0,
  boosting = false,
  steer = 0,
  collisionFlash = 0,
  playerIndex?: 1 | 2,
): RenderView {
  _viewCache.track = ctx.segments
  _viewCache.curvePrefixSum = ctx.curvePrefixSum
  _viewCache.spriteIndex = ctx.spriteIndex
  _viewCache.traffic = ctx.traffic
  _viewCache.night = ctx.def.timeOfDay === 'night'
  // M17：环境场景（驱动天空/草地色相与远山配色；由 TrackDef.environment 透传）
  _viewCache.environment = ctx.def.environment
  // H2（H2）：BOOST 尾焰粒子（比赛渲染传，菜单预览不传/无粒子）
  _viewCache.boostParticles = boostParticles
  // M8：速度线与 BOOST 金色 vignette 参数
  _viewCache.speedRatio = speedRatio
  _viewCache.boosting = boosting
  // M16：碰撞红闪强度（碰撞后指数衰减，驱动屏幕红色 vignette）
  _viewCache.collisionFlash = collisionFlash
  // 玩家实时转向输入（-1..1，比赛渲染传 ctx.steer1/steer2；菜单预览缺省 0）：驱动车辆转向倾斜
  _viewCache.steer = steer
  // 2026-08-05 P2-5：分屏 P2 玩家序号（2 → 蓝色车身；缺省 undefined/P1 → 默认红）
  _viewCache.playerIndex = playerIndex
  return _viewCache
}

/**
 * 单玩家一帧更新：漂移 → 速度修正 → 车辆运动学 → 相机推进 → 个人计时 → 圈数记录。
 * 纯函数式收敛 P1/P2 的重复更新逻辑；lapTimes 可选传入——
 * 分屏 P2 不参与圈速记录（保持原 main.ts 行为：仅 P1 记录 lapTimes）。
 * H5：返回「新 lastLap」——传入 lapTimes 时返回当前圈数（currentLap，过圈时已 push raceTime），
 * 未传 lapTimes 返回 1；wet（雨天物理，G3）上移为第 6 尾参。
 * H1：scoreMultiplier（挑战加成）为第 7 尾参，默认 1 时行为不变。
 */
export function updatePlayerFrame(
  dt: number,
  input: CarInput,
  player: PlayerState,
  carConfig: CarConfig,
  lapLength: number,
  lapTimes?: number[],
  wet = false,
  scoreMultiplier = 1,
): number {
  player.driftState = updateDrift(
    dt,
    input,
    player.carState,
    carConfig,
    player.driftState,
    player.cameraZ,
    scoreMultiplier,
  )
  player.carState.speed *= driftSpeedFactor(player.driftState)
  updateCar(dt, input, player.carState, carConfig, effectiveTurnRate(carConfig, player.driftState), wet)
  player.cameraZ += player.carState.speed * dt
  player.raceTime += dt

  if (lapTimes !== undefined) {
    const currentLap = lapFromZ(player.cameraZ, lapLength)
    // lastLap 由 lapTimes 已有记录数推断（每次过圈 push 一条，圈数 = 条数 + 1），消除外部 { value } 桥接
    if (currentLap > lapTimes.length + 1) {
      lapTimes.push(player.raceTime)
    }
    return currentLap
  }
  return 1
}
