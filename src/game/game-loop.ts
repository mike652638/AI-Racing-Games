import { Renderer, type RenderView } from '../engine/renderer'
import { createRoadsideSprites } from '../engine/sprites'
import { TRACK_DEFS, getTrackDef } from '../engine/tracks'
import { updateTraffic } from '../engine/traffic'
import { createCarConfig, updateCar, type CarConfig, type CarInput } from '../physics/car'
import { driftSpeedFactor, effectiveTurnRate, updateDrift } from '../physics/drift'
import { CollisionSound, EngineSound, RainSound } from '../audio/engine'
import { MusicPlayer } from '../audio/music'
import { WEATHER_CYCLE_SECONDS } from '../engine/lighting'
import { updateHud, type HudElements } from '../ui/hud'
import { JoystickUI } from '../ui/joystick'
import { applyPhaseToScreens, type ScreenElements } from '../ui/screens'
import { formatTime } from '../ui/format'
import { addDriftScore, addMatchResult, loadBestTime, loadBestTimeFor, loadDriftTop, loadMatchTop, recordWin, type WinStats } from '../ui/save'
import { createInputManager } from './input'
import { createRaceState, resetRaceState, type RaceState } from './state'
import { refreshTraffic, type TrackContext } from './track-context'
import { updateCollisions } from './collision'
import { TrackManager } from './track-manager'
import { installDebugHook } from './debug-hook'
import { lapFromZ } from './lap'
import { PHASE_FINISHED, PHASE_MENU, PHASE_PAUSED, PHASE_RACING, type Phase } from './phase'
import { nextPhase, togglePause } from './phase-logic'
import { BOOST_CHARGE_RATE, BOOST_DRAIN_RATE, CHALLENGE_SECONDS } from './constants'
import type { PlayerState } from './player-state'

/** 圈数记录包装已移除（H5）：updatePlayerFrame 现返回新 lastLap，调用方直接赋值 race.lastLap */

/**
 * BOOST 蓄力/消耗（G4，纯函数）：漂移激活期间按 BOOST_CHARGE_RATE 蓄力（封顶 1）；
 * inputBoost 按下且 charge > 0 时激活 boost 并按 BOOST_DRAIN_RATE 消耗（不越 0）。
 * 帧块调用后把返回的 boost 并入传给 updatePlayerFrame 的 input（{ ...input, boost }）。
 */
export function updateBoostCharge(
  charge: number,
  dt: number,
  inputBoost: boolean,
  driftActive: boolean,
): { charge: number; boost: boolean } {
  if (driftActive) {
    charge = Math.min(1, charge + dt * BOOST_CHARGE_RATE)
  }
  const boost = inputBoost && charge > 0
  if (boost) {
    charge = Math.max(0, charge - dt * BOOST_DRAIN_RATE)
  }
  return { charge, boost }
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

/** 主音量持久化 key（localStorage，存 0-1 字符串） */
const VOLUME_KEY = 'outrun-pseudo3d-volume'
/** 音乐/音效分级音量持久化 key（G7：独立于总音量的分轨控制） */
const MUSIC_VOLUME_KEY = 'outrun-pseudo3d-music-volume'
const SFX_VOLUME_KEY = 'outrun-pseudo3d-sfx-volume'

/**
 * 切换赛道时的预览起点：按赛道序号等分圈长（等分数 = TRACK_DEFS.length）。
 * 各赛道起点附近（z < 8000）都是直道，index*5000 无法区分不同赛道；
 * 按圈长 1/N 等分后落在不同曲率区段，预览画面差异明显。
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
    night: ctx.def.timeOfDay === 'night',
  }
}

/**
 * 单玩家一帧更新：漂移 → 速度修正 → 车辆运动学 → 相机推进 → 个人计时 → 圈数记录。
 * 纯函数式收敛 P1/P2 的重复更新逻辑；lapTimes 可选传入——
 * 分屏 P2 不参与圈速记录（保持原 main.ts 行为：仅 P1 记录 lapTimes）。
 * H5：返回「新 lastLap」——传入 lapTimes 时返回当前圈数（currentLap，过圈时已 push raceTime），
 * 未传 lapTimes 返回 1；wet（雨天物理，G3）上移为第 6 尾参。
 * H1：scoreMultiplier（挑战加成）为第 7 尾参，默认 1 时行为不变。
 */
export function updatePlayerFrame(
  dt: number,
  input: CarInput,
  player: PlayerState,
  carConfig: CarConfig,
  lapLength: number,
  lapTimes?: number[],
  wet = false,
  scoreMultiplier = 1,
): number {
  player.driftState = updateDrift(dt, input, player.carState, carConfig, player.driftState, player.cameraZ, scoreMultiplier)
  player.carState.speed *= driftSpeedFactor(player.driftState)
  updateCar(dt, input, player.carState, carConfig, effectiveTurnRate(carConfig, player.driftState), wet)
  player.cameraZ += player.carState.speed * dt
  player.raceTime += dt

  if (lapTimes !== undefined) {
    const currentLap = lapFromZ(player.cameraZ, lapLength)
    // lastLap 由 lapTimes 已有记录数推断（每次过圈 push 一条，圈数 = 条数 + 1），消除外部 { value } 桥接
    if (currentLap > lapTimes.length + 1) {
      lapTimes.push(player.raceTime)
    }
    return currentLap
  }
  return 1
}

/**
 * 游戏主循环：迁移自 main.ts 的全部运行时职责——DOM 引用、初始化、
 * 赛道切换、流程控制、事件监听、每帧更新/渲染编排、音频与调试钩子。
 */
export class GameLoop {
  private readonly splitMode: boolean
  /** 热座轮流模式（?hotseat=1）：双人先后跑同赛道比成绩；split 优先互斥 */
  private readonly hotseatMode: boolean
  /** 漂移挑战模式（?challenge=1）：60 秒限时刷分；与 split/hotseat 互斥 */
  private readonly challengeMode: boolean
  /** 挑战倒计时 HUD 元素（#challenge-timer，防御式缓存；显隐/文本由帧块处理） */
  private challengeTimer: HTMLDivElement | null = null
  /** BOOST 条 HUD 元素（#boost-bar，防御式缓存；宽度/显隐由帧块处理，G4） */
  private boostBar: HTMLDivElement | null = null
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
  /** 雨声环境音（音频惰性创建时实例化，雨段 start / 非雨段 stop，类内幂等） */
  private rainSound: RainSound | null = null
  /** 碰撞冲击音（音频惰性创建时实例化，collisionCount 增长时 play） */
  private collisionSound: CollisionSound | null = null
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
    this.hotseatMode = params.has('hotseat') && !this.splitMode
    // G1（G1）：挑战模式——限时刷分（60 秒收束），与分屏/热座互斥
    this.challengeMode = params.has('challenge') && !this.splitMode && !this.hotseatMode
    // P6（P6）：构造时读取持久化主音量（无效/不可用回退 0.6）；G7：分轨音量独立读取
    this.volume = this.loadVolume()
    this.musicVolume = this.loadMusicVolume()
    this.sfxVolume = this.loadSfxVolume()

    // 模式菜单提示（#menu-hint 由 index.html 提供）：分屏双键盘 / 热座轮流 / 挑战限时 / 默认单屏
    if (this.splitMode) {
      const menuHint = document.getElementById('menu-hint')
      if (menuHint) menuHint.textContent = 'P1: 1-9 选赛道 · P2: Shift+1-9 选赛道 · 按任意键开始'
    } else if (this.hotseatMode) {
      const menuHint = document.getElementById('menu-hint')
      if (menuHint) menuHint.textContent = 'P1 先跑 · 完成按回车交棒 P2 · 1-9 选赛道'
    } else if (this.challengeMode) {
      const menuHint = document.getElementById('menu-hint')
      if (menuHint) menuHint.textContent = '挑战模式：60 秒限时刷分 · 1-9 选赛道 · 任意键开始'
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
    }
    // P6（P6）：暂停菜单控件事件——音量 slider input → setVolume；重开按钮 click → 回菜单。
    // 元素恒存在（hidden 仅面板控制），input/click 监听在构造器绑定一次即可。
    const pauseVolume = this.screenElements.pauseVolume
    const pauseRestart = this.screenElements.pauseRestart
    if (pauseVolume) {
      pauseVolume.addEventListener('input', () => {
        this.setVolume(Number(pauseVolume.value) / 100)
      })
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
        this.setMusicVolume(Number(pauseMusicVolume.value) / 100)
      })
    }
    if (pauseSfxVolume) {
      pauseSfxVolume.addEventListener('input', () => {
        this.setSfxVolume(Number(pauseSfxVolume.value) / 100)
      })
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
    const trackOptions = Array.from(
      { length: TRACK_DEFS.length },
      (_, i) => $(`track-option-${i}`) as HTMLDivElement,
    )
    // 按钮文本：序号 + 名称 + 难度星级（★×difficulty + ☆×(3-difficulty)，覆盖 index.html 初始纯文本）
    trackOptions.forEach((option, i) => {
      const def = TRACK_DEFS[i]
      option.textContent = `${i + 1} ${def.name} ${'★'.repeat(def.difficulty)}${'☆'.repeat(3 - def.difficulty)}`
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
    window.addEventListener('resize', this.resize)
    this.resize()
    this.refreshDriftTop()
    this.refreshBestSummary()
    this.refreshMatchTop()
    requestAnimationFrame(this.frame)
  }

  /** 读取持久化主音量（0-1；localStorage 不可用/值无效回退 0.6，防御模式仿 save.ts getStorage） */
  private loadVolume(): number {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = window.localStorage.getItem(VOLUME_KEY)
        if (raw !== null) {
          const v = Number(raw)
          if (Number.isFinite(v)) {
            return Math.max(0, Math.min(1, v))
          }
        }
      }
    }
    catch {
      // localStorage 被禁用（隐私模式等）
    }
    return 0.6
  }

  /** 读取持久化音乐分轨音量（0-1；不可用/无效回退 0.8，G7） */
  private loadMusicVolume(): number {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = window.localStorage.getItem(MUSIC_VOLUME_KEY)
        if (raw !== null) {
          const v = Number(raw)
          if (Number.isFinite(v)) {
            return Math.max(0, Math.min(1, v))
          }
        }
      }
    }
    catch {
      // localStorage 被禁用
    }
    return 0.8
  }

  /** 读取持久化音效分轨音量（0-1；不可用/无效回退 1.0，G7） */
  private loadSfxVolume(): number {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = window.localStorage.getItem(SFX_VOLUME_KEY)
        if (raw !== null) {
          const v = Number(raw)
          if (Number.isFinite(v)) {
            return Math.max(0, Math.min(1, v))
          }
        }
      }
    }
    catch {
      // localStorage 被禁用
    }
    return 1.0
  }

  /** 设置音乐分轨音量：clamp 0-1、更新字段、musicGain 存在时立即生效、持久化 localStorage（G7） */
  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v))
    if (this.musicGain) {
      this.musicGain.gain.value = this.musicVolume
    }
    try {
      if (typeof localStorage !== 'undefined') {
        window.localStorage.setItem(MUSIC_VOLUME_KEY, String(this.musicVolume))
      }
    }
    catch {
      // localStorage 不可用时忽略持久化
    }
  }

  /** 设置音效分轨音量：clamp 0-1、更新字段、sfxGain 存在时立即生效、持久化 localStorage（G7） */
  setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v))
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxVolume
    }
    try {
      if (typeof localStorage !== 'undefined') {
        window.localStorage.setItem(SFX_VOLUME_KEY, String(this.sfxVolume))
      }
    }
    catch {
      // localStorage 不可用时忽略持久化
    }
  }

  /** 设置主音量：clamp 0-1、更新字段、masterGain 存在时立即生效、持久化 localStorage */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume
    }
    try {
      if (typeof localStorage !== 'undefined') {
        window.localStorage.setItem(VOLUME_KEY, String(this.volume))
      }
    }
    catch {
      // localStorage 不可用时忽略持久化
    }
  }

  /** 刷新菜单漂移 TOP10 榜单（#drift-top，菜单静态元素）：取前 5 条渲染，无记录显示占位文本 */
  private refreshDriftTop(): void {
    const el = document.getElementById('drift-top')
    if (!el) {
      return
    }
    const top = loadDriftTop().slice(0, 5)
    el.textContent =
      top.length === 0
        ? '暂无漂移记录'
        : top
            .map(
              (e, i) =>
                `${i + 1}. ${e.player} · ${e.score} 分 · ${getTrackDef(e.trackId)?.name ?? e.trackId}` +
                // H4（H4）：最高连击档位 → ` · 连击 x倍率`（1 + combo*0.25）；旧条目无 combo 不追加
                (e.combo ? ` · 连击 x${(1 + e.combo * 0.25).toFixed(2)}` : ''),
            )
            .join('\n')
  }

  /**
   * 刷新菜单各赛道 BEST 汇总（#best-summary，菜单静态元素）：遍历 TRACK_DEFS 读 P1/P2 最佳圈速，
   * 每行 `${i+1}. ${name}  P1 <时间>`（P2 有纪录追加 ` · P2 <时间>`；无纪录用 --）。
   * 全部赛道均无任何纪录时显示占位文本（与 #drift-top 的"暂无漂移记录"风格一致）。
   */
  private refreshBestSummary(): void {
    const el = document.getElementById('best-summary')
    if (!el) {
      return
    }
    const lines = TRACK_DEFS.map((def, i) => {
      const t1 = loadBestTimeFor(0, def.id)
      const t2 = loadBestTimeFor(1, def.id)
      const p1 = t1 !== null ? formatTime(t1) : '--'
      const p2 = t2 !== null ? ` · P2 ${formatTime(t2)}` : ''
      return `${i + 1}. ${def.name}  P1 ${p1}${p2}`
    })
    const hasAny = TRACK_DEFS.some(
      (def) => loadBestTimeFor(0, def.id) !== null || loadBestTimeFor(1, def.id) !== null,
    )
    el.textContent = hasAny ? lines.join('\n') : '暂无最佳成绩'
  }

  /**
   * 刷新菜单分屏漂移对局 TOP10（#match-top，菜单静态元素）：取前 MATCH_TOP_MAX 条渲染
   * （`${i+1}. ${winner} 胜 · ${p1Score}:${p2Score} · ${getTrackDef(trackId)?.name ?? trackId}`），
   * 无记录显示占位文本（仿 refreshDriftTop 模式）。
   */
  private refreshMatchTop(): void {
    const el = document.getElementById('match-top')
    if (!el) {
      return
    }
    const top = loadMatchTop()
    el.textContent =
      top.length === 0
        ? '暂无对局记录'
        : top
            .map(
              (e, i) =>
                `${i + 1}. ${e.winner} 胜 · ${e.p1Score}:${e.p2Score} · ${getTrackDef(e.trackId)?.name ?? e.trackId}`,
            )
            .join('\n')
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
    }
    const pauseBtn = this.hudElements.pauseBtn
    if (pauseBtn) {
      pauseBtn.hidden = newPhase !== PHASE_RACING
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
      this.refreshDriftTop()
      this.refreshMatchTop()
    }
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
        winStats,
        challengeMode: this.challengeMode,
      },
    )
    if (newPhase === PHASE_FINISHED) {
      this.bestTime = loadBestTime(this.trackManager.getTrackId(0))
      this.bestTime2 = loadBestTimeFor(1, this.trackManager.getTrackId(1))
    }
    if (newPhase === PHASE_MENU) {
      this.resetRace()
      this.refreshDriftTop()
      this.refreshBestSummary()
      this.refreshMatchTop()
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
          this.previewCameraZ[1] = initialPreviewCameraZ(
            digit - 1,
            this.race.tracks[1].lapLength,
          )
        }
        return
      }
      // 缺陷①修复：菜单阶段所有数字键一律吞掉，无效数字键静默忽略，不触发"任意键开始"
      return
    }
    // 缺陷修复：菜单阶段修饰键单独按下（如 P2 选赛道先按 Shift）不触发"任意键开始"
    if (
      this.phase === PHASE_MENU &&
      (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'ControlLeft' ||
        e.code === 'ControlRight' || e.code === 'AltLeft' || e.code === 'AltRight' ||
        e.code === 'MetaLeft' || e.code === 'MetaRight')
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
      const input1 = this.joystick.isActive() ? this.joystick.getInput() : this.input.getP1Input()
      const input2 = this.splitMode
        ? this.input.getP2Input()
        : { throttle: 0, brake: false, steer: 0 }

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
      updateCollisions(
        this.race,
        dt,
        this.splitMode || (this.hotseatMode && this.hotseatPlayer === 2),
      )
      // F4（F4）：碰撞计数增长 → 触发碰撞冲击音（CollisionSound 内部 80ms 防刷屏）
      if (this.race.collisionCount > this.lastCollisionCount) {
        this.collisionSound?.play()
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
