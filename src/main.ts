import { Renderer } from './engine/renderer'
import { createDefaultTrack, SEGMENT_LENGTH } from './engine/track'
import { createRoadsideSprites } from './engine/sprites'
import { createCarConfig, updateCar, type CarState } from './physics/car'
import { formatSpeed, formatTime, formatLap, lapFromZ } from './ui/format'
import { EngineSound } from './audio/engine'
import { nextPhase, PHASE_MENU, PHASE_RACING, PHASE_FINISHED, type Phase } from './ui/gamestate'

const canvas = document.getElementById('game') as HTMLCanvasElement
const hudSpeed = document.getElementById('hud-speed') as HTMLDivElement
const hudLap = document.getElementById('hud-lap') as HTMLDivElement
const hudTime = document.getElementById('hud-time') as HTMLDivElement
const startScreen = document.getElementById('start-screen') as HTMLDivElement
const finishScreen = document.getElementById('finish-screen') as HTMLDivElement
const finishTime = document.getElementById('finish-time') as HTMLParagraphElement
const finishSpeed = document.getElementById('finish-speed') as HTMLParagraphElement

const TOTAL_LAPS = 3
const track = createDefaultTrack()
const lapLength = track.length * SEGMENT_LENGTH
const renderer = new Renderer(
  canvas,
  track,
  window.innerWidth,
  window.innerHeight,
  undefined,
  createRoadsideSprites(track),
)

const carConfig = createCarConfig()
const carState: CarState = { position: 0, speed: 0 }

const pressed = new Set<string>()
let phase: Phase = PHASE_MENU
let engineSound: EngineSound | null = null
let finishShown = false

let cameraZ = 0
let raceTime = 0
let last = performance.now()

/** 调试钩子：供自动化验证读取运行时状态 */
;(window as unknown as Record<string, unknown>).__gameDebug = {
  get audioState(): AudioContextState | null {
    return engineSound?.state ?? null
  },
  get phase(): Phase {
    return phase
  },
}

function resetRace(): void {
  carState.position = 0
  carState.speed = 0
  cameraZ = 0
  raceTime = 0
  last = performance.now()
  finishShown = false
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
    }
  }
}

window.addEventListener('keydown', (e) => {
  pressed.add(e.code)
  if (!engineSound) {
    engineSound = new EngineSound(new AudioContext())
    engineSound.start()
  }
  applyPhase(nextPhase(phase, lapFromZ(cameraZ, lapLength), TOTAL_LAPS))
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
    const steer
      = (pressed.has('ArrowRight') || pressed.has('KeyD') ? 1 : 0)
      - (pressed.has('ArrowLeft') || pressed.has('KeyA') ? 1 : 0)
    updateCar(dt, {
      throttle: pressed.has('ArrowUp') || pressed.has('KeyW') ? 1 : 0,
      brake: pressed.has('ArrowDown') || pressed.has('KeyS'),
      steer,
    }, carState, carConfig)

    cameraZ += carState.speed * dt
    raceTime += dt
    if (lapFromZ(cameraZ, lapLength) > TOTAL_LAPS) {
      applyPhase(PHASE_FINISHED)
    }
  }

  renderer.setCameraX(carState.position)
  renderer.render(cameraZ)

  hudSpeed.textContent = formatSpeed(carState.speed, carConfig.maxSpeed)
  hudLap.textContent = formatLap(lapFromZ(cameraZ, lapLength), TOTAL_LAPS)
  hudTime.textContent = formatTime(raceTime)
  engineSound?.setSpeedRatio(carState.speed / carConfig.maxSpeed)
  requestAnimationFrame(frame)
}

window.addEventListener('resize', resize)
resize()
requestAnimationFrame(frame)
