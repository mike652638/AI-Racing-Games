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
  COMBO_MULTIPLIER_STEP,
  DRIFT_SCORE_MAX,
  NEAR_MISS_CHARGE,
  NEAR_MISS_SCORE,
} from './constants'
import { updateBoostCharge } from './frame-pure'
import { updateNearMiss } from './near-miss'
import type { ModeStrategy, TouchQuadrantSource } from './mode-strategy'
import { PHASE_RACING, type Phase } from './phase'
import type { RaceState } from './state'
import type { PlayerState } from './player-state'
import type { TrackManager } from './track-manager'

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
  /** BOOST 条 HUD 元素（可能惰性获取后非 null，写回缓存） */
  boostBar: HTMLDivElement | null
  /** 分屏 P2 BOOST 条 HUD 元素缓存（#boost-bar-2，2026-08-08 实测修复；写回缓存，非分屏恒 null） */
  boostBar2?: HTMLDivElement | null
  /** near-miss 弹出 HUD 元素缓存（可能惰性获取后非 null，写回缓存；P0） */
  nearMissEl: HTMLDivElement | null
  /**
   * 本帧已路由的 P1 转向输入（-1..1，S 修复 P4：渲染段直接复用更新段的输入路由结果，
   * 避免帧内二次 routeInputs——倒计时冻结窗口提前返回时不提供，调用方回退 collectSteerInputs）。
   */
  steer1?: number
  /** 本帧已路由的 P2 转向输入（-1..1；分屏取 P2 实际输入，非分屏恒 0） */
  steer2?: number
}

/**
 * 每帧更新段（纯函数）：语义与旧 GameLoop.frame 的 RACING 更新块逐行一致——
 * 雨声/雨天 wet/挑战加成 → 挑战倒计时 HUD → 双世界车流推进 → 输入采集 → 分屏活跃玩家 →
 * BOOST 蓄力/消耗 → BOOST 条/音效/尾焰粒子 → 玩家物理更新（mode 路由）→ 碰撞 → 完赛判定。
 * 完赛（含挑战限时）时调用 ctx.onFinish 并返回 shouldRender=false（等价旧 return）。
 */
export function updateFrame(dt: number, ctx: FrameUpdateContext): FrameUpdateResult {
  const { race, trackManager, carConfig, mode } = ctx

  if (ctx.phase !== PHASE_RACING) {
    // 非比赛阶段不执行更新段（与旧 frame 的 if (this.phase === PHASE_RACING) 一致）
    // M15（M15）：暂停/结算/菜单时静音漂移胎声与胎噪（音频未创建为 null/undefined 时安全 no-op）
    ctx.driftSound?.stop()
    ctx.tireSound?.setLevel(0, 0, false)
    return {
      shouldRender: true,
      countdownJustFinished: false,
      lastActivePlayer: ctx.lastActivePlayer,
      boostActive: ctx.boostActive,
      lastCollisionCount: ctx.lastCollisionCount,
      collisionFlash: updateCollisionFlash(ctx.collisionFlash, null, dt),
      challengeTimer: ctx.challengeTimer,
      challengeScore: ctx.challengeScore,
      boostBar: ctx.boostBar,
      nearMissEl: ctx.nearMissEl ?? null,
    }
  }

  // F-1（2026-08-05 审计修复）：起步倒计时冻结窗口——countdownRemaining > 0 时比赛未正式开始，
  // raceTime/车流/玩家物理/碰撞/环境音全部冻结（与 runCountdown 视觉同步，GO 时刻归零），
  // 消除圈速记录中的倒计时水分；归零瞬间返回 countdownJustFinished=true（U-3 引导浮层触发点）。
  // 模拟时钟按帧 dt 递减而非墙钟 setTimeout：与 rAF 驱动同源，暂停不消耗、单测可确定性驱动。
  if (race.countdownRemaining > 0) {
    race.countdownRemaining = Math.max(0, race.countdownRemaining - dt)
    return {
      shouldRender: true,
      countdownJustFinished: race.countdownRemaining === 0,
      lastActivePlayer: ctx.lastActivePlayer,
      boostActive: ctx.boostActive,
      lastCollisionCount: ctx.lastCollisionCount,
      collisionFlash: updateCollisionFlash(ctx.collisionFlash, null, dt),
      challengeTimer: ctx.challengeTimer,
      challengeScore: ctx.challengeScore,
      boostBar: ctx.boostBar,
      nearMissEl: ctx.nearMissEl ?? null,
    }
  }

  // F4（F4）：雨段环境音——按 P1 raceTime 判定三态（0 晴 / 1 阴 / 2 雨，各 45s 循环）
  // R6 收敛：phase 判定走 lighting.resolveWeatherPhase 单一真源——M23 方案 11 支持对局天气变体
  // 覆盖（race.weatherOverride 'rain' 强制雨天 / 'sunny'/'night' 强制无雨；'auto' 回退三态循环）
  const raining = resolveWeatherPhase(race.weatherOverride, race.player1.raceTime) === 2
  if (raining) ctx.rainSound?.start()
  else ctx.rainSound?.stop()
  // G3（G3）：雨天物理——与雨声同公式同源（raceTime 三态 phase 2）；热座/分屏 P2 世界统一同一 wet 值
  const wet = raining
  // H1（H1）：挑战计分加成——雨天 +50%、难度加成（2★ +25%、3★ +50%）；仅 challengeMode 生效
  // （非挑战传 undefined → updatePlayerFrame 默认 1，行为不变）
  const challengeMult = ctx.mode.challengeMode
    ? 1 + (raining ? 0.5 : 0) + (race.tracks[0].def.difficulty - 1) * 0.25
    : undefined

  // G1（G1）：挑战倒计时 HUD——仅挑战模式且比赛阶段可见，文本显示剩余秒数（更新段恒处于 RACING）。
  // M23 方案 8：检查站时间奖励——每圈按 CHALLENGE_CHECKPOINTS_PER_LAP 等分检查点，
  // 玩家 cameraZ 每越过一个检查点（按圈长等分间距取整）即 +CHALLENGE_CHECKPOINT_BONUS 秒奖励，
  // 倒计时 = CHALLENGE_SECONDS + 累计奖励 - raceTime（提前到达检查点「赚时间」的检查站制博弈）。
  // M27 修复：菜单阶段 HUD 不显示（避免右上角残留橙色细条）；同时确保菜单阶段倒计时/得分归零。
  if (ctx.mode.challengeMode && ctx.phase === PHASE_RACING) {
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
      // R9：脏值比对——剩余秒数文本只在小数变化时写 DOM（10 帧一写，省中间帧分配）
      const leftText = `剩余 ${left.toFixed(1)}s`
      if (ctx.challengeTimer.textContent !== leftText) {
        ctx.challengeTimer.textContent = leftText
      }
      // m17：剩余 10 秒内触发紧急闪烁动画
      ctx.challengeTimer.classList.toggle('urgent', left <= 10)
    }
    // 挑战模式实时得分——与倒计时同生命周期，显示总分（漂移得分 + near-miss 得分，P0 起）
    ctx.challengeScore ??= document.getElementById('challenge-score') as HTMLDivElement | null
    if (ctx.challengeScore) {
      ctx.challengeScore.hidden = false
      const totalScore = race.player1.driftState.score + race.player1.nearMissScore
      const scoreText = `得分 ${Math.round(totalScore)}`
      if (ctx.challengeScore.textContent !== scoreText) {
        ctx.challengeScore.textContent = scoreText
      }
    }
  } else if (ctx.mode.challengeMode) {
    // M27：菜单/暂停/完赛阶段隐藏挑战 HUD 元素，防止回菜单时右上角残留
    ctx.challengeTimer ??= document.getElementById('challenge-timer') as HTMLDivElement | null
    ctx.challengeScore ??= document.getElementById('challenge-score') as HTMLDivElement | null
    if (ctx.challengeTimer && !ctx.challengeTimer.hidden) ctx.challengeTimer.hidden = true
    if (ctx.challengeScore && !ctx.challengeScore.hidden) ctx.challengeScore.hidden = true
  }

  // 双世界车流独立推进：P1 用 tracks[0]（恒推进），分屏或热座 P2 回合时 P2 用 tracks[1]
  // （热座 P1 回合 tracks[1] 静止、P2 回合推进，交棒后车流随当前玩家世界前进）
  // P4（P4）：传玩家位置启用车流避让 AI（逼近同车道车流时让道）
  // M23 方案 13：橡皮筋动态难度——开关开启时 speedFactor 平滑收敛到按玩家速度映射的目标系数
  // （玩家快 → 车流提速保持挑战；玩家慢 → 车流减速便于追赶；不影响避让/恢复逻辑）。
  // 关闭（static）时恒传 1：车流固定速度，simulate/bot 确定性路径不受影响。
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

  // 输入路由：单屏/热座合并 P1(WASD)+P2(方向键)（方向键单屏可用，与菜单"WASD / 方向键驾驶"文案一致）；
  // 分屏：P1 仅 WASD、P2 仅方向键（保持独立）；摇杆 active 时优先；
  // M21：分屏四分区触控源注入（P1 左半屏/P2 右半屏，各半屏有触点即优先于键盘）
  const { input1, input2 } = mode.getInputs({
    touchQuadrant: ctx.touchQuadrant,
    joystickActive: ctx.joystick?.isActive() ?? false,
    joystickInput: ctx.joystick?.getInput() ?? ZERO_INPUT,
    p1Input: ctx.input.getP1Input(),
    p2Input: ctx.input.getP2Input(),
  })
  // P9：分屏暂停标题标注数据源——最近活跃玩家（P1 优先：双人同时活跃归 P1，
  // 仅 P2 有输入才标 P2；触屏摇杆输入走 input1 分支自然归 P1）
  const lastActivePlayer = mode.updateActivePlayer(input1, input2, ctx.lastActivePlayer)
  // S 修复 P4：把本帧已路由的转向输入带回结果，渲染段直接复用（消除帧内二次 routeInputs）
  // ——非分屏 input2 恒为零输入，steer2 即 0，与 collectSteerInputs 语义一致。
  const steer1 = input1.steer
  const steer2 = input2.steer

  // G4（G4）：BOOST 蓄力/消耗——漂移激活蓄力、按键（Space/Enter）且 charge>0 时消耗并激活；
  // 并入 boost 字段后传给 updatePlayerFrame（触屏 input.boost 恒 false 不受影响）
  // P0（P0）：完美氮气——激活边沿（prevBoostActive=该玩家上一帧 boost 激活态）且 charge ≥ 阈值时
  // updateBoostCharge 返回 perfect；帧块将其锁定到本次激活段（boostPerfect 段状态），boost 结束后重置
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

  // G4（G4）：BOOST 条——帧块直接操作填充层宽度（charge 0→200px 平滑映射；勿用百分比——
  // 百分比相对视口会被 max-width 截断导致 0.3~1.0 区间恒满条）。2026-08-05 P1-1 重构：
  // 轨道 #boost-bar 固定 200px 常驻，仅 .boost-fill 填充层宽度随 charge 增长，未蓄能时
  // 也能看到暗色空槽提示 BOOST 功能与蓄能进度
  ctx.boostBar ??= document.getElementById('boost-bar') as HTMLDivElement | null
  if (ctx.boostBar) {
    ctx.boostBar.hidden = false
    const fill = ctx.boostBar.querySelector<HTMLDivElement>('.boost-fill')
    if (fill) {
      // R9：脏值比对——BOOST 条宽度只在数值变化时写 style（蓄能缓慢，多数帧宽度不变）
      const widthPx = `${Math.round(race.player1.boostCharge * 200)}px`
      if (fill.style.width !== widthPx) {
        fill.style.width = widthPx
      }
    }
    // P0（P0）：完美氮气金色反馈——本次激活段为完美时轨道加 .perfect 类（金色高亮描边）
    ctx.boostBar.classList.toggle('perfect', race.player1.boostPerfect)
  }
  // 2026-08-08 实测修复（分屏 P2 BOOST 条）：分屏时 P2 有独立 boostCharge/boostPerfect，
  // 但此前 HUD 只有 P1 的 #boost-bar，P2 蓄能无显示；现按 splitMode 同步更新 #boost-bar-2
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

  // H2（H2）：BOOST 音效与尾焰粒子——任一玩家 boost 激活且上一帧未激活时触发音效（边沿检测）；
  // P1 激活期间每帧至多 1 粒尾焰粒子（z 取相机前方 +2 保证投影非 null，t 随帧推进、超 0.6s 移除）
  const boostOn = effInput1.boost === true || effInput2.boost === true
  if (boostOn && !ctx.boostActive) {
    ctx.boostSound?.play()
  }
  const boostActive = boostOn
  if (effInput1.boost === true) {
    ctx.boostParticles.push({
      x: race.player1.carState.position,
      z: race.player1.cameraZ + 2,
      t: 0,
    })
  }
  // M23 方案 6：对局成就统计——BOOST 使用标记（P1/P2 各自），完美氮气标记复用 boostPerfect 段状态
  if (effInput1.boost === true) race.player1.boostUsedEver = true
  if (effInput2.boost === true) race.player2.boostUsedEver = true
  if (race.player1.boostPerfect) race.player1.perfectBoostUsed = true
  if (race.player2.boostPerfect) race.player2.perfectBoostUsed = true
  // M23 方案 6：漂移连击峰值统计（driftState.combo 会因断连归零，maxCombo 保留本局最高档）
  race.player1.maxCombo = Math.max(race.player1.maxCombo, race.player1.driftState.combo)
  race.player2.maxCombo = Math.max(race.player2.maxCombo, race.player2.driftState.combo)

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

  // 碰撞检测：分屏双人全检；热座仅当前回合玩家参与——P2 回合检 player2 与 P2 世界车流，
  // P1 回合 player2 静止不参与（保持 M8 热座语义，避免起点车流误撞静止 P2）。
  // M16：返回 hit/impact（0-1 速度比）供声音响度与红闪分级。
  const { hit: collisionHit, impact: collisionImpact } = updateCollisions(
    race,
    dt,
    mode.collisionIncludesP2(ctx.hotseatPlayer),
    carConfig.maxSpeed,
  )
  // M16：碰撞红闪状态——命中时以速度比 seed 重置（低速轻微、高速满格），未命中按 dt 指数衰减（渲染段读）
  const collisionFlash = updateCollisionFlash(
    ctx.collisionFlash,
    collisionHit ? flashSeedFromSpeedRatio(collisionImpact) : null,
    dt,
  )
  // F4（F4）：碰撞计数增长 → 触发碰撞冲击音（CollisionSound 内部 80ms 防刷屏）；
  // H6（H6）：强度 = 碰撞瞬间速度比（updateCollisions 返回，高速撞击更响）
  let lastCollisionCount = ctx.lastCollisionCount
  if (race.collisionCount > lastCollisionCount) {
    ctx.collisionSound?.play(collisionImpact)
    lastCollisionCount = race.collisionCount
  }

  // P0（P0）：漂移小喷尾焰——释放漂移触发小喷期间同样产出尾焰粒子（车尾出火视觉，
  // 与 BOOST 尾焰共用粒子通道；小喷时长短、粒子少，不额外新增通道）。
  // 位置在玩家物理更新（updatePlayers→updateDrift 触发 turbo）之后，读取本帧最新 turbo 判定
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
  // 粒子推进/老化：合并 BOOST 尾焰与小喷尾焰统一推进（t 递增、超期移除）
  for (let i = ctx.boostParticles.length - 1; i >= 0; i--) {
    ctx.boostParticles[i].t += dt
    if (ctx.boostParticles[i].t > BOOST_PARTICLE_LIFETIME) {
      ctx.boostParticles.splice(i, 1)
    }
  }

  // M23 方案 12：Game Feel 特效状态推进与触发——完美氮气闪光 / 小喷闪光 / near-miss 脉冲
  // 逐帧指数衰减（渲染段消费；触发瞬间置 1，衰减率决定闪光时长约 0.3s）。
  // 完美氮气：本次激活段为完美时触发金色闪光（与 boostBar .perfect 高亮同源段状态）。
  // 小喷：turbo 激活的帧触发蓝色闪光（出弯喷发爽感）。
  // 漂移得分浮动飘字：得分整数位帧间增长时生成 "+增量" 飘字（≥1 才显示），超期清除。
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

  // P0（P0）：near-miss 贴身超车——玩家以高于车流巡航速度从横向近处擦身超车（未碰撞）时：
  // 得分（NEAR_MISS_SCORE × 当前连击倍率，计入独立 nearMissScore——不污染漂移 TOP10 语义；
  // 挑战 HUD 实时总分 = driftState.score + nearMissScore）+ 蓄能（NEAR_MISS_CHARGE）+ HUD 弹出 + 音效。
  // 与碰撞互斥：near-miss 横向窗口在碰撞容差之上（碰撞会先触发并弹开）。
  // 单屏/热座/挑战均以 P1 世界（tracks[0]）为主；分屏双世界各自判定（P2 走 tracks[1]，热座 P2 回合同）。
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
      // M23 方案 6：near-miss 累计次数（成就「贴地飞行」检测）
      race.player2.nearMissCount += 1
      // M23 方案 12：near-miss 屏幕边缘速度线脉冲（渲染段消费，逐帧指数衰减）
      race.player2.nearMissPulse = 1
      ctx.nearMissSound?.play()
    }
  }

  // M15（M15）：漂移摩擦胎声与轻量胎噪——漂移激活期间播放胎声（随车速/转向/湿滑调制），
  // 胎噪常驻极低音量（速度越大越明显、转向加强、湿滑轻微加成）；均走 sfxGain 分轨。
  // 置于玩家物理更新之后（driftState 为本帧最新）；音频未创建（null/undefined）时安全 no-op
  const driftActive = race.player1.driftState.active || race.player2.driftState.active
  if (driftActive) {
    ctx.driftSound?.start()
    // 强度取双玩家车速比与转向绝对值最大值（分屏双人漂移取较剧烈一方；单屏 player2 静止自然取 P1）
    const speedRatio = Math.max(race.player1.carState.speed, race.player2.carState.speed) / carConfig.maxSpeed
    const steerAbs = Math.max(Math.abs(effInput1.steer), Math.abs(effInput2.steer))
    ctx.driftSound?.setIntensity(speedRatio, steerAbs, wet)
  } else {
    ctx.driftSound?.stop()
  }
  // 胎噪以 P1 车速/转向驱动（单屏语义即 P1；音量极小不喧宾夺主）
  ctx.tireSound?.setLevel(race.player1.carState.speed / carConfig.maxSpeed, Math.abs(effInput1.steer), wet)

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
      boostBar: ctx.boostBar,
      boostBar2: ctx.boostBar2 ?? null,
      nearMissEl: ctx.nearMissEl ?? null,
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
    boostBar: ctx.boostBar,
    boostBar2: ctx.boostBar2 ?? null,
    nearMissEl: ctx.nearMissEl ?? null,
    steer1,
    steer2,
  }
}
