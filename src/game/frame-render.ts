import type { BoostParticle, Renderer } from '../engine/renderer'
import type { CarConfig } from '../physics/car'
import { advancePreviewCameraZ, viewFor } from './frame-pure'
import { PHASE_MENU, PHASE_RACING, type Phase } from './phase'
import type { RaceState } from './state'
import type { TrackManager } from './track-manager'
import { updateHud, type HudElements } from '../ui/hud'
import { Minimap } from '../ui/minimap'

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
  /** 玩家实时转向输入（-1..1，P1；菜单阶段传 0）：经 viewFor 透传 renderer 驱动车辆转向倾斜 */
  steer1: number
  /** 玩家实时转向输入（-1..1，P2；单屏/热座/菜单阶段传 0） */
  steer2: number
}

/** 每帧渲染段的结果：写回 GameLoop 的小地图引用（可能已重建） */
export interface FrameRenderResult {
  minimap: Minimap | null
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

  if (ctx.phase === PHASE_MENU) {
    // 双预览相机按各自世界圈长推进（分屏时 P1/P2 预览独立滚动）
    ctx.previewCameraZ[0] = advancePreviewCameraZ(ctx.previewCameraZ[0], dt, trackManager.getLapLength(0))
    ctx.previewCameraZ[1] = advancePreviewCameraZ(ctx.previewCameraZ[1], dt, trackManager.getLapLength(1))
    // 相机横向小幅摆动，让预览即使在直道也有动感（以 P1 预览位置为准）
    renderer.setCameraX(Math.sin(ctx.previewCameraZ[0] * 0.001) * 0.3)
    if (ctx.splitMode) {
      renderer.renderRegion(ctx.previewCameraZ[0], 0, w / 2, [], 0, viewFor(race.tracks[0]))
      renderer.renderRegion(ctx.previewCameraZ[1], w / 2, w / 2, [], 0, viewFor(race.tracks[1]))
      // 交界处深色分隔线：覆盖两区域近处路缘石交错瑕疵（标准分屏做法）
      renderer.drawDivider(w / 2)
    } else {
      renderer.render(ctx.previewCameraZ[0], [], 0, viewFor(race.tracks[0]))
    }
  } else if (ctx.splitMode) {
    renderer.setCameraX(race.player1.carState.position)
    renderer.renderRegion(
      race.player1.cameraZ,
      0,
      w / 2,
      race.player1.driftState.smoke,
      race.player1.raceTime,
      viewFor(race.tracks[0], ctx.boostParticles, p1SpeedRatio, boosting, ctx.steer1),
    )
    renderer.setCameraX(race.player2.carState.position)
    renderer.renderRegion(
      race.player2.cameraZ,
      w / 2,
      w / 2,
      race.player2.driftState.smoke,
      race.player2.raceTime,
      viewFor(race.tracks[1], ctx.boostParticles, p2SpeedRatio, boosting, ctx.steer2),
    )
    // 交界处深色分隔线：两区域各自独立投影，近处路面宽度远超区域宽度被硬裁，
    // 分隔线覆盖交界处的路缘石斜边交错/三角形重叠（标准分屏做法）
    renderer.drawDivider(w / 2)
  } else {
    renderer.setCameraX(race.player1.carState.position)
    renderer.render(
      race.player1.cameraZ,
      race.player1.driftState.smoke,
      race.player1.raceTime,
      viewFor(race.tracks[0], ctx.boostParticles, p1SpeedRatio, boosting, ctx.steer1),
    )
  }

  // Batch 6（Batch 6）：小地图（#hud-minimap）——仅单屏比赛阶段显示玩家赛道进度；
  // 菜单切赛道后 race.tracks[0] 引用更新，据此重建轨迹折线；分屏不创建（构造器已判空，此处双保险）
  if (minimap) {
    if (minimap.trackContext !== race.tracks[0]) {
      minimap = new Minimap(race.tracks[0], minimap.canvas)
    }
    const showMinimap = ctx.phase === PHASE_RACING && !ctx.splitMode
    minimap.canvas.hidden = !showMinimap
    if (showMinimap) {
      minimap.update(race.player1.cameraZ)
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
