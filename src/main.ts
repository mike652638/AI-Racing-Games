import { Renderer } from './engine/renderer'
import { SEGMENT_LENGTH, createStraightTrack } from './engine/track'

const canvas = document.getElementById('game') as HTMLCanvasElement

const track = createStraightTrack(600)
const renderer = new Renderer(canvas, track, window.innerWidth, window.innerHeight)

/** M1 临时恒定速度（M2 起由车辆物理接管）：30 段/秒 */
const SPEED = SEGMENT_LENGTH * 30

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  renderer.setViewport(canvas, window.innerWidth, window.innerHeight, dpr)
}

let cameraZ = 0
let last = performance.now()

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  cameraZ += SPEED * dt
  renderer.render(cameraZ)
  requestAnimationFrame(frame)
}

window.addEventListener('resize', resize)
resize()
requestAnimationFrame(frame)
