import { Renderer, type RenderView } from '../engine/renderer'
import { createRoadsideSprites } from '../engine/sprites'
import { TRACK_DEFS } from '../engine/tracks'
import { updateTraffic } from '../engine/traffic'
import { createCarConfig, updateCar, type CarConfig, type CarInput } from '../physics/car'
import { driftSpeedFactor, effectiveTurnRate, updateDrift } from '../physics/drift'
import { EngineSound } from '../audio/engine'
import { MusicPlayer } from '../audio/music'
import { updateHud, type HudElements } from '../ui/hud'
import { JoystickUI } from '../ui/joystick'
import { applyPhaseToScreens, type ScreenElements } from '../ui/screens'
import { loadBestTime, loadBestTimeFor } from '../ui/save'
import { createInputManager } from './input'
import { createRaceState, resetRaceState, type RaceState } from './state'
import { refreshTraffic, type TrackContext } from './track-context'
import { updateCollisions } from './collision'
import { TrackManager } from './track-manager'
import { installDebugHook } from './debug-hook'
import { lapFromZ } from './lap'
import { PHASE_FINISHED, PHASE_MENU, PHASE_RACING, type Phase } from './phase'
import { nextPhase, togglePause } from './phase-logic'
import type { PlayerState } from './player-state'

/** 圈数记录包装：updatePlayerFrame 内推进，调用方与 RaceState.lastLap 桥接 */
export interface LastLapRef {
  value: number
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
 * 切换赛道时的预览起点：按赛道序号等分圈长。
 * 三条赛道起点附近都是直道（经典 12000 / 高速 15000 / S 弯 5000 前无曲率），
 * index*5000 无法区分经典与高速；按圈长 1/3 等分后经典落在直道、高速落在右弯、
 * S 弯落在左弯，预览画面差异明显。
 */
export function initialPreviewCameraZ(index: number, lapLength: number): number {
  const count = TRACK_DEFS.length
  return Math.floor((index * lapLength) / count)
}

/**
 * 从赛道上下文构造渲染视图：分段/曲率前缀和/景物索引/车流。
 * 分屏双世界各持一份 TrackContext，渲染时用各自 view（单次渲染零重建，
 * 预计算在 TrackContext 创建时完成）。
 */
function viewFor(ctx: TrackContext): RenderView {
  return {
    track: ctx.segments,
    curvePrefixSum: ctx.curvePrefixSum,
    spriteIndex: ctx.spriteIndex,
    traffic: ctx.traffic,
  }
}

/**
 * 单玩家一帧更新：漂移 → 速度修正 → 车辆运动学 → 相机推进 → 个人计时 → 圈数记录。
 * 纯函数式收敛 P1/P2 的重复更新逻辑；lapTimes/lastLapRef 可选传入——
 * 分屏 P2 不参与圈速记录（保持原 main.ts 行为：仅 P1 记录 lapTimes）。
 */
export function updatePlayerFrame(
  dt: number,
  input: CarInput,
  player: PlayerState,
  carConfig: CarConfig,
  lapLength: number,
  lapTimes?: number[],
  lastLapRef?: LastLapRef,
): void {
  player.driftState = updateDrift(dt, input, player.carState, carConfig, player.driftState, player.cameraZ)
  player.carState.speed *= driftSpeedFactor(player.driftState)
  updateCar(dt, input, player.carState, carConfig, effectiveTurnRate(carConfig, player.driftState))
  player.cameraZ += player.carState.speed * dt
  player.raceTime += dt

  if (lapTimes !== undefined && lastLapRef !== undefined) {
    const currentLap = lapFromZ(player.cameraZ, lapLength)
    if (currentLap > lastLapRef.value) {
      lapTimes.push(player.raceTime)
      lastLapRef.value = currentLap
    }
  }
}

/**
 * 游戏主循环：迁移自 main.ts 的全部运行时职责——DOM 引用、初始化、
 * 赛道切换、流程控制、事件监听、每帧更新/渲染编排、音频与调试钩子。
 */
export class GameLoop {
  private readonly splitMode: boolean
  /** 热座轮流模式（?hotseat=1）：双人先后跑同赛道比成绩；split 优先互斥 */
  private readonly hotseatMode: boolean
  /** 热座当前回合玩家（1 = P1 先跑，交棒后为 2） */
  private hotseatPlayer: 1 | 2 = 1
  /** 热座 P1 回合完赛用时（交棒时快照，供 round 2 结算胜负比较） */
  private prevP1Time: number | null = null
  private readonly canvas: HTMLCanvasElement
  private readonly hudElements: HudElements
  private readonly screenElements: ScreenElements
  private readonly trackManager: TrackManager
  private readonly carConfig: CarConfig
  private readonly race: RaceState
  private readonly renderer: Renderer
  private readonly input: ReturnType<typeof createInputManager>
  private readonly joystick: JoystickUI
  private phase: Phase = PHASE_MENU
  private engineSound: EngineSound | null = null
  private music: MusicPlayer | null = null
  private bestTime: number | null
  /** P2 最佳圈速（分屏独立存档，-p2 key；单屏不加载） */
  private bestTime2: number | null = null
  /** 菜单预览相机位置（仅 PHASE_MENU 推进；分屏 P1/P2 各自独立，切换赛道时按圈长等分重置起点） */
  private previewCameraZ: [number, number] = [0, 0]
  private last = performance.now()

  constructor() {
    const $ = (id: string): HTMLElement => document.getElementById(id)!
    const params = new URLSearchParams(window.location.search)
    this.splitMode = params.has('split')
    this.hotseatMode = params.has('hotseat') && !this.splitMode

    // 模式菜单提示（#menu-hint 由 index.html 提供）：分屏双键盘 / 热座轮流 / 默认单屏
    if (this.splitMode) {
      const menuHint = document.getElementById('menu-hint')
      if (menuHint) menuHint.textContent = 'P1: 1/2/3 选赛道 · P2: 7/8/9 选赛道 · 按任意键开始'
    } else if (this.hotseatMode) {
      const menuHint = document.getElementById('menu-hint')
      if (menuHint) menuHint.textContent = 'P1 先跑 · 完成按回车交棒 P2 · 1/2/3 选赛道'
    }

    this.canvas = $('game') as HTMLCanvasElement

    const hud2Container = $('hud2') as HTMLDivElement
    hud2Container.hidden = !this.splitMode
    // 分屏菜单 P2 赛道名：仅分屏时可见（index.html 初始 hidden，缺陷②修复）
    const p2TrackName = $('p2-track-name') as HTMLSpanElement
    p2TrackName.hidden = !this.splitMode
    this.hudElements = {
      hudContainer: $('hud') as HTMLDivElement,
      hud2Container,
      hudBest: $('hud-best') as HTMLDivElement,
      hudSpeed: $('hud-speed') as HTMLDivElement,
      hudSpeedUnit: $('hud-speed-unit') as HTMLDivElement,
      hudLap: $('hud-lap') as HTMLDivElement,
      hudTime: $('hud-time') as HTMLDivElement,
      hudSpeed2: $('hud-speed-2') as HTMLDivElement,
      hudSpeedUnit2: $('hud-speed-unit-2') as HTMLDivElement,
      hudLap2: $('hud-lap-2') as HTMLDivElement,
      hudTime2: $('hud-time-2') as HTMLDivElement,
      hudBestP2: $('hud-best-p2') as HTMLDivElement,
      hudPlayerTag: $('hud-player-tag') as HTMLDivElement,
      driftIndicator: $('drift-indicator') as HTMLDivElement,
      driftScoreValue: $('drift-score-value') as HTMLSpanElement,
    }
    this.screenElements = {
      startScreen: $('start-screen') as HTMLDivElement,
      finishScreen: $('finish-screen') as HTMLDivElement,
      pauseScreen: $('pause-screen') as HTMLDivElement,
      finishTime: $('finish-time') as HTMLParagraphElement,
      finishSpeed: $('finish-speed') as HTMLParagraphElement,
      finishBest: $('finish-best') as HTMLParagraphElement,
      finishScore: $('finish-score') as HTMLParagraphElement,
      finishLaps: $('finish-laps') as HTMLDivElement,
      finishTime2: $('finish-time-2') as HTMLParagraphElement,
      finishSpeed2: $('finish-speed-2') as HTMLParagraphElement,
      finishBest2: $('finish-best-2') as HTMLParagraphElement,
      finishScore2: $('finish-score-2') as HTMLParagraphElement,
      finishLaps2: $('finish-laps-2') as HTMLDivElement,
      finishHint: $('finish-hint') as HTMLDivElement,
      finishDriftWinner: $('finish-drift-winner') as HTMLDivElement,
    }
    const trackName = $('track-name') as HTMLSpanElement
    const trackOptions = [
      $('track-option-0') as HTMLDivElement,
      $('track-option-1') as HTMLDivElement,
      $('track-option-2') as HTMLDivElement,
    ]

    // 赛道管理（依赖 resetRace 回调，均在构造完成后才使用；P2 赛道名元素 B4 控制显隐）
    this.trackManager = new TrackManager({
      resetRace: () => this.resetRace(),
      trackName,
      p2TrackName,
      splitMode: this.splitMode,
      trackOptions,
    })
    this.carConfig = createCarConfig()
    this.race = createRaceState()
    this.renderer = new Renderer(
      this.canvas,
      this.trackManager.getContext(0).segments,
      window.innerWidth,
      window.innerHeight,
      undefined,
      createRoadsideSprites(this.trackManager.getContext(0).segments),
      this.race.tracks[0].traffic,
    )
    this.input = createInputManager(window)
    this.joystick = new JoystickUI()
    this.joystick.attach(this.canvas)
    this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
    this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))

    installDebugHook({
      audioState: () => this.engineSound?.state ?? null,
      musicState: () => this.music?.state ?? 'stopped',
      phase: () => this.phase,
      driftActive: () => this.race.player1.driftState.active,
      split: this.splitMode,
      hotseatPlayer: () => this.hotseatPlayer,
      player2CameraZ: () => this.race.player2.cameraZ,
      bestTime: () => this.bestTime,
      bestTime2: () => this.bestTime2,
      trafficCount: () => this.race.tracks[0].traffic.length,
      collisions: () => this.race.collisionCount,
      selectedTrack: () => this.trackManager.getTrackId(0),
      selectedTrack2: () => this.trackManager.getTrackId(1),
      touchActive: () => this.joystick.isActive(),
    })

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('resize', this.resize)
    this.resize()
    requestAnimationFrame(this.frame)
  }

  /** 重置对局：清玩家状态与计数，重建双世界车流（渲染全部走 view 参数，renderer 不再持有车流引用） */
  private resetRace(): void {
    resetRaceState(this.race)
    refreshTraffic(this.race.tracks[0])
    refreshTraffic(this.race.tracks[1])
    this.last = performance.now()
    this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
    this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))
  }

  /** 阶段切换：屏幕显隐/结算由 screens 模块负责，本类负责记录刷新与菜单重置 */
  private applyPhase(newPhase: Phase): void {
    this.phase = newPhase
    // 完赛标记：按各玩家本世界圈长/总圈数计算（单屏时 P2 恒 false；FINISHED 时 cameraZ 已随帧推进可靠）
    // 热座与分屏共用 finishedP2：P2 回合玩家2 跑完触发，P1 回合玩家2 静止不会误触
    const finishedP1 =
      lapFromZ(this.race.player1.cameraZ, this.trackManager.getLapLength(0)) > this.trackManager.getTotalLaps(0)
    const finishedP2 =
      (this.splitMode || this.hotseatMode) &&
      lapFromZ(this.race.player2.cameraZ, this.trackManager.getLapLength(1)) > this.trackManager.getTotalLaps(1)
    // 分屏漂移竞速胜者：仅分屏且双完赛时按漂移得分比较（平局归 P1）；否则 null（热座/单屏恒 null）
    const driftWinner =
      this.splitMode && finishedP1 && finishedP2
        ? Math.round(this.race.player1.driftState.score) >= Math.round(this.race.player2.driftState.score)
          ? 'P1'
          : 'P2'
        : null
    applyPhaseToScreens(
      this.screenElements,
      newPhase,
      this.race,
      this.carConfig,
      {
        splitMode: this.splitMode,
        finishedP1,
        finishedP2,
        hotseatMode: this.hotseatMode,
        hotseatRound: this.hotseatPlayer,
        prevP1Time: this.prevP1Time,
        driftWinner,
      },
    )
    if (newPhase === PHASE_FINISHED) {
      this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
      this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))
    }
    if (newPhase === PHASE_MENU) this.resetRace()
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      this.applyPhase(togglePause(this.phase))
      return
    }
    // 菜单选赛道：P1 用 1/2/3（左侧），分屏时 P2 用 7/8/9（右侧）
    if (this.phase === PHASE_MENU && e.code.startsWith('Digit')) {
      const digit = Number(e.code.slice(5))
      if (digit >= 1 && digit <= 3) {
        this.selectTrackFor(0, digit - 1)
        if (this.hotseatMode) {
          // 热座双人同一赛道：P1 选赛道后同步 P2 世界（TrackContext 与预览起点）
          this.trackManager.selectTrack(1, digit - 1)
          this.race.tracks[1] = this.trackManager.getContext(1)
          this.previewCameraZ[1] = initialPreviewCameraZ(
            digit - 1,
            this.race.tracks[1].lapLength,
          )
        }
        return
      }
      if (this.splitMode && digit >= 7 && digit <= 9) {
        this.selectTrackFor(1, digit - 7)
        return
      }
      // 缺陷①修复：菜单阶段所有数字键一律吞掉，无效数字键静默忽略，不触发"任意键开始"
      return
    }
    // 热座交棒：P1 回合完赛后回车/R 交棒 P2（绕过 nextPhase 直接赋值 RACING，Phase 保持四态）。
    // 位置在"任意键回菜单"之前：hotseatPlayer===2 或非 Enter/R 键时走既有 FINISHED→MENU 逻辑
    if (
      this.phase === PHASE_FINISHED &&
      this.hotseatMode &&
      (e.code === 'Enter' || e.code === 'KeyR') &&
      this.hotseatPlayer === 1
    ) {
      this.prevP1Time ??= this.race.player1.raceTime
      this.hotseatPlayer = 2
      this.resetRace()
      // resetRaceState 已重置 finishShown=false（state.ts 确认），P2 回合结算可再次填充
      this.race.phase = PHASE_RACING
      this.applyPhase(PHASE_RACING)
      return
    }
    if (!this.engineSound) {
      const ctx = new AudioContext()
      this.engineSound = new EngineSound(ctx)
      this.engineSound.start()
      this.music = new MusicPlayer(ctx)
      this.music.start()
    }
    this.applyPhase(
      nextPhase(
        this.phase,
        lapFromZ(this.race.player1.cameraZ, this.trackManager.getLapLength(0)),
        this.trackManager.getTotalLaps(0),
      ),
    )
  }

  /**
   * 为指定玩家切换赛道：TrackManager 重建该玩家 TrackContext 后，
   * 同步 race.tracks 引用（渲染视图/HUD 均取 race.tracks，需与 trackManager 一致），
   * 并把该玩家菜单预览相机重置到新赛道的等分起点。另一玩家不受影响。
   */
  private selectTrackFor(playerIndex: 0 | 1, trackIndex: number): void {
    this.trackManager.selectTrack(playerIndex, trackIndex)
    this.race.tracks[playerIndex] = this.trackManager.getContext(playerIndex)
    this.previewCameraZ[playerIndex] = initialPreviewCameraZ(
      trackIndex,
      this.race.tracks[playerIndex].lapLength,
    )
  }

  private readonly resize = (): void => {
    this.renderer.setViewport(
      this.canvas,
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1,
    )
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now

    if (this.phase === PHASE_RACING) {
      // 双世界车流独立推进：P1 用 tracks[0]，分屏时 P2 用 tracks[1]（圈长各自取用）
      updateTraffic(this.race.tracks[0].traffic, dt, this.race.tracks[0].lapLength)
      if (this.splitMode) {
        updateTraffic(this.race.tracks[1].traffic, dt, this.race.tracks[1].lapLength)
      }
      const input1 = this.joystick.isActive() ? this.joystick.getInput() : this.input.getP1Input()
      const input2 = this.splitMode
        ? this.input.getP2Input()
        : { throttle: 0, brake: false, steer: 0 }

      if (this.hotseatMode) {
        // 热座：输入只路由到当前回合玩家（共用同一键盘映射 input1）。
        // P1 回合圈速记录传 lapTimes/lastLap，P2 回合传 lapTimes2/lastLap2（与分屏 P2 同语义）；
        // 另一玩家本回合不更新、不推进相机/计时
        if (this.hotseatPlayer === 1) {
          const lapRef = { value: this.race.lastLap }
          updatePlayerFrame(
            dt,
            input1,
            this.race.player1,
            this.carConfig,
            this.trackManager.getLapLength(0),
            this.race.lapTimes,
            lapRef,
          )
          this.race.lastLap = lapRef.value
        } else {
          const lapRef2 = { value: this.race.lastLap2 }
          updatePlayerFrame(
            dt,
            input1,
            this.race.player2,
            this.carConfig,
            this.trackManager.getLapLength(1),
            this.race.lapTimes2,
            lapRef2,
          )
          this.race.lastLap2 = lapRef2.value
        }
      } else {
        // P1 独立更新（车辆/漂移/相机/计时/圈速），圈数记录桥接到 race.lastLap
        const lapRef = { value: this.race.lastLap }
        updatePlayerFrame(
          dt,
          input1,
          this.race.player1,
          this.carConfig,
          this.trackManager.getLapLength(0),
          this.race.lapTimes,
          lapRef,
        )
        this.race.lastLap = lapRef.value

        // P2 独立更新（分屏时输入有效，否则零输入；圈长取 tracks[1]；圈速记录到 lapTimes2）
        const lapRef2 = { value: this.race.lastLap2 }
        updatePlayerFrame(
          dt,
          input2,
          this.race.player2,
          this.carConfig,
          this.trackManager.getLapLength(1),
          this.race.lapTimes2,
          lapRef2,
        )
        this.race.lastLap2 = lapRef2.value
      }

      updateCollisions(this.race, dt, this.splitMode)

      // 完赛判定：P1/P2 各自按本世界圈长/总圈数计算（分屏与热座 P2 回合独立判定）
      const finishedP1 =
        lapFromZ(this.race.player1.cameraZ, this.trackManager.getLapLength(0)) > this.trackManager.getTotalLaps(0)
      const finishedP2 =
        (this.splitMode || this.hotseatMode) &&
        lapFromZ(this.race.player2.cameraZ, this.trackManager.getLapLength(1)) > this.trackManager.getTotalLaps(1)
      if (finishedP1 || finishedP2) this.applyPhase(PHASE_FINISHED)
    }

    // 渲染：菜单阶段渲染缓慢滚动的赛道预览（分屏左右两区域各渲染各自赛道世界）
    const w = window.innerWidth
    if (this.phase === PHASE_MENU) {
      // 双预览相机按各自世界圈长推进（分屏时 P1/P2 预览独立滚动）
      this.previewCameraZ[0] = advancePreviewCameraZ(
        this.previewCameraZ[0],
        dt,
        this.trackManager.getLapLength(0),
      )
      this.previewCameraZ[1] = advancePreviewCameraZ(
        this.previewCameraZ[1],
        dt,
        this.trackManager.getLapLength(1),
      )
      // 相机横向小幅摆动，让预览即使在直道也有动感（以 P1 预览位置为准）
      this.renderer.setCameraX(Math.sin(this.previewCameraZ[0] * 0.001) * 0.3)
      if (this.splitMode) {
        this.renderer.renderRegion(
          this.previewCameraZ[0],
          0,
          w / 2,
          [],
          0,
          viewFor(this.race.tracks[0]),
        )
        this.renderer.renderRegion(
          this.previewCameraZ[1],
          w / 2,
          w / 2,
          [],
          0,
          viewFor(this.race.tracks[1]),
        )
        // 交界处深色分隔线：覆盖两区域近处路缘石交错瑕疵（标准分屏做法）
        this.renderer.drawDivider(w / 2)
      } else {
        this.renderer.render(this.previewCameraZ[0], [], 0, viewFor(this.race.tracks[0]))
      }
    }
    else if (this.splitMode) {
      this.renderer.setCameraX(this.race.player1.carState.position)
      this.renderer.renderRegion(
        this.race.player1.cameraZ,
        0,
        w / 2,
        this.race.player1.driftState.smoke,
        this.race.player1.raceTime,
        viewFor(this.race.tracks[0]),
      )
      this.renderer.setCameraX(this.race.player2.carState.position)
      this.renderer.renderRegion(
        this.race.player2.cameraZ,
        w / 2,
        w / 2,
        this.race.player2.driftState.smoke,
        this.race.player2.raceTime,
        viewFor(this.race.tracks[1]),
      )
      // 交界处深色分隔线：两区域各自独立投影，近处路面宽度远超区域宽度被硬裁，
      // 分隔线覆盖交界处的路缘石斜边交错/三角形重叠（标准分屏做法）
      this.renderer.drawDivider(w / 2)
    }
    else {
      this.renderer.setCameraX(this.race.player1.carState.position)
      this.renderer.render(
        this.race.player1.cameraZ,
        this.race.player1.driftState.smoke,
        this.race.player1.raceTime,
        viewFor(this.race.tracks[0]),
      )
    }

    updateHud(
      this.hudElements,
      this.race,
      this.carConfig,
      this.bestTime,
      this.splitMode,
      this.race.tracks,
      this.phase,
      this.bestTime2,
      this.hotseatMode ? this.hotseatPlayer : null,
    )
    this.engineSound?.setSpeedRatio(this.race.player1.carState.speed / this.carConfig.maxSpeed)
    requestAnimationFrame(this.frame)
  }
}

/** 游戏入口：创建并启动主循环（main.ts 调用） */
export function initGame(): GameLoop {
  return new GameLoop()
}
