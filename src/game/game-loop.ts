import { Renderer, type BoostParticle } from '../engine/renderer'
import { createRoadsideSprites } from '../engine/sprites'
import { TRACK_DEFS } from '../engine/tracks'
import { type RouteDef } from '../engine/routes'
import { createCarConfig, type CarConfig } from '../physics/car'
import { type HudElements } from '../ui/hud'
import { JoystickUI, detectTouchPrimaryInput } from '../ui/joystick'
import { TouchQuadrantInput } from '../ui/touch-quadrant'
import { Minimap } from '../ui/minimap'
import { applyPhaseToScreens, applyPauseBranding, revealRacingTouchHint, type ScreenElements } from '../ui/screens'
import { loadBestTime, loadBestTimeFor, loadDaily } from '../ui/save'
import { COUNTDOWN_HINTS, COUNTDOWN_HINTS_TOUCH, COUNTDOWN_HINTS_TOUCH_SPLIT } from '../ui/copy'
import { rollDailyToToday, todayDateString } from './daily'
import { createAudioRig, destroyAudioRig, type AudioRig } from './audio-rig'
import type {
  BoostSound,
  CollisionSound,
  DriftSound,
  EngineSound,
  NearMissSound,
  RainSound,
  TireSound,
} from '../audio/engine'
import type { MusicPlayer } from '../audio/music'
import { runCountdown } from './countdown'
import { collectHudElements, collectScreenElements } from './dom-setup'
import { applyTrackPreview, updateMenuBackground } from './menu-preview'
import { createInputManager } from './input'
import { createRaceState, resetRaceState } from './state'
import type { RaceState } from '../shared/types'
import { refreshTraffic } from './track-context'
import { TrackManager } from './track-manager'
import { installDebugHook } from './debug-hook'
import { parseGameParams } from './game-params'
import { applyMenuChrome } from './menu-setup'
import {
  advanceRouteForkAlpha,
  hideRouteChoiceOverlay,
  initRouteRun,
  openRouteChoice,
  routeAdvanceAction,
  selectRouteBranch,
} from './route-choice'
import { maybeTriggerBoostDeniedFlash } from './boost-feedback'
import { buildTrackCards, nextGridTrackIndex } from './track-cards'
import { bindPauseControls, setStartBtnLoading } from './pause-controls'
import { lapFromZ } from '../shared/lap'
import { PHASE_FINISHED, PHASE_MENU, PHASE_PAUSED, PHASE_RACING, type Phase } from '../shared/phase'
import { nextPhase, togglePause } from '../shared/phase-logic'
import { CHALLENGE_SECONDS, RACE_COUNTDOWN_SECONDS } from '../shared/constants'
import type { WeatherOverride } from '../engine/lighting'
import type { RouteFork } from '../engine/guide-line'
import { refreshBestSummary, refreshDriftTop, refreshMatchTop, refreshMenuBoard } from './top-refresh'
// rt4 批次：DOM 交互工具模块（监听清理经 onCleanup 契约登记）
import { bindLeaderboardCards } from './leaderboard-cards'
import { bindPortraitMode } from './portrait-mode'
import { transitionScreenOut } from './screen-transition'
// Task E（Task E）：frame 更新/渲染段、模式策略与结算记账下沉至独立纯函数模块
import { accountFinish } from './finish-accounting'
import { updateFrame } from './frame-update'
import { renderFrame } from './frame-render'
import { collectSteerInputs, createModeStrategy, type ModeStrategy } from './mode-strategy'
import { loadMusicVolumeFromStorage, loadSfxVolumeFromStorage, loadVolumeFromStorage } from './volume'
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

/** 菜单方向键选赛道（3x3 网格导航方向键） */
const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']

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
  /**
   * 对局天气模式（M23 方案 11，URL `?weather=` 驱动）：
   * 'auto' 缺省三态时间循环；'random' 每局开局骰子（晴/雨/夜三选一）；
   * 'sunny'/'rain'/'night' 固定变体。startGame 时写入 race.weatherOverride。
   */
  private readonly weatherMode: WeatherOverride | 'random'
  /**
   * 车流橡皮筋动态难度（M23 方案 13，URL `?traffic=` 驱动）：
   * 'dynamic'（缺省）车流巡航速度随玩家速度平滑调整（快→提速保持挑战，慢→减速便于追赶）；
   * 'static' 固定车流速度（与旧版完全一致，simulate/bot 确定性路径不受影响）。
   */
  private readonly trafficDynamic: boolean
  /** M28 方案 10：导航辅助线强度（?guide=1 开启，0-1；缺省 0 关闭零绘制）。菜单预览不绘制 */
  private readonly guideStrength: number
  /** M28 方案 14：每日挑战模式（缺省启用；?daily=0 关闭，菜单进度/结算完成判定一并关闭） */
  private readonly dailyModeEnabled: boolean
  /**
   * M28 方案 9：路线模式（OutRun 式分段递进 + 岔路）。URL `?route=<id|1|2|3>` 驱动：
   * 每阶段复用一条赛道，玩家跑完该段 1 圈 → 段末岔路二选一 → 切换下一段赛道继续；
   * 终点段跑完完赛。全程累计用时/漂移得分（race.routeCumulative*）。
   */
  private readonly routeId: string | null
  /** 游玩模式策略（Task E）：输入路由/车流推进/碰撞范围/玩家更新/完赛判定/选赛道同步的下沉实现 */
  private readonly mode: ModeStrategy
  /** 挑战倒计时 HUD 元素（#challenge-timer，防御式缓存；显隐/文本由帧块处理） */
  private challengeTimer: HTMLDivElement | null = null
  /** 挑战模式实时得分 HUD 元素（#challenge-score，挑战模式竞赛中显示当前漂移得分） */
  private challengeScore: HTMLDivElement | null = null
  /** 每日挑战赛中徽章元素（#daily-badge，A2 惰性缓存；显隐/文本由帧块处理） */
  private dailyBadge: HTMLDivElement | null = null
  /** A2：当前赛道是否为今日挑战道（startGame 真正开局时计算；路线模式恒 false 保守隐藏） */
  private isDailyTrack = false
  /** BOOST 条 HUD 元素（#boost-bar，防御式缓存；宽度/显隐由帧块处理，G4） */
  private boostBar: HTMLDivElement | null = null
  /** 分屏 P2 BOOST 条 HUD 元素（#boost-bar-2，2026-08-08 实测修复：分屏时 P2 蓄能显示；防御式缓存） */
  private boostBar2: HTMLDivElement | null = null
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
  /** 单屏/热座/挑战：常驻摇杆；分屏：null（改用四分区触控） */
  private readonly joystick: JoystickUI | null
  /** 分屏四分区触控（P1 左半屏/P2 右半屏）；非分屏 null */
  private readonly touchQuadrant: TouchQuadrantInput | null
  private phase: Phase = PHASE_MENU
  private engineSound: EngineSound | null = null
  private music: MusicPlayer | null = null
  /** 雨声环境音（音频惰性创建时实例化，雨段 start / 非雨段 stop，类内幂等） */
  private rainSound: RainSound | null = null
  /** 碰撞冲击音（音频惰性创建时实例化，collisionCount 增长时 play） */
  private collisionSound: CollisionSound | null = null
  /** BOOST 氮气音效（音频惰性创建时实例化，boost 激活边沿触发 play） */
  private boostSound: BoostSound | null = null
  /** near-miss 贴身超车音效（P0：音频惰性创建时实例化，贴身超车触发时 play） */
  private nearMissSound: NearMissSound | null = null
  /** near-miss 弹出 HUD 元素缓存（#near-miss，P0 惰性获取；帧块触发时短暂显示 NEAR MISS!） */
  private nearMissEl: HTMLDivElement | null = null
  /** 漂移摩擦胎声（M15：音频惰性创建时实例化，漂移激活 start / 非激活 stop，随车速/转向/湿滑调制） */
  private driftSound: DriftSound | null = null
  /** 轻量胎噪（M15：音频惰性创建时实例化，常驻极低音量，随车速/转向/湿滑调制） */
  private tireSound: TireSound | null = null
  /** 音频装备束引用（R8：destroy 时 destroyAudioRig 释放持续音节点，防上下文占用） */
  private audioRig: AudioRig | null = null
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
  /** 菜单当前选中赛道（P1）：hover 预览临时切换后由 mouseleave 恢复显示该赛道（2026-08-06 P3-③） */
  private previewTrackIndex = 0
  private last = performance.now()
  /** 帧循环是否已调度 rAF（防重复调度导致双倍速）；完赛 return 时链断置 false，ensureLoop 重启（2026-08-05 音频/冻结修复） */
  private loopRunning = false
  /** 比赛中触屏驾驶引导浮层是否已显示（每局仅首次进入 RACING 触发一次） */
  private hasShownRacingTouchHint = false
  /** BOOST 未蓄能红闪反馈上一次触发时间（300ms 冷却，防止每帧重复） */
  private lastBoostDeniedAt = 0
  /** 当前帧循环 rAF 句柄（S 修复 S3：destroy 时 cancelAnimationFrame） */
  private rafId: number | null = null
  /** 起步倒计时取消函数（S 修复 S4：重复 startGame/离开菜单时取消，防并行 interval 叠加） */
  private countdownCancel: (() => void) | null = null
  /** M28 方案 9：当前路线定义缓存（routeId 非 null 时存在；段切换/完赛/结算读取） */
  private routeDef: RouteDef | null = null
  /** M28 方案 9：是否处于段末岔路选择（帧循环暂停物理更新并显示 #route-choice；选择后置 false） */
  private routeChoosing = false
  /** M28 方案 9 深化：岔路选择分叉渲染参数（beginRouteChoice 计算；chooseRouteBranch/applyPhase 清除） */
  private routeFork: RouteFork | null = null
  /** M28 方案 9 三次打磨：分叉引导带淡入动画进度（0-1，routeChoosing 期间逐帧递增；0 完全透明 / 1 完全显示） */
  private routeForkAlpha = 0
  /** 已注册的清理函数（S 修复 S3：destroy() 统一移除事件监听/取消定时器） */
  private readonly cleanups: Array<() => void> = []
  /** D3：destroy() 是否已执行——幂等守卫（二次调用直接返回）；frame 首行防御已排队旧帧回调不再自续 */
  private destroyed = false

  constructor() {
    const $ = (id: string): HTMLElement => document.getElementById(id)!
    // M34：URL 模式参数解析下沉 game-params.ts 纯函数（互斥判定与缺省回退集中于此，单测直接覆盖）
    const params = parseGameParams(new URLSearchParams(window.location.search))
    this.splitMode = params.splitMode
    this._perfMode = params.perfMode
    this.hotseatMode = params.hotseatMode
    this.challengeMode = params.challengeMode
    this.weatherMode = params.weatherMode
    this.trafficDynamic = params.trafficDynamic
    this.guideStrength = params.guideStrength
    this.dailyModeEnabled = params.dailyModeEnabled
    this.routeId = params.routeId
    // Task E（Task E）：模式策略——互斥且 split 优先的判定已在 game-params 完成，此处只接收已解析标志
    this.mode = createModeStrategy({
      splitMode: this.splitMode,
      hotseatMode: this.hotseatMode,
      challengeMode: this.challengeMode,
      routeMode: this.routeId !== null,
    })
    // P6（P6）：构造时读取持久化主音量（无效/不可用回退 0.6）；G7：分轨音量独立读取（Task D：委托 volume.ts 纯函数）
    this.volume = loadVolumeFromStorage()
    this.musicVolume = loadMusicVolumeFromStorage()
    this.sfxVolume = loadSfxVolumeFromStorage()
    // M34：菜单静态装饰装配（menu-hint/模式徽章/天气徽章/body 类/touch-hint/版本号）下沉 menu-setup.ts
    applyMenuChrome({
      mode: this.mode,
      weatherMode: this.weatherMode,
      routeId: this.routeId,
      getElement: (id) => document.getElementById(id),
      body: typeof document === 'object' ? document.body : null,
    })

    this.canvas = $('game') as HTMLCanvasElement

    const hud2Container = $('hud2') as HTMLDivElement
    hud2Container.hidden = !this.mode.splitMode
    this.hudElements = collectHudElements($, hud2Container)
    // M11：分屏模式下暂停按钮移至底部中央，避免遮挡右下虚拟摇杆
    if (this.mode.splitMode && this.hudElements.pauseBtn) {
      this.hudElements.pauseBtn.classList.add('split-center')
    }
    this.screenElements = collectScreenElements($)
    // P6（P6）：暂停菜单控件事件——音量 slider input → clamp+gain 同步+持久化；按钮 click → 阶段切换
    //（M34 下沉 pause-controls.ts bindPauseControls：元素/gain/音量 setter 经参数注入）
    bindPauseControls({
      screenElements: this.screenElements,
      hudElements: this.hudElements,
      getElement: (id) => document.getElementById(id),
      onCleanup: (fn) => this.onCleanup(fn),
      getPhase: () => this.phase,
      applyPhase: (phase) => this.applyPhase(phase),
      chooseRouteBranch: (dir) => this.chooseRouteBranch(dir),
      getGain: (track) => (track === 'master' ? this.masterGain : track === 'music' ? this.musicGain : this.sfxGain),
      setVolume: (track, v) => {
        if (track === 'master') this.volume = v
        else if (track === 'music') this.musicVolume = v
        else this.sfxVolume = v
        return v
      },
    })
    // 赛道选项元素：按 TRACK_DEFS 数量动态构建（新增赛道只需 append 定义与对应 HTML 按钮）；
    // M34 下沉 track-cards.ts buildTrackCards（星级/奖牌 DOM 构建与四类监听，回调注入式传递）
    const trackOptions = buildTrackCards({
      getElement: (id) => document.getElementById(id),
      isMenuPhase: () => this.phase === PHASE_MENU,
      onSelect: (i) => this.selectP1Track(i),
      getPreviewIndex: () => this.previewTrackIndex,
      onCleanup: (fn) => this.onCleanup(fn),
      applyPreview: applyTrackPreview,
    })

    // 赛道管理（依赖 resetRace 回调，均在构造完成后才使用）
    this.trackManager = new TrackManager({
      resetRace: () => this.resetRace(),
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
    // U-4（2026-08-05 审计）+ M21 修复（2026-08-08）：
    // 分屏模式触屏玩法为四分区触控（P1 左半屏/P2 右半屏，见 ui/touch-quadrant.ts），
    // 不创建常驻摇杆（防 P2 半屏语义混淆 + 消除"临时摇杆仅控 P1"的误导路径）；
    // 非分屏（单屏/热座/挑战）保持常驻摇杆方案。
    this.touchQuadrant = this.mode.splitMode ? new TouchQuadrantInput(true) : null
    this.touchQuadrant?.attach(this.canvas)
    this.joystick = this.mode.splitMode ? null : new JoystickUI()
    this.joystick?.attach(this.canvas)
    // 菜单阶段隐藏虚拟摇杆（右下角圆环），比赛阶段再显示
    this.updateJoystickVisibility(false)
    this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
    this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))

    // 赛道主题背景色（初始赛道 0）
    updateMenuBackground(0)

    this.installDebugSinks()

    // C+E 竖屏兼容（2026-08-05）：「竖屏继续 / 横屏体验」按钮与 portrait-mode 状态
    bindPortraitMode((fn) => this.onCleanup(fn))

    // M34：菜单板块整体刷新（漂移榜/BEST/对局榜/成就/每日进度；与回菜单共用 refreshMenuBoard）
    refreshMenuBoard(this.dailyModeEnabled)
    this.ensureLoop()

    // S 修复 S3：全局监听经清理函数登记（destroy() 时移除）
    window.addEventListener('keydown', this.onKeyDown)
    this.onCleanup(() => window.removeEventListener('keydown', this.onKeyDown))
    this.bindGlobalEvents()
    // M34：菜单板块整体刷新（漂移榜/BEST/对局榜/成就/每日进度；与回菜单共用 refreshMenuBoard）
    refreshMenuBoard(this.dailyModeEnabled)
    this.ensureLoop()
  }

  /** 登记清理函数（destroy() 时执行；绑定监听/定时器一律经此登记，S3） */
  private onCleanup(fn: () => void): void {
    this.cleanups.push(fn)
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
      weatherOverride: () => this.race.weatherOverride,
      weatherMode: () => this.weatherMode,
      // M23 方案 13：车流橡皮筋系数与开关（?traffic=dynamic 缺省 / static 关闭）
      trafficRubber: () => this.race.player1.trafficRubber,
      trafficDynamic: () => this.trafficDynamic,
      // M28 方案 10：导航辅助线强度（?guide=1 开启 / 缺省 0 关闭）
      guideStrength: () => this.guideStrength,
      // M28 方案 14：每日挑战存档状态快照（菜单刷新/完成判定用；供自动化验证）
      dailyState: () => rollDailyToToday(loadDaily(), todayDateString()),
      // M28 方案 9：路线模式状态（?route= 驱动；非路线模式 routeStageId=null）
      routeStageId: () => this.race.routeStageId,
      routeStageIndex: () => this.race.routeStageIndex,
      routeStageCount: () => this.race.routeStageCount,
      routeIsFinish: () => this.race.routeIsFinish,
      routeChoosing: () => this.routeChoosing,
      // M31 方案 9 三次打磨：分叉淡入动画进度（供自动化验证）
      routeForkAlpha: () => this.routeForkAlpha,
      p2TrafficZ: () => this.race.tracks[1].traffic[0]?.z ?? -1,
      bestTime: () => this.bestTime,
      bestTime2: () => this.bestTime2,
      trafficCount: () => this.race.tracks[0].traffic.length,
      collisions: () => this.race.collisionCount,
      collisionFlash: () => this.collisionFlash,
      selectedTrack: () => this.trackManager.getTrackId(0),
      selectedTrack2: () => this.trackManager.getTrackId(1),
      touchActive: () => this.joystick?.isActive() ?? this.touchQuadrant?.isP1Active() ?? false,
      volume: () => this.volume,
      rainPlaying: () => this.rainSound?.isPlaying() ?? false,
      // M23 方案 8：挑战剩余时间含检查点奖励（与 frame-update HUD / mode-strategy 完赛口径一致）
      challengeTimeLeft: () =>
        this.mode.challengeMode
          ? Math.max(0, CHALLENGE_SECONDS + this.race.player1.challengeBonus - this.race.player1.raceTime)
          : null,
      boostCharge: () => this.race.player1.boostCharge,
    })
  }

  /** 绑定全局事件：开始按钮 click（菜单阶段等价任意键开始）与 resize 视口同步 */
  private bindGlobalEvents(): void {
    // 开始按钮点击事件（支持鼠标/触屏）：菜单阶段点击"开始游戏"等价于按任意键开始；
    // 加载中（loading 态）忽略重复点击，防双触发
    const startBtn = document.getElementById('start-btn')
    if (startBtn) {
      const onStartClick = (): void => {
        if (this.phase !== PHASE_MENU || startBtn.classList.contains('loading')) return
        // M34：加载态下沉 pause-controls.ts setStartBtnLoading
        setStartBtnLoading(startBtn, true)
        this.startGame()
        // 短暂加载态后恢复（进入 RACING 后面板已隐藏，恢复仅影响返回菜单时）
        window.setTimeout(() => setStartBtnLoading(startBtn, false), 600)
      }
      startBtn.addEventListener('click', onStartClick)
      // S 修复 S3：监听经清理函数登记
      this.onCleanup(() => startBtn.removeEventListener('click', onStartClick))
    }
    bindLeaderboardCards(
      { driftTop: refreshDriftTop, matchTop: refreshMatchTop, bestSummary: refreshBestSummary },
      (fn) => this.onCleanup(fn),
    )
    window.addEventListener('resize', this.resize)
    // S 修复 S3：resize 监听经清理函数登记
    this.onCleanup(() => window.removeEventListener('resize', this.resize))
    this.resize()
  }

  /**
   * 当前模式下的渲染降级参数（Task 8）：分屏/性能模式返回降级档位，默认全效。
   * 委托纯函数 resolvePerformanceConfig（单测直接覆盖该函数；GameLoop 依赖 DOM 不便实例化）。
   */
  getPerformanceConfig(): PerformanceConfig {
    return resolvePerformanceConfig(this.mode.splitMode, this._perfMode)
  }

  /** 重置对局：清玩家状态与计数，重建双世界车流（渲染全部走 view 参数，renderer 不再持有车流引用）。
   *  M23 方案 11：weatherOverride 不在此重置——由 startGame 每局开局重骰/固定设置（热座交棒与回菜单保留当前变体） */
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
    // S 修复 S3：保存 rAF 句柄（destroy() 时 cancelAnimationFrame）
    this.rafId = requestAnimationFrame(this.frame)
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

  /** 阶段切换：屏幕显隐/结算由 screens 模块负责，本类负责记录刷新与菜单重置 */
  private applyPhase(newPhase: Phase): void {
    this.phase = newPhase
    // M28 方案 9：离开 RACING（暂停/完赛/回菜单）时清除岔路选择态与覆盖层（防残留冻结物理）
    if (newPhase !== PHASE_RACING) {
      this.routeChoosing = false
      this.routeFork = null
      this.routeForkAlpha = 0
      hideRouteChoiceOverlay((id) => document.getElementById(id))
    }
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
    // M21：分屏四分区触控同样在暂停时清空触点（防恢复首帧残留输入）
    if (newPhase === PHASE_PAUSED) {
      this.joystick?.reset()
      this.touchQuadrant?.reset()
      // M34：暂停标题按暂停玩家动态标注 + 赛道名填充（下沉 ui/screens.ts applyPauseBranding）
      const trackId = this.trackManager.getTrackId(0)
      const trackDef = TRACK_DEFS.find((d) => d.id === trackId)
      applyPauseBranding(this.screenElements, {
        splitMode: this.mode.splitMode,
        hotseatMode: this.mode.hotseatMode,
        lastActivePlayer: this.lastActivePlayer,
        hotseatPlayer: this.hotseatPlayer,
        trackName: trackDef?.name ?? '',
      })
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
      transitionScreenOut(this.screenElements.startScreen)
    }
    if (newPhase === PHASE_MENU) {
      transitionScreenOut(this.screenElements.finishScreen)
    }
    if (newPhase !== PHASE_PAUSED) {
      transitionScreenOut(this.screenElements.pauseScreen)
    }
    // U-3（2026-08-05 审计修复）：触屏驾驶引导浮层改由倒计时归零（GO）后触发——
    // 原实现在 applyPhase(RACING) 即显示，2s 淡出早于倒计时 GO（≈2.9s）导致引导失效；
    // 现由 frame 的 countdownJustFinished 边沿调用 showRacingTouchHint（见下）。
    // Task E（Task E）：结算记账下沉至 finish-accounting.ts 纯函数——
    // 完赛标记恒计算（applyPhaseToScreens 各阶段均需），记账写入仅首次进入完赛时执行（finishShown 守卫防重入）
    const firstFinish = newPhase === PHASE_FINISHED && !this.race.finishShown
    const {
      finishedP1,
      finishedP2,
      driftWinner,
      winStats,
      driftRankP1,
      medalP1,
      medalP2,
      newlyUnlockedAchievements,
      dailyDoneToday,
    } = accountFinish({
      race: this.race,
      trackManager: this.trackManager,
      mode: this.mode,
      hotseatPlayer: this.hotseatPlayer,
      prevP1Time: this.prevP1Time,
      record: firstFinish,
      // M28 方案 14：每日挑战模式开关（?daily=0 关闭；缺省启用）
      dailyModeEnabled: this.dailyModeEnabled,
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
      // M23 方案 7：本局判定的赛道奖牌（S/A/B，screens 在结算行展示）
      medalP1,
      medalP2,
      // M23 方案 6：本局新解锁成就（结算行展示「新成就达成」）
      newlyUnlockedAchievements,
      // M28 方案 9：路线模式结算（累计总用时/总分，无单赛道语义）
      routeMode: this.mode.routeMode,
      routeName: this.routeDef?.name,
      // M28 方案 14：本局完成今日挑战（结算行展示）
      dailyDoneToday,
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
      // S 修复 S4：返回菜单时取消未完成倒计时（防止残留 interval 在下一局继续叠加）
      this.countdownCancel?.()
      this.countdownCancel = null
      // 菜单阶段隐藏虚拟摇杆（右下角圆环）
      this.updateJoystickVisibility(false)
      // M34：菜单板块整体刷新（漂移榜/BEST/对局榜/成就/每日进度）
      refreshMenuBoard(this.dailyModeEnabled)
    }
  }

  /**
   * 销毁实例（S 修复 S3 + D3 生命周期管理）：取消帧循环与倒计时定时器、移除全部已登记
   * 事件监听、释放输入管理/摇杆/持续音效。用于测试隔离与热重载；
   * 幂等——destroyed 标志守卫，二次调用直接返回；destroy 后已排队旧帧回调即使仍被驱动
   * （cancelAnimationFrame 竞态）亦因 frame 首行守卫不再自续 rAF。
   */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    // 1. 取消帧循环：已排队 rAF 回调即使仍被驱动，frame 首行 destroyed 守卫不再自续
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.loopRunning = false

    // 2. 移除自身注册的事件监听：window keydown/resize 与各元素监听（start-btn/轨道卡/音量
    //    slider/暂停按钮/榜单卡片/竖屏按钮等）经 cleanups 统一移除——onKeyDown/resize 均为
    //    具名私有引用，与注册时同一函数引用，removeEventListener 可正确配对；input manager
    //    的 window keydown/keyup 经 input.destroy() 移除
    this.cleanups.forEach((fn) => {
      try {
        fn()
      } catch {
        // 单项清理失败不影响其余（测试 stub 元素可能缺少 removeEventListener）
      }
    })
    this.cleanups.length = 0
    this.input.destroy()

    // 3. 取消起步倒计时计时器（runCountdown 的 interval 与隐藏 timeout）
    this.countdownCancel?.()
    this.countdownCancel = null

    // 4. 静音持续音（引擎/漂移胎声/胎噪/雨声）
    this.silenceDriveSounds(true)

    // 5. 摇杆：清残留输入（detach 内部已含 reset，此处显式调用保证 destroy 契约，幂等无害）+
    //    解除 pointer 监听并移除 DOM；分屏四分区触控同走 detach
    this.joystick?.reset()
    this.joystick?.detach()
    this.touchQuadrant?.detach()

    // 6. 释放音频装备束（引擎/胎噪 destroy，防音频上下文占用；雨声等 stop 即停源）
    if (this.audioRig) {
      try {
        destroyAudioRig(this.audioRig)
      } catch {
        // 单项清理失败不影响其余（测试 stub 节点可能缺少 disconnect）
      }
      this.audioRig = null
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // M28 方案 9：岔路选择按键优先——routeChoosing 时 A/D/←/→ 选择路线，其余键忽略
    // （Escape 在岔路选择中不触发暂停，避免选择态被暂停菜单打断）
    if (this.routeChoosing) {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        this.chooseRouteBranch('left')
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        this.chooseRouteBranch('right')
      }
      return
    }
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
      // M34：3x3 网格导航目标计算下沉 track-cards.ts nextGridTrackIndex（左右 ±1、上下 ±3，越界 clamp）
      const cur = this.trackManager.getSelectedIndex(0)
      const next = nextGridTrackIndex(e.code, cur, 3, TRACK_DEFS.length)
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
      this.audioRig = rig
      this.masterGain = rig.masterGain
      this.musicGain = rig.musicGain
      this.sfxGain = rig.sfxGain
      this.engineSound = rig.engineSound
      this.music = rig.music
      this.rainSound = rig.rainSound
      this.collisionSound = rig.collisionSound
      this.boostSound = rig.boostSound
      this.nearMissSound = rig.nearMissSound
      this.driftSound = rig.driftSound
      this.tireSound = rig.tireSound
    }
    // 菜单阶段隐藏摇杆，比赛阶段显示
    this.updateJoystickVisibility(true)
    // 起步倒计时覆盖层（3→2→1→GO，同时显示操作提示）——仅菜单阶段真正开始游戏时触发一次；
    // onKeyDown 末尾兜底在 RACING/FINISHED 阶段按任意键也会调用 startGame（原有"任意键开始"行为），
    // 若无条件调用会致驾驶中按键反复弹出倒计时覆盖层，故以 phase === PHASE_MENU 守卫
    if (this.phase === PHASE_MENU) {
      // M23 方案 11：开局天气变体——random 骰子三选一（晴/雨/夜），固定变体直接设置，auto 保持时间循环。
      // 仅真正开局（菜单阶段）设置一次；RACING/FINISHED 阶段按任意键兜底调用不重骰。
      this.race.weatherOverride =
        this.weatherMode === 'random'
          ? (['sunny', 'rain', 'night'] as const)[Math.floor(Math.random() * 3)]
          : this.weatherMode
      // M28 方案 9：路线模式开局初始化——加载路线定义、置起始阶段、切换到起始段赛道并重置对局
      //（下沉 route-choice.ts initRouteRun）。仅菜单阶段（真正开局）执行；RACING/FINISHED 兜底
      // 调用不重初始化（段切换由 routeStageAdvance 驱动）。
      if (this.mode.routeMode && this.routeId !== null) {
        const { routeDef, startTrackIndex } = initRouteRun(this.routeId, this.race)
        this.routeDef = routeDef
        if (startTrackIndex >= 0) {
          // 起始段赛道：切换赛道（触发 resetRace 与渲染缓存重建）
          this.selectTrackFor(0, startTrackIndex)
        }
      }
      // A2：每日挑战赛中徽章——当前赛道 == 今日赛道才显示（?daily=0 关闭时不显示；
      // 路线模式段切换会换赛道，重算复杂，保守隐藏徽章避免与实际赛道不符）。
      this.isDailyTrack =
        !this.mode.routeMode &&
        this.dailyModeEnabled &&
        this.trackManager.getTrackId(0) === rollDailyToToday(loadDaily(), todayDateString()).trackId
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
      this.previewTrackIndex = trackIndex
      applyTrackPreview(trackIndex)
      updateMenuBackground(trackIndex)
    }
    // Task A 缓存激活：赛道切换后重建道路段离屏缓存（race.tracks 引用已更新，
    // 传新 TrackContext 的预计算字段使 viewFor 的 track 与 renderer.cachedTrack 同引用）
    this.syncRendererTrack(playerIndex)
  }

  /**
   * M28 方案 9：进入段末岔路选择——累计当前段时间/得分到 routeCumulative*（供结算总用时/总分），
   * 显示 #route-choice 覆盖层（冻结物理：帧循环在 routeChoosing=true 时仍走 updateFrame 但
   * updateFrame 检测到 phase RACING + routeChoosing？不——routeChoosing 由 frame() 检查，
   * 选择期间 cameraZ 已超圈，P1 继续加速无碍（段末判定已消费），玩家选路后切段重置）。
   */
  private beginRouteChoice(): void {
    this.routeChoosing = true
    // M28 方案 9 三次打磨：重置分叉淡入动画进度（每次进入岔路选择从 0 开始淡入）
    this.routeForkAlpha = 0
    // 覆盖层 DOM 填充与分叉渲染参数计算下沉 route-choice.ts openRouteChoice
    const { fork, overlayMissing } = openRouteChoice({
      routeDef: this.routeDef,
      race: this.race,
      getElement: (id) => document.getElementById(id),
    })
    if (overlayMissing) {
      // 覆盖层缺失（测试 stub 环境）：无法交互 → 直接取左路继续（防卡死）
      this.chooseRouteBranch('left')
      return
    }
    this.routeFork = fork
  }

  /**
   * M28 方案 9：选择岔路方向（left/right）→ 累计当前段时间/得分 → 切换到下一段赛道
   * （selectTrackFor 触发 resetRace 清本段计时，routeCumulative* 保留）→ 更新段状态 → 继续 RACING。
   * 无该方向出口（终段/单出口缺省）时不动作。
   */
  private chooseRouteBranch(dir: 'left' | 'right'): void {
    // 累计本段时间/得分 + 段状态更新下沉 route-choice.ts selectRouteBranch（纯计算）
    const result = selectRouteBranch({ routeDef: this.routeDef, race: this.race, dir })
    if (!result) return
    // 切到下一段赛道（触发 resetRace 清本段玩家状态/计时，保留 routeCumulative* 与 routeStage*）
    this.selectTrackFor(0, result.trackIndex)
    this.routeChoosing = false
    this.routeFork = null
    this.routeForkAlpha = 0
    hideRouteChoiceOverlay((id) => document.getElementById(id))
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
    // D3：destroy 后不再执行帧逻辑/自续（已排队旧帧回调竞态防御；destroy 前恒 false 零行为改变）
    if (this.destroyed) return
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
      dailyBadge: this.dailyBadge,
      isDailyTrack: this.isDailyTrack,
      boostBar: this.boostBar,
      boostBar2: this.boostBar2,
      nearMissEl: this.nearMissEl,
      rainSound: this.rainSound,
      boostSound: this.boostSound,
      collisionSound: this.collisionSound,
      nearMissSound: this.nearMissSound,
      // M15（M15）：漂移摩擦胎声与胎噪注入帧块驱动（未惰性创建为 null 时 updateFrame 安全 no-op）
      driftSound: this.driftSound,
      tireSound: this.tireSound,
      input: this.input,
      joystick: this.joystick,
      touchQuadrant: this.touchQuadrant ?? undefined,
      onFinish: () => this.applyPhase(PHASE_FINISHED),
      // M23 方案 13：车流橡皮筋动态难度开关（?traffic=dynamic 缺省 / ?traffic=static 关闭）
      trafficDynamic: this.trafficDynamic,
    })
    // 帧间状态写回（lastActivePlayer/boostActive/lastCollisionCount/collisionFlash 与惰性 DOM 元素缓存）
    this.lastActivePlayer = ur.lastActivePlayer
    this.boostActive = ur.boostActive
    this.lastCollisionCount = ur.lastCollisionCount
    this.collisionFlash = ur.collisionFlash
    this.challengeTimer = ur.challengeTimer
    this.challengeScore = ur.challengeScore
    this.dailyBadge = ur.dailyBadge
    this.boostBar = ur.boostBar
    this.boostBar2 = ur.boostBar2 ?? null
    this.nearMissEl = ur.nearMissEl
    // U-3（2026-08-05 审计修复）：触屏驾驶引导浮层在倒计时 GO 后显示（不再与倒计时重叠淡出）
    if (ur.countdownJustFinished) {
      this.showRacingTouchHint()
    }
    // M18：BOOST 未蓄能反馈——键盘按下 Space/Enter 且 charge<=0 且未激活时，#boost-bar 红闪 300ms
    //（M34 下沉 boost-feedback.ts maybeTriggerBoostDeniedFlash：冷却窗口 + unref 兼容计时收敛）
    this.lastBoostDeniedAt = maybeTriggerBoostDeniedFlash({
      phase: this.phase,
      now,
      inputBoost: this.input.getP1Input().boost === true,
      boostCharge: this.race.player1.boostCharge,
      boostActive: this.boostActive,
      lastDeniedAt: this.lastBoostDeniedAt,
      boostBar: this.boostBar,
    })
    if (!shouldScheduleNextFrame(ur.shouldRender)) {
      // 完赛/挑战限时触发 finish：等价旧帧内 return（跳过渲染与 rAF 自续）
      // M16：决策下沉 frame-pure 纯函数（frame-pure.test.ts 锁定 shouldRender 契约）
      // 2026-08-05：链断标记，回菜单/再开赛时 ensureLoop 重启（防画面冻结）
      this.loopRunning = false
      this.rafId = null
      return
    }

    // M28 方案 9：路线模式段末检测——RACING 且非岔路选择中，P1 跑完当前段 1 圈（lapFromZ > 1）时：
    // 终点段 → 累计本段时间/得分后完赛；非终点段 → 进入岔路选择覆盖层（冻结物理，等玩家选路）。
    // 判定下沉 route-choice.ts routeAdvanceAction（置于 shouldRender 检查后——段末必在 GO 后
    // 正常渲染帧，渲染段仍走 RACING 显示当前赛道画面）。
    if (this.phase === PHASE_RACING && this.mode.routeMode && !this.routeChoosing) {
      const action = routeAdvanceAction(
        this.race,
        lapFromZ(this.race.player1.cameraZ, this.trackManager.getLapLength(0)) > 1,
      )
      if (action === 'finish') {
        // 终点段跑完 → 累计最后段时间/得分并完赛（accountFinish 在 FINISHED 块按 route 分支再累加，
        // 此处预累加当前段——注意 accountFinish 已处理累计，此分支不重复累加）
        this.applyPhase(PHASE_FINISHED)
        return
      }
      if (action === 'choice') {
        this.beginRouteChoice()
      }
    }
    // M28 方案 9 三次打磨：分叉淡入动画——routeChoosing 期间 forkAlpha 逐帧递增至 1
    // （约 0.3s 淡入；不抢帧率，纯渲染层进度状态，无物理/确定性影响）
    if (this.phase === PHASE_RACING && this.routeChoosing && this.routeFork) {
      this.routeForkAlpha = advanceRouteForkAlpha(this.routeForkAlpha, dt)
    }

    // 玩家实时转向输入（-1..1）：优先复用更新段已路由的输入（S 修复 P4：消除帧内二次
    // routeInputs——collectSteerInputs 与 updateFrame 同源，结果完全一致）；倒计时冻结窗口
    // 提前返回未提供 steer 时回退 collectSteerInputs（保持渲染倾斜输入源可用）
    let steer1 = 0
    let steer2 = 0
    if (this.phase === PHASE_RACING) {
      if (ur.steer1 !== undefined && ur.steer2 !== undefined) {
        steer1 = ur.steer1
        steer2 = ur.steer2
      } else {
        const steer = collectSteerInputs(
          {
            touchQuadrant: this.touchQuadrant ?? undefined,
            joystickActive: this.joystick?.isActive() ?? false,
            joystickInput: this.joystick?.getInput() ?? { throttle: 0, brake: false, steer: 0 },
            p1Input: this.input.getP1Input(),
            p2Input: this.input.getP2Input(),
          },
          this.mode.splitMode,
        )
        steer1 = steer.steer1
        steer2 = steer.steer2
      }
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
      // M28 方案 10：导航辅助线强度（?guide=1 开启 / 缺省 0 关闭）
      guideStrength: this.guideStrength,
      // M28 方案 9 深化：岔路选择分叉渲染参数（routeChoosing 时非 null）
      routeFork: this.routeFork,
      // M28 方案 9 三次打磨：分叉淡入动画进度（0-1，routeChoosing 期间逐帧递增）
      routeForkAlpha: this.routeForkAlpha,
    })
    this.minimap = rr.minimap
    // 2026-08-05 音频修复：引擎声仅 RACING 按车速调制——菜单/暂停不再以残留速度持续蜂鸣
    // （尤其完赛后 RAF 停摆会停在最后高速帧）；完赛/暂停的静音由 applyPhase silenceDriveSounds 兼顾
    if (this.phase === PHASE_RACING) {
      this.engineSound?.setSpeedRatio(this.race.player1.carState.speed / this.carConfig.maxSpeed)
    }
    // S 修复 S3：保存 rAF 句柄（destroy() 时 cancelAnimationFrame）
    this.rafId = requestAnimationFrame(this.frame)
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

  /** 起步倒计时覆盖层：游戏开始 3 秒显示操作提示（3→2→1→GO；实现下沉 countdown.ts）。
   *  2026-08-08 小米 13 Ultra 横屏专项实测修复：触屏设备不再显示键盘文案——
   *  单屏触屏显示摇杆指引（COUNTDOWN_HINTS_TOUCH）、分屏触屏显示四分区指引
   *  （COUNTDOWN_HINTS_TOUCH_SPLIT），键盘玩家沿用 COUNTDOWN_HINTS。
   *  S 修复 S4：先取消上一次未完成倒计时（防重复 startGame 叠加并行 interval），句柄存入字段供 destroy 取消 */
  private startCountdown(): void {
    const overlay = document.getElementById('countdown-overlay')
    if (overlay) {
      this.countdownCancel?.()
      const touch = detectTouchPrimaryInput()
      const hints = touch
        ? this.mode.splitMode
          ? COUNTDOWN_HINTS_TOUCH_SPLIT
          : COUNTDOWN_HINTS_TOUCH
        : COUNTDOWN_HINTS
      this.countdownCancel = runCountdown(overlay, hints).cancel
    }
  }

  /**
   * 触屏驾驶引导浮层（U-3：倒计时 GO 后触发，每局仅一次）：
   * 仅 hover:none 触屏设备显示，2s 淡出；DOM/文案逻辑下沉 ui/screens.ts revealRacingTouchHint。
   */
  private showRacingTouchHint(): void {
    if (this.hasShownRacingTouchHint) return
    this.hasShownRacingTouchHint = true
    const hint = this.screenElements.racingTouchHint
    if (hint) {
      revealRacingTouchHint(hint, this.mode.splitMode)
    }
  }
}

/** 游戏入口：创建并启动主循环（main.ts 调用） */
export function initGame(): GameLoop {
  return new GameLoop()
}
