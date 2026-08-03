import { Renderer } from '../engine/renderer'
import { createRoadsideSprites } from '../engine/sprites'
import { TRACK_DEFS } from '../engine/tracks'
import { createTraffic, updateTraffic } from '../engine/traffic'
import { createCarConfig, updateCar, type CarConfig, type CarInput } from '../physics/car'
import { driftSpeedFactor, effectiveTurnRate, updateDrift } from '../physics/drift'
import { EngineSound } from '../audio/engine'
import { MusicPlayer } from '../audio/music'
import { updateHud, type HudElements } from '../ui/hud'
import { JoystickUI } from '../ui/joystick'
import { applyPhaseToScreens, type ScreenElements } from '../ui/screens'
import { loadBestTime } from '../ui/save'
import { createInputManager } from './input'
import { createRaceState, resetRaceState, type RaceState } from './state'
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
  private last = performance.now()

  constructor() {
    const $ = (id: string): HTMLElement => document.getElementById(id)!
    this.splitMode = new URLSearchParams(window.location.search).has('split')
    this.canvas = $('game') as HTMLCanvasElement

    const hud2Container = $('hud2') as HTMLDivElement
    hud2Container.hidden = !this.splitMode
    this.hudElements = {
      hudContainer: $('hud') as HTMLDivElement,
      hud2Container,
      hudBest: $('hud-best') as HTMLDivElement,
      hudSpeed: $('hud-speed') as HTMLDivElement,
      hudLap: $('hud-lap') as HTMLDivElement,
      hudTime: $('hud-time') as HTMLDivElement,
      hudSpeed2: $('hud-speed-2') as HTMLDivElement,
      hudLap2: $('hud-lap-2') as HTMLDivElement,
      hudTime2: $('hud-time-2') as HTMLDivElement,
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
    }
    const trackName = $('track-name') as HTMLSpanElement
    const trackOptions = [
      $('track-option-0') as HTMLDivElement,
      $('track-option-1') as HTMLDivElement,
      $('track-option-2') as HTMLDivElement,
    ]

    // 赛道管理（依赖 resetRace 回调与惰性 renderer，均在构造完成后才使用）
    this.trackManager = new TrackManager({
      renderer: () => this.renderer,
      resetRace: () => this.resetRace(),
      trackName,
      trackOptions,
    })
    this.carConfig = createCarConfig()
    this.race = createRaceState(createTraffic(this.trackManager.lapLength))
    this.renderer = new Renderer(
      this.canvas,
      this.trackManager.track,
      window.innerWidth,
      window.innerHeight,
      undefined,
      createRoadsideSprites(this.trackManager.track),
      this.race.traffic,
    )
    this.input = createInputManager(window)
    this.joystick = new JoystickUI()
    this.joystick.attach(this.canvas)
    this.bestTime = loadBestTime(this.trackManager.trackDef.id)

    installDebugHook({
      audioState: () => this.engineSound?.state ?? null,
      musicState: () => this.music?.state ?? 'stopped',
      phase: () => this.phase,
      driftActive: () => this.race.player1.driftState.active,
      split: this.splitMode,
      bestTime: () => this.bestTime,
      trafficCount: () => this.race.traffic.length,
      collisions: () => this.race.collisionCount,
      selectedTrack: () => this.trackManager.trackDef.id,
      touchActive: () => this.joystick.isActive(),
    })

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('resize', this.resize)
    this.resize()
    requestAnimationFrame(this.frame)
  }

  /** 重置对局：重建车流并同步渲染器车流引用 */
  private resetRace(): void {
    resetRaceState(this.race, createTraffic(this.trackManager.lapLength))
    this.renderer.setTraffic(this.race.traffic)
    this.last = performance.now()
    this.bestTime = loadBestTime(this.trackManager.trackDef.id)
  }

  /** 阶段切换：屏幕显隐/结算由 screens 模块负责，本类负责记录刷新与菜单重置 */
  private applyPhase(newPhase: Phase): void {
    this.phase = newPhase
    applyPhaseToScreens(
      this.screenElements,
      newPhase,
      this.race,
      this.carConfig,
      this.trackManager.trackDef.id,
    )
    if (newPhase === PHASE_FINISHED) this.bestTime = loadBestTime(this.trackManager.trackDef.id)
    if (newPhase === PHASE_MENU) this.resetRace()
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      this.applyPhase(togglePause(this.phase))
      return
    }
    if (this.phase === PHASE_MENU && e.code.startsWith('Digit')) {
      const index = Number(e.code.slice(5)) - 1
      if (index >= 0 && index < TRACK_DEFS.length) {
        this.trackManager.applyTrack(index)
        return
      }
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
        lapFromZ(this.race.player1.cameraZ, this.trackManager.lapLength),
        this.trackManager.totalLaps,
      ),
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
      updateTraffic(this.race.traffic, dt, this.trackManager.lapLength)
      const input1 = this.joystick.isActive() ? this.joystick.getInput() : this.input.getP1Input()
      const input2 = this.splitMode
        ? this.input.getP2Input()
        : { throttle: 0, brake: false, steer: 0 }

      // P1 独立更新（车辆/漂移/相机/计时/圈速），圈数记录桥接到 race.lastLap
      const lapRef = { value: this.race.lastLap }
      updatePlayerFrame(
        dt,
        input1,
        this.race.player1,
        this.carConfig,
        this.trackManager.lapLength,
        this.race.lapTimes,
        lapRef,
      )
      this.race.lastLap = lapRef.value

      // P2 独立更新（分屏时输入有效，否则零输入；不参与圈速记录，保持原行为）
      updatePlayerFrame(dt, input2, this.race.player2, this.carConfig, this.trackManager.lapLength)

      updateCollisions(this.race, dt, this.splitMode)

      const finishedP1 =
        lapFromZ(this.race.player1.cameraZ, this.trackManager.lapLength) > this.trackManager.totalLaps
      const finishedP2 =
        this.splitMode &&
        lapFromZ(this.race.player2.cameraZ, this.trackManager.lapLength) > this.trackManager.totalLaps
      if (finishedP1 || finishedP2) this.applyPhase(PHASE_FINISHED)
    }

    // 渲染：菜单阶段也渲染赛道预览（分屏左右两区域都渲染，修复 P2 黑屏）
    const w = window.innerWidth
    if (this.phase === PHASE_MENU) {
      if (this.splitMode) {
        this.renderer.setCameraX(0)
        this.renderer.renderRegion(0, 0, w / 2, [], 0)
        this.renderer.renderRegion(0, w / 2, w / 2, [], 0)
      } else {
        this.renderer.setCameraX(0)
        this.renderer.render(0, [], 0)
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
      )
      this.renderer.setCameraX(this.race.player2.carState.position)
      this.renderer.renderRegion(
        this.race.player2.cameraZ,
        w / 2,
        w / 2,
        this.race.player2.driftState.smoke,
        this.race.player2.raceTime,
      )
    }
    else {
      this.renderer.setCameraX(this.race.player1.carState.position)
      this.renderer.render(
        this.race.player1.cameraZ,
        this.race.player1.driftState.smoke,
        this.race.player1.raceTime,
      )
    }

    updateHud(
      this.hudElements,
      this.race,
      this.carConfig,
      this.bestTime,
      this.splitMode,
      this.trackManager.lapLength,
      this.trackManager.totalLaps,
      this.phase,
    )
    this.engineSound?.setSpeedRatio(this.race.player1.carState.speed / this.carConfig.maxSpeed)
    requestAnimationFrame(this.frame)
  }
}

/** 游戏入口：创建并启动主循环（main.ts 调用） */
export function initGame(): GameLoop {
  return new GameLoop()
}
