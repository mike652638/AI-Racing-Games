import { Renderer } from './engine/renderer'
import { createTrack } from './engine/track'
import { createCarConfig, updateCar, type CarState } from './physics/car'

const canvas = document.getElementById('game') as HTMLCanvasElement

/** 可配置赛道：直道 + 右弯 + 左弯 + 缓弯，总曲率回环为 0（460 段，约 15 秒/圈） */
const track = createTrack([
  { curve: 0, count: 60 },
  { curve: 0.02, count: 50 },
  { curve: 0, count: 40 },
  { curve: -0.02, count: 50 },
  { curve: 0, count: 60 },
  { curve: 0.01, count: 50 },
  { curve: 0, count: 40 },
  { curve: -0.01, count: 50 },
  { curve: 0, count: 60 },
])
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
  renderer.setCameraX(carState.position)
  renderer.render(cameraZ)
  requestAnimationFrame(frame)
}

window.addEventListener('resize', resize)
resize()
requestAnimationFrame(frame)
