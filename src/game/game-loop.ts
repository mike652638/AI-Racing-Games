import { Renderer, type BoostParticle } from '../engine/renderer'
import { createRoadsideSprites } from '../engine/sprites'
import { TRACK_DEFS } from '../engine/tracks'
import { createCarConfig, type CarConfig } from '../physics/car'
import { type HudElements } from '../ui/hud'
import { JoystickUI } from '../ui/joystick'
import { Minimap } from '../ui/minimap'
import { applyPhaseToScreens, type ScreenElements } from '../ui/screens'
import { loadBestTime, loadBestTimeFor } from '../ui/save'
import { RACING_TOUCH_HINT } from '../ui/copy'
import { createAudioRig } from './audio-rig'
import type { BoostSound, CollisionSound, DriftSound, EngineSound, RainSound, TireSound } from '../audio/engine'
import type { MusicPlayer } from '../audio/music'
import { runCountdown } from './countdown'
import { collectHudElements, collectScreenElements } from './dom-setup'
import { buildTrackPreviewSvg } from './track-preview'
import { getEnvironmentPreviewColor } from '../engine/environment'
import { createInputManager } from './input'
import { createRaceState, resetRaceState, type RaceState } from './state'
import { refreshTraffic } from './track-context'
import { TrackManager } from './track-manager'
import { installDebugHook } from './debug-hook'
import { lapFromZ } from './lap'
import { PHASE_FINISHED, PHASE_MENU, PHASE_PAUSED, PHASE_RACING, type Phase } from './phase'
import { nextPhase, togglePause } from './phase-logic'
import { CHALLENGE_SECONDS, RACE_COUNTDOWN_SECONDS } from './constants'
import { refreshBestSummary, refreshDriftTop, refreshMatchTop } from './top-refresh'
// Task E（Task E）：frame 更新/渲染段、模式策略与结算记账下沉至独立纯函数模块
import { accountFinish } from './finish-accounting'
import { updateFrame } from './frame-update'
import { renderFrame } from './frame-render'
import { collectSteerInputs, createModeStrategy, type ModeStrategy } from './mode-strategy'
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
  shouldScheduleNextFrame,
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
  shouldScheduleNextFrame,
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

/** 菜单方向键选赛道（3x3 网格：左右 ±1、上下 ±3） */
const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']

/** 赛道难度星级文案（下标即难度；纯星级，title/aria-label 各自加"难度："前缀，2026-08-05 D-2 修复重复前缀） */
const DIFFICULTY_HINT: Record<number, string> = {
  1: '★☆☆',
  2: '★★☆',
  3: '★★★',
}

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
  /** 本局 P1 漂移榜名次（2026-08-05 审计 F-3：accountFinish 返回，供挑战结算面板展示；0 = 未入榜/未记录） */
  private driftRankP1 = 0
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
  /** 碰撞红闪强度（0-1，frame-update 每帧更新/写回；渲染段驱动屏幕红色 vignette） */
  private collisionFlash = 0
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
  /** 帧循环是否已调度 rAF（防重复调度导致双倍速）；完赛 return 时链断置 false，ensureLoop 重启（2026-08-05 音频/冻结修复） */
  private loopRunning = false
  /** 比赛中触屏驾驶引导浮层是否已显示（每局仅首次进入 RACING 触发一次） */
  private hasShownRacingTouchHint = false
  /** BOOST 未蓄能红闪反馈上一次触发时间（300ms 冷却，防止每帧重复） */
  private lastBoostDeniedAt = 0

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
    // UX-3 修复（2026-08-05）：菜单模式徽章——分屏/热座/挑战模式显式标识，避免用户误认为单屏；
    // 单屏模式保持隐藏（默认玩法无需标注）
    const modeBadge = document.getElementById('menu-mode-badge')
    if (modeBadge) {
      if (this.mode.splitMode) {
        modeBadge.hidden = false
        modeBadge.textContent = '分屏模式 · 双人同屏'
        modeBadge.className = 'mode-badge mode-split'
      } else if (this.mode.hotseatMode) {
        modeBadge.hidden = false
        modeBadge.textContent = '热座模式 · 回合轮流'
        modeBadge.className = 'mode-badge mode-hotseat'
      } else if (this.mode.challengeMode) {
        modeBadge.hidden = false
        modeBadge.textContent = `挑战模式 · ${CHALLENGE_SECONDS} 秒刷分`
        modeBadge.className = 'mode-badge mode-challenge'
      } else {
        modeBadge.hidden = true
      }
    }
    // UX-8 修复：分屏模式为 body 加类，启用 HUD P1/P2 侧标签（.hud-side-tag，CSS 控制显隐）
    if (this.mode.splitMode && typeof document.body?.classList?.add === 'function') {
      document.body.classList.add('split-mode')
    }

    this.canvas = $('game') as HTMLCanvasElement

    const hud2Container = $('hud2') as HTMLDivElement
    hud2Container.hidden = !this.mode.splitMode
    // 分屏菜单 P2 赛道名：仅分屏时可见（index.html 初始 hidden，缺陷②修复）
    const p2TrackName = $('p2-track-name') as HTMLSpanElement
    p2TrackName.hidden = !this.mode.splitMode
    this.hudElements = collectHudElements($, hud2Container)
    // M11：分屏模式下暂停按钮移至底部中央，避免遮挡右下虚拟摇杆
    if (this.mode.splitMode && this.hudElements.pauseBtn) {
      this.hudElements.pauseBtn.classList.add('split-center')
    }
    this.screenElements = collectScreenElements($)
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
    // U-4（2026-08-05 审计）：分屏模式触屏玩法为四分区触控，不常驻摇杆（防 P2 半屏语义混淆）
    this.joystick = new JoystickUI({ splitMode: this.mode.splitMode })
    this.joystick.attach(this.canvas)
    // 菜单阶段隐藏虚拟摇杆（右下角圆环），比赛阶段再显示
    this.updateJoystickVisibility(false)
    this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
    this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))

    // 赛道主题背景色（初始赛道 0）
    this.updateTrackBackground(0)

    this.installDebugSinks()

    window.addEventListener('keydown', this.onKeyDown)
    this.bindGlobalEvents()
    // Task D：排行榜刷新迁移至 top-refresh.ts 独立函数（无 this 依赖）
    refreshDriftTop()
    refreshBestSummary()
    refreshMatchTop()
    this.ensureLoop()
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
      // m4：优先写入结构化 .track-label（序号徽章 + 名称 + 星级 span），缺失时回退纯文本
      const label = option.querySelector('.track-label')
      const nameEl = label?.querySelector<HTMLElement>('.track-name')
      const starsEl = label?.querySelector<HTMLElement>('.track-stars')
      const text = `${i + 1} ${def.name} ${'★'.repeat(def.difficulty)}${'☆'.repeat(3 - def.difficulty)}`
      if (nameEl && starsEl) {
        nameEl.textContent = def.name
        starsEl.textContent = '★'.repeat(def.difficulty) + '☆'.repeat(3 - def.difficulty)
        // 星级颜色编码（diff-1 绿 / diff-2 金 / diff-3 粉红）+ 难度 title 提示
        starsEl.className = `track-stars diff-${def.difficulty}`
        starsEl.title = `难度：${DIFFICULTY_HINT[def.difficulty]}`
        if (typeof starsEl.setAttribute === 'function') {
          starsEl.setAttribute('aria-label', `难度：${DIFFICULTY_HINT[def.difficulty]}`)
        }
      } else if (label) label.textContent = text
      else option.textContent = text
      // 菜单点击选赛道（触屏/鼠标均可）：等价于键盘 1-9；热座双人同步 P2 世界
      option.addEventListener('click', () => {
        if (this.phase !== PHASE_MENU) return
        this.selectP1Track(i)
      })
      // 键盘可访问性：聚焦按钮上 Enter/Space 等效点击（菜单阶段）
      option.addEventListener('keydown', (e: KeyboardEvent) => {
        if ((e.code === 'Enter' || e.code === 'Space') && this.phase === PHASE_MENU) {
          e.preventDefault()
          this.selectP1Track(i)
        }
      })
    })
    // 低优①：中央信息区赛道缩略图（controlPoints 积分生成 SVG 轨迹，初始显示 0 号赛道）
    this.refreshTrackPreview(0)
    return trackOptions
  }

  /** 安装调试钩子（window.__gameDebug 运行时状态读取器，自动化验证脚本消费）。
   *  生产剥离（2026-08-05）：非 DEV 环境直接返回，避免创建 19 个状态 getter 闭包——
   *  连同 installDebugHook 内部的 DEV no-op，整个 __gameDebug 安装链路被死码消除；
   *  vitest（mode=test，DEV=true）与 dev 服务器保持安装，测试断言不受影响。 */
  private installDebugSinks(): void {
    if (!import.meta.env.DEV) return
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
      collisionFlash: () => this.collisionFlash,
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
    // 开始按钮点击事件（支持鼠标/触屏）：菜单阶段点击"开始游戏"等价于按任意键开始；
    // 加载中（loading 态）忽略重复点击，防双触发
    const startBtn = document.getElementById('start-btn')
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (this.phase !== PHASE_MENU || startBtn.classList.contains('loading')) return
        this.setStartBtnLoading(startBtn, true)
        this.startGame()
        // 短暂加载态后恢复（进入 RACING 后面板已隐藏，恢复仅影响返回菜单时）
        window.setTimeout(() => this.setStartBtnLoading(startBtn, false), 600)
      })
    }
    this.bindLeaderboardCards()
    window.addEventListener('resize', this.resize)
    this.resize()
  }

  /** 开始按钮加载态：禁用点击 + 文案切换（dataset 缺失元素安全跳过） */
  private setStartBtnLoading(btn: HTMLElement, loading: boolean): void {
    btn.classList.toggle('loading', loading)
    if (loading) {
      if (typeof btn.dataset === 'object' && btn.dataset !== null) {
        btn.dataset.originalText = btn.textContent ?? '开始游戏'
      }
      btn.textContent = '开始中…'
    } else {
      const original = typeof btn.dataset === 'object' && btn.dataset !== null ? btn.dataset.originalText : null
      btn.textContent = original ?? '开始游戏'
    }
  }

  /** 绑定统计卡片展开交互（点击/Enter/Space 切换 前5条 / 全部10条，展开态由 .expanded + aria-expanded 标记；
   *  UX-5 修复 2026-08-05：互斥展开——展开一个时自动收起其他，防三面板同展把开始按钮顶出视口） */
  private bindLeaderboardCards(): void {
    const cards = document.querySelectorAll?.('.lb-card-clickable') ?? []
    const updateAria = (c: Element) => {
      if (typeof c.setAttribute === 'function') {
        c.setAttribute('aria-expanded', String(c.classList.contains('expanded')))
      }
    }
    const toggleCard = (card: Element) => {
      const willExpand = !card.classList.contains('expanded')
      if (willExpand) {
        cards.forEach((other) => {
          if (other !== card) {
            other.classList.remove('expanded')
            updateAria(other)
          }
        })
      }
      card.classList.toggle('expanded')
      updateAria(card)
      const target = card.getAttribute?.('data-target')
      if (target === 'drift-top') refreshDriftTop()
      else if (target === 'match-top') refreshMatchTop()
      else if (target === 'best-summary') refreshBestSummary()
    }
    cards.forEach((card) => {
      card.addEventListener('click', () => toggleCard(card))
      card.addEventListener('keydown', (e: Event) => {
        const ke = e as KeyboardEvent
        if (ke.code === 'Enter' || ke.code === 'Space') {
          e.preventDefault()
          toggleCard(card)
        }
      })
    })
  }

  /** 刷新中央信息区赛道缩略图：controlPoints 积分 → SVG path（元素缺失安全跳过；积分/SVG 下沉 track-preview.ts）；
   *  轨迹主题色随赛道环境区分（2026-08-05 菜单优化，getEnvironmentPreviewColor） */
  private refreshTrackPreview(trackIndex: number): void {
    const preview = document.getElementById('track-preview')
    if (!preview) return
    const def = TRACK_DEFS[trackIndex]
    if (!def) return
    const svg = buildTrackPreviewSvg(def, 200, 64, 8, getEnvironmentPreviewColor(def.environment))
    if (svg !== null) {
      preview.innerHTML = svg
    }
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

  /** 确保帧循环已调度（幂等）：完赛后 RAF 链断（frame 因 shouldRender=false return），
   *  回菜单/再开赛/热座交棒时须经此重启，否则画面冻结、音频不再被调制（2026-08-05） */
  private ensureLoop(): void {
    if (this.loopRunning) return
    this.loopRunning = true
    requestAnimationFrame(this.frame)
  }

  /** 静音车相关持续音（引擎/漂移胎声/胎噪；雨声可选）——离开 RACING 时调用，
   *  防完赛/暂停后持续蜂鸣/噪声（完赛后 RAF 停摆，updateFrame 静音分支不再执行，2026-08-05）。
   *  恢复比赛后由 updateFrame/帧块重新驱动（引擎 setSpeedRatio、胎噪 setLevel、漂移 start、雨声 start）。 */
  private silenceDriveSounds(stopRain: boolean): void {
    this.engineSound?.stop()
    this.driftSound?.stop()
    this.tireSound?.setLevel(0, 0, false)
    if (stopRain) {
      this.rainSound?.stop()
    }
  }

  /**
   * 屏幕退场过渡：为目标 DOM 元素加 .leaving 触发 CSS 淡出（150ms），
   * 动画结束后才隐藏并移除类；若元素已离开/已隐藏或处于测试 mock 环境则幂等跳过/立即隐藏。
   */
  private transitionScreenOut(screen: HTMLElement | undefined): void {
    if (!screen || screen.hidden) return
    // 测试 mock 元素无 classList/addEventListener/contains：直接隐藏，避免崩溃
    if (
      !screen.classList ||
      typeof screen.classList.contains !== 'function' ||
      typeof screen.addEventListener !== 'function'
    ) {
      screen.hidden = true
      return
    }
    if (screen.classList.contains('leaving')) return
    screen.classList.add('leaving')
    const cleanup = () => {
      screen.removeEventListener('transitionend', cleanup)
      screen.classList.remove('leaving')
      screen.hidden = true
    }
    screen.addEventListener('transitionend', cleanup)
    const timer = globalThis.setTimeout(cleanup, 250)
    // Node 测试环境：unref 定时器，避免测试进程为等待 250ms 清理而保留大量 DOM 引用
    if (timer && typeof timer === 'object' && typeof (timer as { unref?: () => void }).unref === 'function') {
      ;(timer as { unref: () => void }).unref()
    }
  }

  /** 阶段切换：屏幕显隐/结算由 screens 模块负责，本类负责记录刷新与菜单重置 */
  private applyPhase(newPhase: Phase): void {
    this.phase = newPhase
    // 2026-08-05 音频修复：离开 RACING 时静音车相关持续音——完赛后 RAF 停摆、updateFrame 静音分支
    // 不再执行，引擎/胎噪/漂移/雨声会停在最后一帧状态形成持续蜂鸣/噪声；暂停保留雨声（环境音），
    // 完赛/回菜单连雨声一并停止（背景音乐 MusicPlayer 不受影响，持续播放）
    if (newPhase !== PHASE_RACING) {
      this.silenceDriveSounds(newPhase !== PHASE_PAUSED)
    }
    // 离开完赛态（回菜单/再开赛）重启帧循环（完赛时 RAF 链已断）
    if (newPhase === PHASE_MENU || newPhase === PHASE_RACING) {
      this.ensureLoop()
    }
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
      // 2026-08-05 P2-6：暂停画面显示当前赛道名（#pause-track-name），帮助玩家确认暂停的是哪条赛道
      const pauseTrack = this.screenElements.pauseTrackName
      if (pauseTrack) {
        const trackId = this.trackManager.getTrackId(0)
        const def = TRACK_DEFS.find((d) => d.id === trackId)
        pauseTrack.textContent = def ? `赛道：${def.name}` : ''
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
    // M18：屏幕切换过渡——菜单/暂停/结算退场淡出 150ms，不阻塞游戏循环
    if (newPhase === PHASE_RACING) {
      this.transitionScreenOut(this.screenElements.startScreen)
    }
    if (newPhase === PHASE_MENU) {
      this.transitionScreenOut(this.screenElements.finishScreen)
    }
    if (newPhase !== PHASE_PAUSED) {
      this.transitionScreenOut(this.screenElements.pauseScreen)
    }
    // U-3（2026-08-05 审计修复）：触屏驾驶引导浮层改由倒计时归零（GO）后触发——
    // 原实现在 applyPhase(RACING) 即显示，2s 淡出早于倒计时 GO（≈2.9s）导致引导失效；
    // 现由 frame 的 countdownJustFinished 边沿调用 showRacingTouchHint（见下）。
    // Task E（Task E）：结算记账下沉至 finish-accounting.ts 纯函数——
    // 完赛标记恒计算（applyPhaseToScreens 各阶段均需），记账写入仅首次进入完赛时执行（finishShown 守卫防重入）
    const firstFinish = newPhase === PHASE_FINISHED && !this.race.finishShown
    const { finishedP1, finishedP2, driftWinner, winStats, driftRankP1 } = accountFinish({
      race: this.race,
      trackManager: this.trackManager,
      mode: this.mode,
      hotseatPlayer: this.hotseatPlayer,
      prevP1Time: this.prevP1Time,
      record: firstFinish,
    })
    // 榜单刷新（DOM 副作用留在 GameLoop）：仅首次进入完赛时刷新漂移榜与对局榜
    if (firstFinish) {
      this.driftRankP1 = driftRankP1
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
      // F-3（2026-08-05 审计）：挑战结算名次直接消费 addDriftScore 返回值（防 findIndex 同分误判）
      driftRank: this.driftRankP1,
    })
    if (newPhase === PHASE_FINISHED) {
      this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
      this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))
      // Batch 6：小地图实例由 frame-render 在 RACING 首帧惰性创建（BUG-1 修复，2026-08-05：
      // 原此处 FINISHED 创建导致首次比赛整局空白），此处不再重复创建
    }
    if (newPhase === PHASE_MENU) {
      this.resetRace()
      this.driftRankP1 = 0
      // 菜单阶段隐藏虚拟摇杆（右下角圆环）
      this.updateJoystickVisibility(false)
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
    // 菜单选赛道：方向键 3x3 网格导航（左右 ±1、上下 ±3），焦点跟随；方向键在 RACING 阶段
    // 是 P2 油门/转向（帧循环采集），菜单阶段复用无冲突
    if (this.phase === PHASE_MENU && ARROW_KEYS.includes(e.code)) {
      if (typeof e.preventDefault === 'function') e.preventDefault()
      const cols = 3
      const cur = this.trackManager.getSelectedIndex(0)
      const move = e.code === 'ArrowLeft' ? -1 : e.code === 'ArrowRight' ? 1 : e.code === 'ArrowUp' ? -cols : cols
      const next = Math.min(TRACK_DEFS.length - 1, Math.max(0, cur + move))
      if (next !== cur) {
        this.selectP1Track(next)
        const opt = document.getElementById(`track-option-${next}`)
        if (opt && typeof opt.focus === 'function') opt.focus()
      }
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
    // 位置在"空格键开始"之前：hotseatPlayer===2 或非 Enter/R 键时走既有 FINISHED→MENU 逻辑
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
      // P0 修复（热座 P2）：P1 完赛时 frame() 因 shouldRender=false 直接 return，
      // 未自续 RAF；P2 回合直接进入 RACING 后 RAF 链已断——applyPhase(RACING) 内 ensureLoop 重启帧循环，
      // 否则 P2 画面/HUD 永远冻结在 P1 状态（frame() 永不调用）
      return
    }
    // 菜单阶段仅空格/回车键开始游戏（其余键吞掉，防误触）
    if (this.phase === PHASE_MENU) {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (typeof e.preventDefault === 'function') e.preventDefault()
        this.startGame()
      }
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
      // 音频装备下沉 audio-rig.ts（2026-08-05）：masterGain 总控 + musicGain/sfxGain 分轨 + 全部音效一次性装配
      const rig = createAudioRig(new AudioContext(), this.volume, this.musicVolume, this.sfxVolume)
      this.masterGain = rig.masterGain
      this.musicGain = rig.musicGain
      this.sfxGain = rig.sfxGain
      this.engineSound = rig.engineSound
      this.music = rig.music
      this.rainSound = rig.rainSound
      this.collisionSound = rig.collisionSound
      this.boostSound = rig.boostSound
      this.driftSound = rig.driftSound
      this.tireSound = rig.tireSound
    }
    // 菜单阶段隐藏摇杆，比赛阶段显示
    this.updateJoystickVisibility(true)
    // 起步倒计时覆盖层（3→2→1→GO，同时显示操作提示）——仅菜单阶段真正开始游戏时触发一次；
    // onKeyDown 末尾兜底在 RACING/FINISHED 阶段按任意键也会调用 startGame（原有"任意键开始"行为），
    // 若无条件调用会致驾驶中按键反复弹出倒计时覆盖层，故以 phase === PHASE_MENU 守卫
    if (this.phase === PHASE_MENU) {
      this.startCountdown()
      // F-1（2026-08-05 审计修复）：起步倒计时冻结窗口——与 runCountdown 视觉同步，
      // GO 前 raceTime/车流/玩家物理全部冻结（updateFrame 按 dt 递减 countdownRemaining）
      this.race.countdownRemaining = RACE_COUNTDOWN_SECONDS
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
    // 低优①：P1 选赛道时同步刷新中央缩略图（分屏 P2 选赛道不覆盖 P1 预览）
    if (playerIndex === 0) {
      this.refreshTrackPreview(trackIndex)
      this.updateTrackBackground(trackIndex)
    }
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
      collisionFlash: this.collisionFlash,
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
    // 帧间状态写回（lastActivePlayer/boostActive/lastCollisionCount/collisionFlash 与惰性 DOM 元素缓存）
    this.lastActivePlayer = ur.lastActivePlayer
    this.boostActive = ur.boostActive
    this.lastCollisionCount = ur.lastCollisionCount
    this.collisionFlash = ur.collisionFlash
    this.challengeTimer = ur.challengeTimer
    this.challengeScore = ur.challengeScore
    this.boostBar = ur.boostBar
    // U-3（2026-08-05 审计修复）：触屏驾驶引导浮层在倒计时 GO 后显示（不再与倒计时重叠淡出）
    if (ur.countdownJustFinished) {
      this.showRacingTouchHint()
    }
    // M18：BOOST 未蓄能反馈——键盘按下 Space/Enter 且 charge<=0 且未激活时，#boost-bar 红闪 300ms
    if (
      this.phase === PHASE_RACING &&
      this.input.getP1Input().boost === true &&
      this.race.player1.boostCharge <= 0 &&
      !this.boostActive &&
      now - this.lastBoostDeniedAt > 300
    ) {
      this.lastBoostDeniedAt = now
      if (this.boostBar) {
        this.boostBar.classList.add('no-charge')
        const timer = globalThis.setTimeout(() => {
          this.boostBar?.classList.remove('no-charge')
        }, 300)
        if (timer && typeof timer === 'object' && typeof (timer as { unref?: () => void }).unref === 'function') {
          ;(timer as { unref: () => void }).unref()
        }
      }
    }
    if (!shouldScheduleNextFrame(ur.shouldRender)) {
      // 完赛/挑战限时触发 finish：等价旧帧内 return（跳过渲染与 rAF 自续）
      // M16：决策下沉 frame-pure 纯函数（frame-pure.test.ts 锁定 shouldRender 契约）
      // 2026-08-05：链断标记，回菜单/再开赛时 ensureLoop 重启（防画面冻结）
      this.loopRunning = false
      return
    }

    // 玩家实时转向输入（-1..1）：collectSteerInputs 与 updateFrame 同源路由（mode 合并
    // WASD+方向键/摇杆语义，2026-08-05 下沉纯函数），保证渲染倾斜与物理转向输入源一致——
    // 直接取 getP1Input 会漏掉方向键（P2 映射）在单屏合并输入中的转向分量，导致物理左移但车辆不倾斜
    let steer1 = 0
    let steer2 = 0
    if (this.phase === PHASE_RACING) {
      const steer = collectSteerInputs(
        {
          joystickActive: this.joystick.isActive(),
          joystickInput: this.joystick.getInput(),
          p1Input: this.input.getP1Input(),
          p2Input: this.input.getP2Input(),
        },
        this.mode.splitMode,
      )
      steer1 = steer.steer1
      steer2 = steer.steer2
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
      collisionFlash: this.collisionFlash,
      steer1,
      steer2,
    })
    this.minimap = rr.minimap
    // 2026-08-05 音频修复：引擎声仅 RACING 按车速调制——菜单/暂停不再以残留速度持续蜂鸣
    // （尤其完赛后 RAF 停摆会停在最后高速帧）；完赛/暂停的静音由 applyPhase silenceDriveSounds 兼顾
    if (this.phase === PHASE_RACING) {
      this.engineSound?.setSpeedRatio(this.race.player1.carState.speed / this.carConfig.maxSpeed)
    }
    requestAnimationFrame(this.frame)
  }

  /** 更新菜单背景色类（赛道主题：切换赛道时 .menu-bg 追加 track-xxx 类） */
  private updateTrackBackground(trackIndex: number): void {
    const menuBg =
      typeof document.querySelector === 'function' ? (document.querySelector('.menu-bg') as HTMLElement | null) : null
    if (!menuBg) return
    const def = TRACK_DEFS[trackIndex]
    if (!def) return
    // 移除所有 track-* 类，再添加当前赛道类
    menuBg.className = 'menu-bg'
    menuBg.classList.add(`track-${def.id}`)
  }

  /** 控制虚拟摇杆显隐：菜单阶段隐藏（防右下角圆环残留），比赛阶段显示 */
  private updateJoystickVisibility(isRacing: boolean): void {
    const base =
      typeof document.querySelector === 'function'
        ? (document.querySelector('.joystick-base') as HTMLElement | null)
        : null
    if (base) {
      base.hidden = !isRacing
    }
    if (typeof document.body?.classList?.toggle === 'function') {
      document.body.classList.toggle('racing', isRacing)
    }
  }

  /** 起步倒计时覆盖层：游戏开始 3 秒显示操作提示（3→2→1→GO；实现下沉 countdown.ts） */
  private startCountdown(): void {
    const overlay = document.getElementById('countdown-overlay')
    if (overlay) runCountdown(overlay)
  }

  /**
   * 触屏驾驶引导浮层（U-3：倒计时 GO 后触发，每局仅一次）：
   * 仅 hover:none 触屏设备显示，2s 淡出；文案取自 copy.ts 的 RACING_TOUCH_HINT。
   */
  private showRacingTouchHint(): void {
    if (this.hasShownRacingTouchHint) return
    this.hasShownRacingTouchHint = true
    const hint = this.screenElements.racingTouchHint
    if (hint && typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches) {
      const textEl = hint.querySelector<HTMLElement>('.racing-touch-hint-text')
      if (textEl) textEl.textContent = RACING_TOUCH_HINT
      hint.hidden = false
      hint.classList.add('show')
      const timer = globalThis.setTimeout(() => {
        hint.classList.remove('show')
        hint.hidden = true
      }, 2000)
      if (timer && typeof timer === 'object' && typeof (timer as { unref?: () => void }).unref === 'function') {
        ;(timer as { unref: () => void }).unref()
      }
    }
  }
}

/** 游戏入口：创建并启动主循环（main.ts 调用） */
export function initGame(): GameLoop {
  return new GameLoop()
}
