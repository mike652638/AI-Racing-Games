import type { BoostParticle, Renderer, RenderOptions } from '../engine/renderer'
import type { RouteFork } from '../engine/guide-line'
import type { CarConfig } from '../physics/car'
import { advancePreviewCameraZ, viewFor } from './frame-pure'
import { PHASE_MENU, PHASE_RACING, type Phase } from './phase'
import type { RaceState } from './state'
import type { PlayerState } from './player-state'
import type { TrackManager } from './track-manager'
import { updateHud, type HudElements } from '../ui/hud'
import { Minimap } from '../ui/minimap'

/**
 * M23 方案 12：Game Feel 特效透传辅助——从玩家状态抽取渲染段消费的触发式特效
 * （near-miss 脉冲 / 完美氮气金闪 / 小喷蓝闪 / 漂移得分飘字），构造 viewFor 第 9 尾参。
 */
function gameFeelFor(player: PlayerState): {
  nearMissPulse: number
  perfectBoostFlash: number
  miniTurboFlash: number
  driftPopup: { t: number; amount: number; combo?: number } | null
} {
  return {
    nearMissPulse: player.nearMissPulse,
    perfectBoostFlash: player.perfectBoostFlash,
    miniTurboFlash: player.miniTurboFlash,
    driftPopup: player.driftPopup,
  }
}

/**
 * 每帧渲染段纯函数（Task E 抽取自 game-loop.ts frame 方法「渲染段」）：
 * 菜单预览渲染分支（分屏左右两区域 / 单屏）、分屏/单屏比赛渲染分支
 * （renderRegion×2 + drawDivider / render）、小地图重建与更新、updateHud 调用。
 * ctx 为聚合参数对象（renderer/race/previewCameraZ/boostParticles/HUD 引用等），不依赖 GameLoop 实例；
 * 小地图可能按赛道切换重建，经返回值写回。
 */
export interface FrameRenderContext {
  /** 当前阶段（菜单渲染预览、其余按分屏/单屏渲染比赛画面） */
  phase: Phase
  splitMode: boolean
  renderer: Renderer
  race: RaceState
  trackManager: TrackManager
  /** 菜单预览相机位置（[P1, P2]；菜单阶段按各自世界圈长推进，in-place 写回） */
  previewCameraZ: [number, number]
  /** BOOST 尾焰粒子（比赛渲染传入 viewFor；菜单预览不传/无粒子） */
  boostParticles: BoostParticle[]
  /** 小地图（单屏比赛阶段显示玩家赛道进度；可能按赛道切换重建并返回） */
  minimap: Minimap | null
  hudElements: HudElements
  carConfig: CarConfig
  bestTime: number | null
  bestTime2: number | null
  hotseatMode: boolean
  /** 热座当前回合玩家（updateHud 玩家标签与漂移指示数据源；非热座忽略） */
  hotseatPlayer: 1 | 2
  /** M8：BOOST 激活状态（任一玩家），用于渲染金色 vignette */
  boostActive: boolean
  /** M16：碰撞红闪强度（0-1，frame-update 更新后写回；驱动屏幕红色 vignette） */
  collisionFlash: number
  /** 玩家实时转向输入（-1..1，P1；菜单阶段传 0）：经 viewFor 透传 renderer 驱动车辆转向倾斜 */
  steer1: number
  /** 玩家实时转向输入（-1..1，P2；单屏/热座/菜单阶段传 0） */
  steer2: number
  /** M28 方案 10：导航辅助线强度（0-1，?guide=1 开启；菜单预览缺省 0 不绘制） */
  guideStrength: number
  /** M28 方案 9 深化：岔路选择分叉渲染参数（routeChoosing 时由 GameLoop 计算传入；缺省 null 不绘制） */
  routeFork?: RouteFork | null
  /** M28 方案 9 三次打磨：分叉淡入动画进度（0-1，GameLoop 逐帧推进；缺省 0 完全透明） */
  routeForkAlpha?: number
}

/** 每帧渲染段的结果：写回 GameLoop 的小地图引用（可能已重建） */
export interface FrameRenderResult {
  minimap: Minimap | null
}

/**
 * 倒计时冻结窗口渲染降级（F-1 配套，2026-08-05）：该窗口内画面静止且被倒计时覆盖层遮挡，
 * 缩短视距并跳过粒子特效层——降低每帧绘制/录制开销（真实浏览器亦省帧成本），
 * GO 后 countdownRemaining 归零自动恢复全量渲染（玩家车保留可见）。
 */
const COUNTDOWN_RENDER_OPTS: RenderOptions = {
  drawDistance: 60,
  skipSmoke: true,
  skipBoostParticles: true,
  skipRain: true,
}

/**
 * 每帧渲染段（纯函数）：语义与旧 GameLoop.frame 渲染块逐行一致——
 * 菜单阶段推进双预览相机并渲染预览（分屏左右两区域 + 分隔线 / 单屏全幅），
 * 比赛/暂停阶段按分屏双世界渲染（renderRegion×2 + drawDivider）或单屏渲染；
 * 随后重建/更新小地图并调用 updateHud 同步双人 DOM 文本。
 */
export function renderFrame(dt: number, ctx: FrameRenderContext): FrameRenderResult {
  const { renderer, race, trackManager } = ctx
  const w = window.innerWidth
  let minimap = ctx.minimap

  // M8：速度与 BOOST 状态用于速度线 / 金色 vignette
  const maxSpeed = ctx.carConfig.maxSpeed
  const p1SpeedRatio = race.player1.carState.speed / maxSpeed
  const p2SpeedRatio = race.player2.carState.speed / maxSpeed
  const boosting = ctx.boostActive
  // F-1：倒计时冻结窗口内比赛渲染走降级参数（菜单预览分支不受影响）
  const countdownOpts = race.countdownRemaining > 0 ? COUNTDOWN_RENDER_OPTS : undefined

  if (ctx.phase === PHASE_MENU) {
    // 双预览相机按各自世界圈长推进（分屏时 P1/P2 预览独立滚动）
    ctx.previewCameraZ[0] = advancePreviewCameraZ(ctx.previewCameraZ[0], dt, trackManager.getLapLength(0))
    ctx.previewCameraZ[1] = advancePreviewCameraZ(ctx.previewCameraZ[1], dt, trackManager.getLapLength(1))
    // 相机横向小幅摆动，让预览即使在直道也有动感（以 P1 预览位置为准）
    renderer.setCameraX(Math.sin(ctx.previewCameraZ[0] * 0.001) * 0.3)
    // M23 方案 11：菜单预览同步对局天气变体（rain/night 变体下预览即可预览雨丝/夜晚色板）
    if (ctx.splitMode) {
      renderer.renderRegion(
        ctx.previewCameraZ[0],
        0,
        w / 2,
        [],
        0,
        viewFor(race.tracks[0], undefined, 0, false, 0, 0, undefined, race.weatherOverride),
      )
      renderer.renderRegion(
        ctx.previewCameraZ[1],
        w / 2,
        w / 2,
        [],
        0,
        viewFor(race.tracks[1], undefined, 0, false, 0, 0, undefined, race.weatherOverride),
      )
      // 交界处深色分隔线：覆盖两区域近处路缘石交错瑕疵（标准分屏做法）
      renderer.drawDivider(w / 2)
    } else {
      renderer.render(
        ctx.previewCameraZ[0],
        [],
        0,
        viewFor(race.tracks[0], undefined, 0, false, 0, 0, undefined, race.weatherOverride),
      )
    }
  } else if (ctx.splitMode) {
    renderer.setCameraX(race.player1.carState.position)
    renderer.renderRegion(
      race.player1.cameraZ,
      0,
      w / 2,
      race.player1.driftState.smoke,
      race.player1.raceTime,
      viewFor(
        race.tracks[0],
        ctx.boostParticles,
        p1SpeedRatio,
        boosting,
        ctx.steer1,
        ctx.collisionFlash,
        undefined,
        race.weatherOverride,
        gameFeelFor(race.player1),
        ctx.guideStrength,
        ctx.routeFork ?? undefined,
        ctx.routeForkAlpha ?? 1,
      ),
      countdownOpts,
    )
    renderer.setCameraX(race.player2.carState.position)
    renderer.renderRegion(
      race.player2.cameraZ,
      w / 2,
      w / 2,
      race.player2.driftState.smoke,
      race.player2.raceTime,
      viewFor(
        race.tracks[1],
        ctx.boostParticles,
        p2SpeedRatio,
        boosting,
        ctx.steer2,
        ctx.collisionFlash,
        2,
        race.weatherOverride,
        gameFeelFor(race.player2),
        ctx.guideStrength,
        ctx.routeFork ?? undefined,
        ctx.routeForkAlpha ?? 1,
      ),
      countdownOpts,
    )
    // 交界处深色分隔线：两区域各自独立投影，近处路面宽度远超区域宽度被硬裁，
    // 分隔线覆盖交界处的路缘石斜边交错/三角形重叠（标准分屏做法）
    renderer.drawDivider(w / 2)
  } else {
    // P0 修复（热座 P2）：单屏渲染必须按当前回合玩家切换数据源——
    // 热座 P2 回合渲染 player2 与 tracks[1]（否则画面冻结在 P1 完赛瞬间）。
    // steer 取 ctx.steer1（热座输入经 routeInputs 合并到 input1，steer2 恒 0）。
    const activePlayer = ctx.hotseatMode && ctx.hotseatPlayer === 2 ? race.player2 : race.player1
    const activeTrack = ctx.hotseatMode && ctx.hotseatPlayer === 2 ? race.tracks[1] : race.tracks[0]
    const activeSpeedRatio = ctx.hotseatMode && ctx.hotseatPlayer === 2 ? p2SpeedRatio : p1SpeedRatio
    renderer.setCameraX(activePlayer.carState.position)
    renderer.render(
      activePlayer.cameraZ,
      activePlayer.driftState.smoke,
      activePlayer.raceTime,
      viewFor(
        activeTrack,
        ctx.boostParticles,
        activeSpeedRatio,
        boosting,
        ctx.steer1,
        ctx.collisionFlash,
        undefined,
        race.weatherOverride,
        gameFeelFor(activePlayer),
        ctx.guideStrength,
        ctx.routeFork ?? undefined,
        ctx.routeForkAlpha ?? 1,
      ),
      countdownOpts,
    )
  }

  // Batch 6（Batch 6）：小地图（#hud-minimap）——仅单屏比赛阶段显示玩家赛道进度；
  // 菜单切赛道后 race.tracks[0] 引用更新，据此重建轨迹折线；分屏不创建（构造器已判空，此处双保险）。
  // BUG-1 修复（2026-08-05）：惰性创建——旧逻辑仅在 applyPhase(FINISHED) 创建实例，
  // 首次比赛 RACING 阶段 minimap 恒为 null → 小地图整局空白；改为 RACING 首帧惰性创建
  // （分屏跳过；node 测试环境无 document/getContext，特性检测安全跳过）
  const showMinimap = ctx.phase === PHASE_RACING && !ctx.splitMode
  if (!minimap && showMinimap && typeof document !== 'undefined') {
    const minimapEl = document.getElementById('hud-minimap') as HTMLCanvasElement | null
    if (minimapEl !== null && typeof minimapEl.getContext === 'function') {
      minimap = new Minimap(race.tracks[0], minimapEl)
    }
  }
  if (minimap) {
    if (minimap.trackContext !== race.tracks[0]) {
      minimap = new Minimap(race.tracks[0], minimap.canvas)
    }
    minimap.canvas.hidden = !showMinimap
    if (showMinimap) {
      // 热座 P2 回合小地图跟随当前回合玩家（与单屏渲染数据源一致）
      const activeCameraZ = ctx.hotseatMode && ctx.hotseatPlayer === 2 ? race.player2.cameraZ : race.player1.cameraZ
      minimap.update(activeCameraZ)
    }
  }

  updateHud(
    ctx.hudElements,
    race,
    ctx.carConfig,
    ctx.bestTime,
    ctx.splitMode,
    race.tracks,
    ctx.phase,
    ctx.bestTime2,
    ctx.hotseatMode ? ctx.hotseatPlayer : null,
  )

  return { minimap }
}
