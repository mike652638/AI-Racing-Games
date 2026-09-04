import { TRAFFIC_RUBBER_SMOOTH, trafficRubberTarget, updateTraffic } from '../engine/traffic'
import { resolveWeatherPhase } from '../engine/lighting'
import type { BoostParticle } from '../engine/renderer'
import type { CarConfig, CarInput } from '../physics/car'
import type { RainSound, BoostSound, CollisionSound, DriftSound, TireSound, NearMissSound } from '../audio/engine'
import { updateCollisions } from './collision'
import { flashSeedFromSpeedRatio, updateCollisionFlash, type CollisionFlashState } from './collision-feedback'
import {
  BOOST_PARTICLE_LIFETIME,
  CHALLENGE_CHECKPOINT_BONUS,
  CHALLENGE_CHECKPOINTS_PER_LAP,
  CHALLENGE_SECONDS,
  CHALLENGE_TARGET_SCORE,
  COMBO_MULTIPLIER_STEP,
  DRIFT_SCORE_MAX,
  NEAR_MISS_CHARGE,
  NEAR_MISS_POPUP_SEC,
  NEAR_MISS_SCORE,
} from '../shared/constants'
import { updateBoostCharge } from './frame-pure'
import { updateNearMiss } from './near-miss'
import type { ModeStrategy, TouchQuadrantSource } from './mode-strategy'
import { PHASE_RACING, type Phase } from '../shared/phase'
import type { PlayerState, RaceState } from '../shared/types'
import type { TrackManager } from './track-manager'
import { DAILY_PROGRESS_PREFIX } from '../ui/copy'

/** M23 方案 12：漂移得分飘字生命周期（秒）与最大增量显示（飘字仅显示本段新增分，避免巨数溢出） */
const DRIFT_POPUP_LIFETIME = 0.7
const DRIFT_POPUP_MAX_AMOUNT = 999

/** 摇杆缺省零输入（M21：分屏模式 joystick 为 null 时兜底，与旧 routeInputs 的 input2 零输入同形） */
const ZERO_INPUT: CarInput = { throttle: 0, brake: false, steer: 0 }

/**
 * M23 方案 12：漂移得分浮动飘字推进与生成（纯函数，帧内调用）——
 * 1) 已有飘字推进 t，超期清除；
 * 2) 得分整数位较上次增长（≥1）时生成 "+增量" 飘字（覆盖旧飘字，显示最新增量）。
 * 帧间 diff 用整数位（lastDriftScoreInt），避免漂移得分高频小增量逐帧刷飘字。
 */
export function updateDriftPopup(player: PlayerState, dt: number): void {
  if (player.driftPopup) {
    player.driftPopup.t += dt
    if (player.driftPopup.t >= DRIFT_POPUP_LIFETIME) {
      player.driftPopup = null
    }
  }
  const scoreInt = Math.floor(player.driftState.score)
  const gained = scoreInt - player.lastDriftScoreInt
  if (gained >= 1) {
    // M29 方案 12 二次打磨：生成时带上当前连击档位（combo ≥5 时飘字更大 + 橙色高亮）
    player.driftPopup = { t: 0, amount: Math.min(gained, DRIFT_POPUP_MAX_AMOUNT), combo: player.driftState.combo }
    player.lastDriftScoreInt = scoreInt
  } else {
    // 分数回退（reset/减分）同步基准，避免下次增长误报大增量
    player.lastDriftScoreInt = Math.max(player.lastDriftScoreInt, scoreInt)
  }
}

/**
 * 每帧更新段纯函数（Task E 抽取自 game-loop.ts frame 方法「更新段」）：
 * 车流推进、输入采集与路由、BOOST 蓄力/消耗/粒子、挑战倒计时 HUD、玩家物理更新、
 * 碰撞检测、环境音效驱动与完赛判定等全部非渲染逻辑。
 * ctx 为聚合参数对象（race/trackManager/mode/音频与 DOM 副作用注入），不依赖 GameLoop 实例；
 * 需要写回的帧间状态（lastActivePlayer/boostActive/lastCollisionCount 与惰性 DOM 缓存）经返回值回传。
 */
export interface FrameUpdateContext {
  /** 当前阶段：仅 RACING 执行更新段（与旧 frame 的 if (phase === RACING) 分支一致） */
  phase: Phase
  race: RaceState
  trackManager: TrackManager
  carConfig: CarConfig
  /** BOOST 尾焰粒子数组（in-place push/splice，引用共享） */
  boostParticles: BoostParticle[]
  /** 游玩模式策略（输入路由/车流推进/碰撞范围/玩家更新路由/完赛判定） */
  mode: ModeStrategy
  /** 热座当前回合玩家（1 = P1 先跑，交棒后为 2） */
  hotseatPlayer: 1 | 2
  /** 分屏最近活跃玩家（仅分屏更新，P1 优先；非分屏原样透传） */
  lastActivePlayer: 1 | 2
  /** 上一帧 boost 是否激活（边沿检测：本帧激活且上帧未激活 → boostSound.play()） */
  boostActive: boolean
  /** 上次碰撞计数快照（对比增长即触发碰撞音） */
  lastCollisionCount: number
  /** 碰撞红闪强度（0-1，上一帧结束值；本帧命中重置/未命中衰减后写回） */
  collisionFlash: CollisionFlashState
  /** 挑战倒计时 HUD 元素缓存（惰性获取；元素缺失时为 null） */
  challengeTimer: HTMLDivElement | null
  /** 挑战实时得分 HUD 元素缓存（惰性获取；元素缺失时为 null） */
  challengeScore: HTMLDivElement | null
  /** 每日挑战赛中徽章元素缓存（#daily-badge，A2 惰性获取；元素缺失时为 null） */
  dailyBadge: HTMLDivElement | null
  /** A2：当前赛道是否为今日挑战道（GameLoop.startGame 计算；路线模式恒 false 保守隐藏） */
  isDailyTrack: boolean
  /** BOOST 条 HUD 元素缓存（惰性获取；元素缺失时为 null） */
  boostBar: HTMLDivElement | null
  /** 分屏 P2 BOOST 条 HUD 元素缓存（#boost-bar-2，2026-08-08 实测修复：分屏时按 P2 蓄能更新；缺失 null） */
  boostBar2?: HTMLDivElement | null
  /** 雨声环境音（雨段 start / 非雨段 stop，幂等） */
  rainSound: RainSound | null
  /** BOOST 氮气音效（boost 激活边沿触发 play） */
  boostSound: BoostSound | null
  /** 碰撞冲击音（collisionCount 增长时 play，强度 = 双玩家速度比取较快者） */
  collisionSound: CollisionSound | null
  /** near-miss 贴身超车音效（P0 可选注入：贴身超车触发时 play；音频未创建时 null no-op） */
  nearMissSound?: NearMissSound | null
  /** near-miss 弹出 HUD 元素（#near-miss，P0 惰性获取缓存；触发时短暂显示"NEAR MISS!"，缺失时 null no-op） */
  nearMissEl?: HTMLDivElement | null
  /**
   * near-miss 飘字剩余显示时间（秒）：> 0 表示元素应在画面上、逐帧按 dt 递减，归零时隐藏。
   * null / 0 = 当前不应显示。
   * 2026-09-04 P0-2 修复：此前仅在触发时置 hidden=false 而全仓库无复位点，
   * 飘字触发一次后会一直挂在画面上（直到暂停/结算/回菜单才由非 RACING 分支兜底隐藏）。
   */
  nearMissHideIn?: number | null
  /** 漂移摩擦胎声（M15 可选注入：漂移激活 start / 非激活 stop，setIntensity 随车速/转向/湿滑调制；音频未创建时 null no-op） */
  driftSound?: DriftSound | null
  /** 轻量胎噪（M15 可选注入：常驻极低音量，setLevel 随车速/转向/湿滑调制；音频未创建时 null no-op） */
  tireSound?: TireSound | null
  /** 键盘输入源（GameLoop 注入；getP1Input 为 WASD、getP2Input 为方向键） */
  input: { getP1Input(): CarInput; getP2Input(): CarInput }
  /** 触屏摇杆输入源（active 时优先于键盘；分屏模式为 null 走四分区触控） */
  joystick: { isActive(): boolean; getInput(): CarInput } | null
  /** 分屏四分区触控源（M21：分屏模式注入，P1 左半屏/P2 右半屏；非分屏 undefined） */
  touchQuadrant?: TouchQuadrantSource
  /** 完赛回调（GameLoop.applyPhase(PHASE_FINISHED) 包装；触发后本帧跳过渲染与 rAF 自续） */
  onFinish: () => void
  /**
   * M23 方案 13：车流橡皮筋动态难度开关（缺省 false 与旧行为一致，GameLoop 按 ?traffic= 注入）。
   * true 时车流 speedFactor 平滑收敛到玩家速度映射目标（快→提速保持挑战，慢→减速便于追赶）；
   * false 时 speedFactor 恒 1（车流固定速度，simulate/bot 确定性路径不受影响）。
   */
  trafficDynamic?: boolean
}

/** 每帧更新段的结果：写回 GameLoop 的帧间状态与是否继续渲染 */
export interface FrameUpdateResult {
  /** false = 完赛/挑战限时触发 finish（旧 frame 的 return：跳过渲染段与 requestAnimationFrame 自续） */
  shouldRender: boolean
  /** 本帧倒计时刚好归零（GO 瞬间，2026-08-05 审计 U-3：供触屏引导浮层推迟到 GO 后显示） */
  countdownJustFinished: boolean
  /** 分屏最近活跃玩家（帧循环按输入更新，P1 优先，默认 P1） */
  lastActivePlayer: 1 | 2
  /** 上一帧 boost 是否激活（边沿检测快照写回） */
  boostActive: boolean
  /** 碰撞计数快照（写回供下帧对比） */
  lastCollisionCount: number
  /** 碰撞红闪强度（写回供渲染段使用，下一帧继续衰减） */
  collisionFlash: CollisionFlashState
  /** 挑战倒计时 HUD 元素（可能惰性获取后非 null，写回缓存） */
  challengeTimer: HTMLDivElement | null
  /** 挑战实时得分 HUD 元素（可能惰性获取后非 null，写回缓存） */
  challengeScore: HTMLDivElement | null
  /** 每日挑战赛中徽章元素（可能惰性获取后非 null，写回缓存；A2） */
  dailyBadge: HTMLDivElement | null
  /** BOOST 条 HUD 元素（可能惰性获取后非 null，写回缓存） */
  boostBar: HTMLDivElement | null
  /** 分屏 P2 BOOST 条 HUD 元素缓存（#boost-bar-2，2026-08-08 实测修复；写回缓存，非分屏恒 null） */
  boostBar2?: HTMLDivElement | null
  /** near-miss 弹出 HUD 元素缓存（可能惰性获取后非 null，写回缓存；P0） */
  nearMissEl: HTMLDivElement | null
  /** near-miss 飘字剩余显示时间（秒；0/null = 不显示。与 FrameUpdateContext 同名字段闭环） */
  nearMissHideIn: number | null
  /**
   * 本帧已路由的 P1 转向输入（-1..1，S 修复 P4：渲染段直接复用更新段的输入路由结果，
   * 避免帧内二次 routeInputs——倒计时冻结窗口提前返回时不提供，调用方回退 collectSteerInputs）。
   */
  steer1?: number
  /** 本帧已路由的 P2 转向输入（-1..1；分屏取 P2 实际输入，非分屏恒 0） */
  steer2?: number
}

/**
 * 隐藏 near-miss 飘字（元素缺失或已隐藏时 no-op）。
 * 2026-09-04 P0-2：抽出来供非比赛阶段 / 倒计时冻结窗口 / 显示倒计时归零三处共用，
 * 与 dailyBadge 的兜底隐藏保持同一写法。
 */
function hideNearMiss(el: HTMLDivElement | null): void {
  if (el && !el.hidden) {
    el.hidden = true
  }
}

/**
 * near-miss 贴身超车整段处理（2026-09-04 从 updateFrame 抽出，拆分第一步）：
 * 1) 飘字（#near-miss）显示倒计时推进，归零即隐藏——修复前无复位点，飘字会常驻画面（P0-2）；
 * 2) 双世界检测擦身超车：P1 走 tracks[0]，P2 走 tracks[1] 且按 mode 判定是否参与
 *    （单屏/热座/挑战以 P1 世界为主，分屏双世界各自判定）；
 * 3) 命中反馈：得分（× 连击倍率，计入独立 nearMissScore，不污染漂移 TOP10 语义）、
 *    蓄能、次数统计、速度线脉冲、HUD 弹出、音效。
 *
 * 与碰撞互斥：near-miss 横向窗口（NEAR_MISS_X_TOL 0.9）在碰撞容差（0.55）之上，
 * 贴得更近会先判碰撞并横向弹开。倒计时推进置于检测之前，故本帧新触发会覆盖为完整时长。
 *
 * @returns 本帧结束后的飘字剩余显示时间（秒），由调用方写回帧间状态
 */
function advanceNearMiss(ctx: FrameUpdateContext, dt: number): number | null {
  const { race, mode } = ctx
  let hideIn = ctx.nearMissHideIn ?? null
  if (hideIn !== null && hideIn > 0) {
    hideIn = Math.max(0, hideIn - dt)
    if (hideIn === 0) {
      hideNearMiss(ctx.nearMissEl ?? null)
    }
  }

  const nearMiss1 = updateNearMiss(
    race.tracks[0].traffic,
    race.player1.cameraZ,
    race.player1.carState.position,
    race.player1.carState.speed,
    race.player1.nearMissCooldown,
    dt,
    race.tracks[0].lapLength,
  )
  race.player1.nearMissCooldown = nearMiss1.cooldown
  if (nearMiss1.hit) {
    const mult = 1 + race.player1.driftState.combo * COMBO_MULTIPLIER_STEP
    race.player1.nearMissScore = Math.min(DRIFT_SCORE_MAX, race.player1.nearMissScore + NEAR_MISS_SCORE * mult)
    race.player1.boostCharge = Math.min(1, race.player1.boostCharge + NEAR_MISS_CHARGE)
    // M23 方案 6：near-miss 累计次数（成就「贴地飞行」检测）
    race.player1.nearMissCount += 1
    // M23 方案 12：near-miss 屏幕边缘速度线脉冲（渲染段消费，逐帧指数衰减）
    race.player1.nearMissPulse = 1
    // HUD 弹出（惰性获取，与 boostBar 同模式；触发时短暂显示 NEAR MISS!）
    ctx.nearMissEl ??= document.getElementById('near-miss') as HTMLDivElement | null
    if (ctx.nearMissEl) {
      ctx.nearMissEl.hidden = false
      ctx.nearMissEl.classList.remove('near-miss-pop')
      void ctx.nearMissEl.offsetWidth // 重启动画
      ctx.nearMissEl.classList.add('near-miss-pop')
    }
    // P0-2：启动显示倒计时（与 CSS near-miss-pop 0.8s 同源），归零由上方递减逻辑隐藏
    hideIn = NEAR_MISS_POPUP_SEC
    ctx.nearMissSound?.play()
  }

  if (mode.collisionIncludesP2(ctx.hotseatPlayer)) {
    const nearMiss2 = updateNearMiss(
      race.tracks[1].traffic,
      race.player2.cameraZ,
      race.player2.carState.position,
      race.player2.carState.speed,
      race.player2.nearMissCooldown,
      dt,
      race.tracks[1].lapLength,
    )
    race.player2.nearMissCooldown = nearMiss2.cooldown
    if (nearMiss2.hit) {
      const mult = 1 + race.player2.driftState.combo * COMBO_MULTIPLIER_STEP
      race.player2.nearMissScore = Math.min(DRIFT_SCORE_MAX, race.player2.nearMissScore + NEAR_MISS_SCORE * mult)
      race.player2.boostCharge = Math.min(1, race.player2.boostCharge + NEAR_MISS_CHARGE)
      race.player2.nearMissCount += 1
      race.player2.nearMissPulse = 1
      // P0-2：P2 触发同样启动飘字显示倒计时（双玩家共用同一 #near-miss 元素）
      hideIn = NEAR_MISS_POPUP_SEC
      ctx.nearMissSound?.play()
    }
  }
  return hideIn
}

/**
 * 每帧更新段（纯函数）：语义与旧 GameLoop.frame 的 RACING 更新块逐行一致——
 * 雨声/雨天 wet/挑战加成 → 挑战倒计时 HUD → 双世界车流推进 → 输入采集 → 分屏活跃玩家 →
 * BOOST 蓄力/消耗 → BOOST 条/音效/尾焰粒子 → 玩家物理更新（mode 路由）→ 碰撞 → 完赛判定。
 * 完赛（含挑战限时）时调用 ctx.onFinish 并返回 shouldRender=false（等价旧 return）。
 */
/**
 * 步骤 1｜环境（F4 雨声 / G3 雨天物理 / H1 挑战加成）：
 * 按 P1 raceTime 与对局天气变体判定本帧是否下雨，驱动雨声环境音，
 * 并导出雨天物理系数 wet 与挑战计分加成（非挑战模式为 undefined，updatePlayerFrame 默认 1）。
 * 天气三态判定走 `lighting.resolveWeatherPhase` 单一真源。
 */
function stepEnvironment(ctx: FrameUpdateContext): { wet: boolean; challengeMult: number | undefined } {
  const { race } = ctx
  const raining = resolveWeatherPhase(race.weatherOverride, race.player1.raceTime) === 2
  if (raining) ctx.rainSound?.start()
  else ctx.rainSound?.stop()
  // G3：雨天物理与雨声同公式同源；热座/分屏 P2 世界统一同一 wet 值
  const wet = raining
  // H1：雨天 +50%、难度加成（2★ +25%、3★ +50%）
  const challengeMult = ctx.mode.challengeMode
    ? 1 + (raining ? 0.5 : 0) + (race.tracks[0].def.difficulty - 1) * 0.25
    : undefined
  return { wet, challengeMult }
}

/**
 * 步骤 2｜挑战模式 HUD（G1 / M23 方案 8）：
 * 检查站时间奖励推进（cameraZ 每越过一个等分检查点补发 CHALLENGE_CHECKPOINT_BONUS 秒），
 * 倒计时与实时得分文本刷新（含 CHALLENGE_TARGET_SCORE 目标参照），并负责非 RACING 阶段的兜底隐藏。
 */
function stepChallengeHud(ctx: FrameUpdateContext): void {
  const { race } = ctx
  if (!ctx.mode.challengeMode) return

  if (ctx.phase !== PHASE_RACING) {
    // M27：菜单/暂停/完赛阶段隐藏挑战 HUD 元素，防止回菜单时右上角残留
    ctx.challengeTimer ??= document.getElementById('challenge-timer') as HTMLDivElement | null
    ctx.challengeScore ??= document.getElementById('challenge-score') as HTMLDivElement | null
    if (ctx.challengeTimer && !ctx.challengeTimer.hidden) ctx.challengeTimer.hidden = true
    if (ctx.challengeScore && !ctx.challengeScore.hidden) ctx.challengeScore.hidden = true
    return
  }

  // 检查点推进：当前应通过的检查点数 = floor(cameraZ / 间距)；大于已记录数时补发奖励
  const checkpointSpacing = race.tracks[0].lapLength / CHALLENGE_CHECKPOINTS_PER_LAP
  const expectedCheckpoints = Math.floor(race.player1.cameraZ / checkpointSpacing)
  if (expectedCheckpoints > race.player1.challengeCheckpoints) {
    race.player1.challengeBonus +=
      (expectedCheckpoints - race.player1.challengeCheckpoints) * CHALLENGE_CHECKPOINT_BONUS
    race.player1.challengeCheckpoints = expectedCheckpoints
  }
  ctx.challengeTimer ??= document.getElementById('challenge-timer') as HTMLDivElement | null
  if (ctx.challengeTimer) {
    ctx.challengeTimer.hidden = false
    const left = Math.max(0, CHALLENGE_SECONDS + race.player1.challengeBonus - race.player1.raceTime)
    // R9：脏值比对——剩余秒数文本只在小数变化时写 DOM
    const leftText = `剩余 ${left.toFixed(1)}s`
    if (ctx.challengeTimer.textContent !== leftText) {
      ctx.challengeTimer.textContent = leftText
    }
    // m17：剩余 10 秒内触发紧急闪烁动画
    ctx.challengeTimer.classList.toggle('urgent', left <= 10)
  }
  // 实时得分 = 漂移得分 + near-miss 得分，与目标分同源参照
  ctx.challengeScore ??= document.getElementById('challenge-score') as HTMLDivElement | null
  if (ctx.challengeScore) {
    ctx.challengeScore.hidden = false
    const totalScore = race.player1.driftState.score + race.player1.nearMissScore
    const scoreText = `得分 ${Math.round(totalScore)} / 目标 ${CHALLENGE_TARGET_SCORE}`
    if (ctx.challengeScore.textContent !== scoreText) {
      ctx.challengeScore.textContent = scoreText
    }
  }
}

/** 步骤 3｜每日挑战徽章（A2）：当前赛道为今日挑战道时显示，文案与菜单 #daily-progress 同源 */
function stepDailyBadge(ctx: FrameUpdateContext): void {
  ctx.dailyBadge ??= document.getElementById('daily-badge') as HTMLDivElement | null
  if (ctx.dailyBadge) {
    ctx.dailyBadge.hidden = !ctx.isDailyTrack
    if (ctx.isDailyTrack && ctx.dailyBadge.textContent !== DAILY_PROGRESS_PREFIX) {
      ctx.dailyBadge.textContent = DAILY_PROGRESS_PREFIX
    }
  }
}

/**
 * 步骤 4｜双世界车流推进（P0-1 环形语义 / P4 避让 AI / M23 方案 13 橡皮筋）：
 * P1 用 tracks[0] 恒推进；分屏或热座 P2 回合时 P2 用 tracks[1]
 * （热座 P1 回合 tracks[1] 静止，交棒后车流随当前玩家世界前进）。
 * 橡皮筋开启时 speedFactor 平滑收敛到按玩家速度映射的目标系数，关闭（static）时恒为 1
 * ——保证 simulate/bot 确定性路径不受影响。
 */
function stepTraffic(ctx: FrameUpdateContext, dt: number): void {
  const { race, mode } = ctx
  const dynamic = ctx.trafficDynamic === true
  if (dynamic) {
    race.player1.trafficRubber +=
      (trafficRubberTarget(race.player1.carState.speed, ctx.carConfig.maxSpeed) - race.player1.trafficRubber) *
      Math.min(1, TRAFFIC_RUBBER_SMOOTH * dt)
  }
  updateTraffic(
    race.tracks[0].traffic,
    dt,
    race.tracks[0].lapLength,
    {
      z: race.player1.cameraZ,
      x: race.player1.carState.position,
    },
    dynamic ? race.player1.trafficRubber : 1,
  )
  if (mode.shouldUpdateP2Traffic(ctx.hotseatPlayer)) {
    if (dynamic) {
      race.player2.trafficRubber +=
        (trafficRubberTarget(race.player2.carState.speed, ctx.carConfig.maxSpeed) - race.player2.trafficRubber) *
        Math.min(1, TRAFFIC_RUBBER_SMOOTH * dt)
    }
    updateTraffic(
      race.tracks[1].traffic,
      dt,
      race.tracks[1].lapLength,
      {
        z: race.player2.cameraZ,
        x: race.player2.carState.position,
      },
      dynamic ? race.player2.trafficRubber : 1,
    )
  }
}

/**
 * 步骤 5｜输入路由（S 修复 P4 / P9 / M21）：
 * 单屏与热座合并 P1(WASD) + P2(方向键)；分屏 P1 仅 WASD、P2 仅方向键保持独立；
 * 摇杆激活时优先，分屏另有四分区触控源（P1 左半屏 / P2 右半屏，有触点即优先于键盘）。
 * 同时产出最近活跃玩家（分屏暂停标题标注用）与本帧已路由的转向输入（渲染段复用，避免二次路由）。
 */
function stepInputs(ctx: FrameUpdateContext): {
  input1: CarInput
  input2: CarInput
  lastActivePlayer: 1 | 2
  steer1: number
  steer2: number
} {
  const { input1, input2 } = ctx.mode.getInputs({
    touchQuadrant: ctx.touchQuadrant,
    joystickActive: ctx.joystick?.isActive() ?? false,
    joystickInput: ctx.joystick?.getInput() ?? ZERO_INPUT,
    p1Input: ctx.input.getP1Input(),
    p2Input: ctx.input.getP2Input(),
  })
  // P9：最近活跃玩家（P1 优先：双人同时活跃归 P1，仅 P2 有输入才标 P2）
  const lastActivePlayer = ctx.mode.updateActivePlayer(input1, input2, ctx.lastActivePlayer)
  // 非分屏 input2 恒为零输入，steer2 即 0，与 collectSteerInputs 语义一致
  return { input1, input2, lastActivePlayer, steer1: input1.steer, steer2: input2.steer }
}

/**
 * 步骤 6｜BOOST 全链路（G4 蓄力/消耗、H2 音效与尾焰、P0 完美氮气、M23 方案 6 成就统计）：
 * 漂移激活蓄力，按键且 charge > 0 时消耗并激活；完美判定在激活边沿锁定到本次激活段。
 * HUD 条按 charge 映射 200px 填充宽度（勿用百分比——相对视口会被 max-width 截断），
 * 分屏 P2 另有独立 #boost-bar-2。返回注入 boost/perfectBoost 后的有效输入供物理步消费。
 */
function stepBoost(
  ctx: FrameUpdateContext,
  dt: number,
  input1: CarInput,
  input2: CarInput,
): { effInput1: CarInput; effInput2: CarInput; boostActive: boolean } {
  const { race } = ctx

  const boost1 = updateBoostCharge(
    race.player1.boostCharge,
    dt,
    input1.boost === true,
    race.player1.driftState.active,
    race.player1.boostActive,
  )
  race.player1.boostCharge = boost1.charge
  race.player1.boostPerfect = boost1.boost ? boost1.perfect || race.player1.boostPerfect : false
  race.player1.boostActive = boost1.boost
  const effInput1: CarInput = { ...input1, boost: boost1.boost, perfectBoost: race.player1.boostPerfect }

  const boost2 = updateBoostCharge(
    race.player2.boostCharge,
    dt,
    input2.boost === true,
    race.player2.driftState.active,
    race.player2.boostActive,
  )
  race.player2.boostCharge = boost2.charge
  race.player2.boostPerfect = boost2.boost ? boost2.perfect || race.player2.boostPerfect : false
  race.player2.boostActive = boost2.boost
  const effInput2: CarInput = { ...input2, boost: boost2.boost, perfectBoost: race.player2.boostPerfect }

  // BOOST 条：轨道常驻 200px，仅填充层宽度随 charge 增长（未蓄能也可看到暗色空槽）
  ctx.boostBar ??= document.getElementById('boost-bar') as HTMLDivElement | null
  if (ctx.boostBar) {
    ctx.boostBar.hidden = false
    const fill = ctx.boostBar.querySelector<HTMLDivElement>('.boost-fill')
    if (fill) {
      // R9：脏值比对——宽度只在数值变化时写 style
      const widthPx = `${Math.round(race.player1.boostCharge * 200)}px`
      if (fill.style.width !== widthPx) {
        fill.style.width = widthPx
      }
    }
    ctx.boostBar.classList.toggle('perfect', race.player1.boostPerfect)
  }
  // 分屏 P2 独立 BOOST 条（2026-08-08 实测修复：此前 P2 蓄能无显示）
  if (ctx.mode.splitMode) {
    ctx.boostBar2 ??= document.getElementById('boost-bar-2') as HTMLDivElement | null
    if (ctx.boostBar2) {
      ctx.boostBar2.hidden = false
      const fill2 = ctx.boostBar2.querySelector<HTMLDivElement>('.boost-fill')
      if (fill2) {
        const widthPx2 = `${Math.round(race.player2.boostCharge * 200)}px`
        if (fill2.style.width !== widthPx2) {
          fill2.style.width = widthPx2
        }
      }
      ctx.boostBar2.classList.toggle('perfect', race.player2.boostPerfect)
    }
  }

  // 音效边沿检测 + P1 尾焰粒子（z 取相机前方 +2 保证投影非 null）
  const boostOn = effInput1.boost === true || effInput2.boost === true
  if (boostOn && !ctx.boostActive) {
    ctx.boostSound?.play()
  }
  if (effInput1.boost === true) {
    ctx.boostParticles.push({
      x: race.player1.carState.position,
      z: race.player1.cameraZ + 2,
      t: 0,
    })
  }
  // M23 方案 6：对局成就统计（BOOST 使用 / 完美氮气 / 漂移连击峰值）
  if (effInput1.boost === true) race.player1.boostUsedEver = true
  if (effInput2.boost === true) race.player2.boostUsedEver = true
  if (race.player1.boostPerfect) race.player1.perfectBoostUsed = true
  if (race.player2.boostPerfect) race.player2.perfectBoostUsed = true
  // driftState.combo 会因断连归零，maxCombo 保留本局最高档
  race.player1.maxCombo = Math.max(race.player1.maxCombo, race.player1.driftState.combo)
  race.player2.maxCombo = Math.max(race.player2.maxCombo, race.player2.driftState.combo)

  return { effInput1, effInput2, boostActive: boostOn }
}

/**
 * 步骤 7｜碰撞检测与反馈（M16 红闪分级 / F4 碰撞音 / H6 强度）：
 * 分屏双人全检；热座仅当前回合玩家参与——P2 回合检 player2 与 P2 世界车流，
 * P1 回合 player2 静止不参与（保持 M8 热座语义，避免起点车流误撞静止 P2）。
 * 命中时以速度比 seed 重置红闪（低速轻微、高速满格），未命中按 dt 指数衰减；
 * 碰撞计数增长才触发冲击音（CollisionSound 内部 80ms 防刷屏）。
 */
function stepCollision(ctx: FrameUpdateContext, dt: number): { collisionFlash: number; lastCollisionCount: number } {
  const { race, mode, carConfig } = ctx
  const { hit, impact } = updateCollisions(race, dt, mode.collisionIncludesP2(ctx.hotseatPlayer), carConfig.maxSpeed)
  const collisionFlash = updateCollisionFlash(ctx.collisionFlash, hit ? flashSeedFromSpeedRatio(impact) : null, dt)
  let lastCollisionCount = ctx.lastCollisionCount
  if (race.collisionCount > lastCollisionCount) {
    ctx.collisionSound?.play(impact)
    lastCollisionCount = race.collisionCount
  }
  return { collisionFlash, lastCollisionCount }
}

/**
 * 步骤 8｜尾焰粒子与 Game Feel 特效推进（P0 小喷 / M23 方案 12）：
 * 漂移小喷与 BOOST 共用粒子通道（小喷时长短、粒子少，不额外新增通道）；
 * 完美氮气金闪 / 小喷蓝闪 / near-miss 速度线脉冲逐帧指数衰减（约 0.3s 归零）；
 * 漂移得分浮动飘字同步推进生命周期。置于物理更新之后以读取本帧最新 turbo 与 driftState。
 */
function stepGameFeel(ctx: FrameUpdateContext, dt: number): void {
  const { race } = ctx
  if (race.player1.driftState.turbo > 0) {
    ctx.boostParticles.push({
      x: race.player1.carState.position,
      z: race.player1.cameraZ + 2,
      t: 0,
    })
  }
  if (race.player2.driftState.turbo > 0) {
    ctx.boostParticles.push({
      x: race.player2.carState.position,
      z: race.player2.cameraZ + 2,
      t: 0,
    })
  }
  // 粒子推进/老化：BOOST 尾焰与小喷尾焰统一推进（t 递增、超期移除）
  for (let i = ctx.boostParticles.length - 1; i >= 0; i--) {
    ctx.boostParticles[i].t += dt
    if (ctx.boostParticles[i].t > BOOST_PARTICLE_LIFETIME) {
      ctx.boostParticles.splice(i, 1)
    }
  }

  const flashDecay = Math.max(0, 1 - dt * 5) // 约 0.3s 衰减到 0
  race.player1.nearMissPulse *= flashDecay
  race.player2.nearMissPulse *= flashDecay
  race.player1.perfectBoostFlash *= flashDecay
  race.player2.perfectBoostFlash *= flashDecay
  race.player1.miniTurboFlash *= flashDecay
  race.player2.miniTurboFlash *= flashDecay
  if (race.player1.boostPerfect) race.player1.perfectBoostFlash = 1
  if (race.player2.boostPerfect) race.player2.perfectBoostFlash = 1
  if (race.player1.driftState.turbo > 0) race.player1.miniTurboFlash = 1
  if (race.player2.driftState.turbo > 0) race.player2.miniTurboFlash = 1
  // 漂移得分飘字：P1 先推进再判定（P2 同步处理）
  updateDriftPopup(race.player1, dt)
  updateDriftPopup(race.player2, dt)
}

/**
 * 步骤 9｜行驶期音频（M15）：漂移摩擦胎声（激活时播放，强度取双玩家中较剧烈一方）
 * 与常驻轻量胎噪（以 P1 车速/转向驱动，音量极小不喧宾夺主）。
 * 置于物理更新之后以读取本帧最新 driftState；音频未创建（null/undefined）时安全 no-op。
 */
function stepDriveAudio(ctx: FrameUpdateContext, wet: boolean, effInput1: CarInput, effInput2: CarInput): void {
  const { race, carConfig } = ctx
  const driftActive = race.player1.driftState.active || race.player2.driftState.active
  if (driftActive) {
    ctx.driftSound?.start()
    const speedRatio = Math.max(race.player1.carState.speed, race.player2.carState.speed) / carConfig.maxSpeed
    const steerAbs = Math.max(Math.abs(effInput1.steer), Math.abs(effInput2.steer))
    ctx.driftSound?.setIntensity(speedRatio, steerAbs, wet)
  } else {
    ctx.driftSound?.stop()
  }
  // 胎噪以 P1 车速/转向驱动（单屏语义即 P1）
  ctx.tireSound?.setLevel(race.player1.carState.speed / carConfig.maxSpeed, Math.abs(effInput1.steer), wet)
}

export function updateFrame(dt: number, ctx: FrameUpdateContext): FrameUpdateResult {
  const { race, trackManager, carConfig, mode } = ctx

  if (ctx.phase !== PHASE_RACING) {
    // 非比赛阶段不执行更新段（与旧 frame 的 if (this.phase === PHASE_RACING) 一致）
    // M15（M15）：暂停/结算/菜单时静音漂移胎声与胎噪（音频未创建为 null/undefined 时安全 no-op）
    ctx.driftSound?.stop()
    ctx.tireSound?.setLevel(0, 0, false)
    // A2：非比赛阶段隐藏每日挑战徽章（防回菜单/暂停/结算时残留）
    ctx.dailyBadge ??= document.getElementById('daily-badge') as HTMLDivElement | null
    if (ctx.dailyBadge && !ctx.dailyBadge.hidden) ctx.dailyBadge.hidden = true
    // P0-2（2026-09-04）：非比赛阶段同样复位 near-miss 飘字（暂停/结算/回菜单时不残留）
    ctx.nearMissEl ??= document.getElementById('near-miss') as HTMLDivElement | null
    hideNearMiss(ctx.nearMissEl ?? null)
    return {
      shouldRender: true,
      countdownJustFinished: false,
      lastActivePlayer: ctx.lastActivePlayer,
      boostActive: ctx.boostActive,
      lastCollisionCount: ctx.lastCollisionCount,
      collisionFlash: updateCollisionFlash(ctx.collisionFlash, null, dt),
      challengeTimer: ctx.challengeTimer,
      challengeScore: ctx.challengeScore,
      dailyBadge: ctx.dailyBadge,
      boostBar: ctx.boostBar,
      // 2026-09-04：补齐与正常分支一致的字段集合（此前漏 boostBar2，靠 GameLoop 下帧
      // 惰性重取兜底；显式补齐可避免未来新增字段时再次漏掉某个提前返回分支）。
      // steer1/steer2 不返回——本分支未做输入路由，由 GameLoop 回退 collectSteerInputs。
      boostBar2: ctx.boostBar2 ?? null,
      nearMissEl: ctx.nearMissEl ?? null,
      nearMissHideIn: null,
    }
  }

  // F-1（2026-08-05 审计修复）：起步倒计时冻结窗口——countdownRemaining > 0 时比赛未正式开始，
  // raceTime/车流/玩家物理/碰撞/环境音全部冻结（与 runCountdown 视觉同步，GO 时刻归零），
  // 消除圈速记录中的倒计时水分；归零瞬间返回 countdownJustFinished=true（U-3 引导浮层触发点）。
  // 模拟时钟按帧 dt 递减而非墙钟 setTimeout：与 rAF 驱动同源，暂停不消耗、单测可确定性驱动。
  if (race.countdownRemaining > 0) {
    race.countdownRemaining = Math.max(0, race.countdownRemaining - dt)
    // A2：倒计时期间隐藏每日挑战徽章（GO 后由主 RACING 块按 isDailyTrack 显示）
    ctx.dailyBadge ??= document.getElementById('daily-badge') as HTMLDivElement | null
    if (ctx.dailyBadge && !ctx.dailyBadge.hidden) ctx.dailyBadge.hidden = true
    // P0-2（2026-09-04）：起步倒计时窗口同样复位 near-miss 飘字
    ctx.nearMissEl ??= document.getElementById('near-miss') as HTMLDivElement | null
    hideNearMiss(ctx.nearMissEl ?? null)
    return {
      shouldRender: true,
      countdownJustFinished: race.countdownRemaining === 0,
      lastActivePlayer: ctx.lastActivePlayer,
      boostActive: ctx.boostActive,
      lastCollisionCount: ctx.lastCollisionCount,
      collisionFlash: updateCollisionFlash(ctx.collisionFlash, null, dt),
      challengeTimer: ctx.challengeTimer,
      challengeScore: ctx.challengeScore,
      dailyBadge: ctx.dailyBadge,
      boostBar: ctx.boostBar,
      // 2026-09-04：同非比赛分支，补齐 boostBar2（此前漏字段）
      boostBar2: ctx.boostBar2 ?? null,
      nearMissEl: ctx.nearMissEl ?? null,
      nearMissHideIn: null,
    }
  }

  // —— 编排：环境（天气/雨声/雨天物理/挑战加成）——
  const { wet, challengeMult } = stepEnvironment(ctx)
  // —— 编排：挑战模式 HUD（检查站奖励 + 倒计时 + 实时得分）——
  stepChallengeHud(ctx)
  // —— 编排：每日挑战徽章 ——
  stepDailyBadge(ctx)
  // —— 编排：双世界车流推进（含橡皮筋难度与避让 AI）——
  stepTraffic(ctx, dt)

  // —— 编排：输入路由（含最近活跃玩家与渲染复用转向）——
  const { input1, input2, lastActivePlayer, steer1, steer2 } = stepInputs(ctx)
  // —— 编排：BOOST 蓄力/消耗、HUD 条、音效与尾焰粒子、对局成就统计 ——
  const { effInput1, effInput2, boostActive } = stepBoost(ctx, dt, input1, input2)

  // 玩家物理更新路由：热座仅当前回合玩家（P1 回合记录 lapTimes、P2 回合记录 lapTimes2），
  // 其余模式 P1/P2 各自独立更新（分屏时 input2 有效，否则零输入）
  mode.updatePlayers(
    {
      dt,
      effInput1,
      effInput2,
      race,
      carConfig,
      trackManager,
      wet,
      challengeMult,
    },
    ctx.hotseatPlayer,
  )

  // —— 编排：碰撞检测与反馈（红闪分级 + 碰撞冲击音）——
  const { collisionFlash, lastCollisionCount } = stepCollision(ctx, dt)

  // —— 编排：尾焰粒子与 Game Feel 特效推进（含漂移得分飘字生命周期）——
  stepGameFeel(ctx, dt)

  // P0 / P0-2：near-miss 贴身超车——飘字显示倒计时推进 + 双世界检测与反馈
  // （得分/蓄能/计数/速度线脉冲/HUD 弹出/音效），逻辑见 advanceNearMiss。
  const nearMissHideIn = advanceNearMiss(ctx, dt)

  // —— 编排：行驶期音频（漂移摩擦胎声 + 常驻胎噪）——
  stepDriveAudio(ctx, wet, effInput1, effInput2)

  // 完赛判定（mode 统一：挑战限时优先 + 正常圈数判定；语义与旧两个 if 完全一致——
  // 任一命中即触发 finish 并跳过本帧后续渲染）
  if (mode.shouldFinish(race, trackManager, ctx.hotseatPlayer)) {
    ctx.onFinish()
    return {
      shouldRender: false,
      countdownJustFinished: false,
      lastActivePlayer,
      boostActive,
      lastCollisionCount,
      collisionFlash,
      challengeTimer: ctx.challengeTimer,
      challengeScore: ctx.challengeScore,
      dailyBadge: ctx.dailyBadge,
      boostBar: ctx.boostBar,
      boostBar2: ctx.boostBar2 ?? null,
      nearMissEl: ctx.nearMissEl ?? null,
      nearMissHideIn,
      steer1,
      steer2,
    }
  }

  return {
    shouldRender: true,
    countdownJustFinished: false,
    lastActivePlayer,
    boostActive,
    lastCollisionCount,
    collisionFlash,
    challengeTimer: ctx.challengeTimer,
    challengeScore: ctx.challengeScore,
    dailyBadge: ctx.dailyBadge,
    boostBar: ctx.boostBar,
    boostBar2: ctx.boostBar2 ?? null,
    nearMissEl: ctx.nearMissEl ?? null,
    nearMissHideIn,
    steer1,
    steer2,
  }
}
