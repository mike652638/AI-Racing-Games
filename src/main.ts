import { Renderer } from './engine/renderer'
import { SEGMENT_LENGTH } from './engine/track'
import { createRoadsideSprites } from './engine/sprites'
import { createTrackFromDef, TRACK_DEFS, type TrackDef } from './engine/tracks'
import { collideWithPlayer, createTraffic, updateTraffic } from './engine/traffic'
import { createCarConfig, updateCar, type CarState } from './physics/car'
import {
  createDriftState,
  driftSpeedFactor,
  effectiveTurnRate,
  updateDrift,
} from './physics/drift'
import {
  inputFromKeys,
  PLAYER1_MAPPING,
  PLAYER2_MAPPING,
} from './physics/input'
import { formatSpeed, formatTime, formatLap, lapFromZ } from './ui/format'
import { loadBestTime, saveBestTime } from './ui/save'
import { EngineSound } from './audio/engine'
import {
  nextPhase,
  PHASE_MENU,
  PHASE_RACING,
  PHASE_FINISHED,
  type Phase,
} from './ui/gamestate'

const SPLIT_MODE = new URLSearchParams(window.location.search).has('split')

const canvas = document.getElementById('game') as HTMLCanvasElement
const hudBest = document.getElementById('hud-best') as HTMLDivElement
const hudSpeed = document.getElementById('hud-speed') as HTMLDivElement
const hudLap = document.getElementById('hud-lap') as HTMLDivElement
const hudTime = document.getElementById('hud-time') as HTMLDivElement
const hudSpeed2 = document.getElementById('hud-speed-2') as HTMLDivElement
const hudLap2 = document.getElementById('hud-lap-2') as HTMLDivElement
const hudTime2 = document.getElementById('hud-time-2') as HTMLDivElement
const driftIndicator = document.getElementById('drift-indicator') as HTMLDivElement
const driftScoreValue = document.getElementById('drift-score-value') as HTMLSpanElement
const finishScore = document.getElementById('finish-score') as HTMLParagraphElement
const hud2 = document.getElementById('hud2') as HTMLDivElement
hud2.hidden = !SPLIT_MODE
const startScreen = document.getElementById('start-screen') as HTMLDivElement
const finishScreen = document.getElementById('finish-screen') as HTMLDivElement
const finishTime = document.getElementById('finish-time') as HTMLParagraphElement
const finishSpeed = document.getElementById('finish-speed') as HTMLParagraphElement
const finishBest = document.getElementById('finish-best') as HTMLParagraphElement
const trackName = document.getElementById('track-name') as HTMLSpanElement
const trackOptions = [
  document.getElementById('track-option-0') as HTMLDivElement,
  document.getElementById('track-option-1') as HTMLDivElement,
  document.getElementById('track-option-2') as HTMLDivElement,
]

let selectedIndex = 0
let trackDef: TrackDef = TRACK_DEFS[0]
let track = createTrackFromDef(trackDef)
let lapLength = track.length * SEGMENT_LENGTH
let totalLaps = trackDef.laps
const renderer = new Renderer(
  canvas,
  track,
  window.innerWidth,
  window.innerHeight,
  undefined,
  createRoadsideSprites(track),
  createTraffic(lapLength),
)

const carConfig = createCarConfig()
const carState: CarState = { position: 0, speed: 0 }
const carState2: CarState = { position: 0, speed: 0 }
let driftState = createDriftState()
let driftState2 = createDriftState()

const pressed = new Set<string>()
let phase: Phase = PHASE_MENU
let engineSound: EngineSound | null = null
let finishShown = false

let cameraZ = 0
let cameraZ2 = 0
let raceTime = 0
let raceTime2 = 0
let bestTime: number | null = loadBestTime()
let traffic = createTraffic(lapLength)
let collisionCount = 0
let collisionCooldown = 0
let last = performance.now()

/** 调试钩子：供自动化验证读取运行时状态 */
;(window as unknown as Record<string, unknown>).__gameDebug = {
  get audioState(): AudioContextState | null {
    return engineSound?.state ?? null
  },
  get phase(): Phase {
    return phase
  },
  get driftActive(): boolean {
    return driftState.active
  },
  get split(): boolean {
    return SPLIT_MODE
  },
  get bestTime(): number | null {
    return bestTime
  },
  get trafficCount(): number {
    return traffic.length
  },
  get collisions(): number {
    return collisionCount
  },
  get selectedTrack(): string {
    return trackDef.id
  },
}

/** 切换赛道定义：重建 track/lapLength/totalLaps/景物/车流并重置对局 */
function applyTrack(index: number): void {
  selectedIndex = index
  trackDef = TRACK_DEFS[index]
  track = createTrackFromDef(trackDef)
  lapLength = track.length * SEGMENT_LENGTH
  totalLaps = trackDef.laps
  renderer.setTrack(track, createRoadsideSprites(track))
  traffic = createTraffic(lapLength)
  resetRace()
  updateTrackSelect()
}

/** 更新选单高亮与赛道名 */
function updateTrackSelect(): void {
  trackName.textContent = trackDef.name
  trackOptions.forEach((option, i) => {
    option.classList.toggle('selected', i === selectedIndex)
  })
}

function resetRace(): void {
  carState.position = 0
  carState.speed = 0
  carState2.position = 0
  carState2.speed = 0
  driftState = createDriftState()
  driftState2 = createDriftState()
  cameraZ = 0
  cameraZ2 = 0
  raceTime = 0
  raceTime2 = 0
  last = performance.now()
  finishShown = false
  bestTime = loadBestTime()
  traffic = createTraffic(lapLength)
  collisionCount = 0
  collisionCooldown = 0
}

function applyPhase(newPhase: Phase): void {
  phase = newPhase
  if (phase === PHASE_MENU) {
    startScreen.hidden = false
    finishScreen.hidden = true
    resetRace()
  }
  else if (phase === PHASE_RACING) {
    startScreen.hidden = true
    finishScreen.hidden = true
  }
  else if (phase === PHASE_FINISHED) {
    finishScreen.hidden = false
    if (!finishShown) {
      finishShown = true
      const avgSpeed = cameraZ / Math.max(raceTime, 0.001)
      finishTime.textContent = `总用时 ${formatTime(raceTime)}`
      finishSpeed.textContent = `平均速度 ${formatSpeed(avgSpeed, carConfig.maxSpeed)} km/h`
      const isRecord = saveBestTime(raceTime)
      bestTime = loadBestTime()
      if (isRecord) {
        finishBest.textContent = 'NEW RECORD!'
      }
      else {
        finishBest.textContent = `最佳 ${formatTime(bestTime ?? raceTime)}`
      }
      finishScore.textContent = `漂移得分 ${Math.round(driftState.score)}`
    }
  }
}

window.addEventListener('keydown', (e) => {
  pressed.add(e.code)
  if (phase === PHASE_MENU && e.code.startsWith('Digit')) {
    const index = Number(e.code.slice(5)) - 1
    if (index >= 0 && index < TRACK_DEFS.length) {
      applyTrack(index)
      return
    }
  }
  if (!engineSound) {
    engineSound = new EngineSound(new AudioContext())
    engineSound.start()
  }
  applyPhase(nextPhase(phase, lapFromZ(cameraZ, lapLength), totalLaps))
})
window.addEventListener('keyup', (e) => {
  pressed.delete(e.code)
})

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  renderer.setViewport(canvas, window.innerWidth, window.innerHeight, dpr)
}

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now

  if (phase === PHASE_RACING) {
    updateTraffic(traffic, dt, lapLength)

    const input1 = inputFromKeys(pressed, PLAYER1_MAPPING)
    const input2 = SPLIT_MODE
      ? inputFromKeys(pressed, PLAYER2_MAPPING)
      : { throttle: 0, brake: false, steer: 0 }

    driftState = updateDrift(dt, input1, carState, carConfig, driftState, cameraZ)
    carState.speed *= driftSpeedFactor(driftState)
    updateCar(dt, input1, carState, carConfig, effectiveTurnRate(carConfig, driftState))
    cameraZ += carState.speed * dt
    raceTime += dt

    collisionCooldown = Math.max(collisionCooldown - dt, 0)
    const hit =
      collisionCooldown <= 0 ? collideWithPlayer(traffic, cameraZ, carState.position) : null
    if (hit) {
      carState.speed *= 0.5
      collisionCount++
      collisionCooldown = 1
    }

    driftState2 = updateDrift(dt, input2, carState2, carConfig, driftState2, cameraZ2)
    carState2.speed *= driftSpeedFactor(driftState2)
    updateCar(dt, input2, carState2, carConfig, effectiveTurnRate(carConfig, driftState2))
    cameraZ2 += carState2.speed * dt
    raceTime2 += dt

    const finishedP1 = lapFromZ(cameraZ, lapLength) > totalLaps
    const finishedP2 = SPLIT_MODE && lapFromZ(cameraZ2, lapLength) > totalLaps
    if (finishedP1 || finishedP2) {
      applyPhase(PHASE_FINISHED)
    }
  }

  driftIndicator.hidden = !driftState.active
  if (driftState.active) {
    driftScoreValue.textContent = String(Math.round(driftState.score))
  }
  if (SPLIT_MODE) {
    const w = window.innerWidth
    renderer.setCameraX(carState.position)
    renderer.renderRegion(cameraZ, 0, w / 2, driftState.smoke)
    renderer.setCameraX(carState2.position)
    renderer.renderRegion(cameraZ2, w / 2, w / 2, driftState2.smoke)
  }
  else {
    renderer.setCameraX(carState.position)
    renderer.render(cameraZ, driftState.smoke)
  }

  hudSpeed.textContent = formatSpeed(carState.speed, carConfig.maxSpeed)
  hudLap.textContent = formatLap(lapFromZ(cameraZ, lapLength), totalLaps)
  hudTime.textContent = formatTime(raceTime)
  hudBest.hidden = bestTime === null
  if (bestTime !== null) {
    hudBest.textContent = `BEST ${formatTime(bestTime)}`
  }
  if (SPLIT_MODE) {
    hudSpeed2.textContent = formatSpeed(carState2.speed, carConfig.maxSpeed)
    hudLap2.textContent = formatLap(lapFromZ(cameraZ2, lapLength), totalLaps)
    hudTime2.textContent = formatTime(raceTime2)
  }
  engineSound?.setSpeedRatio(carState.speed / carConfig.maxSpeed)
  requestAnimationFrame(frame)
}

window.addEventListener('resize', resize)
updateTrackSelect()
resize()
requestAnimationFrame(frame)
