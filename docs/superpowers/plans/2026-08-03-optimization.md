# AI-Racing-Games 复盘、复核与优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于对 AI-Racing-Games 项目的实现思路复盘、代码质量复核与实际效果测试，修复严重缺陷、提升代码质量、优化游戏体验，并沉淀可指导后续无人值守长程编程的工程规范。

**Architecture:** 在保持现有 TypeScript + Vite + Canvas 2D + Vitest 技术栈不变的前提下，优先修复 P0 级缺陷（碰撞冷却、渲染校准、分屏独立实例、菜单 HUD 泄漏），其次重构架构问题（main.ts 拆分、反向依赖消除、重复逻辑提取），最后补充测试与可观测性。

**Tech Stack:** TypeScript + Vite + Canvas 2D + Vitest，零运行时依赖。

## Global Constraints

- 技术栈固定：TypeScript + Vite + Canvas 2D（不使用 WebGL/Three.js）
- 验证优先级：`npm run typecheck` → `npm run lint` → `npm test` → `npm run build` → `npm run bot` → browser 冒烟
- 每完成一个 Task 必须跑通 typecheck + test；跨 Task 提交前必须跑通 build + bot
- 单测必须新增，且必须针对当前发现的回归场景
- 代码/文件路径/标识符保留英文，中文注释/文档
- 分屏模式 URL 参数为 `?split=1`
- 不引入新运行时依赖

---

## 一、项目现状复盘

### 1.1 实现思路与架构决策

项目采用**纯函数优先的分层领域驱动设计**，整体架构决策成熟：

| 层次 | 模块 | 职责 | 副作用 |
|------|------|------|--------|
| 基础设施层 | `engine/` | 伪3D投影数学、赛道分段、渲染 | Canvas API（受限于 Renderer 类） |
| 领域层 | `physics/` | 车辆运动学、漂移系统 | 无（纯函数） |
| 领域层 | `ai/` | Bot 决策、无头模拟 | 无（纯函数） |
| 编排层 | `game/` | 对局状态、输入管理、碰撞裁决 | 修改 RaceState |
| 表现层 | `ui/` | HUD、画面切换、存档、阶段 FSM | DOM 操作 |
| 表现层 | `audio/` | WebAudio 程序化合成 | AudioContext |
| 入口 | `main.ts` | RAF 主循环、模块串联 | 全局协调 |

**核心优势：**
1. **纯函数领域层**：`engine/projection.ts`、`physics/car.ts`、`ai/bot.ts` 等核心逻辑均为纯函数，可独立测试与复用。
2. **状态集中管理**：`RaceState` 作为运行时唯一可变状态容器，渲染与 UI 函数遵循 `state → output` 的纯函数/渲染函数模式。
3. **确定性生成**：`mulberry32` PRNG 保证同输入下场景、车流、远山体一致，支撑 bot 可复现校验。
4. **性能优化意识**：远山预渲染到离屏 Canvas、曲率前缀和 `Float64Array`、DRAW_DISTANCE 限制可视分段、dt 上限防止后台跳帧。

**依赖方向问题：**
- 正确：底层（`engine/`、`physics/`）不依赖上层，上层组合底层。
- 越界：`game/state.ts` 导入了 `ui/gamestate.ts` 的 `PHASE_MENU` 和 `Phase` 类型，导致**编排层依赖表现层**的反向耦合。

### 1.2 自动化验证结果（当前基线）

```bash
npm run typecheck  # ✅ 通过
npm run lint       # ✅ 通过
npm test           # ✅ 23 files, 208 tests 全绿
npm run bot        # ✅ 3 圈 76.017s, 0 违规
```

### 1.3 实际效果测试方法

使用 Playwright + Chromium 对 `http://localhost:5175/` 进行手动场景自动化截图，覆盖：
- 启动菜单、赛道切换、开始比赛
- 驾驶、暂停/恢复、长时间行驶
- 分屏模式（`?split=1`）菜单与比赛

截图目录：`D:\AI\AI-Racing-Games\shots\manual-test/`

---

## 二、问题清单

### P0 — 严重（影响核心可玩性或正确性）

| # | 问题 | 来源 | 影响 | 关键文件 |
|---|------|------|------|----------|
| P0-1 | **P1-P2 互碰缺少冷却机制** | 代码复核 | 两车持续接触时每帧速度 ×0.5，0.5 秒内速度衰减至接近 0，分屏互碰完全不可玩 | `src/game/collision.ts:55-66` |
| P0-2 | **车辆精灵渲染尺寸异常** | 截图测试 | 车流显示为巨大黄色方块，占据画面近 1/4，无正确车辆形状与透视 | `src/engine/traffic-render.ts:42-43` |
| P0-3 | **路边景物渲染尺寸异常** | 截图测试 | 树木/路标被极端放大、拉伸，近处景物遮挡道路与天空 | `src/engine/renderer.ts:285` |
| P0-4 | **菜单阶段 HUD 残留** | 截图测试 | 启动菜单右上角仍显示速度、圈数、计时 HUD | `src/main.ts:217`, `src/ui/hud.ts` |
| P0-5 | **分屏不是独立游戏实例** | 截图测试 | P1/P2 共享同一 cameraZ、速度、时间，画面完全同步，无真正双人体验 | `src/main.ts:205-215` |
| P0-6 | **分屏菜单阶段 P2 区域黑屏** | 截图测试 | 分屏菜单下半部分纯黑，无菜单/赛道预览 | `src/main.ts:205-215`, `src/ui/screens.ts` |

### P1 — 重要（代码质量、可维护性、潜在缺陷）

| # | 问题 | 来源 | 影响 | 关键文件 |
|---|------|------|------|----------|
| P1-1 | **main.ts 职责过重（226 行上帝文件）** | 代码复核 | DOM 引用、初始化、调试钩子、流程控制、事件监听、主循环、启动编排全部集中 | `src/main.ts` |
| P1-2 | **`game/state.ts` → `ui/gamestate.ts` 反向依赖** | 代码复核 | 编排层依赖表现层，`Phase` 应下沉到 `game/` | `src/game/state.ts:4`, `src/ui/gamestate.ts` |
| P1-3 | **P1/P2 漂移更新逻辑完全重复** | 代码复核 | 修改一处遗漏另一处会导致双人行为不一致 | `src/main.ts:180-196` |
| P1-4 | **`updateDrift` 语义模糊** | 代码复核 | 既 in-place 修改参数，又返回引用；调用方又赋值回去 | `src/physics/drift.ts:43-82`, `src/main.ts:180,192` |
| P1-5 | **碰撞冷却包装对象 `{ value }`** | 代码复核 | 用包装对象模拟引用传递，不够直观 | `src/game/collision.ts:19,42-46` |
| P1-6 | **Renderer `null!` 非空断言** | 代码复核 | 绕过类型安全，初始化顺序变更可能引发运行时异常 | `src/engine/renderer.ts:109-110` |
| P1-7 | **魔法数字散布** | 代码复核 | 漂移阈值、碰撞参数、渲染距离等缺少统一配置 | `src/physics/drift.ts`, `src/game/collision.ts`, `src/engine/renderer.ts` |
| P1-8 | **非分屏模式下 P2 计时器仍递增** | 代码复核 | `race.raceTime2` 在单人模式下也增加，状态不一致 | `src/main.ts:196` |
| P1-9 | **分屏采用上下分割而非左右分割** | 截图测试 | 宽屏下每个玩家画面过于扁平，建议改为左右分割 | `src/main.ts:206-210`, `src/ui/hud.ts` |
| P1-10 | **赛道切换预览画面不变** | 截图测试 | 不同赛道右侧预览画面完全相同 | `src/main.ts:126-135`, `src/engine/renderer.ts` |

### P2 — 可选（测试覆盖、性能、可扩展性）

| # | 问题 | 来源 | 影响 | 关键文件 |
|---|------|------|------|----------|
| P2-1 | **Renderer 类无测试** | 代码复核 | 335 行核心渲染逻辑零测试 | `src/engine/renderer.ts` |
| P2-2 | **main.ts 主循环无测试** | 代码复核 | 集成逻辑无法回归验证 | `src/main.ts` |
| P2-3 | **`spritesInRange` 线性扫描** | 代码复核 | O(n) 每帧，赛道增长后性能下降 | `src/engine/sprites.ts:39-55` |
| P2-4 | **MusicPlayer 调度逻辑可测化不足** | 代码复核 | `schedule()` 依赖 AudioContext 时间，纯函数提取不足 | `src/audio/music.ts` |

---

## 三、优化实施计划

### Task 1: 修复 P1-P2 互碰冷却机制（P0-1）

**Files:**
- Modify: `src/game/collision.ts:41-67`
- Modify: `src/game/state.ts:29-32`（新增 P1-P2 互碰冷却字段）
- Create: `tests/unit/collision-player.test.ts` 或扩展 `tests/unit/collision.test.ts`

**Interfaces:**
- Consumes: `RaceState`（新增 `playerCollisionCooldown: number`）, `collidePlayers`, `COLLISION_COOLDOWN`, `COLLISION_SPEED_FACTOR`
- Produces: `updateCollisions(race, dt, splitMode)` 行为变更：P1-P2 互碰触发后进入 1 秒冷却

- [ ] **Step 1: 写失败回归测试**

```typescript
// tests/unit/collision.test.ts
import { describe, expect, it } from 'vitest'
import { createRaceState } from '../../src/game/state'
import { updateCollisions } from '../../src/game/collision'

function makeRaceWithOverlap() {
  const race = createRaceState([])
  race.cameraZ = 100
  race.cameraZ2 = 100
  race.carState.position = 0
  race.carState2.position = 0
  race.carState.speed = 100
  race.carState2.speed = 100
  return race
}

describe('player-player collision cooldown', () => {
  it('should apply speed penalty only once per cooldown', () => {
    const race = makeRaceWithOverlap()
    updateCollisions(race, 0.016, true)
    const afterFirst = race.carState.speed
    expect(afterFirst).toBeLessThan(100)
    updateCollisions(race, 0.016, true)
    expect(race.carState.speed).toBe(afterFirst)
  })

  it('should allow second collision after cooldown expires', () => {
    const race = makeRaceWithOverlap()
    updateCollisions(race, 0.016, true)
    const afterFirst = race.carState.speed
    // 1.1 秒后冷却结束
    updateCollisions(race, 1.1, true)
    expect(race.carState.speed).toBe(afterFirst)
    // 再次重叠仍罚速
    race.carState.speed = 100
    race.carState2.speed = 100
    updateCollisions(race, 0.016, true)
    expect(race.carState.speed).toBeLessThan(100)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/unit/collision.test.ts
```

Expected: FAIL（P1-P2 互碰连续触发罚速）

- [ ] **Step 3: 实现冷却字段与逻辑**

修改 `src/game/state.ts`：

```typescript
export interface RaceState {
  // ... existing fields
  /** P1 与车流碰撞冷却（秒） */
  collisionCooldown: number
  /** P2 与车流碰撞冷却（秒） */
  collisionCooldown2: number
  /** P1-P2 互碰冷却（秒） */
  playerCollisionCooldown: number
}
```

并在 `createRaceState` 和 `resetRaceState` 中初始化为 0。

修改 `src/game/collision.ts`：

```typescript
export function updateCollisions(race: RaceState, dt: number, splitMode: boolean): void {
  // ... P1/P2 车流碰撞逻辑不变

  if (splitMode) {
    // ... P2 车流碰撞

    race.playerCollisionCooldown = Math.max(race.playerCollisionCooldown - dt, 0)
    if (
      race.playerCollisionCooldown === 0 &&
      collidePlayers(
        race.cameraZ,
        race.carState.position,
        race.cameraZ2,
        race.carState2.position,
      )
    ) {
      race.carState.speed *= COLLISION_SPEED_FACTOR
      race.carState2.speed *= COLLISION_SPEED_FACTOR
      race.collisionCount++
      race.playerCollisionCooldown = COLLISION_COOLDOWN
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/unit/collision.test.ts
```

Expected: PASS

- [ ] **Step 5: 全量验证**

```bash
npm run typecheck && npm run lint && npm test && npm run bot
```

- [ ] **Step 6: 提交**

```bash
git add src/game/collision.ts src/game/state.ts tests/unit/collision.test.ts
git commit -m "fix(collision): add cooldown for player-player collisions"
```

---

### Task 2: 修复车辆与路边景物渲染尺寸（P0-2 / P0-3）

**Files:**
- Modify: `src/engine/traffic-render.ts:42-43`
- Modify: `src/engine/renderer.ts:285`（树木高度计算）
- Modify: `src/engine/sprites.ts:16-18`（景物世界尺寸）
- Modify: `src/engine/road-geometry.ts`（可选：道路半宽校准）
- Create/Modify: `tests/unit/traffic-render.test.ts`, `tests/unit/sprites.test.ts`

**Interfaces:**
- Consumes: `project`, `TrafficCar`, `Sprite`, `ProjectionOptions`, `Camera3D`
- Produces: `TrafficProjection`（width/height 合理）, `Sprite` 尺寸合理

**根因分析：**
当前车流宽度使用 `bottom.scale * opts.height * 0.9`，未基于车辆世界宽度，且使用了屏幕高度而非宽度；路边景物 `hpx = sprite.height * bottom.scale * opts.height * 0.5` 中 `sprite.height = 3` 过大，导致近处景物巨大。

**推荐方案：**
1. 为车流引入世界宽度与高度（如 `worldWidth: 0.8`, `worldHeight: 0.6`），像素尺寸按 `worldDim * scale * (opts.height / 2)` 计算（垂直投影比例）。
2. 将树木/路灯世界高度降低至合理范围（如 `TREE_HEIGHT = 0.6`, `LAMP_HEIGHT = 0.4`），或在投影时额外乘以校准系数。
3. 保持道路渲染不变，仅调整 object 世界尺寸。

- [ ] **Step 1: 写失败回归测试**

```typescript
// tests/unit/traffic-render.test.ts
import { describe, expect, it } from 'vitest'
import { projectTraffic } from '../../src/engine/traffic-render'
import type { TrafficCar } from '../../src/engine/traffic'

const camera = { x: 0, y: 1, z: 0 }
const opts = { width: 800, height: 600, horizon: 210, depth: 672 }

function carAt(z: number): TrafficCar {
  return { z, offset: 0, speed: 0, colorIndex: 0 }
}

describe('traffic projection sizing', () => {
  it('car near camera should not exceed 30% screen height', () => {
    const cars: TrafficCar[] = [carAt(400)]
    const projected = projectTraffic(cars, 0, 0, opts, camera)
    expect(projected).toHaveLength(1)
    const p = projected[0]
    expect(p.height).toBeLessThan(opts.height * 0.3)
    expect(p.width).toBeLessThan(opts.height * 0.3)
  })
})
```

扩展 `tests/unit/sprites.test.ts`：

```typescript
it('tree projection near camera should not exceed 50% screen height', () => {
  const track = createStraightTrack(10)
  const sprites = createRoadsideSprites(track)
  const seen = spritesInRange(sprites, track, 0, 800)
  // 取最远的几个 sprite 测试，近处若大于 50% 则判定失败
  // 实际可通过 mock project 计算
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/unit/traffic-render.test.ts
```

Expected: FAIL（车辆高度 > 30% 屏高）

- [ ] **Step 3: 校准车流世界尺寸与投影公式**

修改 `src/engine/traffic.ts`（为 TrafficCar 增加 world 尺寸，保持向后兼容）：

```typescript
export interface TrafficCar {
  z: number
  offset: number
  speed: number
  colorIndex: number
  worldWidth?: number
  worldHeight?: number
}
```

修改 `src/engine/traffic-render.ts`：

```typescript
const DEFAULT_CAR_WIDTH = 0.7
const DEFAULT_CAR_HEIGHT = 0.5

export function projectTraffic(...) {
  // ...
  const width = (car.worldWidth ?? DEFAULT_CAR_WIDTH) * bottom.scale * (opts.height / 2)
  const height = (car.worldHeight ?? DEFAULT_CAR_HEIGHT) * bottom.scale * (opts.height / 2)
  // ...
}
```

修改 `src/engine/sprites.ts`：

```typescript
const ROAD_SIDE_OFFSET = 1.4
const TREE_HEIGHT = 0.6
const LAMP_HEIGHT = 0.45
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/unit/traffic-render.test.ts tests/unit/sprites.test.ts
```

- [ ] **Step 5: 浏览器验证截图**

```bash
npm run dev
# 在另一个终端运行 Playwright 截图脚本或 agent-browser 验证车辆/景物尺寸
python test-manual.py
```

确认截图中车辆不再显示为巨大方块，树木尺寸合理。

- [ ] **Step 6: 全量验证**

```bash
npm run typecheck && npm run lint && npm test && npm run bot
```

- [ ] **Step 7: 提交**

```bash
git add src/engine/traffic.ts src/engine/traffic-render.ts src/engine/sprites.ts tests/unit/traffic-render.test.ts tests/unit/sprites.test.ts
git commit -m "fix(engine): calibrate traffic and sprite world sizes for correct perspective"
```

---

### Task 3: 修复菜单阶段 HUD 残留（P0-4）

**Files:**
- Modify: `src/ui/hud.ts:19-47`
- Modify: `src/main.ts:217`
- Create/Modify: `tests/unit/hud.test.ts`

**Interfaces:**
- Consumes: `HudElements`, `RaceState`, `Phase`
- Produces: `updateHud` 新增 `phase` 参数，菜单阶段隐藏所有 HUD

- [ ] **Step 1: 写失败回归测试**

```typescript
// tests/unit/hud.test.ts
import { describe, expect, it } from 'vitest'
import { updateHud } from '../../src/ui/hud'
import { createRaceState } from '../../src/game/state'
import { createCarConfig } from '../../src/physics/car'

const elements = {
  hudBest: { hidden: false, textContent: '' },
  hudSpeed: { hidden: false, textContent: '' },
  hudLap: { hidden: false, textContent: '' },
  hudTime: { hidden: false, textContent: '' },
  hudSpeed2: { hidden: false, textContent: '' },
  hudLap2: { hidden: false, textContent: '' },
  hudTime2: { hidden: false, textContent: '' },
  driftIndicator: { hidden: false, textContent: '' },
  driftScoreValue: { textContent: '' },
} as any

const race = createRaceState([])
const carConfig = createCarConfig()

describe('hud visibility', () => {
  it('hides all hud elements in menu phase', () => {
    updateHud(elements, race, carConfig, null, false, 1000, 3, 'menu')
    expect(elements.hudSpeed.hidden).toBe(true)
    expect(elements.hudLap.hidden).toBe(true)
    expect(elements.hudTime.hidden).toBe(true)
    expect(elements.hudBest.hidden).toBe(true)
    expect(elements.hudSpeed2.hidden).toBe(true)
    expect(elements.hudLap2.hidden).toBe(true)
    expect(elements.hudTime2.hidden).toBe(true)
    expect(elements.driftIndicator.hidden).toBe(true)
  })

  it('shows hud elements in racing phase', () => {
    updateHud(elements, race, carConfig, null, false, 1000, 3, 'racing')
    expect(elements.hudSpeed.hidden).toBe(false)
    expect(elements.hudLap.hidden).toBe(false)
    expect(elements.hudTime.hidden).toBe(false)
    expect(elements.driftIndicator.hidden).toBe(true) // drift inactive
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/unit/hud.test.ts
```

Expected: FAIL（updateHud 无 phase 参数或菜单阶段不隐藏）

- [ ] **Step 3: 修改 updateHud 接口与实现**

修改 `src/ui/hud.ts`：

```typescript
import { PHASE_MENU, PHASE_FINISHED, type Phase } from './gamestate'

export function updateHud(
  elements: HudElements,
  race: RaceState,
  carConfig: CarConfig,
  bestTime: number | null,
  splitMode: boolean,
  lapLength: number,
  totalLaps: number,
  phase: Phase,
): void {
  const showHud = phase === PHASE_RACING || phase === PHASE_PAUSED
  elements.hudSpeed.hidden = !showHud
  elements.hudLap.hidden = !showHud
  elements.hudTime.hidden = !showHud
  elements.hudBest.hidden = !showHud || bestTime === null
  elements.driftIndicator.hidden = !showHud || !race.driftState.active

  if (!showHud) {
    return
  }

  // ... existing update logic
}
```

修改 `src/main.ts:217`：

```typescript
updateHud(hudElements, race, carConfig, bestTime, SPLIT_MODE, lapLength, totalLaps, phase)
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/unit/hud.test.ts
```

- [ ] **Step 5: 浏览器验证截图**

确认 `01-menu.png` 中右上角无 HUD 残留。

- [ ] **Step 6: 全量验证与提交**

```bash
npm run typecheck && npm run lint && npm test && npm run bot
```

```bash
git add src/ui/hud.ts src/main.ts tests/unit/hud.test.ts
git commit -m "fix(ui): hide HUD during menu and finished phases"
```

---

### Task 4: 重构分屏为独立游戏实例（P0-5 / P0-6 / P1-9）

**Files:**
- Create: `src/game/player-state.ts`
- Modify: `src/game/state.ts`
- Modify: `src/main.ts:171-215`
- Modify: `src/ui/hud.ts`
- Modify: `src/engine/renderer.ts:156-172`
- Create/Modify: `tests/unit/player-state.test.ts`

**Interfaces:**
- Consumes: `CarState`, `DriftState`, `SmokeParticle[]`
- Produces: `PlayerState { carState, driftState, cameraZ, raceTime, collisionCooldown, smoke }`

**设计：**
将 P1/P2 各自的状态封装为 `PlayerState`，主循环分别更新两个实例。分屏时按左右分割（默认），每个玩家独立 cameraZ、速度和计时。

- [x] **Step 1: 设计 PlayerState 类型与辅助函数**

创建 `src/game/player-state.ts`：

```typescript
import type { CarState } from '../physics/car'
import type { DriftState } from '../physics/drift'
import { createDriftState } from '../physics/drift'

export interface PlayerState {
  carState: CarState
  driftState: DriftState
  cameraZ: number
  raceTime: number
  collisionCooldown: number
}

export function createPlayerState(): PlayerState {
  return {
    carState: { position: 0, speed: 0 },
    driftState: createDriftState(),
    cameraZ: 0,
    raceTime: 0,
    collisionCooldown: 0,
  }
}

export function resetPlayerState(state: PlayerState): void {
  state.carState.position = 0
  state.carState.speed = 0
  state.driftState = createDriftState()
  state.cameraZ = 0
  state.raceTime = 0
  state.collisionCooldown = 0
}
```

- [x] **Step 2: 写失败回归测试**

```typescript
// tests/unit/player-state.test.ts
import { describe, expect, it } from 'vitest'
import { createPlayerState, resetPlayerState } from '../../src/game/player-state'

describe('player state', () => {
  it('creates independent initial state', () => {
    const p1 = createPlayerState()
    const p2 = createPlayerState()
    p1.cameraZ = 100
    expect(p2.cameraZ).toBe(0)
  })

  it('reset clears state', () => {
    const p = createPlayerState()
    p.cameraZ = 100
    p.raceTime = 10
    resetPlayerState(p)
    expect(p.cameraZ).toBe(0)
    expect(p.raceTime).toBe(0)
  })
})
```

- [x] **Step 3: 重构 RaceState 使用 PlayerState**

修改 `src/game/state.ts`：

```typescript
import { createPlayerState, type PlayerState } from './player-state'

export interface RaceState {
  player1: PlayerState
  player2: PlayerState
  collisionCount: number
  lapTimes: number[]
  lastLap: number
  phase: Phase
  finishShown: boolean
  traffic: TrafficCar[]
}
```

**注意：** 此重构影响面大，需同步更新 `main.ts`, `ui/hud.ts`, `game/collision.ts`, `ui/screens.ts` 等所有消费方。

- [x] **Step 4: 修改 main.ts 主循环支持独立 P1/P2 与左右分屏**

```typescript
// 渲染部分改为左右分割
if (SPLIT_MODE) {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setCameraX(race.player1.carState.position)
  renderer.renderRegion(race.player1.cameraZ, 0, w / 2, race.player1.driftState.smoke, race.player1.raceTime)
  renderer.setCameraX(race.player2.carState.position)
  renderer.renderRegion(race.player2.cameraZ, w / 2, w / 2, race.player2.driftState.smoke, race.player2.raceTime)
}
```

- [x] **Step 5: 修复分屏菜单黑屏**

在 `src/main.ts` 渲染分支中，菜单阶段也渲染赛道预览：

```typescript
if (phase === PHASE_MENU) {
  if (SPLIT_MODE) {
    const w = window.innerWidth
    renderer.setCameraX(0)
    renderer.renderRegion(0, 0, w / 2, [], 0)
    renderer.renderRegion(0, w / 2, w / 2, [], 0)
  } else {
    renderer.setCameraX(0)
    renderer.render(0, [], 0)
  }
}
else if (phase === PHASE_RACING || phase === PHASE_PAUSED) {
  // ... existing racing render
}
```

- [x] **Step 6: 更新 HUD 布局支持左右分屏**

调整 `src/ui/hud.ts` 与 `index.html`/`style.css`，使 P1 HUD 在左侧画面上方，P2 HUD 在右侧画面上方。可新增参数 `viewport: 'left' | 'right' | 'full'`。

- [x] **Step 7: 运行测试**

```bash
npx vitest run tests/unit/player-state.test.ts tests/unit/hud.test.ts tests/unit/collision.test.ts
```

- [x] **Step 8: 浏览器验证分屏**

打开 `http://localhost:5175/?split=1`，确认：
- 菜单阶段左右两个区域都有预览
- 开始比赛后 P1/P2 速度、时间不同步
- 左右分屏显示正常

- [x] **Step 9: 全量验证与提交**

```bash
npm run typecheck && npm run lint && npm test && npm run bot
```

```bash
git add src/game/player-state.ts src/game/state.ts src/main.ts src/ui/hud.ts src/ui/screens.ts src/engine/renderer.ts tests/unit/player-state.test.ts
git commit -m "refactor(game): split player state and implement true independent split-screen"
```

#### 实施偏差（Task 4 实际落地与设计的差异）

1. **碰撞冷却合并为 PlayerState.collisionCooldown 单字段**：按文档 PlayerState 仅含一个 `collisionCooldown`，将原 `collisionCooldown` / `collisionCooldown2` / `playerCollisionCooldown` 三字段合并。互碰命中时同时设置双方 `collisionCooldown`，因此互碰后 1 秒内车流碰撞与互碰均不重复罚速；边界语义变化：原 Task 1 实现为"冷却归零当帧跳过检测"，新实现为"冷却归零当帧恢复检测"（1 秒冷却保护完整，归零当帧若仍重叠则立即罚速）。`collision.test.ts` 对应断言已同步更新（"冷却结束后再次重叠可再次罚速"改为验证 1.1s 后立即罚速）。核心行为保持：互碰命中后 1 秒冷却期内不重复罚速。
2. **HUD 布局未新增 viewport 参数**：复用现有 `splitMode` 参数 + `HudElements` 可选容器字段（`hudContainer`/`hud2Container`），`updateHud` 内 toggle `split` CSS 类实现左右分屏布局（P1 左上、P2 右上，左右对称）；`index.html` 无需改动（`#hud`/`#hud2` 容器已存在），仅 `style.css` 新增 `#hud.split` / `#hud2.split` 规则。
3. **renderer.ts 未修改**：现有 `renderRegion` 已是左右分割（translate + clip），直接复用；分屏渲染为 `renderRegion(cameraZ, 0, w/2, ...)` + `renderRegion(cameraZ, w/2, w/2, ...)`。
4. **菜单阶段渲染**：分屏菜单渲染左右两个预览区域（`renderRegion(0, 0, w/2, [], 0)` 与 `renderRegion(0, w/2, w/2, [], 0)`），单屏菜单保持 `renderer.render(0, [], 0)` 预览；结算/暂停沿用原渲染分支。
5. **测试文件范围**：除新增 `player-state.test.ts` 外，还全量更新了 `collision.test.ts`（字段路径迁移 + 互碰冷却断言调整）与 `hud.test.ts`（新增 split 布局类切换测试）。

---

### Task 5: 拆分 main.ts 与消除反向依赖（P1-1 / P1-2 / P1-3 / P1-8）

**Files:**
- Create: `src/game/phase.ts`
- Create: `src/game/game-loop.ts`
- Create: `src/game/track-manager.ts`
- Create: `src/game/debug-hook.ts`
- Modify: `src/ui/gamestate.ts`（迁移 Phase 定义）
- Modify: `src/game/state.ts`
- Modify: `src/main.ts`
- Create/Modify: 对应单测

**Interfaces:**
- Consumes: `RaceState`, `PlayerState`, `TrackDef`, `Renderer`, `InputManager`
- Produces: `GameLoop` 类/函数, `TrackManager`, `DebugHook`, `Phase` 从 `game/` 导出

**注意：** 此 Task 与 Task 4 有依赖关系。建议先完成 Task 4（PlayerState 抽象），再执行本 Task。

- [x] **Step 1: 下沉 Phase 定义**

创建 `src/game/phase.ts`：

```typescript
export const PHASE_MENU = 'menu'
export const PHASE_RACING = 'racing'
export const PHASE_FINISHED = 'finished'
export const PHASE_PAUSED = 'paused'
export type Phase = typeof PHASE_MENU | typeof PHASE_RACING | typeof PHASE_FINISHED | typeof PHASE_PAUSED
```

修改 `src/ui/gamestate.ts`：

```typescript
export { PHASE_MENU, PHASE_RACING, PHASE_FINISHED, PHASE_PAUSED, type Phase } from '../game/phase'
export { nextPhase, togglePause } from './phase-logic'
```

创建 `src/game/phase-logic.ts` 包含 `nextPhase` 和 `togglePause`：

```typescript
import { PHASE_MENU, PHASE_RACING, PHASE_PAUSED, PHASE_FINISHED, type Phase } from './phase'

export function nextPhase(phase: Phase, lap: number, totalLaps: number): Phase { ... }
export function togglePause(phase: Phase): Phase { ... }
```

- [x] **Step 2: 提取单玩家帧更新函数消除重复**

在 `src/game/game-loop.ts`：

```typescript
export function updatePlayerFrame(
  dt: number,
  input: CarInput,
  player: PlayerState,
  carConfig: CarConfig,
  lapLength: number,
  lapTimes: number[],
  lastLapRef: { value: number },
): void {
  player.driftState = updateDrift(dt, input, player.carState, carConfig, player.driftState, player.cameraZ)
  player.carState.speed *= driftSpeedFactor(player.driftState)
  updateCar(dt, input, player.carState, carConfig, effectiveTurnRate(carConfig, player.driftState))
  player.cameraZ += player.carState.speed * dt
  player.raceTime += dt

  const currentLap = lapFromZ(player.cameraZ, lapLength)
  if (currentLap > lastLapRef.value) {
    lapTimes.push(player.raceTime)
    lastLapRef.value = currentLap
  }
}
```

- [x] **Step 3: 拆分 main.ts 到 GameLoop 与 TrackManager**

创建 `src/game/game-loop.ts` 包含 `GameLoop` 类，封装主循环逻辑。
创建 `src/game/track-manager.ts` 管理 `applyTrack` 与 `updateTrackSelect`。
创建 `src/game/debug-hook.ts` 暴露 `window.__gameDebug`。

`src/main.ts` 瘦身为：

```typescript
import './style.css'
import { initGame } from './game/game-loop'

initGame()
```

- [x] **Step 4: 运行测试**

```bash
npx vitest run tests/unit/game-loop.test.ts tests/unit/phase.test.ts tests/unit/track-manager.test.ts
```

- [x] **Step 5: 全量验证与提交**

```bash
npm run typecheck && npm run lint && npm test && npm run bot
```

```bash
git add src/game/phase.ts src/game/phase-logic.ts src/game/game-loop.ts src/game/track-manager.ts src/game/debug-hook.ts src/main.ts src/ui/gamestate.ts tests/unit/phase.test.ts tests/unit/game-loop.test.ts
git commit -m "refactor(main): split game loop, track manager, debug hook and move Phase to game layer"
```

#### 实施偏差（Task 5 实际落地与设计的差异）

1. **lapFromZ 迁移到 game/lap.ts**：文档假设圈数判定来自 `engine/track.ts`，实际 `lapFromZ` 位于 `ui/format.ts`。为避免 `game/game-loop.ts` 引入新的 game→ui 反向依赖，创建 `src/game/lap.ts` 承载 `lapFromZ`，`ui/format.ts` 改为 re-export（`export { lapFromZ } from '../game/lap'`），hud.ts 与 format.test.ts 等旧消费方不受影响。
2. **updatePlayerFrame 的 lapTimes/lastLapRef 改为可选参数**：文档示例为必选，但原 main.ts 仅 P1 记录圈速（P2 不 push lapTimes、不推进 lastLap）。若 P2 也传共享的 `race.lapTimes`/`lastLap` 会污染 P1 的圈速记录与完赛判定，因此 P2 调用不传圈数参数，保持行为完全不变。
3. **lastLap 桥接模式**：`RaceState.lastLap` 保持真相源，GameLoop 每帧以 `{ value: race.lastLap }` 包装传入 `updatePlayerFrame`，调用后写回 `race.lastLap = lapRef.value`；未引入持久引用对象。
4. **TrackManager 依赖注入**：`renderer` 以惰性 getter（`() => this.renderer`）注入（GameLoop 构造后才创建 renderer），`resetRace` 以回调注入；`applyTrack` 内部先 `renderer.setTrack` 再 `resetRace`，顺序与 main.ts 一致。
5. **测试范围**：除 `phase.test.ts`（9 例）、`game-loop.test.ts`（8 例）外，另新增 `track-manager.test.ts`（4 例，mock Renderer/DOM 薄验证）；`gamestate.test.ts` 未迁移删除，re-export 后原 6 例继续通过；`format.test.ts` 因 lapFromZ re-export 保持通过。
6. **game/state.ts 反向依赖消除**：import 由 `../ui/gamestate` 改为 `./phase`（P1-2）；同时 `ui/gamestate.ts` 保留为 re-export 兼容层，screens/hud 等旧导入路径不破坏。

---

### Task 6: 统一 updateDrift 语义与简化碰撞冷却（P1-4 / P1-5）

**Files:**
- Modify: `src/physics/drift.ts`
- Modify: `src/game/collision.ts`
- Modify: 所有调用方
- Create/Modify: `tests/unit/drift.test.ts`, `tests/unit/collision.test.ts`

**Interfaces:**
- Consumes: `DriftState`, `CarInput`, `CarState`, `CarConfig`, `cameraZ`
- Produces: `updateDrift` 明确为纯函数返回新 `DriftState`；`applyTrafficCollision` 直接接受 `number` 冷却字段

- [x] **Step 1: 修改 updateDrift 为纯函数**

```typescript
// src/physics/drift.ts
export function updateDrift(
  dt: number,
  input: CarInput,
  carState: CarState,
  config: CarConfig,
  drift: DriftState,
  cameraZ: number,
): DriftState {
  // 不修改入参 drift，返回新对象
  const next = { ...drift }
  // ... existing logic operating on next
  return next
}
```

- [x] **Step 2: 简化碰撞冷却**

```typescript
// src/game/collision.ts
export function applyTrafficCollision(
  carState: CarState,
  cameraZ: number,
  traffic: TrafficCar[],
  cooldown: number,
  dt: number,
): { hit: boolean; cooldown: number } {
  cooldown = Math.max(cooldown - dt, 0)
  if (cooldown > 0) {
    return { hit: false, cooldown }
  }
  const hit = collideWithPlayer(traffic, cameraZ, carState.position)
  if (hit) {
    carState.speed *= COLLISION_SPEED_FACTOR
    cooldown = COLLISION_COOLDOWN
  }
  return { hit, cooldown }
}
```

- [x] **Step 3: 更新调用方并跑测试**

```bash
npx vitest run tests/unit/drift.test.ts tests/unit/collision.test.ts
```

- [x] **Step 4: 全量验证与提交**

```bash
npm run typecheck && npm run lint && npm test && npm run bot
```

```bash
git add src/physics/drift.ts src/game/collision.ts src/main.ts tests/unit/drift.test.ts tests/unit/collision.test.ts
git commit -m "refactor(physics): make updateDrift pure and simplify collision cooldown"
```

#### 实施偏差（Task 6 实际落地与设计的差异）

1. **updateDrift 纯函数实现需深复制 smoke**：文档仅示例 `const next = { ...drift }`。由于 `smoke` 是数组（粒子对象可变），浅拷贝会让 `push` 与粒子 `t` 老化污染原对象。实际实现为 `{ ...drift, smoke: [...drift.smoke] }`，且老化阶段以 `{ ...particle, t: particle.t + dt }` 复制粒子，保证原对象（含数组与粒子）完全不变（有测试断言原对象 `toEqual` 不变）。
2. **调用方位置变更**：文档 Files 提到 `src/main.ts`，实际 main.ts 已在 Task 5 拆分，唯一调用方是 `src/game/game-loop.ts` 的 `updatePlayerFrame`（已是 `player.driftState = updateDrift(...)` 赋值模式），本任务未改任何调用方。
3. **applyTrafficCollision 需将命中结果转布尔**：`collideWithPlayer` 返回 `TrafficCar | null`（truthy 判断），而新返回值类型为 `{ hit: boolean; cooldown: number }`，因此用 `const collision = collideWithPlayer(...)` + `if (collision)` 转布尔后返回。
4. **冷却字段合并已由 Task 4 完成**：`updateCollisions` 在 Task 4 已使用 `PlayerState.collisionCooldown` 单一字段（车流与互碰共用）。本任务仅消除 `applyTrafficCollision` 残留的 `{ value }` 包装对象，改为数字冷却 + `{ hit, cooldown }` 返回值，互碰/车流共用冷却语义保持不变（互碰命中双设冷却，冷却期内两者均不罚速）。
5. **测试更新**：drift.test.ts 中 4 个"不接收返回值"的得分用例改为断言返回值（原 in-place 语义用例）；新增 1 例纯函数性用例（原对象不变 + 粒子 t 正确老化）。collision.test.ts 的 7 个 `applyTrafficCollision` 用例全部改为数字 cooldown + `{ hit, cooldown }` 断言，保留"冷却期内不重复罚速"与"冷却归零后恢复"核心断言。

---

### Task 7: 集中游戏参数配置（P1-7 / P1-6）

**Files:**
- Create: `src/game/constants.ts`
- Modify: `src/physics/drift.ts`
- Modify: `src/game/collision.ts`
- Modify: `src/engine/renderer.ts`
- Modify: `src/engine/road-geometry.ts`（保留导出，默认值来自 constants）
- Create/Modify: `tests/unit/constants.test.ts`

**Interfaces:**
- Produces: `DRIFT_*`, `COLLISION_*`, `RENDER_*`, `CAR_*` 等常量

- [x] **Step 1: 创建 constants.ts**

```typescript
// src/game/constants.ts
export const DRIFT_STEER_THRESHOLD = 0.7
export const DRIFT_CHARGE_THRESHOLD = 0.25
export const DRIFT_SPEED_FACTOR = 0.985
export const DRIFT_SCORE_MAX = 99999

export const COLLISION_SPEED_FACTOR = 0.5
export const COLLISION_COOLDOWN = 1

export const RENDER_DRAW_DISTANCE = 120
export const RENDER_HORIZON_RATIO = 0.35
export const RENDER_DEPTH_RATIO = 0.84

export const ROAD_HALF_WIDTH = 1
export const EDGE_WIDTH = 0.15
```

- [x] **Step 2: 替换各文件魔法数字**

- `src/physics/drift.ts` 使用 `DRIFT_*`
- `src/game/collision.ts` 使用 `COLLISION_*`
- `src/engine/renderer.ts` 使用 `RENDER_HORIZON_RATIO`, `RENDER_DEPTH_RATIO`
- `src/engine/road-geometry.ts` 使用 `RENDER_DRAW_DISTANCE`, `ROAD_HALF_WIDTH`, `EDGE_WIDTH`

- [x] **Step 3: 修复 Renderer null! 断言**

将 `MountainLayer` 构建改为工厂模式：

```typescript
private buildMountains(width: number): MountainLayer[] {
  const layerDefs = [
    { profile: generateMountainProfile(width, 2024), factor: 0.02, color: '#27425e', peak: 0.5 },
    { profile: generateMountainProfile(width, 77), factor: 0.05, color: '#1f3046', peak: 0.35 },
  ]
  return layerDefs.map((def) => ({
    ...def,
    offscreen: renderMountainOffscreen(def as MountainLayer, width),
  }))
}
```

- [x] **Step 4: 运行测试与提交**

```bash
npm run typecheck && npm run lint && npm test && npm run bot
```

```bash
git add src/game/constants.ts src/physics/drift.ts src/game/collision.ts src/engine/renderer.ts src/engine/road-geometry.ts tests/unit/constants.test.ts
git commit -m "refactor(config): centralize game constants and remove null assertion in renderer"
```

#### 实施偏差（Task 7 实际落地与设计的差异）

1. **DRIFT_SCORE_MAX 仅为注册常量**：当前代码（drift.ts）没有 score 上限 clamp 逻辑（2026-08-02-optimize.md 中"score 不超上限 99999"的 RED/GREEN 计划未落地），constants.ts 按约定值 99999 注册该常量，drift.ts 未引入 clamp，保持渲染与计分行为完全不变。
2. **RENDER_DRAW_DISTANCE 为新增名，保留 DRAW_DISTANCE 兼容导出**：现有消费方（renderer.ts、traffic-render.ts、traffic-render.test.ts）均 import `DRAW_DISTANCE`，road-geometry.ts 以 `export const DRAW_DISTANCE = RENDER_DRAW_DISTANCE` 保留兼容名，消费方未迁移（常量注册表测试断言两值一致）。
3. **buildMountains 已有雏形**：实际代码是"先建数组字面量（offscreen: null!）再循环赋值"；改造为 layerDefs + map 工厂，profile/factor/color/peak 与 renderMountainOffscreen 调用完全不变，仅消除 `null!` 断言，渲染行为不变。
4. **drift.ts 未集中的常量保留本地定义**：SPEED_RATIO_THRESHOLD、CHARGE_DECAY、SMOKE_INTERVAL、SMOKE_LIFETIME、DRIFT_SCORE_RATE、DRIFT_TURN_MULTIPLIER 不在 Task 7 常量清单内，按范围保留本地定义。
5. **road-geometry.test.ts 无需改动**：ROAD_HALF_WIDTH/EDGE_WIDTH 仍从 road-geometry 导出（re-export），测试 import 路径不变。

---

### Task 8: 修复赛道切换预览（P1-10）

**Files:**
- Modify: `src/main.ts` 或 `src/game/track-manager.ts`
- Modify: `src/ui/screens.ts`
- Modify: `index.html`, `src/style.css`

**Interfaces:**
- Consumes: `TrackDef`, `Renderer`
- Produces: 赛道切换时菜单背景即时更新

**根因：** `applyTrack` 已调用 `renderer.setTrack(track, createRoadsideSprites(track))`，但菜单阶段的渲染没有使用新 track。当前菜单阶段不渲染，或渲染了但 cameraZ=0 的预览对所有赛道看起来相似。

**修复方案：** 菜单阶段使用当前赛道缓慢推进的 cameraZ 渲染预览，并在不同赛道切换时重置预览 cameraZ 到不同起点。

- [x] **Step 1: 在菜单阶段维护预览 cameraZ**

```typescript
let previewCameraZ = 0
```

- [x] **Step 2: 切换赛道时重置预览 cameraZ**

```typescript
function applyTrack(index: number): void {
  // ... existing logic
  previewCameraZ = index * 5000 // 不同赛道从不同位置预览
}
```

- [x] **Step 3: 菜单阶段渲染缓慢滚动的预览**

```typescript
if (phase === PHASE_MENU) {
  previewCameraZ += 50 * dt
  if (previewCameraZ > lapLength) previewCameraZ -= lapLength
  renderer.setCameraX(Math.sin(previewCameraZ * 0.001) * 0.3)
  renderer.render(previewCameraZ, [], 0)
}
```

- [x] **Step 4: 浏览器验证**

切换赛道 1/2/3，确认右侧预览画面有明显差异。

- [x] **Step 5: 全量验证与提交**

```bash
npm run typecheck && npm run lint && npm test && npm run bot
```

```bash
git add src/main.ts src/game/track-manager.ts
git commit -m "feat(ui): animate track preview on menu and reflect selected track"
```

### 实施偏差

- **实际改动文件**：Task 4/5 重构后 main.ts 已拆分，本任务只改 `src/game/game-loop.ts`（预览状态/推进/渲染分支）、`tests/unit/game-loop.test.ts`（纯函数单测）与本文档。`track-manager.ts`、`screens.ts`、`index.html`、`style.css` 无需改动（TrackManager 已封装赛道切换，选单 DOM 与半透明遮罩已就绪）。
- **previewCameraZ 归属**：由 GameLoop 持有（TrackManager 保持纯赛道数据职责），切换赛道时在 `onKeyDown` 的 `applyTrack(index)` 之后重置。推进与初始位置提取为可单测纯函数 `advancePreviewCameraZ` / `initialPreviewCameraZ`。
- **初始位置从 index*5000 改为按圈长等分**：三条赛道起点附近均为直道（经典 12000 / 高速 15000 / S 弯 5000 前无曲率），`index*5000` 使经典与高速预览同为直道无法区分；改为 `floor(index * lapLength / TRACK_DEFS.length)` 后经典落在直道、高速落在右弯中段、S 弯落在左弯中段。
- **推进速度从 50 微调为 500**：50 单位/秒相对 24000 视距（DRAW_DISTANCE×SEGMENT_LENGTH）每帧仅 0.8 单位，肉眼不可感知；500 单位/秒每帧约 8 单位、横向 sin 摆动周期约 12.6 秒，仍属"缓慢滚动"且可见。见 `PREVIEW_CAMERA_SPEED` 注释。
- **TDD**：GameLoop 依赖真实 DOM/canvas（canvas mock 属 Task 9），不写脆弱 DOM 测试；预览逻辑已提取为纯函数并在 `game-loop.test.ts` 新增 4 个单测（线性推进、超圈回绕、圈长等分、三赛道真实圈长下起点互异），game-loop.test.ts 由 8 → 12 个测试。
- **分屏**：左右两区域共用同一 previewCameraZ 渲染（保持 Task 4 双区域预览），并叠加滚动与横向摆动。
- **浏览器验证（程序化）**：Playwright 直读 canvas 像素签名，三赛道两两差异 45.9%~71.6%，同赛道 3 秒滚动差异 38.9%，切回赛道 1 起点重置生效。截图见 `shots/optimization/task8-track1.png`、`task8-track2.png`、`task8-track3.png`（shots/ 已 gitignore）。

---

### Task 9: 补充 Renderer 与主循环测试（P2-1 / P2-2）

**Files:**
- Create: `tests/unit/renderer-state.test.ts`
- Create: `tests/unit/game-loop-integration.test.ts`
- Create: `tests/__mocks__/canvas.ts`（mock CanvasRenderingContext2D）

**Interfaces:**
- Produces: 对 `Renderer.setViewport`, `setTrack`, `setTraffic` 的状态切换测试；对 `GameLoop` 的启动/暂停/完赛状态机测试

- [x] **Step 1: 创建 Canvas mock**

```typescript
// tests/__mocks__/canvas.ts
export function createMockCanvas(width = 800, height = 600): HTMLCanvasElement {
  const ctx = {
    fillStyle: '',
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rect: () => {},
    clip: () => {},
    drawImage: () => {},
    arc: () => {},
    setTransform: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  } as unknown as CanvasRenderingContext2D

  return {
    getContext: () => ctx,
    width,
    height,
  } as HTMLCanvasElement
}
```

- [x] **Step 2: 写 Renderer 状态测试**

```typescript
// tests/unit/renderer-state.test.ts
import { describe, expect, it } from 'vitest'
import { Renderer } from '../../src/engine/renderer'
import { createMockCanvas } from '../__mocks__/canvas'
import { createStraightTrack } from '../helpers/track'

describe('renderer state', () => {
  it('setTrack updates internal track and sprites', () => {
    const canvas = createMockCanvas()
    const track1 = createStraightTrack(10)
    const track2 = createStraightTrack(20)
    const renderer = new Renderer(canvas, track1, 800, 600)
    renderer.setTrack(track2, [])
    // 通过渲染不抛错来验证
    renderer.render(0, [], 0)
  })
})
```

- [x] **Step 3: 写主循环集成测试**

```typescript
// tests/unit/game-loop-integration.test.ts
import { describe, expect, it } from 'vitest'
import { createGameLoop } from '../../src/game/game-loop'

describe('game loop', () => {
  it('starts in menu phase', () => {
    const loop = createGameLoop({ ... })
    expect(loop.phase).toBe('menu')
  })

  it('transitions to racing on input', () => {
    // 模拟输入事件
  })
})
```

- [x] **Step 4: 运行测试与提交**

```bash
npm run typecheck && npm run lint && npm test && npm run bot
```

```bash
git add tests/__mocks__/canvas.ts tests/unit/renderer-state.test.ts tests/unit/game-loop-integration.test.ts
git commit -m "test(integration): add renderer state and game loop smoke tests"
```

### 实施偏差

- **实际新增文件**：`tests/__mocks__/canvas.ts`、`tests/unit/renderer-state.test.ts`（8 用例）、`tests/unit/game-loop-integration.test.ts`（6 用例）。未修改任何 src 代码。
- **Canvas mock 覆盖**：文档骨架只含 fillRect 等 14 个方法；按 renderer.ts 实际调用补齐为 fillRect/beginPath/moveTo/lineTo/closePath/fill/save/restore/translate/rect/clip/drawImage/arc/setTransform/getImageData + fillStyle 属性，另加 addEventListener/appendChild/setPointerCapture（GameLoop 的 JoystickUI.attach 需要）。扩展 `__calls` 调用计数与 `__ctx` 引用，使"渲染输出稳定"可断言（同参数重复渲染 fill 次数增量恒定）。
- **createStraightTrack 来源**：文档示例从 `tests/helpers/track` 导入，该文件不存在；`createStraightTrack` 实际由 `src/engine/track.ts` 导出（引擎层既有纯函数），renderer-state.test.ts 直接 `import { createStraightTrack } from '../../src/engine/track'`，另用 `createTrackFromDef(TRACK_DEFS[1])` 覆盖真实赛道数据。
- **createGameLoop 不存在**：Task 4-8 重构后为 `class GameLoop`（constructor 无参）+ `initGame()`，且 `phase` 是私有字段。测试改为实例化 `new GameLoop()`，通过 `installDebugHook` 暴露的 `window.__gameDebug.phase` getter（bot 脚本同款读取方式）断言阶段状态，不改 src。
- **DOM 依赖解决方式**：node 测试环境无 DOM，用 `vi.stubGlobal` 替换 window/document/requestAnimationFrame/cancelAnimationFrame/AudioContext。document.getElementById 对 `'game'` 返回 canvas mock、其余 id 返回元素替身；AudioContext 用最小 FakeAudioContext（createGain/createBiquadFilter/createOscillator + 节点 value/setTargetAtTime 等）支撑 EngineSound 构造与 setSpeedRatio。
- **帧驱动**：requestAnimationFrame stub 记录回调，构造时唯一注册的 rAF 回调即 GameLoop.frame，测试按 50ms/帧（dt=0.05）手动驱动；MusicPlayer.tick 等其它回调不驱动，避免 WebAudio 调度路径。初始 now 取 `performance.now()` 避免首帧负 dt。
- **输入模拟**：window.addEventListener 记录监听器，`fireKey(code)` 同步触发全部 keydown 监听（input manager 记键 + GameLoop.onKeyDown 转阶段）。
- **finished 场景**：按键 KeyW 全油门后驱动 2500 帧（125 秒模拟）跑完经典赛道 3 圈（276000 世界单位）。途中可能与车流碰撞减速（碰撞惩罚 speed×0.5、1 秒冷却），所需帧数约 1100，2500 留足余量且实测稳定。
- **可测性建议（未改 src）**：GameLoop.phase 为私有、仅能经 debug hook 读取；若后续要更直接的状态断言，可考虑加只读 getter（如 `getPhase()`）。另外 `tests/__mocks__/canvas.ts` 中 `renderMountainOffscreen` 的离屏 canvas 也走同一 mock，未单独验证离屏缓存内容。

---

### Task 10: 优化 spritesInRange 查询性能（P2-3）

**Files:**
- Modify: `src/engine/sprites.ts`
- Modify: `src/engine/renderer.ts`
- Create/Modify: `tests/unit/sprites.test.ts`

**Interfaces:**
- Produces: `SpriteIndex`（按段分组索引）, `spritesInRange` O(1) 查询

- [x] **Step 1: 实现空间索引**

```typescript
// src/engine/sprites.ts
export function buildSpriteIndex(sprites: Sprite[], segmentLength: number): Map<number, Sprite[]> {
  const index = new Map<number, Sprite[]>()
  for (const sprite of sprites) {
    const seg = Math.floor(sprite.z / segmentLength)
    if (!index.has(seg)) index.set(seg, [])
    index.get(seg)!.push(sprite)
  }
  return index
}

export function spritesInRangeIndexed(
  index: Map<number, Sprite[]>,
  track: Segment[],
  cameraZ: number,
  viewDistance: number,
): Sprite[] { ... }
```

- [x] **Step 2: Renderer 使用索引**

- [x] **Step 3: 运行测试与提交**

```bash
npm run typecheck && npm run lint && npm test && npm run bot
```

```bash
git add src/engine/sprites.ts src/engine/renderer.ts tests/unit/sprites.test.ts
git commit -m "perf(engine): index roadside sprites by segment for O(1) range queries"
```

#### 实施偏差（Task 10）

1. **候选段数上界**：`spritesInRangeIndexed` 遍历的候选段数为 `min(track.length, floor(viewDistance / SEGMENT_LENGTH) + 2)`——窗口跨段数（`floor((f+viewDistance)/L) + 1`，f 为相机段内偏移）的安全上界，保证不遗漏；视距 ≥ 环长时退化为全环（与线性版全量返回一致）。
2. **返回顺序语义**：索引版按候选段序（自相机所在段起环形递增）收集、段内按输入顺序；线性版 `spritesInRange` 按输入数组顺序。对 `createRoadsideSprites`（z 递增输入），非跨环窗口下两版**逐元素一致**；跨环（cameraZ 距环尾不足 viewDistance）时集合与绝对 z 完全一致，仅顺序不同（段序 vs 输入序），渲染为远→近倒序绘制，视觉无回归。
3. **过滤逻辑单一事实来源**：抽出 `windowedSprite(sprite, totalLength, cameraZ, viewDistance)` 内部辅助，线性版与索引版共用同一环形回绕（`relZ = (zNorm - cameraZ) mod totalLength`）与 `relZ <= viewDistance` 过滤、`z = cameraZ + relZ` 绝对 z 化，保证行为一致。
4. **保留 `spritesInRange` 导出**：renderer 迁移到索引后仅测试作为线性基准对照使用，未删除。
5. **renderer 不再持有 sprites 字段**：构造函数 `sprites` 参数保留（位置参数调用方无感知）仅用于初始构建索引；`setTrack(track, sprites)` 签名不变，内部改为构建 `spriteIndex`（键 = `floor(z / SEGMENT_LENGTH)`）。
6. **索引适用范围**：`buildSpriteIndex` 假定 `sprite.z ∈ [0, 赛道总长)`（`createRoadsideSprites` 与测试构造均满足）；越界 z 会落到 `[0, track.length)` 外的键而被索引查询漏掉（线性版对任意 z 归一化），当前无消费方传入越界 z。
7. **验证**：`npm run typecheck`、`npm run lint`、`npm test`（256 通过）、`npm run bot`（3 圈、0 违规、均速 3631.7）全绿。

---

## 四、无人值守长程编程闭环推进指南

为了让后续 agentic worker 能够无人值守地持续推进本项目，本计划配套以下工程规范：

### 4.1 任务边界与验收标准

每个 Task 必须独立可交付、可测试。禁止跨 Task 大杂烩提交。

**单 Task 验收 checklist：**
- [ ] 代码实现完成
- [ ] 新增/更新的单元测试通过
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm test` 通过
- [ ] 如改动渲染/UI，`npm run bot` 通过
- [ ] 浏览器冒烟截图或 agent-browser 验证通过
- [ ] Git 提交（Conventional Commits）

### 4.2 验证优先级

严格按照 AGENTS.md 的验证顺序执行：

```bash
npm run typecheck  # 1. 类型安全
npm run lint       # 2. 代码规范
npm test           # 3. 单元测试
npm run build      # 4. 构建产物
npm run bot        # 5. bot 跑圈
# browser smoke    # 6. 浏览器冒烟（人工/Playwright/agent-browser）
```

### 4.3 持续集成脚本

建议新增 `scripts/ci.sh`（或 `scripts/ci.ps1`）：

```bash
#!/bin/bash
set -e
npm run typecheck
npm run lint
npm test
npm run build
npm run bot
echo "CI passed"
```

### 4.4 浏览器冒烟清单

每次提交前必须验证以下场景：
1. 启动菜单显示正常，无 HUD 残留
2. 赛道 1/2/3 切换后预览画面不同
3. 按任意键开始比赛，HUD 显示正确
4. 驾驶 10 秒以上，车辆/景物尺寸合理
5. ESC 暂停/恢复正常
6. 完赛 3 圈后结算面板显示正确
7. `?split=1` 分屏：左右分屏、两个玩家独立控制、菜单阶段两个区域都有预览
8. bot 跑圈 0 违规

### 4.5 失败处理规范

当 `npm test` 或 `npm run bot` 失败时：
1. 立即停止当前 Task
2. 使用 `superpowers:systematic-debugging` 技能分析根因
3. 先补回归测试，再修复代码
4. 修复后重新跑完全部验证链
5. 若连续 3 次修复失败，升级使用 `superpowers:oracle` 进行架构审查

### 4.6 文档同步

每完成一个 Task，更新本文档对应 checkbox。每完成一个里程碑，更新：
- 相关 `codemap.md`
- `docs/superpowers/plans/codemap.md` 中的状态
- `AGENTS.md` 中如有新验证命令/规则变更

### 4.7 安全约束

- 不引入新的运行时依赖
- 不删除现有单测，除非被取代并有等价覆盖
- 不修改 `package.json` 的 `dependencies`（保持零运行时依赖）
- 不使用 `any` 或 `@ts-ignore` 绕过类型检查
- 所有新增文件必须写入对应的 `codemap.md`

---

## 五、实施顺序

```
[Phase 1] P0 缺陷修复（必须先完成）：
  Task 1 → Task 2 → Task 3

[Phase 2] 核心重构（依赖 Phase 1）：
  Task 4 → Task 5 → Task 6 → Task 7

[Phase 3] 体验增强：
  Task 8

[Phase 4] 测试与性能：
  Task 9 → Task 10
```

**说明：**
- Task 4（分屏独立实例）会重构 `RaceState` 与 `main.ts` 主循环结构，因此 Task 5 依赖 Task 4。
- Task 6/7 可在 Task 4 完成后并行进行，但为避免冲突建议串行。

---

## 六、验证检查表（最终里程碑）

- [ ] 全量 typecheck 通过
- [ ] 全量 lint 通过
- [ ] 全量 test 通过（新增 30+ 测试）
- [ ] build 成功
- [ ] bot 跑圈 0 违规
- [ ] 浏览器冒烟：menu → start → racing → pause → resume → finish → menu 全流程
- [ ] 分屏冒烟：`?split=1` 左右分屏、P1/P2 独立控制、菜单双区域预览
- [ ] 赛道切换预览画面有差异
- [ ] 所有 P0 问题已修复
- [ ] 所有新增/修改文件已同步 codemap
- [ ] Git 提交历史清晰（Conventional Commits）

---

## 七、关键经验总结

1. **纯函数领域层是质量基石**：`physics/car.ts`、`ai/bot.ts`、`engine/projection.ts` 等纯函数模块使项目具备高可测试性，后续扩展应坚持纯函数优先。
2. **Canvas 伪 3D 投影校准是视觉体验生命线**：世界单位与投影参数必须一致，车辆和景物尺寸需与道路宽度成合理比例。
3. **分屏不是“复制渲染”而是“独立状态”**：真正的分屏需要独立的 cameraZ、速度和计时，共享状态会导致玩家体验完全同步。
4. **UI 阶段状态必须显式**：菜单阶段必须主动隐藏 HUD，不能依赖初始化时不更新。
5. **冷却机制是碰撞系统的必要组成**：任何碰撞惩罚必须配套冷却，否则持续接触会导致数值指数崩溃。
6. **主循环是集成测试盲区**：`main.ts` 和 `Renderer` 等集成点需要 mock Canvas/RAF 才能回归验证。
7. **无人值守需要强验收标准**：每个 Task 的 checkbox、验证命令、失败处理规范缺一不可。

---

*Plan created: 2026-08-03*
*Total Tasks: 10*
*Estimated: 4-6 hours (TDD + browser verification)*
*Status: Pending execution*
