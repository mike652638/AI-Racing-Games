import './style.css'
import { Renderer } from './engine/renderer'
import { SEGMENT_LENGTH } from './engine/track'
import { createRoadsideSprites } from './engine/sprites'
import { createTrackFromDef, TRACK_DEFS, type TrackDef } from './engine/tracks'
import { createTraffic, updateTraffic } from './engine/traffic'
import { createCarConfig, updateCar } from './physics/car'
import { driftSpeedFactor, effectiveTurnRate, updateDrift } from './physics/drift'
import { createInputManager } from './game/input'
import { createRaceState, resetRaceState } from './game/state'
import { updateCollisions } from './game/collision'
import { JoystickUI } from './ui/joystick'
import { updateHud, type HudElements } from './ui/hud'
import { applyPhaseToScreens, type ScreenElements } from './ui/screens'
import { lapFromZ } from './ui/format'
import { loadBestTime } from './ui/save'
import { EngineSound } from './audio/engine'
import { MusicPlayer } from './audio/music'
import { PHASE_FINISHED, PHASE_MENU, PHASE_RACING, nextPhase, togglePause, type Phase } from './ui/gamestate'

/** 调试钩子类型：供自动化验证脚本读取运行时状态（与下方赋值保持同步） */
declare global {
  interface Window {
    __gameDebug?: {
      readonly audioState: AudioContextState | null
      readonly musicState: 'stopped' | 'running'
      readonly phase: Phase
      readonly driftActive: boolean
      readonly split: boolean
      readonly bestTime: number | null
      readonly trafficCount: number
      readonly collisions: number
      readonly selectedTrack: string
      readonly touchActive: boolean
    }
  }
}

const SPLIT_MODE = new URLSearchParams(window.location.search).has('split')

// ---- DOM 引用 ----
const $ = (id: string): HTMLElement => document.getElementById(id)!
const canvas = $('game') as HTMLCanvasElement
const hudContainer = $('hud') as HTMLDivElement
const hud2Container = $('hud2') as HTMLDivElement
const hudElements: HudElements = {
  hudContainer,
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
const screenElements: ScreenElements = {
  startScreen: $('start-screen') as HTMLDivElement,
  finishScreen: $('finish-screen') as HTMLDivElement,
  pauseScreen: $('pause-screen') as HTMLDivElement,
  finishTime: $('finish-time') as HTMLParagraphElement,
  finishSpeed: $('finish-speed') as HTMLParagraphElement,
  finishBest: $('finish-best') as HTMLParagraphElement,
  finishScore: $('finish-score') as HTMLParagraphElement,
  finishLaps: $('finish-laps') as HTMLDivElement,
}
hud2Container.hidden = !SPLIT_MODE
const trackName = $('track-name') as HTMLSpanElement
const trackOptions = [
  $('track-option-0') as HTMLDivElement,
  $('track-option-1') as HTMLDivElement,
  $('track-option-2') as HTMLDivElement,
]

// ---- 赛道 / 渲染 / 输入 ----
let selectedIndex = 0
let trackDef: TrackDef = TRACK_DEFS[0]
let track = createTrackFromDef(trackDef)
let lapLength = track.length * SEGMENT_LENGTH
let totalLaps = trackDef.laps
const carConfig = createCarConfig()
const race = createRaceState(createTraffic(lapLength))
const renderer = new Renderer(
  canvas, track, window.innerWidth, window.innerHeight, undefined,
  createRoadsideSprites(track), race.traffic,
)
const input = createInputManager(window)
const joystick = new JoystickUI()
joystick.attach(canvas)
let phase: Phase = PHASE_MENU
let engineSound: EngineSound | null = null
let music: MusicPlayer | null = null
let bestTime: number | null = loadBestTime(trackDef.id)
let last = performance.now()

/** 调试钩子：供自动化验证读取运行时状态 */
window.__gameDebug = {
  get audioState() { return engineSound?.state ?? null },
  get musicState() { return music?.state ?? 'stopped' },
  get phase() { return phase },
  get driftActive() { return race.player1.driftState.active },
  get split() { return SPLIT_MODE },
  get bestTime() { return bestTime },
  get trafficCount() { return race.traffic.length },
  get collisions() { return race.collisionCount },
  get selectedTrack() { return trackDef.id },
  get touchActive() { return joystick.isActive() },
}

// ---- 流程控制 ----
/** 重置对局：重建车流并同步渲染器车流引用 */
function resetRace(): void {
  resetRaceState(race, createTraffic(lapLength))
  renderer.setTraffic(race.traffic)
  last = performance.now()
  bestTime = loadBestTime(trackDef.id)
}

/** 阶段切换：屏幕显隐/结算由 screens 模块负责，main 负责记录刷新与菜单重置 */
function applyPhase(newPhase: Phase): void {
  phase = newPhase
  applyPhaseToScreens(screenElements, newPhase, race, carConfig, trackDef.id)
  if (newPhase === PHASE_FINISHED) bestTime = loadBestTime(trackDef.id)
  if (newPhase === PHASE_MENU) resetRace()
}

/** 切换赛道定义：重建 track/lapLength/totalLaps/景物/车流并重置对局 */
function applyTrack(index: number): void {
  selectedIndex = index
  trackDef = TRACK_DEFS[index]
  track = createTrackFromDef(trackDef)
  lapLength = track.length * SEGMENT_LENGTH
  totalLaps = trackDef.laps
  renderer.setTrack(track, createRoadsideSprites(track))
  resetRace()
  updateTrackSelect()
}

/** 更新选单高亮与赛道名 */
function updateTrackSelect(): void {
  trackName.textContent = trackDef.name
  trackOptions.forEach((option, i) => option.classList.toggle('selected', i === selectedIndex))
}

// ---- 事件 ----
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    applyPhase(togglePause(phase))
    return
  }
  if (phase === PHASE_MENU && e.code.startsWith('Digit')) {
    const index = Number(e.code.slice(5)) - 1
    if (index >= 0 && index < TRACK_DEFS.length) {
      applyTrack(index)
      return
    }
  }
  if (!engineSound) {
    const ctx = new AudioContext()
    engineSound = new EngineSound(ctx)
    engineSound.start()
    music = new MusicPlayer(ctx)
    music.start()
  }
  applyPhase(nextPhase(phase, lapFromZ(race.player1.cameraZ, lapLength), totalLaps))
})

function resize(): void {
  renderer.setViewport(canvas, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
}

// ---- 主循环 ----
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now

  if (phase === PHASE_RACING) {
    updateTraffic(race.traffic, dt, lapLength)
    const input1 = joystick.isActive() ? joystick.getInput() : input.getP1Input()
    const input2 = SPLIT_MODE ? input.getP2Input() : { throttle: 0, brake: false, steer: 0 }

    // P1 独立更新（车辆/漂移/相机/计时/圈速）
    const p1 = race.player1
    p1.driftState = updateDrift(dt, input1, p1.carState, carConfig, p1.driftState, p1.cameraZ)
    p1.carState.speed *= driftSpeedFactor(p1.driftState)
    updateCar(dt, input1, p1.carState, carConfig, effectiveTurnRate(carConfig, p1.driftState))
    p1.cameraZ += p1.carState.speed * dt
    p1.raceTime += dt

    const currentLap = lapFromZ(p1.cameraZ, lapLength)
    if (currentLap > race.lastLap) {
      race.lapTimes.push(p1.raceTime)
      race.lastLap = currentLap
    }

    // P2 独立更新（分屏时输入有效，否则零输入）
    const p2 = race.player2
    p2.driftState = updateDrift(dt, input2, p2.carState, carConfig, p2.driftState, p2.cameraZ)
    p2.carState.speed *= driftSpeedFactor(p2.driftState)
    updateCar(dt, input2, p2.carState, carConfig, effectiveTurnRate(carConfig, p2.driftState))
    p2.cameraZ += p2.carState.speed * dt
    p2.raceTime += dt

    updateCollisions(race, dt, SPLIT_MODE)

    const finishedP1 = lapFromZ(p1.cameraZ, lapLength) > totalLaps
    const finishedP2 = SPLIT_MODE && lapFromZ(p2.cameraZ, lapLength) > totalLaps
    if (finishedP1 || finishedP2) applyPhase(PHASE_FINISHED)
  }

  // 渲染：菜单阶段也渲染赛道预览（分屏左右两区域都渲染，修复 P2 黑屏）
  const w = window.innerWidth
  if (phase === PHASE_MENU) {
    if (SPLIT_MODE) {
      renderer.setCameraX(0)
      renderer.renderRegion(0, 0, w / 2, [], 0)
      renderer.renderRegion(0, w / 2, w / 2, [], 0)
    } else {
      renderer.setCameraX(0)
      renderer.render(0, [], 0)
    }
  }
  else if (SPLIT_MODE) {
    renderer.setCameraX(race.player1.carState.position)
    renderer.renderRegion(race.player1.cameraZ, 0, w / 2, race.player1.driftState.smoke, race.player1.raceTime)
    renderer.setCameraX(race.player2.carState.position)
    renderer.renderRegion(race.player2.cameraZ, w / 2, w / 2, race.player2.driftState.smoke, race.player2.raceTime)
  }
  else {
    renderer.setCameraX(race.player1.carState.position)
    renderer.render(race.player1.cameraZ, race.player1.driftState.smoke, race.player1.raceTime)
  }

  updateHud(hudElements, race, carConfig, bestTime, SPLIT_MODE, lapLength, totalLaps, phase)
  engineSound?.setSpeedRatio(race.player1.carState.speed / carConfig.maxSpeed)
  requestAnimationFrame(frame)
}

// ---- 启动 ----
window.addEventListener('resize', resize)
updateTrackSelect()
resize()
requestAnimationFrame(frame)
