import { Renderer, type BoostParticle } from '../engine/renderer'
import { createRoadsideSprites } from '../engine/sprites'
import { TRACK_DEFS } from '../engine/tracks'
import { updateTraffic } from '../engine/traffic'
import { createCarConfig, type CarConfig, type CarInput } from '../physics/car'
import { BoostSound, CollisionSound, EngineSound, RainSound } from '../audio/engine'
import { MusicPlayer } from '../audio/music'
import { WEATHER_CYCLE_SECONDS } from '../engine/lighting'
import { updateHud, type HudElements } from '../ui/hud'
import { JoystickUI } from '../ui/joystick'
import { Minimap } from '../ui/minimap'
import { applyPhaseToScreens, type ScreenElements } from '../ui/screens'
import { addDriftScore, addMatchResult, loadBestTime, loadBestTimeFor, recordWin, type WinStats } from '../ui/save'
import { createInputManager } from './input'
import { mergeCarInputs } from '../physics/input'
import { createRaceState, resetRaceState, type RaceState } from './state'
import { refreshTraffic } from './track-context'
import { updateCollisions } from './collision'
import { TrackManager } from './track-manager'
import { installDebugHook } from './debug-hook'
import { lapFromZ } from './lap'
import { PHASE_FINISHED, PHASE_MENU, PHASE_PAUSED, PHASE_RACING, type Phase } from './phase'
import { nextPhase, togglePause } from './phase-logic'
import { CHALLENGE_SECONDS } from './constants'
import { refreshBestSummary, refreshDriftTop, refreshMatchTop } from './top-refresh'
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
    // P6（P6）：构造时读取持久化主音量（无效/不可用回退 0.6）；G7：分轨音量独立读取（Task D：委托 volume.ts 纯函数）
    this.volume = loadVolumeFromStorage()
    this.musicVolume = loadMusicVolumeFromStorage()
    this.sfxVolume = loadSfxVolumeFromStorage()

    // 模式菜单提示（#menu-hint 由 index.html 提供）：分屏双键盘 / 热座轮流 / 挑战限时 / 默认单屏。
    // Batch 3：文案统一为 [操作说明] · [开始方式] 格式——默认单屏补驾驶说明，热座补开始提示，
    // 挑战模式重排为「限时说明 · 驾驶 · 开始」，分屏保持原样（已符合格式）
    const menuHint = document.getElementById('menu-hint')
    if (menuHint) {
      if (this.splitMode) {
        menuHint.textContent = 'P1: 1-9 选赛道 · P2: Shift+1-9 选赛道 · 按任意键开始'
      } else if (this.hotseatMode) {
        menuHint.textContent = 'P1 先跑 · 完成按回车交棒 P2 · 1-9 选赛道 · 按任意键开始'
      } else if (this.challengeMode) {
        menuHint.textContent = '60 秒限时刷分 · WASD / 方向键驾驶 · 按任意键开始'
      } else {
        menuHint.textContent = 'WASD / 方向键驾驶 · 1-9 选赛道 · 按任意键开始'
      }
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
      driftCombo: $('drift-combo') as HTMLDivElement,
      pauseBtn: $('pause-btn') as HTMLButtonElement,
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
      finishWins: $('finish-wins') as HTMLDivElement,
      pauseVolume: $('pause-volume') as HTMLInputElement,
      pauseRestart: $('pause-restart') as HTMLButtonElement,
      pauseResume: $('pause-resume') as HTMLButtonElement,
      pauseMusicVolume: $('pause-music-volume') as HTMLInputElement,
      pauseSfxVolume: $('pause-sfx-volume') as HTMLInputElement,
      pauseTitle: $('pause-title') as HTMLHeadingElement,
    }
    // P6（P6）：暂停菜单控件事件——音量 slider input → clamp+gain 同步+持久化；重开按钮 click → 回菜单。
    // Task D：原 setVolume 等方法迁移为 volume.ts 纯函数，此处闭包内联（masterGain 未惰性创建时为 null，
    // clampAndSyncGain 仅 clamp 不同步，与旧 setVolume 行为一致）；元素恒存在（hidden 仅面板控制），
    // input/click 监听在构造器绑定一次即可。
    const pauseVolume = this.screenElements.pauseVolume
    const pauseRestart = this.screenElements.pauseRestart
    if (pauseVolume) {
      pauseVolume.addEventListener('input', () => {
        this.volume = clampAndSyncGain(Number(pauseVolume.value) / 100, this.masterGain)
        persistVolume(VOLUME_KEY, this.volume)
        // P2（P2）：同步滑块数值标签（UI 层新增 #pause-volume-value span，元素缺失时静默跳过）
        this.syncVolumeLabel(pauseVolume, 'pause-volume-value')
      })
      // P2（P2）：初始同步一次（UI 层 span 初始文本可能为空，保证与 slider 当前值一致）
      this.syncVolumeLabel(pauseVolume, 'pause-volume-value')
    }
    if (pauseRestart) {
      pauseRestart.addEventListener('click', () => {
        this.applyPhase(PHASE_MENU)
      })
    }
    // G7（G7）：音乐/音效分轨音量 slider（仿 pauseVolume 模式，守卫式绑定）
    const pauseMusicVolume = this.screenElements.pauseMusicVolume
    const pauseSfxVolume = this.screenElements.pauseSfxVolume
    if (pauseMusicVolume) {
      pauseMusicVolume.addEventListener('input', () => {
        this.musicVolume = clampAndSyncGain(Number(pauseMusicVolume.value) / 100, this.musicGain)
        persistVolume(MUSIC_VOLUME_KEY, this.musicVolume)
        // P2（P2）：同步滑块数值标签（UI 层新增 #pause-music-volume-value span，元素缺失时静默跳过）
        this.syncVolumeLabel(pauseMusicVolume, 'pause-music-volume-value')
      })
      // P2（P2）：初始同步一次（UI 层 span 初始文本可能为空，保证与 slider 当前值一致）
      this.syncVolumeLabel(pauseMusicVolume, 'pause-music-volume-value')
    }
    if (pauseSfxVolume) {
      pauseSfxVolume.addEventListener('input', () => {
        this.sfxVolume = clampAndSyncGain(Number(pauseSfxVolume.value) / 100, this.sfxGain)
        persistVolume(SFX_VOLUME_KEY, this.sfxVolume)
        // P2（P2）：同步滑块数值标签（UI 层新增 #pause-sfx-volume-value span，元素缺失时静默跳过）
        this.syncVolumeLabel(pauseSfxVolume, 'pause-sfx-volume-value')
      })
      // P2（P2）：初始同步一次（UI 层 span 初始文本可能为空，保证与 slider 当前值一致）
      this.syncVolumeLabel(pauseSfxVolume, 'pause-sfx-volume-value')
    }
    // F3（F3）：触屏暂停/恢复入口——#pause-btn 悬浮按钮进入暂停、#pause-resume「继续」按钮恢复
    const pauseBtn = this.hudElements.pauseBtn
    const pauseResume = this.screenElements.pauseResume
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.applyPhase(togglePause(this.phase))
      })
    }
    if (pauseResume) {
      pauseResume.addEventListener('click', () => {
        this.applyPhase(togglePause(this.phase))
      })
    }
    const trackName = $('track-name') as HTMLSpanElement
    // 赛道选项元素：按 TRACK_DEFS 数量动态构建（新增赛道只需 append 定义与对应 HTML 按钮）
    const trackOptions = Array.from({ length: TRACK_DEFS.length }, (_, i) => $(`track-option-${i}`) as HTMLDivElement)
    // 按钮文本：序号 + 名称 + 难度星级（★×difficulty + ☆×(3-difficulty)，覆盖 index.html 初始纯文本）
    trackOptions.forEach((option, i) => {
      const def = TRACK_DEFS[i]
      option.textContent = `${i + 1} ${def.name} ${'★'.repeat(def.difficulty)}${'☆'.repeat(3 - def.difficulty)}`
      // 菜单点击选赛道（触屏/鼠标均可）：等价于键盘 1-9；热座双人同步 P2 世界
      option.addEventListener('click', () => {
        if (this.phase !== PHASE_MENU) return
        this.selectP1Track(i)
      })
    })

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
    // Task A 缓存激活：初始赛道立即预热道路段离屏缓存（渲染 view 取自 race.tracks，
    // 与 Renderer 构造入参的 trackManager 上下文引用不同，须以 race.tracks 为准才能命中 useCache 判定）
    this.syncRendererTrack(0)
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
        this.challengeMode ? Math.max(0, CHALLENGE_SECONDS - this.race.player1.raceTime) : null,
      boostCharge: () => this.race.player1.boostCharge,
    })

    window.addEventListener('keydown', this.onKeyDown)
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
    // Task D：排行榜刷新迁移至 top-refresh.ts 独立函数（无 this 依赖）
    refreshDriftTop()
    refreshBestSummary()
    refreshMatchTop()
    requestAnimationFrame(this.frame)
  }

  /**
   * 当前模式下的渲染降级参数（Task 8）：分屏/性能模式返回降级档位，默认全效。
   * 委托纯函数 resolvePerformanceConfig（单测直接覆盖该函数；GameLoop 依赖 DOM 不便实例化）。
   */
  getPerformanceConfig(): PerformanceConfig {
    return resolvePerformanceConfig(this.splitMode, this._perfMode)
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
        const pausedWho = this.splitMode ? this.lastActivePlayer : this.hotseatMode ? this.hotseatPlayer : null
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
    // 胜场统计：仅首次进入完赛时记录（finishShown 守卫防 ESC 重入重复计数）——
    // 热座 round 2 按 P1/P2 用时比较（平手不记）、分屏双完赛复用 driftWinner、单人恒 null；
    // 漂移 TOP10 同守卫：各完赛玩家正分记录（热座 round 1 只记 P1、round 2 只记 P2，天然不重复）
    let winStats: WinStats | null = null
    if (newPhase === PHASE_FINISHED && !this.race.finishShown) {
      let winner: 'P1' | 'P2' | null = null
      if (this.hotseatMode && this.hotseatPlayer === 2 && this.prevP1Time !== null) {
        const t1 = this.prevP1Time
        const t2 = this.race.player2.raceTime
        winner = t1 < t2 ? 'P1' : t1 > t2 ? 'P2' : null
      } else if (this.splitMode && finishedP1 && finishedP2) {
        winner = driftWinner
      }
      if (winner) {
        winStats = recordWin(this.hotseatMode ? 'hotseat' : 'split', winner)
      }
      // G1（G1）：挑战模式无圈数完赛标记——P1 记分条件放宽为「完赛或挑战模式」且正分
      if ((finishedP1 || this.challengeMode) && Math.round(this.race.player1.driftState.score) > 0) {
        addDriftScore({
          player: 'P1',
          trackId: this.trackManager.getTrackId(0),
          score: Math.round(this.race.player1.driftState.score),
          time: this.race.player1.raceTime,
          // H4（H4）：记录最高连击档位（排行榜权重展示）
          combo: Math.round(this.race.player1.driftState.combo),
        })
      }
      // 挑战模式单屏：P2 恒不参与记分（finishedP2 恒 false，条件天然跳过）
      if (finishedP2 && (this.splitMode || this.hotseatMode) && Math.round(this.race.player2.driftState.score) > 0) {
        addDriftScore({
          player: 'P2',
          trackId: this.trackManager.getTrackId(1),
          score: Math.round(this.race.player2.driftState.score),
          time: this.race.player2.raceTime,
          combo: Math.round(this.race.player2.driftState.combo),
        })
      }
      // M11 F2：分屏双完赛记录漂移对局（最近 10 局，driftWinner 在双完赛时恒非 null，平局归 P1）
      if (this.splitMode && finishedP1 && finishedP2) {
        addMatchResult({
          winner: driftWinner ?? 'P1',
          p1Score: Math.round(this.race.player1.driftState.score),
          p2Score: Math.round(this.race.player2.driftState.score),
          trackId: this.trackManager.getTrackId(0),
        })
      }
      // Task D：排行榜刷新迁移至 top-refresh.ts 独立函数
      refreshDriftTop()
      refreshMatchTop()
    }
    applyPhaseToScreens(this.screenElements, newPhase, this.race, this.carConfig, {
      splitMode: this.splitMode,
      finishedP1,
      finishedP2,
      hotseatMode: this.hotseatMode,
      hotseatRound: this.hotseatPlayer,
      prevP1Time: this.prevP1Time,
      driftWinner,
      winStats,
      challengeMode: this.challengeMode,
    })
    if (newPhase === PHASE_FINISHED) {
      this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
      this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))
      // Batch 6（Batch 6）：小地图 canvas 惰性获取——仅单屏创建（分屏双世界无单一进度语义）；
      // 特性检测 getContext 而非 instanceof HTMLCanvasElement：Node 测试环境无该全局（ReferenceError），
      // 且 document.getElementById 对未知 id 返回普通对象替身（无 getContext 方法），判空自然跳过
      const minimapEl = document.getElementById('hud-minimap') as HTMLCanvasElement | null
      if (minimapEl !== null && !this.splitMode && typeof minimapEl.getContext === 'function') {
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
      if (this.splitMode && e.shiftKey) {
        if (digit >= 1 && digit <= TRACK_DEFS.length) this.selectTrackFor(1, digit - 1)
        return
      }
      if (digit >= 1 && digit <= TRACK_DEFS.length) {
        this.selectTrackFor(0, digit - 1)
        if (this.hotseatMode) {
          // 热座双人同一赛道：P1 选赛道后同步 P2 世界（TrackContext 与预览起点）
          this.trackManager.selectTrack(1, digit - 1)
          this.race.tracks[1] = this.trackManager.getContext(1)
          this.previewCameraZ[1] = initialPreviewCameraZ(digit - 1, this.race.tracks[1].lapLength)
        }
        return
      }
      // 缺陷①修复：菜单阶段所有数字键一律吞掉，无效数字键静默忽略，不触发"任意键开始"
      return
    }
    // 缺陷修复：菜单阶段修饰键单独按下（如 P2 选赛道先按 Shift）不触发"任意键开始"
    if (
      this.phase === PHASE_MENU &&
      (e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight' ||
        e.code === 'ControlLeft' ||
        e.code === 'ControlRight' ||
        e.code === 'AltLeft' ||
        e.code === 'AltRight' ||
        e.code === 'MetaLeft' ||
        e.code === 'MetaRight')
    ) {
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
    if (this.hotseatMode) {
      // 热座双人同一赛道：P1 选赛道后同步 P2 世界（TrackContext 与预览起点）
      this.trackManager.selectTrack(1, trackIndex)
      this.race.tracks[1] = this.trackManager.getContext(1)
      this.previewCameraZ[1] = initialPreviewCameraZ(trackIndex, this.race.tracks[1].lapLength)
    }
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

  private readonly frame = (now: number): void => {
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now

    if (this.phase === PHASE_RACING) {
      // F4（F4）：雨段环境音——按 P1 raceTime 判定三态（0 晴 / 1 阴 / 2 雨，各 45s 循环）
      const raining = Math.floor(this.race.player1.raceTime / WEATHER_CYCLE_SECONDS) % 3 === 2
      if (raining) this.rainSound?.start()
      else this.rainSound?.stop()
      // G3（G3）：雨天物理——与雨声同公式同源（raceTime 三态 phase 2）；热座/分屏 P2 世界统一同一 wet 值
      const wet = Math.floor(this.race.player1.raceTime / WEATHER_CYCLE_SECONDS) % 3 === 2
      // H1（H1）：挑战计分加成——雨天 +50%、难度加成（2★ +25%、3★ +50%）；仅 challengeMode 生效
      // （非挑战传 undefined → updatePlayerFrame 默认 1，行为不变）
      const challengeMult = this.challengeMode
        ? 1 + (raining ? 0.5 : 0) + (this.race.tracks[0].def.difficulty - 1) * 0.25
        : undefined
      // G1（G1）：挑战倒计时 HUD——仅挑战模式且比赛阶段可见，文本显示剩余秒数
      if (this.challengeMode) {
        this.challengeTimer ??= document.getElementById('challenge-timer') as HTMLDivElement | null
        if (this.challengeTimer) {
          this.challengeTimer.hidden = this.phase !== PHASE_RACING
          this.challengeTimer.textContent = `剩余 ${Math.max(0, CHALLENGE_SECONDS - this.race.player1.raceTime).toFixed(1)}s`
        }
        // 挑战模式实时得分——与倒计时同生命周期，显示当前漂移得分（整数）
        this.challengeScore ??= document.getElementById('challenge-score') as HTMLDivElement | null
        if (this.challengeScore) {
          this.challengeScore.hidden = this.phase !== PHASE_RACING
          this.challengeScore.textContent = `得分 ${Math.round(this.race.player1.driftState.score)}`
        }
      }
      // 双世界车流独立推进：P1 用 tracks[0]，分屏或热座 P2 回合时 P2 用 tracks[1]
      // （热座 P1 回合 tracks[1] 静止、P2 回合推进，交棒后车流随当前玩家世界前进）
      // P4（P4）：传玩家位置启用车流避让 AI（逼近同车道车流时让道）
      updateTraffic(this.race.tracks[0].traffic, dt, this.race.tracks[0].lapLength, {
        z: this.race.player1.cameraZ,
        x: this.race.player1.carState.position,
      })
      if (this.splitMode || (this.hotseatMode && this.hotseatPlayer === 2)) {
        updateTraffic(this.race.tracks[1].traffic, dt, this.race.tracks[1].lapLength, {
          z: this.race.player2.cameraZ,
          x: this.race.player2.carState.position,
        })
      }
      // 单屏：合并 P1(WASD)+P2(方向键) 键盘输入（方向键单屏可用，与菜单"WASD / 方向键驾驶"文案一致）；
      // 分屏：P1 仅 WASD、P2 仅方向键（保持独立）
      const input1 = this.joystick.isActive()
        ? this.joystick.getInput()
        : this.splitMode
          ? this.input.getP1Input()
          : mergeCarInputs(this.input.getP1Input(), this.input.getP2Input())
      const input2 = this.splitMode ? this.input.getP2Input() : { throttle: 0, brake: false, steer: 0 }
      // P9：分屏暂停标题标注数据源——最近活跃玩家（P1 优先：双人同时活跃归 P1，
      // 仅 P2 有输入才标 P2；触屏摇杆输入走 input1 分支自然归 P1）
      if (this.splitMode) {
        if (input1.throttle > 0 || input1.brake || input1.steer !== 0) {
          this.lastActivePlayer = 1
        } else if (input2.throttle > 0 || input2.brake || input2.steer !== 0) {
          this.lastActivePlayer = 2
        }
      }

      // G4（G4）：BOOST 蓄力/消耗——漂移激活蓄力、按键（Space/Enter）且 charge>0 时消耗并激活；
      // 并入 boost 字段后传给 updatePlayerFrame（触屏 input.boost 恒 false 不受影响）
      const boost1 = updateBoostCharge(
        this.race.player1.boostCharge,
        dt,
        input1.boost === true,
        this.race.player1.driftState.active,
      )
      this.race.player1.boostCharge = boost1.charge
      const effInput1: CarInput = { ...input1, boost: boost1.boost }
      const boost2 = updateBoostCharge(
        this.race.player2.boostCharge,
        dt,
        input2.boost === true,
        this.race.player2.driftState.active,
      )
      this.race.player2.boostCharge = boost2.charge
      const effInput2: CarInput = { ...input2, boost: boost2.boost }

      // G4（G4）：BOOST 条——帧块直接操作（宽度 = P1 charge 相对 max-width 200px 的像素值，charge 0→200px 平滑映射；勿用百分比——百分比相对视口会被 max-width 截断导致 0.3~1.0 区间恒满条），仅比赛阶段可见
      this.boostBar ??= document.getElementById('boost-bar') as HTMLDivElement | null
      if (this.boostBar) {
        this.boostBar.hidden = this.phase !== PHASE_RACING
        this.boostBar.style.width = `${Math.round(this.race.player1.boostCharge * 200)}px`
      }

      // H2（H2）：BOOST 音效与尾焰粒子——任一玩家 boost 激活且上一帧未激活时触发音效（边沿检测）；
      // P1 激活期间每帧至多 1 粒尾焰粒子（z 取相机前方 +2 保证投影非 null，t 随帧推进、超 0.6s 移除）
      const boostOn = effInput1.boost === true || effInput2.boost === true
      if (boostOn && !this.boostActive) {
        this.boostSound?.play()
      }
      this.boostActive = boostOn
      if (effInput1.boost === true) {
        this.boostParticles.push({
          x: this.race.player1.carState.position,
          z: this.race.player1.cameraZ + 2,
          t: 0,
        })
      }
      for (let i = this.boostParticles.length - 1; i >= 0; i--) {
        this.boostParticles[i].t += dt
        if (this.boostParticles[i].t > 0.6) {
          this.boostParticles.splice(i, 1)
        }
      }

      if (this.hotseatMode) {
        // 热座：输入只路由到当前回合玩家（共用同一键盘映射 input1）。
        // P1 回合圈速记录传 lapTimes/lastLap，P2 回合传 lapTimes2/lastLap2（与分屏 P2 同语义）；
        // 另一玩家本回合不更新、不推进相机/计时
        if (this.hotseatPlayer === 1) {
          this.race.lastLap = updatePlayerFrame(
            dt,
            effInput1,
            this.race.player1,
            this.carConfig,
            this.trackManager.getLapLength(0),
            this.race.lapTimes,
            wet,
            challengeMult,
          )
        } else {
          this.race.lastLap2 = updatePlayerFrame(
            dt,
            effInput1,
            this.race.player2,
            this.carConfig,
            this.trackManager.getLapLength(1),
            this.race.lapTimes2,
            wet,
            challengeMult,
          )
        }
      } else {
        // P1 独立更新（车辆/漂移/相机/计时/圈速），H5：返回新 lastLap 单行赋值
        this.race.lastLap = updatePlayerFrame(
          dt,
          effInput1,
          this.race.player1,
          this.carConfig,
          this.trackManager.getLapLength(0),
          this.race.lapTimes,
          wet,
          challengeMult,
        )

        // P2 独立更新（分屏时输入有效，否则零输入；圈长取 tracks[1]；圈速记录到 lapTimes2）
        this.race.lastLap2 = updatePlayerFrame(
          dt,
          effInput2,
          this.race.player2,
          this.carConfig,
          this.trackManager.getLapLength(1),
          this.race.lapTimes2,
          wet,
          challengeMult,
        )
      }

      // 碰撞检测：分屏双人全检；热座仅当前回合玩家参与——P2 回合检 player2 与 P2 世界车流，
      // P1 回合 player2 静止不参与（保持 M8 热座语义，避免起点车流误撞静止 P2）
      updateCollisions(this.race, dt, this.splitMode || (this.hotseatMode && this.hotseatPlayer === 2))
      // F4（F4）：碰撞计数增长 → 触发碰撞冲击音（CollisionSound 内部 80ms 防刷屏）；
      // H6（H6）：强度 = 双玩家速度比取较快者（单屏 player2 speed=0 自然取 P1），高速撞击更响
      if (this.race.collisionCount > this.lastCollisionCount) {
        const impact = Math.max(
          this.race.player1.carState.speed / this.carConfig.maxSpeed,
          this.race.player2.carState.speed / this.carConfig.maxSpeed,
        )
        this.collisionSound?.play(impact)
        this.lastCollisionCount = this.race.collisionCount
      }

      // 完赛判定：P1/P2 各自按本世界圈长/总圈数计算（分屏与热座 P2 回合独立判定）
      const finishedP1 =
        lapFromZ(this.race.player1.cameraZ, this.trackManager.getLapLength(0)) > this.trackManager.getTotalLaps(0)
      const finishedP2 =
        (this.splitMode || this.hotseatMode) &&
        lapFromZ(this.race.player2.cameraZ, this.trackManager.getLapLength(1)) > this.trackManager.getTotalLaps(1)
      // G1（G1）：挑战模式限时收束——raceTime 达 CHALLENGE_SECONDS 即结束（不看圈数）；
      // 判定在正常完赛判定之前：限时先到时走挑战收束，正常完赛（3 圈）先到时仍走完赛路径（结算面板按 challengeMode 显示挑战文案）
      if (this.challengeMode && this.race.player1.raceTime >= CHALLENGE_SECONDS) {
        this.applyPhase(PHASE_FINISHED)
        return
      }
      if (finishedP1 || finishedP2) this.applyPhase(PHASE_FINISHED)
    }

    // 渲染：菜单阶段渲染缓慢滚动的赛道预览（分屏左右两区域各渲染各自赛道世界）
    const w = window.innerWidth
    if (this.phase === PHASE_MENU) {
      // 双预览相机按各自世界圈长推进（分屏时 P1/P2 预览独立滚动）
      this.previewCameraZ[0] = advancePreviewCameraZ(this.previewCameraZ[0], dt, this.trackManager.getLapLength(0))
      this.previewCameraZ[1] = advancePreviewCameraZ(this.previewCameraZ[1], dt, this.trackManager.getLapLength(1))
      // 相机横向小幅摆动，让预览即使在直道也有动感（以 P1 预览位置为准）
      this.renderer.setCameraX(Math.sin(this.previewCameraZ[0] * 0.001) * 0.3)
      if (this.splitMode) {
        this.renderer.renderRegion(this.previewCameraZ[0], 0, w / 2, [], 0, viewFor(this.race.tracks[0]))
        this.renderer.renderRegion(this.previewCameraZ[1], w / 2, w / 2, [], 0, viewFor(this.race.tracks[1]))
        // 交界处深色分隔线：覆盖两区域近处路缘石交错瑕疵（标准分屏做法）
        this.renderer.drawDivider(w / 2)
      } else {
        this.renderer.render(this.previewCameraZ[0], [], 0, viewFor(this.race.tracks[0]))
      }
    } else if (this.splitMode) {
      this.renderer.setCameraX(this.race.player1.carState.position)
      this.renderer.renderRegion(
        this.race.player1.cameraZ,
        0,
        w / 2,
        this.race.player1.driftState.smoke,
        this.race.player1.raceTime,
        viewFor(this.race.tracks[0], this.boostParticles),
      )
      this.renderer.setCameraX(this.race.player2.carState.position)
      this.renderer.renderRegion(
        this.race.player2.cameraZ,
        w / 2,
        w / 2,
        this.race.player2.driftState.smoke,
        this.race.player2.raceTime,
        viewFor(this.race.tracks[1], this.boostParticles),
      )
      // 交界处深色分隔线：两区域各自独立投影，近处路面宽度远超区域宽度被硬裁，
      // 分隔线覆盖交界处的路缘石斜边交错/三角形重叠（标准分屏做法）
      this.renderer.drawDivider(w / 2)
    } else {
      this.renderer.setCameraX(this.race.player1.carState.position)
      this.renderer.render(
        this.race.player1.cameraZ,
        this.race.player1.driftState.smoke,
        this.race.player1.raceTime,
        viewFor(this.race.tracks[0], this.boostParticles),
      )
    }

    // Batch 6（Batch 6）：小地图（#hud-minimap）——仅单屏比赛阶段显示玩家赛道进度；
    // 菜单切赛道后 race.tracks[0] 引用更新，据此重建轨迹折线；分屏不创建（构造器已判空，此处双保险）
    if (this.minimap) {
      if (this.minimap.trackContext !== this.race.tracks[0]) {
        this.minimap = new Minimap(this.race.tracks[0], this.minimap.canvas)
      }
      const showMinimap = this.phase === PHASE_RACING && !this.splitMode
      this.minimap.canvas.hidden = !showMinimap
      if (showMinimap) {
        this.minimap.update(this.race.player1.cameraZ)
      }
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
