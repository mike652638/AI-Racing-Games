# Extensions Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 为 OutRun 伪 3D 复刻新增五个可扩展方向：车流/碰撞、漂移得分、关卡选单、合成音乐、移动端触控。

**Architecture:** 每个方向一个独立模块 + 纯函数可单测；main.ts 薄层集成；渲染复用现有 opts 参数化管线。

**Tech Stack:** TypeScript + Vite + Canvas 2D + Vitest；WebAudio（合成音乐）；localStorage（关卡无关）。

## Global Constraints

- 全程 TDD：先写失败测试再实现；每 Task 提交一次（Conventional Commits，英文标题+中文 body）
- 验证顺序：`npm run typecheck` → `npm run lint` → `npm test` → `npm run build` → `npm run bot`（bot 必须保持 3 圈 0 违规稳定输出）
- 不引入新依赖（音效/音乐全部 WebAudio 合成；触控纯 DOM API）
- simulate.ts（bot 模拟器）不接入车流——bot 无避让能力，保持报告稳定
- 注释、文档用中文；代码、标识符英文
- 现有 API 必须保持兼容：createDefaultTrack()、createSmoothTrack()、updateCar()、inputFromKeys()、renderWithOpts() 签名不变，只做加法

---

### Task 1: 车流与碰撞（traffic cars）

**Files:**
- Create: `src/engine/traffic.ts`
- Create: `tests/unit/traffic.test.ts`
- Modify: `src/engine/renderer.ts`（drawTraffic + renderWithOpts 调用）
- Modify: `src/main.ts`（traffic 创建/更新/碰撞惩罚）

**Interfaces:**
- Produces: `TrafficCar={z:number,offset:number,speed:number,colorIndex:number}`；`createTraffic(track: Segment[], lapLength: number, seed?: number, count?: number): TrafficCar[]`；`updateTraffic(traffic: TrafficCar[], dt: number, lapLength: number): void`（in-place 环形推进）；`collideWithPlayer(traffic: TrafficCar[], playerZ: number, playerX: number, zTol?: number, xTol?: number): TrafficCar | null`
- Consumes: `Segment`（track.ts）、`Renderer.renderWithOpts(cameraZ, opts, smoke)` 与 `project()`（renderer.ts 内部）

- [x] **Step 1: 写失败测试 `tests/unit/traffic.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { createStraightTrack } from '../../src/engine/track'
import { collideWithPlayer, createTraffic, updateTraffic, type TrafficCar } from '../../src/engine/traffic'

describe('createTraffic', () => {
  test('生成指定数量且确定性（同 seed 同结果）', () => {
    const track = createStraightTrack(100)
    const a = createTraffic(track, 20000, 777, 8)
    const b = createTraffic(track, 20000, 777, 8)
    expect(a).toHaveLength(8)
    expect(a).toEqual(b)
  })
  test('车辆均匀分布（间隔≈lapLength/count）', () => {
    const track = createStraightTrack(100)
    const traffic = createTraffic(track, 20000, 777, 8)
    const sorted = [...traffic].sort((x, y) => x.z - y.z)
    const gaps = sorted.map((c, i) => (sorted[(i + 1) % sorted.length].z - c.z + 20000) % 20000)
    gaps.forEach(g => expect(g).toBeGreaterThan(1800))
    gaps.forEach(g => expect(g).toBeLessThan(3200))
  })
  test('offset 在 ±1 内（不骑中央线）', () => {
    const traffic = createTraffic(createStraightTrack(100), 20000, 777, 8)
    traffic.forEach(c => expect(Math.abs(c.offset)).toBeLessThan(1))
  })
  test('speed 为正', () => {
    const traffic = createTraffic(createStraightTrack(100), 20000, 777, 8)
    traffic.forEach(c => expect(c.speed).toBeGreaterThan(0))
  })
})

describe('updateTraffic', () => {
  test('按速度推进 z', () => {
    const car: TrafficCar = { z: 100, offset: 0.7, speed: 1200, colorIndex: 0 }
    updateTraffic([car], 0.5, 20000)
    expect(car.z).toBeCloseTo(700, 6)
  })
  test('超过 lapLength 环形回绕', () => {
    const car: TrafficCar = { z: 19800, offset: 0.7, speed: 1200, colorIndex: 0 }
    updateTraffic([car], 1, 20000)
    expect(car.z).toBeCloseTo(1000, 6)
  })
})

describe('collideWithPlayer', () => {
  test('纵向横向均接近时命中', () => {
    const car: TrafficCar = { z: 1000, offset: 0.7, speed: 1200, colorIndex: 0 }
    expect(collideWithPlayer([car], 1050, 0.7)).toBe(car)
  })
  test('横向错开（offset 差 > xTol）不命中', () => {
    const car: TrafficCar = { z: 1000, offset: -0.7, speed: 1200, colorIndex: 0 }
    expect(collideWithPlayer([car], 1050, 0.7)).toBeNull()
  })
  test('纵向错过（|dz| > zTol）不命中', () => {
    const car: TrafficCar = { z: 1000, offset: 0.7, speed: 1200, colorIndex: 0 }
    expect(collideWithPlayer([car], 2000, 0.7)).toBeNull()
  })
  test('无车不命中', () => {
    expect(collideWithPlayer([], 1000, 0)).toBeNull()
  })
})
```

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/traffic.test.ts`
Expected: FAIL（模块不存在）

- [x] **Step 3: 实现 `src/engine/traffic.ts`**

```ts
import type { Segment } from './track'
import { mulberry32 } from './scenery'

export interface TrafficCar {
  z: number
  offset: number
  speed: number
  colorIndex: number
}

export const TRAFFIC_Z_TOL = 80
export const TRAFFIC_X_TOL = 0.9
export const TRAFFIC_CRUISE_SPEED = 2400

export function createTraffic(
  track: Segment[],
  lapLength: number,
  seed = 777,
  count = 8,
): TrafficCar[] {
  const rnd = mulberry32(seed)
  const cars: TrafficCar[] = []
  for (let i = 0; i < count; i++) {
    cars.push({
      z: ((i * lapLength) / count + rnd() * 200) % lapLength,
      offset: (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.4),
      speed: TRAFFIC_CRUISE_SPEED * (0.8 + rnd() * 0.4),
      colorIndex: Math.floor(rnd() * 4),
    })
  }
  return cars
}

export function updateTraffic(traffic: TrafficCar[], dt: number, lapLength: number): void {
  for (const car of traffic) {
    car.z = (car.z + car.speed * dt) % lapLength
  }
}

export function collideWithPlayer(
  traffic: TrafficCar[],
  playerZ: number,
  playerX: number,
  zTol = TRAFFIC_Z_TOL,
  xTol = TRAFFIC_X_TOL,
): TrafficCar | null {
  for (const car of traffic) {
    if (Math.abs(car.z - playerZ) < zTol && Math.abs(car.offset - playerX) < xTol) {
      return car
    }
  }
  return null
}
```

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/traffic.test.ts`
Expected: PASS（8/8）

- [x] **Step 5: Renderer 集成（drawTraffic）**

在 `src/engine/renderer.ts` 新增（与 drawSprites 同模式，traffic 在 sprites 之后、smoke 之前）：

```ts
const TRAFFIC_COLORS = ['#d84a4a', '#4a8ad8', '#d8c04a', '#4ad88a']

private drawTraffic(traffic: TrafficCar[], cameraZ: number, opts: ProjectionOptions): void {
  if (!traffic.length) return
  const sorted = [...traffic].filter(c => c.z > cameraZ).sort((a, b) => b.z - a.z)
  for (const car of sorted) {
    const bottom = project(opts, this.camera, { x: car.offset, y: 0, z: car.z })
    if (!bottom) continue
    const top = project(opts, this.camera, { x: car.offset, y: 1.4, z: car.z })
    if (!top) continue
    const bodyW = (bottom.x - project(opts, this.camera, { x: car.offset + 0.45, y: 0, z: car.z })!.x) * 2
    this.ctx.fillStyle = TRAFFIC_COLORS[car.colorIndex % TRAFFIC_COLORS.length]
    this.ctx.fillRect(bottom.x - bodyW / 2, top.y, bodyW, bottom.y - top.y)
    this.ctx.fillStyle = '#1b2430'
    this.ctx.fillRect(bottom.x - bodyW / 4, top.y + (bottom.y - top.y) * 0.3, bodyW / 2, (bottom.y - top.y) * 0.4)
  }
}
```

`renderWithOpts` 中调用顺序：路面 → `drawSprites` → `drawTraffic(traffic, cameraZ, opts)` → `drawSmoke`。
（注意：`this.camera.z` 已在 render 入口同步为 cameraZ，project 直接可用。）

- [x] **Step 6: main.ts 集成**

- 模块级：`let traffic: TrafficCar[] = []`
- `resetRace()` 末尾：`traffic = createTraffic(track, lapLength)`
- `frame()`（racing 分支，updateCar 之前）：`updateTraffic(traffic, dt, lapLength)`
- `frame()`（updateCar 之后）：`const hit = collideWithPlayer(traffic, cameraZ, carState.position); if (hit) { carState.speed *= 0.5; collisionCount++ }`
- `__gameDebug` 加：`trafficCount: traffic.length`、`collisions: collisionCount`（模块级 `let collisionCount = 0`，resetRace 清零）

- [x] **Step 7: 全量验证**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`
Expected: 全绿；bot 3 圈输出稳定（simulate 未接入车流，无违规）

- [x] **Step 8: 浏览器实测**

- dev server 存活时 `agent-browser eval`：`__gameDebug.trafficCount` 应为 8
- CDP `press ArrowUp` 启动 → 合成 keydown 保持加速 30s → eval `__gameDebug.collisions` 应 >0（巡航车 2400 < 玩家全速 6000，必追尾）
- 截图 `shots/m7-traffic.png`

- [x] **Step 9: 提交**

```bash
git add src/engine/traffic.ts tests/unit/traffic.test.ts src/engine/renderer.ts src/main.ts
git commit -m "feat(traffic): traffic cars with collision penalty"
```

---

### Task 2: 漂移得分系统

**Files:**
- Modify: `src/physics/drift.ts`（DriftState 加 score；updateDrift 累计）
- Modify: `tests/unit/drift.test.ts`（加 4 测试）
- Modify: `src/index.html`（#drift-score 与 #finish-score）
- Modify: `src/style.css`
- Modify: `src/main.ts`（HUD 更新 + 结算显示）

**Interfaces:**
- Consumes: `DriftState`（现有 {charge,active,lastSmoke,smoke[]}）
- Produces: `DriftState.score: number`；结算页展示 `#finish-score`

- [x] **Step 1: 写失败测试（追加到 drift.test.ts）**

```ts
describe('drift score', () => {
  const state = { position: 0, speed: 0 }
  const config = createCarConfig({ maxSpeed: 6000 })
  function fresh(): DriftState { return { charge: 1, active: false, lastSmoke: 0, smoke: [], score: 0 } }

  test('漂移中按速度累计得分', () => {
    const drift = fresh()
    const input = { throttle: 0, brake: false, steer: 1 }
    state.speed = 6000
    state.position = 0.5
    updateDrift(1, input, state, config, drift, 0)
    expect(drift.active).toBe(true)
    expect(drift.score).toBeGreaterThan(0)
  })
  test('得分与速度成正比（两倍速度两倍得分）', () => {
    const a = fresh(); const b = fresh()
    state.speed = 6000; state.position = 0.5
    updateDrift(1, { throttle: 0, brake: false, steer: 1 }, state, config, a, 0)
    state.speed = 3000
    updateDrift(1, { throttle: 0, brake: false, steer: 1 }, state, config, b, 0)
    expect(a.score).toBeCloseTo(b.score * 2, 6)
  })
  test('不漂移不计分', () => {
    const drift = fresh()
    state.speed = 6000; state.position = 0
    updateDrift(1, { throttle: 0, brake: false, steer: 0 }, state, config, drift, 0)
    expect(drift.score).toBe(0)
  })
  test('低速漂移（charge 不足）不计分', () => {
    const drift = fresh()
    drift.charge = 0
    state.speed = 6000; state.position = 0.5
    updateDrift(1, { throttle: 0, brake: false, steer: 1 }, state, config, drift, 0)
    expect(drift.score).toBe(0)
  })
})
```

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/drift.test.ts`
Expected: FAIL（score 不存在/为 0）

- [x] **Step 3: 实现（drift.ts 修改）**

```ts
export interface DriftState {
  charge: number
  active: boolean
  lastSmoke: number
  smoke: SmokeParticle[]
  score: number
}
// createDriftState() 初始 { ..., score: 0 }
// updateDrift 内：active 判定成功后
if (drift.active) {
  drift.score += state.speed * dt * DRIFT_SCORE_RATE  // DRIFT_SCORE_RATE = 0.01
}
```

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/drift.test.ts`
Expected: PASS（12/12）

- [x] **Step 5: HUD 与结算集成**

- index.html：#drift-score（hidden，`DRIFT +<span id="drift-score-value">0</span>`）+ #finish-screen 内 #finish-score
- main.ts：frame 里漂移 active 时显示、分数更新；applyPhase FINISHED 时 finishScore.textContent=`漂移得分 ${Math.round(driftState.score)}`；resetRace 里 `driftState = createDriftState()`（score 清零）
- style.css：#drift-score 橙色系右下角

- [x] **Step 6: 全量验证 + 浏览器实测（漂移 3s 后分数 >0、结算显示）**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`

- [x] **Step 7: 提交**

```bash
git add src/physics/drift.ts tests/unit/drift.test.ts src/index.html src/style.css src/main.ts
git commit -m "feat(drift): drift score accumulation with HUD"
```

---

### Task 3: 关卡选单（赛道选择）

**Files:**
- Create: `src/engine/tracks.ts`
- Create: `tests/unit/tracks.test.ts`
- Modify: `src/engine/track.ts`（导出 DEFAULT_CONTROL_POINTS）
- Modify: `src/engine/renderer.ts`（setTrack）
- Modify: `src/index.html`、`src/style.css`（选单 UI）
- Modify: `src/main.ts`（赛道切换）

**Interfaces:**
- Produces: `TrackDef={id:string,name:string,laps:number,controlPoints:CurveControlPoint[]}`；`TRACK_DEFS: TrackDef[]`（3 条）；`createTrackFromDef(def): Segment[]`；`getTrackDef(id): TrackDef | undefined`
- Consumes: `createSmoothTrack`、`CurveControlPoint`、`totalCurve`（track.ts）

- [x] **Step 1: 写失败测试 `tests/unit/tracks.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { createTrackFromDef, getTrackDef, TRACK_DEFS } from '../../src/engine/tracks'
import { totalCurve } from '../../src/engine/track'

describe('track defs', () => {
  test('3 条赛道且 id 唯一', () => {
    expect(TRACK_DEFS).toHaveLength(3)
    const ids = TRACK_DEFS.map(d => d.id)
    expect(new Set(ids).size).toBe(3)
  })
  test('每条赛道总曲率回环为 0', () => {
    for (const def of TRACK_DEFS) {
      expect(totalCurve(createTrackFromDef(def))).toBeCloseTo(0, 9)
    }
  })
  test('laps 为正整数', () => {
    for (const def of TRACK_DEFS) {
      expect(Number.isInteger(def.laps)).toBe(true)
      expect(def.laps).toBeGreaterThan(0)
    }
  })
  test('getTrackDef 按 id 查', () => {
    expect(getTrackDef('classic')?.name).toBeDefined()
    expect(getTrackDef('nope')).toBeUndefined()
  })
  test('赛道总长不同（难度差异）', () => {
    const lengths = TRACK_DEFS.map(d => createTrackFromDef(d).length)
    expect(new Set(lengths).size).toBeGreaterThan(1)
  })
})
```

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/tracks.test.ts`

- [x] **Step 3: track.ts 导出控制点常量**

```ts
export const DEFAULT_CONTROL_POINTS: CurveControlPoint[] = [
  // 现有 createDefaultTrack 的 18 个控制点原样移入
]
export function createDefaultTrack(): Segment[] {
  return createSmoothTrack(DEFAULT_CONTROL_POINTS)
}
```

- [x] **Step 4: 实现 `src/engine/tracks.ts`**

```ts
import { createSmoothTrack, DEFAULT_CONTROL_POINTS, type CurveControlPoint, type Segment } from './track'

export interface TrackDef {
  id: string
  name: string
  laps: number
  controlPoints: CurveControlPoint[]
}

export const TRACK_DEFS: TrackDef[] = [
  { id: 'classic', name: '经典环道', laps: 3, controlPoints: DEFAULT_CONTROL_POINTS },
  {
    id: 'highway', name: '高速直道', laps: 2,
    controlPoints: [
      { z: 0, curve: 0 }, { z: 20000, curve: 0 },
      { z: 26000, curve: 0.008 }, { z: 46000, curve: 0.008 },
      { z: 52000, curve: 0 }, { z: 70000, curve: 0 },
      { z: 76000, curve: -0.008 }, { z: 96000, curve: -0.008 },
      { z: 102000, curve: 0 }, { z: 118000, curve: 0 },
    ],
  },
  {
    id: 's-curve', name: 'S 弯技术赛', laps: 2,
    controlPoints: [
      { z: 0, curve: 0 }, { z: 8000, curve: 0 },
      { z: 10000, curve: 0.03 }, { z: 18000, curve: 0.03 },
      { z: 20000, curve: 0 }, { z: 28000, curve: 0 },
      { z: 30000, curve: -0.03 }, { z: 38000, curve: -0.03 },
      { z: 40000, curve: 0 }, { z: 48000, curve: 0 },
      { z: 50000, curve: 0.03 }, { z: 58000, curve: 0.03 },
      { z: 60000, curve: 0 }, { z: 68000, curve: 0 },
      { z: 70000, curve: -0.03 }, { z: 78000, curve: -0.03 },
      { z: 80000, curve: 0 }, { z: 88000, curve: 0 },
    ],
  },
]

export function createTrackFromDef(def: TrackDef): Segment[] {
  return createSmoothTrack(def.controlPoints)
}

export function getTrackDef(id: string): TrackDef | undefined {
  return TRACK_DEFS.find(d => d.id === id)
}
```

- [x] **Step 5: renderer.setTrack**

```ts
setTrack(track: Segment[], sprites: Sprite[]): void {
  this.track = track
  this.sprites = sprites
}
```

- [x] **Step 6: 选单 UI 与 main.ts 集成**

- index.html #start-screen 加：
```html
<div id="track-select">赛道：<span id="track-name">经典环道</span>　按 1/2/3 切换</div>
```
- style.css：#track-select 白色 18px 下边距
- main.ts：`let selectedIndex = 0`；`let track = createTrackFromDef(TRACK_DEFS[0])`（原 createDefaultTrack 调用替换）；`let laps = TRACK_DEFS[0].laps`（替换 TOTAL_LAPS 常量，所有引用同步改）；keydown 在 phase==='menu' 时处理 Digit1/2/3 切换（trackName.textContent、显示）；`resetRace()` 里重建 track/sprites/traffic：`track = createTrackFromDef(TRACK_DEFS[selectedIndex]); lapLength = track.length * SEGMENT_LENGTH; sprites = createRoadsideSprites(track); renderer.setTrack(track, sprites); traffic = createTraffic(track, lapLength)`；hudLap 总圈数用 laps
- __gameDebug 加 `trackId`、`selectedIndex` getter

- [x] **Step 7: 全量验证 + 浏览器实测（按 3 切 S 弯赛 → racing → 圈数 HUD 变 /3 → 完赛）**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`

- [x] **Step 8: 提交**

```bash
git add src/engine/tracks.ts tests/unit/tracks.test.ts src/engine/track.ts src/engine/renderer.ts src/index.html src/style.css src/main.ts
git commit -m "feat(tracks): track select menu with 3 configurable tracks"
```

---

### Task 4: 音频音乐播放器（WebAudio 合成）

**Files:**
- Create: `src/audio/music.ts`
- Create: `tests/unit/music.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `noteToFreq(semitone: number, baseA4?: number): number`；`MUSIC_SEQUENCE: {bpm:number; bass:(number|null)[]; lead:(number|null)[]}`（16 步）；`tickMsForBpm(bpm: number): number`；`class MusicPlayer { constructor(ctx: AudioContext); start(): void; stop(): void; readonly step: number }`

- [x] **Step 1: 写失败测试 `tests/unit/music.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { MUSIC_SEQUENCE, noteToFreq, tickMsForBpm } from '../../src/audio/music'

describe('noteToFreq', () => {
  test('A4=69 → 440Hz', () => expect(noteToFreq(69)).toBeCloseTo(440, 6))
  test('A3=57 → 220Hz', () => expect(noteToFreq(57)).toBeCloseTo(220, 6))
  test('C4=60 → 261.63Hz', () => expect(noteToFreq(60)).toBeCloseTo(261.63, 1))
})

describe('MUSIC_SEQUENCE', () => {
  test('16 步 bass 与 lead', () => {
    expect(MUSIC_SEQUENCE.bass).toHaveLength(16)
    expect(MUSIC_SEQUENCE.lead).toHaveLength(16)
  })
  test('bpm 在 60..200', () => {
    expect(MUSIC_SEQUENCE.bpm).toBeGreaterThanOrEqual(60)
    expect(MUSIC_SEQUENCE.bpm).toBeLessThanOrEqual(200)
  })
  test('bass 有音符也有休止', () => {
    expect(MUSIC_SEQUENCE.bass.some(n => n !== null)).toBe(true)
    expect(MUSIC_SEQUENCE.bass.some(n => n === null)).toBe(true)
  })
})

describe('tickMsForBpm', () => {
  test('120bpm → 125ms（16 分音符）', () => expect(tickMsForBpm(120)).toBeCloseTo(125, 6))
  test('100bpm → 150ms', () => expect(tickMsForBpm(100)).toBeCloseTo(150, 6))
})
```

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/music.test.ts`

- [x] **Step 3: 实现 `src/audio/music.ts`**

```ts
export function noteToFreq(semitone: number, baseA4 = 440): number {
  return baseA4 * Math.pow(2, (semitone - 69) / 12)
}

export function tickMsForBpm(bpm: number): number {
  return 60000 / bpm / 4
}

// A 小调 synthwave 循环：A2 低音行走 + A4 旋律句
export const MUSIC_SEQUENCE = {
  bpm: 100,
  bass: [33, null, 33, 33, 33, null, 33, 33, 29, null, 29, 29, 31, null, 31, 31],
  lead: [69, null, 72, null, 76, null, 74, 72, 69, null, 69, 72, 74, null, 72, null],
} as const

export class MusicPlayer {
  readonly step: number
  private ctx: AudioContext
  private timer: number | null
  private master: GainNode | null
  private noiseBuf: AudioBuffer | null

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.step = 0
    this.timer = null
    this.master = null
    this.noiseBuf = null
  }

  start(): void {
    if (this.timer !== null) return
    void this.ctx.resume()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.12
    this.master.connect(this.ctx.destination)
    const len = Math.floor(this.ctx.sampleRate * 0.2)
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.timer = window.setInterval(() => this.tick(), tickMsForBpm(MUSIC_SEQUENCE.bpm))
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.master?.disconnect()
    this.master = null
  }

  private tick(): void {
    const master = this.master
    if (!master) return
    const i = this.step % 16
    const bassNote = MUSIC_SEQUENCE.bass[i]
    const leadNote = MUSIC_SEQUENCE.lead[i]
    if (bassNote !== null) this.playTone(bassNote, 'square', 0.12, 0.22)
    if (leadNote !== null) this.playTone(leadNote, 'sawtooth', 0.05, 0.16)
    if (i % 4 === 0) this.playNoise(0.15, 300)
    if (i % 2 === 0) this.playNoise(0.03, 6000)
    this.step = (this.step + 1) % 64
  }

  private playTone(semi: number, type: OscillatorType, gain: number, dur: number): void {
    if (!this.master) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = noteToFreq(semi)
    g.gain.setValueAtTime(gain, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur)
    osc.connect(g)
    g.connect(this.master)
    osc.start()
    osc.stop(this.ctx.currentTime + dur)
  }

  private playNoise(vol: number, cutoff: number): void {
    if (!this.master || !this.noiseBuf) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08)
    src.connect(filter)
    filter.connect(g)
    g.connect(this.master)
    src.start()
    src.stop(this.ctx.currentTime + 0.1)
  }
}
```

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/music.test.ts`
Expected: PASS（7/7）

- [x] **Step 5: main.ts 集成**

- `let musicPlayer: MusicPlayer | null = null`；首键（与 EngineSound 相同懒创建处）`musicPlayer = new MusicPlayer(new AudioContext())`，applyPhase PHASE_RACING 时 `musicPlayer?.start()`；PHASE_MENU 重置时 `musicPlayer?.stop()`；`__gameDebug.musicStep: musicPlayer?.step ?? -1`
- 注意：MusicPlayer 需要 `window.setInterval`（返回 number），避免 node 类型冲突

- [x] **Step 6: 全量验证 + 浏览器实测（CDP press 激活后 musicStep 递增、audioState=running）**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`

- [x] **Step 7: 提交**

```bash
git add src/audio/music.ts tests/unit/music.test.ts src/main.ts
git commit -m "feat(audio): synthesized synthwave music loop"
```

---

### Task 5: 移动端触控

**Files:**
- Modify: `src/physics/input.ts`（touchInputFrom + mergeCarInput）
- Modify: `tests/unit/input.test.ts`（加 8 测试）
- Modify: `src/main.ts`（touch 监听 + 输入合并）
- Modify: `src/index.html`、`src/style.css`（触控提示）

**Interfaces:**
- Produces: `TouchPoint={x:number,y:number}`（归一化 0..1）；`touchInputFrom(touches: TouchPoint[]): CarInput`；`mergeCarInput(a: CarInput, b: CarInput): CarInput`

- [x] **Step 1: 写失败测试（追加到 input.test.ts）**

```ts
describe('touchInputFrom', () => {
  test('无触摸 → 全零', () => {
    expect(touchInputFrom([])).toEqual({ throttle: 0, brake: false, steer: 0 })
  })
  test('右上半屏 → 油门', () => {
    expect(touchInputFrom([{ x: 0.7, y: 0.2 }])).toEqual({ throttle: 1, brake: false, steer: 0 })
  })
  test('右下半屏 → 刹车', () => {
    expect(touchInputFrom([{ x: 0.7, y: 0.8 }]).brake).toBe(true)
  })
  test('左半屏左侧 → 左转', () => {
    expect(touchInputFrom([{ x: 0.1, y: 0.5 }]).steer).toBe(-1)
  })
  test('左半屏右侧 → 右转', () => {
    expect(touchInputFrom([{ x: 0.4, y: 0.5 }]).steer).toBe(1)
  })
  test('同时触左右 → 转向取左（左优先）', () => {
    expect(touchInputFrom([{ x: 0.1, y: 0.5 }, { x: 0.4, y: 0.5 }]).steer).toBe(-1)
  })
})

describe('mergeCarInput', () => {
  const kb = { throttle: 0, brake: false, steer: 0 }
  test('油门取最大', () => {
    expect(mergeCarInput(kb, { throttle: 1, brake: false, steer: 0 }).throttle).toBe(1)
  })
  test('刹车 OR', () => {
    expect(mergeCarInput(kb, { throttle: 0, brake: true, steer: 0 }).brake).toBe(true)
  })
  test('键盘转向优先', () => {
    expect(mergeCarInput({ throttle: 0, brake: false, steer: 1 }, { throttle: 0, brake: false, steer: -1 }).steer).toBe(1)
  })
})
```

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/input.test.ts`

- [x] **Step 3: 实现（input.ts 追加）**

```ts
export interface TouchPoint { x: number; y: number }

export function touchInputFrom(touches: TouchPoint[]): CarInput {
  let throttle = 0
  let brake = false
  let steer = 0
  for (const t of touches) {
    if (t.x >= 0.5) {
      if (t.y < 0.5) throttle = 1
      else brake = true
    } else {
      if (steer === 0) steer = t.x < 0.25 ? -1 : 1
    }
  }
  return { throttle, brake, steer }
}

export function mergeCarInput(a: CarInput, b: CarInput): CarInput {
  return {
    throttle: Math.max(a.throttle, b.throttle),
    brake: a.brake || b.brake,
    steer: a.steer !== 0 ? a.steer : b.steer,
  }
}
```

- [x] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/input.test.ts`
Expected: PASS（13/13）

- [x] **Step 5: main.ts 触控绑定**

- `let touches: TouchPoint[] = []`；`function updateTouches(e: TouchEvent): void { touches = Array.from(e.touches).map(t => ({ x: t.clientX / window.innerWidth, y: t.clientY / window.innerHeight })) }`；window addEventListener touchstart/touchmove/touchend
- frame 里：`const kb1 = inputFromKeys(pressed, PLAYER1_MAPPING); const input1 = mergeCarInput(kb1, touchInputFrom(touches))`；SPLIT 模式 P2 不用触控
- index.html：#start-screen 提示加「触屏：左侧转向，右侧油门/刹车」；style.css 无新增（触控即屏幕分区，无可见按钮）

- [x] **Step 6: 全量验证 + 浏览器实测（eval 构造 TouchEvent dispatch 到 window → gameDebug 显示油门输入生效；合成 touch 无法真正驱动物理则用 __gameDebug.input1 getter 验证）**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`

- [x] **Step 7: 提交**

```bash
git add src/physics/input.ts tests/unit/input.test.ts src/main.ts src/index.html src/style.css
git commit -m "feat(touch): mobile touch controls with input merging"
```

---

## 收尾

- [x] **Step 1: 全量验证**（typecheck/lint/test/build/bot 全绿 + 浏览器冒烟 reload：phase=menu）
- [x] **Step 2: 勾选本文档全部 - [x] → - [x]**（PowerShell `Get-Content -Raw` + `-replace` + `Set-Content -NoNewline`）
- [x] **Step 3: README.md 更新**：操作说明（赛道选择 1/2/3、触控说明）、新功能清单（车流碰撞/漂移得分/三赛道/合成音乐/触控）、目录结构（traffic.ts/music.ts/tracks.ts）
- [x] **Step 4: 提交**（docs: mark extensions round 2 complete and update README）
