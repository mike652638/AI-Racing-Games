import { Renderer } from './engine/renderer'
import { createDefaultTrack, SEGMENT_LENGTH } from './engine/track'
import { createCarConfig, updateCar, type CarState } from './physics/car'
import { formatSpeed, formatTime, formatLap, lapFromZ } from './ui/format'

const canvas = document.getElementById('game') as HTMLCanvasElement
const hudSpeed = document.getElementById('hud-speed') as HTMLDivElement
const hudLap = document.getElementById('hud-lap') as HTMLDivElement
const hudTime = document.getElementById('hud-time') as HTMLDivElement

const TOTAL_LAPS = 3
const track = createDefaultTrack()
const lapLength = track.length * SEGMENT_LENGTH
const renderer = new Renderer(canvas, track, window.innerWidth, window.innerHeight)

const carConfig = createCarConfig()
const carState: CarState = { position: 0, speed: 0 }

const pressed = new Set<string>()

window.addEventListener('keydown', (e) => {
  pressed.add(e.code)
})
window.addEventListener('keyup', (e) => {
  pressed.delete(e.code)
})

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  renderer.setViewport(canvas, window.innerWidth, window.innerHeight, dpr)
}

let cameraZ = 0
let raceTime = 0
let last = performance.now()

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now

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
  renderer.setCameraX(carState.position)
  renderer.render(cameraZ)

  hudSpeed.textContent = formatSpeed(carState.speed, carConfig.maxSpeed)
  hudLap.textContent = formatLap(lapFromZ(cameraZ, lapLength), TOTAL_LAPS)
  hudTime.textContent = formatTime(raceTime)
  requestAnimationFrame(frame)
}

window.addEventListener('resize', resize)
resize()
requestAnimationFrame(frame)
