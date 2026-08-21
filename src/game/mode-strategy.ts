import type { CarConfig, CarInput } from '../physics/car'
import { mergeCarInputs } from '../physics/input'
import { CHALLENGE_SECONDS } from '../shared/constants'
import { initialPreviewCameraZ, updatePlayerFrame } from './frame-pure'
import { lapFromZ } from '../shared/lap'
import type { RaceState } from '../shared/types'
import type { TrackManager } from './track-manager'

/**
 * 游玩模式策略（Task E 抽取自 game-loop.ts 的模式 if/else 分支）：
 * 单屏 / 分屏（?split=1）/ 热座（?hotseat=1）/ 挑战（?challenge=1）四实例，
 * 统一封装输入路由、车流推进范围、碰撞范围、玩家更新路由、完赛判定与热座选赛道双人同步。
 * 每个分支的实现均对照旧 GameLoop 逐行核对，语义完全一致（互斥且 split 优先的
 * URL 判定逻辑仍留在 GameLoop 构造器，本模块只接收已解析的布尔标志）。
 */
export interface ModeStrategy {
  /** 分屏模式（左右独立双世界） */
  readonly splitMode: boolean
  /** 热座轮流模式（双人先后跑同赛道比成绩） */
  readonly hotseatMode: boolean
  /** 漂移挑战模式（限时刷分；与 split/hotseat 互斥） */
  readonly challengeMode: boolean
  /** M28 方案 9：路线模式（OutRun 式分段递进 + 岔路；?route= 驱动，与 split/hotseat/challenge 互斥） */
  readonly routeMode: boolean
  /**
   * 菜单提示文案（#menu-hint，Batch 3 格式 [操作说明] · [开始方式]）：
   * 分屏双键盘 / 热座轮流 / 挑战限时 / 默认单屏各一套。
   */
  readonly menuHint: string
  /** 输入路由：返回本帧 P1/P2 有效输入（单屏/热座合并双键盘、分屏独立；摇杆 active 优先） */
  getInputs(ctx: InputRoutingContext): { input1: CarInput; input2: CarInput }
  /** 分屏最近活跃玩家（仅分屏按输入更新，P1 优先；其余模式原样返回） */
  updateActivePlayer(input1: CarInput, input2: CarInput, current: 1 | 2): 1 | 2
  /** P2 世界车流是否推进（热座仅当前回合 = P2 时推进，其余模式恒推进） */
  shouldUpdateP2Traffic(hotseatPlayer: 1 | 2): boolean
  /** 碰撞检测是否包含 P2 世界（热座仅当前回合 = P2 时参与） */
  collisionIncludesP2(hotseatPlayer: 1 | 2): boolean
  /** 玩家物理更新路由（热座仅更新当前回合玩家；其余模式 P1/P2 各自独立更新） */
  updatePlayers(args: PlayerUpdateArgs, hotseatPlayer: 1 | 2): void
  /** 本帧是否触发完赛（挑战限时优先 + 正常圈数判定；语义与旧 frame 两个 if 一致） */
  shouldFinish(race: RaceState, trackManager: TrackManager, hotseatPlayer: 1 | 2): boolean
  /** P1 选赛道后的双人同步（热座同步 P2 世界 TrackContext 与预览起点；其余模式无操作） */
  afterSelectP1Track(args: SelectTrackArgs): void
}

/** 四分区触控输入源（M21：分屏 P1 左半屏/P2 右半屏各自四分区，见 ui/touch-quadrant.ts） */
export interface TouchQuadrantSource {
  isP1Active(): boolean
  getP1Input(): CarInput
  isP2Active(): boolean
  getP2Input(): CarInput
}

/** 输入路由上下文：四分区触控、摇杆与双键盘原始输入（由 GameLoop.frame 采集传入） */
export interface InputRoutingContext {
  /** 四分区触控源（分屏模式创建；非分屏 undefined 走摇杆/键盘） */
  touchQuadrant?: TouchQuadrantSource
  joystickActive: boolean
  joystickInput: CarInput
  p1Input: CarInput
  p2Input: CarInput
}

/** 玩家更新路由参数（updatePlayerFrame 所需依赖聚合） */
export interface PlayerUpdateArgs {
  dt: number
  effInput1: CarInput
  effInput2: CarInput
  race: RaceState
  carConfig: CarConfig
  trackManager: TrackManager
  /** 雨天物理 wet（G3：制动 ×0.7 / 转向 ×0.85） */
  wet: boolean
  /** 挑战计分加成（H1：非挑战 undefined → updatePlayerFrame 默认 1） */
  challengeMult: number | undefined
}

/** 选赛道双人同步参数（热座：P1 选赛道后同步 P2 世界） */
export interface SelectTrackArgs {
  trackIndex: number
  race: RaceState
  trackManager: TrackManager
  previewCameraZ: [number, number]
}

/**
 * 渲染用转向输入采集（纯函数，2026-08-05 抽取）：GameLoop.frame 渲染段在 updateFrame 之外
 * 需再次路由输入取 steer（渲染倾斜数据源），此函数下沉与 updateFrame 同源的 mode.getInputs
 * 合并语义——merge 当且仅当非分屏（SINGLE/HOTSEAT/CHALLENGE 均合并双键盘、SPLIT 独立），
 * 与各策略实例 getInputs 的路由完全一致，消除两处重复实现。
 * 分屏时 steer2 取 P2 输入；非分屏 P2 输入被合并进 input1，steer2 恒 0。
 */
export function collectSteerInputs(ctx: InputRoutingContext, splitMode: boolean): { steer1: number; steer2: number } {
  const { input1, input2 } = routeInputs(ctx, !splitMode)
  return { steer1: input1.steer, steer2: splitMode ? input2.steer : 0 }
}

/**
 * 输入路由公共实现：merge 为 true（单屏/热座/挑战）时合并双键盘为 input1 且 input2 零输入；
 * merge 为 false（分屏）时 input1 = P1、input2 = P2（保持独立）。摇杆 active 时优先取摇杆输入。
 * M21：分屏四分区触控源存在时，各玩家半屏有触点即优先取四分区输入（P1 左半屏/P2 右半屏），
 * 键盘仍作为同玩家回退（无触点时）；非分屏不提供 touchQuadrant，行为与旧版逐字节一致。
 */
function routeInputs(ctx: InputRoutingContext, merge: boolean): { input1: CarInput; input2: CarInput } {
  const tq = ctx.touchQuadrant
  const tqActive1 = tq !== undefined && tq.isP1Active()
  const tqActive2 = tq !== undefined && tq.isP2Active()
  const input1 = tqActive1
    ? tq.getP1Input()
    : ctx.joystickActive
      ? ctx.joystickInput
      : merge
        ? mergeCarInputs(ctx.p1Input, ctx.p2Input)
        : ctx.p1Input
  const input2 = merge ? { throttle: 0, brake: false, steer: 0 } : tqActive2 ? tq.getP2Input() : ctx.p2Input
  return { input1, input2 }
}

/** 双玩家各自更新（单屏/分屏/挑战共用）：P1 记 lapTimes、P2 记 lapTimes2，各自独立推进 */
function updateBothPlayers(args: PlayerUpdateArgs): void {
  const { dt, effInput1, effInput2, race, carConfig, trackManager, wet, challengeMult } = args
  race.lastLap = updatePlayerFrame(
    dt,
    effInput1,
    race.player1,
    carConfig,
    trackManager.getLapLength(0),
    race.lapTimes,
    wet,
    challengeMult,
  )
  race.lastLap2 = updatePlayerFrame(
    dt,
    effInput2,
    race.player2,
    carConfig,
    trackManager.getLapLength(1),
    race.lapTimes2,
    wet,
    challengeMult,
  )
}

/** 热座回合制更新：输入只路由到当前回合玩家（P1 回合记 lapTimes、P2 回合记 lapTimes2），另一玩家不更新 */
function updateCurrentHotseatPlayer(args: PlayerUpdateArgs, hotseatPlayer: 1 | 2): void {
  const { dt, effInput1, race, carConfig, trackManager, wet, challengeMult } = args
  if (hotseatPlayer === 1) {
    race.lastLap = updatePlayerFrame(
      dt,
      effInput1,
      race.player1,
      carConfig,
      trackManager.getLapLength(0),
      race.lapTimes,
      wet,
      challengeMult,
    )
  } else {
    race.lastLap2 = updatePlayerFrame(
      dt,
      effInput1,
      race.player2,
      carConfig,
      trackManager.getLapLength(1),
      race.lapTimes2,
      wet,
      challengeMult,
    )
  }
}

/**
 * 正常圈数完赛判定：P1 按本世界圈长/总圈数；P2 仅双人模式（分屏/热座）参与判定
 * （单屏/挑战非双人，P2 恒未完赛）。
 */
function finishByLaps(race: RaceState, trackManager: TrackManager, includeP2: boolean): boolean {
  const finishedP1 = lapFromZ(race.player1.cameraZ, trackManager.getLapLength(0)) > trackManager.getTotalLaps(0)
  const finishedP2 =
    includeP2 && lapFromZ(race.player2.cameraZ, trackManager.getLapLength(1)) > trackManager.getTotalLaps(1)
  return finishedP1 || finishedP2
}

/** 分屏最近活跃玩家更新（P1 优先：双人同时活跃归 P1，仅 P2 有输入才标 P2） */
function splitActivePlayer(input1: CarInput, input2: CarInput, current: 1 | 2): 1 | 2 {
  if (input1.throttle > 0 || input1.brake || input1.steer !== 0) {
    return 1
  }
  if (input2.throttle > 0 || input2.brake || input2.steer !== 0) {
    return 2
  }
  return current
}

/** 热座选赛道双人同步：P1 选赛道后同步 P2 世界（TrackContext 与预览起点） */
function hotseatSyncP2(args: SelectTrackArgs): void {
  args.trackManager.selectTrack(1, args.trackIndex)
  args.race.tracks[1] = args.trackManager.getContext(1)
  args.previewCameraZ[1] = initialPreviewCameraZ(args.trackIndex, args.race.tracks[1].lapLength)
}

/** 单屏模式（默认）：合并双键盘输入、P1/P2 各自更新、P2 不参与完赛判定 */
const SINGLE: ModeStrategy = {
  splitMode: false,
  hotseatMode: false,
  challengeMode: false,
  routeMode: false,
  menuHint: '空格键开始 · 1-9 / 方向键 切换赛道',
  getInputs(ctx) {
    return routeInputs(ctx, true)
  },
  updateActivePlayer(_input1, _input2, current) {
    return current
  },
  shouldUpdateP2Traffic() {
    return false
  },
  collisionIncludesP2() {
    return false
  },
  updatePlayers(args) {
    updateBothPlayers(args)
  },
  shouldFinish(race, trackManager) {
    return finishByLaps(race, trackManager, false)
  },
  afterSelectP1Track() {
    // 单屏无双人同步
  },
}

/** 分屏模式（?split=1）：P1/P2 独立输入与更新、P2 世界恒推进、双完赛参与判定 */
const SPLIT: ModeStrategy = {
  splitMode: true,
  hotseatMode: false,
  challengeMode: false,
  routeMode: false,
  menuHint: 'P1: 1-9 选赛道 · P2: Shift+1-9 选赛道 · 空格键开始',
  getInputs(ctx) {
    return routeInputs(ctx, false)
  },
  updateActivePlayer(input1, input2, current) {
    return splitActivePlayer(input1, input2, current)
  },
  shouldUpdateP2Traffic() {
    return true
  },
  collisionIncludesP2() {
    return true
  },
  updatePlayers(args) {
    updateBothPlayers(args)
  },
  shouldFinish(race, trackManager) {
    return finishByLaps(race, trackManager, true)
  },
  afterSelectP1Track() {
    // 分屏双人各自选赛道，无需同步
  },
}

/** 热座模式（?hotseat=1）：合并输入路由到当前回合玩家、车流/碰撞按回合、选赛道双人同步 */
const HOTSEAT: ModeStrategy = {
  splitMode: false,
  hotseatMode: true,
  challengeMode: false,
  routeMode: false,
  menuHint: 'P1 先跑 · 完成按回车交棒 P2 · 双人同赛道 · 1-9 选赛道 · 空格键开始',
  getInputs(ctx) {
    return routeInputs(ctx, true)
  },
  updateActivePlayer(_input1, _input2, current) {
    return current
  },
  shouldUpdateP2Traffic(hotseatPlayer) {
    return hotseatPlayer === 2
  },
  collisionIncludesP2(hotseatPlayer) {
    return hotseatPlayer === 2
  },
  updatePlayers(args, hotseatPlayer) {
    updateCurrentHotseatPlayer(args, hotseatPlayer)
  },
  shouldFinish(race, trackManager) {
    return finishByLaps(race, trackManager, true)
  },
  afterSelectP1Track(args) {
    hotseatSyncP2(args)
  },
}

/** 挑战模式（?challenge=1）：单屏合并输入 + 限时收束（raceTime 达 CHALLENGE_SECONDS 即完赛，不看圈数） */
const CHALLENGE: ModeStrategy = {
  splitMode: false,
  hotseatMode: false,
  challengeMode: true,
  routeMode: false,
  menuHint: '60 秒限时刷分 · 目标 5000 · 空格键开始',
  getInputs(ctx) {
    return routeInputs(ctx, true)
  },
  updateActivePlayer(_input1, _input2, current) {
    return current
  },
  shouldUpdateP2Traffic() {
    return false
  },
  collisionIncludesP2() {
    return false
  },
  updatePlayers(args) {
    updateBothPlayers(args)
  },
  shouldFinish(race, trackManager) {
    // G1（G1）：挑战限时优先——raceTime 达限时即结束（不看圈数）；正常完赛（3 圈）先到时仍走完赛路径。
    // M23 方案 8：检查站时间奖励——限时 = CHALLENGE_SECONDS + 累计检查点奖励（通过检查点赚时间）
    return (
      race.player1.raceTime >= CHALLENGE_SECONDS + race.player1.challengeBonus ||
      finishByLaps(race, trackManager, false)
    )
  },
  afterSelectP1Track() {
    // 挑战为单屏模式，无双人同步
  },
}

/**
 * M28 方案 9：路线模式（?route=）——OutRun 式分段递进 + 岔路选择。
 * 单屏合并输入（与 SINGLE 相同的输入路由/玩家更新）；完赛判定不在此做（GameLoop 负责
 * 段末岔路切换与终点判定），故 shouldFinish 恒 false——由帧块之外 GameLoop 的
 * routeStageAdvance 检测 cameraZ 超当前段圈长触发段切换或完赛。
 * 此策略仅承载 routeMode 标志与菜单提示（避免改 write 既有策略的完赛语义）。
 */
const ROUTE: ModeStrategy = {
  splitMode: false,
  hotseatMode: false,
  challengeMode: false,
  routeMode: true,
  menuHint: '路线模式 · 每段岔路二选一 · 空格键开始',
  getInputs(ctx) {
    return routeInputs(ctx, true)
  },
  updateActivePlayer(_input1, _input2, current) {
    return current
  },
  shouldUpdateP2Traffic() {
    return false
  },
  collisionIncludesP2() {
    return false
  },
  updatePlayers(args) {
    updateBothPlayers(args)
  },
  shouldFinish() {
    // 路线模式完赛由 GameLoop 段切换逻辑驱动（routeStageAdvance 检测终点段圈满），
    // 不经过 mode.shouldFinish——避免与既有环形圈数语义冲突
    return false
  },
  afterSelectP1Track() {
    // 路线模式单屏，无双人同步
  },
}

/** 按已解析的模式标志创建策略实例（互斥且 split 优先的判定由 GameLoop 构造器完成） */
export function createModeStrategy(params: {
  splitMode: boolean
  hotseatMode: boolean
  challengeMode: boolean
  /** M28 方案 9：路线模式（?route=，与 split/hotseat/challenge 互斥） */
  routeMode?: boolean
}): ModeStrategy {
  if (params.splitMode) {
    return SPLIT
  }
  if (params.hotseatMode) {
    return HOTSEAT
  }
  if (params.challengeMode) {
    return CHALLENGE
  }
  if (params.routeMode) {
    return ROUTE
  }
  return SINGLE
}
