import { Renderer, type BoostParticle } from '../engine/renderer'
import { createRoadsideSprites } from '../engine/sprites'
import { TRACK_DEFS } from '../engine/tracks'
import { createCarConfig, type CarConfig } from '../physics/car'
import { BoostSound, CollisionSound, DriftSound, EngineSound, RainSound, TireSound } from '../audio/engine'
import { MusicPlayer } from '../audio/music'
import { type HudElements } from '../ui/hud'
import { JoystickUI } from '../ui/joystick'
import { Minimap } from '../ui/minimap'
import { applyPhaseToScreens, type ScreenElements } from '../ui/screens'
import { loadBestTime, loadBestTimeFor } from '../ui/save'
import { createInputManager } from './input'
import { createRaceState, resetRaceState, type RaceState } from './state'
import { refreshTraffic } from './track-context'
import { TrackManager } from './track-manager'
import { installDebugHook } from './debug-hook'
import { lapFromZ } from './lap'
import { PHASE_FINISHED, PHASE_MENU, PHASE_PAUSED, PHASE_RACING, type Phase } from './phase'
import { nextPhase, togglePause } from './phase-logic'
import { CHALLENGE_SECONDS } from './constants'
import { refreshBestSummary, refreshDriftTop, refreshMatchTop } from './top-refresh'
// Task E（Task E）：frame 更新/渲染段、模式策略与结算记账下沉至独立纯函数模块
import { accountFinish } from './finish-accounting'
import { updateFrame } from './frame-update'
import { renderFrame } from './frame-render'
import { createModeStrategy, type ModeStrategy } from './mode-strategy'
import {
  clampAndSyncGain,
  loadMusicVolumeFromStorage,
  loadSfxVolumeFromStorage,
  loadVolumeFromStorage,
  MUSIC_VOLUME_KEY,
  persistVolume,
  SFX_VOLUME_KEY,
  VOLUME_KEY,
} from './volume'
// Task D（Task D）：纯函数/常量/类型迁移至 frame-pure.ts——import 供本模块内部使用，
// 同名 re-export 保持外部 'game-loop' import 路径与导出签名不变（isolatedModules：type 用 export type）
import {
  advancePreviewCameraZ,
  initialPreviewCameraZ,
  PREVIEW_CAMERA_SPEED,
  resolvePerformanceConfig,
  updateBoostCharge,
  updatePlayerFrame,
  viewFor,
  type PerformanceConfig,
} from './frame-pure'
export {
  advancePreviewCameraZ,
  initialPreviewCameraZ,
  PREVIEW_CAMERA_SPEED,
  resolvePerformanceConfig,
  updateBoostCharge,
  updatePlayerFrame,
  viewFor,
}
export type { PerformanceConfig }

/** 菜单阶段单独按下不触发"任意键开始"的修饰键（缺陷修复：P2 选赛道先按 Shift 等） */
const MODIFIER_KEYS = [
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]

/**
 * 游戏主循环：迁移自 main.ts 的全部运行时职责——DOM 引用、初始化、
 * 赛道切换、流程控制、事件监听、每帧更新/渲染编排、音频与调试钩子。
 */
export class GameLoop {
  private readonly splitMode: boolean
  /** 性能模式（?perf=1，Task 8）：渲染降级档位由 getPerformanceConfig 读取；与 split 不互斥 */
  private readonly _perfMode: boolean
  /** 热座轮流模式（?hotseat=1）：双人先后跑同赛道比成绩；split 优先互斥 */
  private readonly hotseatMode: boolean
  /** 漂移挑战模式（?challenge=1）：60 秒限时刷分；与 split/hotseat 互斥 */
  private readonly challengeMode: boolean
  /** 游玩模式策略（Task E）：输入路由/车流推进/碰撞范围/玩家更新/完赛判定/选赛道同步的下沉实现 */
  private readonly mode: ModeStrategy
  /** 挑战倒计时 HUD 元素（#challenge-timer，防御式缓存；显隐/文本由帧块处理） */
  private challengeTimer: HTMLDivElement | null = null
  /** 挑战模式实时得分 HUD 元素（#challenge-score，挑战模式竞赛中显示当前漂移得分） */
  private challengeScore: HTMLDivElement | null = null
  /** BOOST 条 HUD 元素（#boost-bar，防御式缓存；宽度/显隐由帧块处理，G4） */
  private boostBar: HTMLDivElement | null = null
  /** 小地图（#hud-minimap，Batch 6）：单屏比赛阶段显示玩家赛道进度；防御式惰性获取，测试环境无 canvas 时为 null */
  private minimap: Minimap | null = null
  /** 热座当前回合玩家（1 = P1 先跑，交棒后为 2） */
  private hotseatPlayer: 1 | 2 = 1
  /** 分屏最近活跃玩家（P9：暂停标题标注暂停来源；帧循环按输入更新，P1 优先，默认 P1） */
  private lastActivePlayer: 1 | 2 = 1
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
  /** 雨声环境音（音频惰性创建时实例化，雨段 start / 非雨段 stop，类内幂等） */
  private rainSound: RainSound | null = null
  /** 碰撞冲击音（音频惰性创建时实例化，collisionCount 增长时 play） */
  private collisionSound: CollisionSound | null = null
  /** BOOST 氮气音效（音频惰性创建时实例化，boost 激活边沿触发 play） */
  private boostSound: BoostSound | null = null
  /** 漂移摩擦胎声（M15：音频惰性创建时实例化，漂移激活 start / 非激活 stop，随车速/转向/湿滑调制） */
  private driftSound: DriftSound | null = null
  /** 轻量胎噪（M15：音频惰性创建时实例化，常驻极低音量，随车速/转向/湿滑调制） */
  private tireSound: TireSound | null = null
  /** 上一帧 boost 是否激活（边沿检测：本帧激活且上帧未激活 → boostSound.play()） */
  private boostActive = false
  /** BOOST 尾焰粒子（H2：P1 激活期间每帧至多 1 粒，存活 0.6s；经 viewFor 传入 renderer 投影） */
  private boostParticles: BoostParticle[] = []
  /** 上次碰撞计数快照（帧循环对比，增长即触发碰撞音） */
  private lastCollisionCount = 0
  /** 主音量节点（音频惰性创建时建立，EngineSound/MusicPlayer 均注入；暂停菜单 slider 调节） */
  private masterGain: GainNode | null = null
  /** 音乐分轨增益（G7：MusicPlayer 注入此节点，各连 masterGain，独立于音效调节） */
  private musicGain: GainNode | null = null
  /** 音效分轨增益（G7：EngineSound/RainSound/CollisionSound 注入此节点） */
  private sfxGain: GainNode | null = null
  /** 主音量（0-1，localStorage 持久化 key outrun-pseudo3d-volume；初值 0.6） */
  private volume = 0.6
  /** 音乐分轨音量（0-1，MusicPlayer 注入 musicGain；初值 0.8，G7） */
  private musicVolume = 0.8
  /** 音效分轨音量（0-1，EngineSound/RainSound/CollisionSound 注入 sfxGain；初值 1.0，G7） */
  private sfxVolume = 1.0
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
    // Task 8（Task 8）：性能模式——显式降级渲染负载（?perf=1），与分屏不互斥（共存时性能档优先）
    this._perfMode = params.has('perf')
    this.hotseatMode = params.has('hotseat') && !this.splitMode
    // G1（G1）：挑战模式——限时刷分（60 秒收束），与分屏/热座互斥
    this.challengeMode = params.has('challenge') && !this.splitMode && !this.hotseatMode
    // Task E（Task E）：模式策略——互斥且 split 优先的判定已在上方完成，此处只接收已解析标志
    this.mode = createModeStrategy({
      splitMode: this.splitMode,
      hotseatMode: this.hotseatMode,
      challengeMode: this.challengeMode,
    })
    // P6（P6）：构造时读取持久化主音量（无效/不可用回退 0.6）；G7：分轨音量独立读取（Task D：委托 volume.ts 纯函数）
    this.volume = loadVolumeFromStorage()
    this.musicVolume = loadMusicVolumeFromStorage()
    this.sfxVolume = loadSfxVolumeFromStorage()
    // 模式菜单提示（#menu-hint 由 index.html 提供）：文案下沉至 mode.menuHint（分屏/热座/挑战/单屏各一套）
    const menuHint = document.getElementById('menu-hint')
    if (menuHint) {
      menuHint.textContent = this.mode.menuHint
    }

    this.canvas = $('game') as HTMLCanvasElement

    const hud2Container = $('hud2') as HTMLDivElement
    hud2Container.hidden = !this.mode.splitMode
    // 分屏菜单 P2 赛道名：仅分屏时可见（index.html 初始 hidden，缺陷②修复）
    const p2TrackName = $('p2-track-name') as HTMLSpanElement
    p2TrackName.hidden = !this.mode.splitMode
    this.hudElements = this.collectHudElements($, hud2Container)
    // M11：分屏模式下暂停按钮移至底部中央，避免遮挡右下虚拟摇杆
    if (this.mode.splitMode && this.hudElements.pauseBtn) {
      this.hudElements.pauseBtn.classList.add('split-center')
    }
    this.screenElements = this.collectScreenElements($)
    // P6（P6）：暂停菜单控件事件——音量 slider input → clamp+gain 同步+持久化；按钮 click → 阶段切换
    // （Task D：闭包内联 volume.ts 纯函数，masterGain 未惰性创建时仅 clamp；元素缺失守卫式绑定）
    this.bindPauseControls()
    const trackName = $('track-name') as HTMLSpanElement
    // 赛道选项元素：按 TRACK_DEFS 数量动态构建（新增赛道只需 append 定义与对应 HTML 按钮）
    const trackOptions = this.buildTrackOptions($)

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
    // Task A 缓存激活：初始赛道立即预热道路段离屏缓存（须以 race.tracks 为准才能命中 useCache 判定）
    this.syncRendererTrack(0)
    this.input = createInputManager(window)
    this.joystick = new JoystickUI()
    this.joystick.attach(this.canvas)
    this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
    this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))

    this.installDebugSinks()

    window.addEventListener('keydown', this.onKeyDown)
    this.bindGlobalEvents()
    // Task D：排行榜刷新迁移至 top-refresh.ts 独立函数（无 this 依赖）
    refreshDriftTop()
    refreshBestSummary()
    refreshMatchTop()
    requestAnimationFrame(this.frame)
  }

  /** 组装 HUD DOM 引用（P1/P2 速度、圈数、计时、最佳时间与漂移指示；hud2Container 分屏布局类） */
  private collectHudElements($: (id: string) => HTMLElement, hud2Container: HTMLDivElement): HudElements {
    return {
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
      driftCombo: $('drift-combo') as HTMLDivElement,
      pauseBtn: $('pause-btn') as HTMLButtonElement,
    }
  }

  /** 组装屏幕 DOM 引用（启动/结算/暂停面板及结算文本，P2 行仅分屏时存在） */
  private collectScreenElements($: (id: string) => HTMLElement): ScreenElements {
    return {
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
      finishWins: $('finish-wins') as HTMLDivElement,
      pauseVolume: $('pause-volume') as HTMLInputElement,
      pauseRestart: $('pause-restart') as HTMLButtonElement,
      pauseResume: $('pause-resume') as HTMLButtonElement,
      pauseQuit: $('pause-quit-btn') as HTMLButtonElement,
      pauseMusicVolume: $('pause-music-volume') as HTMLInputElement,
      pauseSfxVolume: $('pause-sfx-volume') as HTMLInputElement,
      pauseTitle: $('pause-title') as HTMLHeadingElement,
      finishRestartBtn: $('finish-restart-btn') as HTMLButtonElement,
    }
  }

  /** 绑定暂停菜单控件事件：三个音量 slider + 重开/继续/触屏暂停按钮（守卫式，缺失元素跳过） */
  private bindPauseControls(): void {
    // 主音量 / 音乐分轨 / 音效分轨（P6 总控 + G7 分轨独立调节，仿 pauseVolume 模式）
    this.bindVolumeSlider(
      this.screenElements.pauseVolume,
      'pause-volume-value',
      VOLUME_KEY,
      () => this.masterGain,
      (v) => (this.volume = v),
    )
    this.bindVolumeSlider(
      this.screenElements.pauseMusicVolume,
      'pause-music-volume-value',
      MUSIC_VOLUME_KEY,
      () => this.musicGain,
      (v) => (this.musicVolume = v),
    )
    this.bindVolumeSlider(
      this.screenElements.pauseSfxVolume,
      'pause-sfx-volume-value',
      SFX_VOLUME_KEY,
      () => this.sfxGain,
      (v) => (this.sfxVolume = v),
    )
    this.bindPhaseButton(this.screenElements.pauseRestart, () => this.applyPhase(PHASE_MENU))
    this.bindPhaseButton(this.screenElements.pauseQuit, () => this.applyPhase(PHASE_MENU))
    // M19：结算屏返回主菜单按钮（触屏/鼠标可用）
    this.bindPhaseButton(this.screenElements.finishRestartBtn, () => this.applyPhase(PHASE_MENU))
    // F3（F3）：触屏暂停/恢复入口——#pause-btn 悬浮按钮进入暂停、#pause-resume「继续」按钮恢复
    this.bindPhaseButton(this.hudElements.pauseBtn, () => this.applyPhase(togglePause(this.phase)))
    this.bindPhaseButton(this.screenElements.pauseResume, () => this.applyPhase(togglePause(this.phase)))
  }

  /** 构建赛道选项元素（按 TRACK_DEFS 数量动态构建）：按钮文本 序号+名称+难度星级，点击等价键盘 1-9 */
  private buildTrackOptions($: (id: string) => HTMLElement): HTMLDivElement[] {
    const trackOptions = Array.from({ length: TRACK_DEFS.length }, (_, i) => $(`track-option-${i}`) as HTMLDivElement)
    trackOptions.forEach((option, i) => {
      const def = TRACK_DEFS[i]
      // m4：按钮文本写入 .track-label，避免清空内嵌 SVG 图标
      const label = option.querySelector('.track-label')
      const text = `${i + 1} ${def.name} ${'★'.repeat(def.difficulty)}${'☆'.repeat(3 - def.difficulty)}`
      if (label) label.textContent = text
      else option.textContent = text
      // 菜单点击选赛道（触屏/鼠标均可）：等价于键盘 1-9；热座双人同步 P2 世界
      option.addEventListener('click', () => {
        if (this.phase !== PHASE_MENU) return
        this.selectP1Track(i)
      })
    })
    return trackOptions
  }

  /** 安装调试钩子（window.__gameDebug 运行时状态读取器，自动化验证脚本消费） */
  private installDebugSinks(): void {
    installDebugHook({
      audioState: () => this.engineSound?.state ?? null,
      musicState: () => this.music?.state ?? 'stopped',
      phase: () => this.phase,
      driftActive: () => this.race.player1.driftState.active,
      split: this.mode.splitMode,
      hotseatPlayer: () => this.hotseatPlayer,
      player2CameraZ: () => this.race.player2.cameraZ,
      p2TrafficZ: () => this.race.tracks[1].traffic[0]?.z ?? -1,
      bestTime: () => this.bestTime,
      bestTime2: () => this.bestTime2,
      trafficCount: () => this.race.tracks[0].traffic.length,
      collisions: () => this.race.collisionCount,
      selectedTrack: () => this.trackManager.getTrackId(0),
      selectedTrack2: () => this.trackManager.getTrackId(1),
      touchActive: () => this.joystick.isActive(),
      volume: () => this.volume,
      rainPlaying: () => this.rainSound?.isPlaying() ?? false,
      challengeTimeLeft: () =>
        this.mode.challengeMode ? Math.max(0, CHALLENGE_SECONDS - this.race.player1.raceTime) : null,
      boostCharge: () => this.race.player1.boostCharge,
    })
  }

  /** 绑定全局事件：开始按钮 click（菜单阶段等价任意键开始）与 resize 视口同步 */
  private bindGlobalEvents(): void {
    // 开始按钮点击事件（支持鼠标/触屏）：菜单阶段点击"开始游戏"等价于按任意键开始
    const startBtn = document.getElementById('start-btn')
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (this.phase === PHASE_MENU) {
          this.startGame()
        }
      })
    }
    window.addEventListener('resize', this.resize)
    this.resize()
  }

  /**
   * 当前模式下的渲染降级参数（Task 8）：分屏/性能模式返回降级档位，默认全效。
   * 委托纯函数 resolvePerformanceConfig（单测直接覆盖该函数；GameLoop 依赖 DOM 不便实例化）。
   */
  getPerformanceConfig(): PerformanceConfig {
    return resolvePerformanceConfig(this.mode.splitMode, this._perfMode)
  }

  /**
   * 同步暂停菜单滑块数值标签（P2：UI 层新增 #pause-*-value span，显示百分比整数）。
   * 元素尚未由 UI 层添加时静默跳过（判空守卫），不抛错。
   */
  private syncVolumeLabel(slider: HTMLInputElement, labelId: string): void {
    const label = document.getElementById(labelId)
    if (label) {
      label.textContent = `${Math.round(Number(slider.value))}%`
    }
  }

  /**
   * 绑定暂停菜单音量 slider（P6/G7）：input → clampAndSyncGain 同步对应分轨 gain → setValue 写回
   * 音量字段 → persistVolume 持久化 → 同步数值标签；构造时初始同步一次。
   * gain 惰性为 null 时 clampAndSyncGain 仅 clamp 不同步（与旧 setVolume 行为一致）。
   */
  private bindVolumeSlider(
    slider: HTMLInputElement | undefined,
    labelId: string,
    volumeKey: string,
    gain: () => GainNode | null,
    setValue: (v: number) => number,
  ): void {
    if (!slider) {
      return
    }
    slider.addEventListener('input', () => {
      const v = setValue(clampAndSyncGain(Number(slider.value) / 100, gain()))
      persistVolume(volumeKey, v)
      this.syncVolumeLabel(slider, labelId)
    })
    // P2（P2）：初始同步一次（UI 层 span 初始文本可能为空，保证与 slider 当前值一致）
    this.syncVolumeLabel(slider, labelId)
  }

  /** 绑定暂停菜单按钮 click（重开/继续/触屏暂停；元素缺失守卫式跳过） */
  private bindPhaseButton(btn: HTMLButtonElement | undefined, action: () => void): void {
    if (!btn) {
      return
    }
    btn.addEventListener('click', action)
  }

  /** 重置对局：清玩家状态与计数，重建双世界车流（渲染全部走 view 参数，renderer 不再持有车流引用） */
  private resetRace(): void {
    resetRaceState(this.race)
    refreshTraffic(this.race.tracks[0])
    refreshTraffic(this.race.tracks[1])
    this.last = performance.now()
    this.lastCollisionCount = 0 // resetRaceState 已归零 collisionCount，快照同步
    this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
    this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))
  }

  /** 阶段切换：屏幕显隐/结算由 screens 模块负责，本类负责记录刷新与菜单重置 */
  private applyPhase(newPhase: Phase): void {
    this.phase = newPhase
    // F3（F3）：进入暂停时清理摇杆残留输入（防恢复首帧误输入）；触屏暂停按钮仅比赛阶段可见
    if (newPhase === PHASE_PAUSED) {
      this.joystick.reset()
      // P9：暂停标题按暂停玩家动态标注——分屏按最近活跃玩家（lastActivePlayer，触屏按钮无输入时默认 P1）、
      // 热座按当前回合玩家（hotseatPlayer）、单屏保持通用 "PAUSED"；
      // 配色类与 HUD P1/P2 标签风格一致（p1/p2 class，见 hud.ts hudPlayerTag）
      const pauseTitle = this.screenElements.pauseTitle
      if (pauseTitle) {
        const pausedWho = this.mode.splitMode
          ? this.lastActivePlayer
          : this.mode.hotseatMode
            ? this.hotseatPlayer
            : null
        if (pausedWho !== null) {
          pauseTitle.textContent = pausedWho === 2 ? 'P2 已暂停' : 'P1 已暂停'
          pauseTitle.classList.toggle('p1', pausedWho === 1)
          pauseTitle.classList.toggle('p2', pausedWho === 2)
        } else {
          pauseTitle.textContent = 'PAUSED'
        }
      }
    }
    const pauseBtn = this.hudElements.pauseBtn
    if (pauseBtn) {
      pauseBtn.hidden = newPhase !== PHASE_RACING
    }
    // 挑战模式 HUD 兜底显隐：倒计时/实时得分仅比赛阶段可见（帧块按 phase 刷新，此处覆盖退出 RACING 后的残留）
    if (this.challengeTimer) {
      this.challengeTimer.hidden = newPhase !== PHASE_RACING
    }
    if (this.challengeScore) {
      this.challengeScore.hidden = newPhase !== PHASE_RACING
    }
    // Batch 6（Batch 6）：小地图兜底显隐——退出 RACING（暂停/结算/回菜单）时隐藏（帧块按 phase 刷新，此处覆盖残留）
    if (this.minimap) {
      this.minimap.canvas.hidden = newPhase !== PHASE_RACING
    }
    // Task E（Task E）：结算记账下沉至 finish-accounting.ts 纯函数——
    // 完赛标记恒计算（applyPhaseToScreens 各阶段均需），记账写入仅首次进入完赛时执行（finishShown 守卫防重入）
    const firstFinish = newPhase === PHASE_FINISHED && !this.race.finishShown
    const { finishedP1, finishedP2, driftWinner, winStats } = accountFinish({
      race: this.race,
      trackManager: this.trackManager,
      mode: this.mode,
      hotseatPlayer: this.hotseatPlayer,
      prevP1Time: this.prevP1Time,
      record: firstFinish,
    })
    // 榜单刷新（DOM 副作用留在 GameLoop）：仅首次进入完赛时刷新漂移榜与对局榜
    if (firstFinish) {
      refreshDriftTop()
      refreshMatchTop()
    }
    applyPhaseToScreens(this.screenElements, newPhase, this.race, this.carConfig, {
      splitMode: this.mode.splitMode,
      finishedP1,
      finishedP2,
      hotseatMode: this.mode.hotseatMode,
      hotseatRound: this.hotseatPlayer,
      prevP1Time: this.prevP1Time,
      driftWinner,
      winStats,
      challengeMode: this.mode.challengeMode,
    })
    if (newPhase === PHASE_FINISHED) {
      this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
      this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))
      // Batch 6（Batch 6）：小地图 canvas 惰性获取——仅单屏创建（分屏双世界无单一进度语义）；
      // 特性检测 getContext（Node 测试环境无 HTMLCanvasElement 全局、未知 id 替身无该方法），判空自然跳过
      const minimapEl = document.getElementById('hud-minimap') as HTMLCanvasElement | null
      if (minimapEl !== null && !this.mode.splitMode && typeof minimapEl.getContext === 'function') {
        this.minimap = new Minimap(this.race.tracks[0], minimapEl)
      }
    }
    if (newPhase === PHASE_MENU) {
      this.resetRace()
      refreshDriftTop()
      refreshBestSummary()
      refreshMatchTop()
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      this.applyPhase(togglePause(this.phase))
      return
    }
    // P6（P6）：暂停菜单按 R 重新开始（回菜单；applyPhase MENU 块自动 resetRace + 榜单刷新）
    if (this.phase === PHASE_PAUSED && e.code === 'KeyR') {
      this.applyPhase(PHASE_MENU)
      return
    }
    // 菜单选赛道：P1 用 1-9（左侧），分屏时 P2 用 Shift+1-9（右侧；原 7/8/9 键位废弃）
    if (this.phase === PHASE_MENU && e.code.startsWith('Digit')) {
      const digit = Number(e.code.slice(5))
      // 分屏 P2 键位优先：Shift+数字键一律在此分支处理并 return——
      // 无效数字（超出 1-9）也在此吞掉，防止落进 P1 分支或"任意键开始"逻辑
      if (this.mode.splitMode && e.shiftKey) {
        if (digit >= 1 && digit <= TRACK_DEFS.length) this.selectTrackFor(1, digit - 1)
        return
      }
      if (digit >= 1 && digit <= TRACK_DEFS.length) {
        this.selectTrackFor(0, digit - 1)
        // Task E（Task E）：热座双人同一赛道同步下沉至 mode.afterSelectP1Track（其余模式无操作）
        this.mode.afterSelectP1Track({
          trackIndex: digit - 1,
          race: this.race,
          trackManager: this.trackManager,
          previewCameraZ: this.previewCameraZ,
        })
        return
      }
      // 缺陷①修复：菜单阶段所有数字键一律吞掉，无效数字键静默忽略，不触发"任意键开始"
      return
    }
    // 缺陷修复：菜单阶段修饰键单独按下（如 P2 选赛道先按 Shift）不触发"任意键开始"
    if (this.phase === PHASE_MENU && MODIFIER_KEYS.includes(e.code)) {
      return
    }
    // 热座交棒：P1 回合完赛后回车/R 交棒 P2（绕过 nextPhase 直接赋值 RACING，Phase 保持四态）。
    // 位置在"任意键回菜单"之前：hotseatPlayer===2 或非 Enter/R 键时走既有 FINISHED→MENU 逻辑
    if (
      this.phase === PHASE_FINISHED &&
      this.mode.hotseatMode &&
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
    this.startGame()
  }

  /**
   * 开始游戏：首次调用时惰性创建 AudioContext 并注入全部音效（主音量 masterGain 总控，
   * G7 起下挂 musicGain/sfxGain 分轨），随后推进阶段 FSM（menu→racing，超圈→finished，finished→menu）。
   * 键盘"任意键开始"与 #start-btn 点击共用此逻辑（M12 按钮修复）。
   */
  private startGame(): void {
    if (!this.engineSound) {
      const ctx = new AudioContext()
      // P6（P6）：主音量节点——总控；G7 起分轨：musicGain/sfxGain 各连 masterGain，独立调节
      const masterGain = ctx.createGain()
      masterGain.gain.value = this.volume
      masterGain.connect(ctx.destination)
      this.masterGain = masterGain
      // G7（G7）：音乐/音效分轨——MusicPlayer 走 musicGain、引擎/雨声/碰撞音走 sfxGain
      const musicGain = ctx.createGain()
      musicGain.gain.value = this.musicVolume
      musicGain.connect(masterGain)
      this.musicGain = musicGain
      const sfxGain = ctx.createGain()
      sfxGain.gain.value = this.sfxVolume
      sfxGain.connect(masterGain)
      this.sfxGain = sfxGain
      this.engineSound = new EngineSound(ctx, sfxGain)
      this.engineSound.start()
      this.music = new MusicPlayer(ctx, musicGain)
      this.music.start()
      // F4（F4）：雨声环境音与碰撞冲击音同样走音效分轨（随 sfxVolume 与主音量调节）
      this.rainSound = new RainSound(ctx, sfxGain)
      this.collisionSound = new CollisionSound(ctx, sfxGain)
      // H2（H2）：BOOST 氮气音效（走音效分轨）
      this.boostSound = new BoostSound(ctx, sfxGain)
      // M15（M15）：漂移摩擦胎声与轻量胎噪（走音效分轨，随 sfxVolume 与主音量调节；默认启用）
      this.driftSound = new DriftSound(ctx, sfxGain)
      this.tireSound = new TireSound(ctx, sfxGain)
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
   * 菜单选择 P1 赛道（键盘 1-9 与赛道按钮点击共用）：
   * 热座双人同一赛道：P1 选赛道后同步 P2 世界（TrackContext 与预览起点）。
   */
  private selectP1Track(trackIndex: number): void {
    this.selectTrackFor(0, trackIndex)
    // Task E（Task E）：热座双人同一赛道同步下沉至 mode.afterSelectP1Track（其余模式无操作）
    this.mode.afterSelectP1Track({
      trackIndex,
      race: this.race,
      trackManager: this.trackManager,
      previewCameraZ: this.previewCameraZ,
    })
  }

  /**
   * 为指定玩家切换赛道：TrackManager 重建该玩家 TrackContext 后，
   * 同步 race.tracks 引用（渲染视图/HUD 均取 race.tracks，需与 trackManager 一致），
   * 并把该玩家菜单预览相机重置到新赛道的等分起点。另一玩家不受影响。
   */
  private selectTrackFor(playerIndex: 0 | 1, trackIndex: number): void {
    this.trackManager.selectTrack(playerIndex, trackIndex)
    this.race.tracks[playerIndex] = this.trackManager.getContext(playerIndex)
    this.previewCameraZ[playerIndex] = initialPreviewCameraZ(trackIndex, this.race.tracks[playerIndex].lapLength)
    // Task A 缓存激活：赛道切换后重建道路段离屏缓存（race.tracks 引用已更新，
    // 传新 TrackContext 的预计算字段使 viewFor 的 track 与 renderer.cachedTrack 同引用）
    this.syncRendererTrack(playerIndex)
  }

  /**
   * 激活渲染器道路段缓存消费（Task A 缓存路径在真实游戏的接入点）：
   * 把指定玩家 TrackContext 的预计算（segments/sprites/roadStrips）推给 renderer.setTrack，
   * 使 viewFor(ctx) 返回的 RenderView.track 与 renderer.cachedTrack 同引用且缓存非空 → useCache 成立。
   * 注意：渲染 view 取自 race.tracks（createRaceState 自建 TrackContext，与 TrackManager 上下文引用不同），
   * 必须传 race.tracks 的字段才能命中缓存判定。
   * 分屏双世界共用同一 Renderer（engine 层 cachedTrack 单引用）：缓存指向最近切换的玩家世界，
   * 另一玩家世界回退逐段 drawQuad（渲染正确性不受影响）。热座双人同赛道且渲染只走 tracks[0]。
   */
  private syncRendererTrack(playerIndex: 0 | 1): void {
    const ctx = this.race.tracks[playerIndex]
    // node 测试环境无 OffscreenCanvas 全局（roadStripCache 预渲染依赖 new OffscreenCanvas）：
    // 降级为不带 roadStrips 的 setTrack（缓存停用、渲染走逐段 drawQuad，与激活前行为一致）；
    // 真实浏览器存在 OffscreenCanvas，传 roadStrips 激活道路段离屏缓存消费。
    if (typeof OffscreenCanvas === 'undefined') {
      this.renderer.setTrack(ctx.segments, ctx.sprites)
      return
    }
    this.renderer.setTrack(ctx.segments, ctx.sprites, ctx.roadStrips)
  }

  private readonly resize = (): void => {
    this.renderer.setViewport(this.canvas, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
  }

  /**
   * 主循环帧回调（Task E 薄壳化）：计算 dt → 更新段（updateFrame）→ 渲染段（renderFrame）→
   * 引擎音速比 → rAF 自续。更新/渲染逻辑已下沉至 frame-update.ts / frame-render.ts 纯函数；
   * 完赛/挑战限时触发时 updateFrame 返回 shouldRender=false（等价旧帧内 return：
   * 跳过渲染段与 rAF 自续，保持既有行为）。
   */
  private readonly frame = (now: number): void => {
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now

    const ur = updateFrame(dt, {
      phase: this.phase,
      race: this.race,
      trackManager: this.trackManager,
      carConfig: this.carConfig,
      boostParticles: this.boostParticles,
      mode: this.mode,
      hotseatPlayer: this.hotseatPlayer,
      lastActivePlayer: this.lastActivePlayer,
      boostActive: this.boostActive,
      lastCollisionCount: this.lastCollisionCount,
      challengeTimer: this.challengeTimer,
      challengeScore: this.challengeScore,
      boostBar: this.boostBar,
      rainSound: this.rainSound,
      boostSound: this.boostSound,
      collisionSound: this.collisionSound,
      // M15（M15）：漂移摩擦胎声与胎噪注入帧块驱动（未惰性创建为 null 时 updateFrame 安全 no-op）
      driftSound: this.driftSound,
      tireSound: this.tireSound,
      input: this.input,
      joystick: this.joystick,
      onFinish: () => this.applyPhase(PHASE_FINISHED),
    })
    // 帧间状态写回（lastActivePlayer/boostActive/lastCollisionCount 与惰性 DOM 元素缓存）
    this.lastActivePlayer = ur.lastActivePlayer
    this.boostActive = ur.boostActive
    this.lastCollisionCount = ur.lastCollisionCount
    this.challengeTimer = ur.challengeTimer
    this.challengeScore = ur.challengeScore
    this.boostBar = ur.boostBar
    if (!ur.shouldRender) {
      // 完赛/挑战限时触发 finish：等价旧帧内 return（跳过渲染与 rAF 自续）
      return
    }

    const rr = renderFrame(dt, {
      phase: this.phase,
      splitMode: this.mode.splitMode,
      renderer: this.renderer,
      race: this.race,
      trackManager: this.trackManager,
      previewCameraZ: this.previewCameraZ,
      boostParticles: this.boostParticles,
      minimap: this.minimap,
      hudElements: this.hudElements,
      carConfig: this.carConfig,
      bestTime: this.bestTime,
      bestTime2: this.bestTime2,
      hotseatMode: this.mode.hotseatMode,
      hotseatPlayer: this.hotseatPlayer,
      boostActive: this.boostActive,
    })
    this.minimap = rr.minimap
    this.engineSound?.setSpeedRatio(this.race.player1.carState.speed / this.carConfig.maxSpeed)
    requestAnimationFrame(this.frame)
  }
}

/** 游戏入口：创建并启动主循环（main.ts 调用） */
export function initGame(): GameLoop {
  return new GameLoop()
}
