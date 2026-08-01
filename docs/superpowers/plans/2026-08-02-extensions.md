# 可扩展方向实施计划（弯道控制点 / 路面景物 / 漂移 / 双人分屏 / 存档）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M1-M5 完成的 OutRun 伪 3D 复刻基础上，无人值守闭环推进 5 个可扩展方向并全部验证提交。

**Architecture:** 每个 Task 独立闭环（TDD 红→绿→集成→浏览器验证→提交），互不阻塞；修改集中在 track.ts / scenery.ts / car.ts / renderer.ts / main.ts，均有既有单测兜底。

**Tech Stack:** TypeScript + Vite + Canvas 2D 伪 3D + Vitest + tsx（bot 脚本）

## Global Constraints

- 验证顺序固定：typecheck → lint → test → build →（bot）
- 所有新逻辑必须有失败前置的单测；渲染集成靠 agent-browser 实测兜底
- 提交使用英文 Conventional Commits + 中文 body，每 Task 一个提交
- 不引入新依赖（除必要的 devDeps，需说明理由）
- 所有注释、文档、回复使用中文

---

### Task 1: 平滑弯道（曲线控制点）

**Files:**
- Modify: `src/engine/track.ts`
- Test: `tests/unit/track.test.ts`

**Interfaces:**
- Consumes: `Segment={z,curve}`、`createTrack(groups, segmentLength?)`
- Produces:
  - `CurveControlPoint={z:number, curve:number}`
  - `createSmoothTrack(controlPoints: CurveControlPoint[], segmentLength=200): Segment[]` —— 相邻控制点间对 curve 线性插值，z 按段长连续覆盖；末点 z 处回绕（闭环要求首尾控制点 curve 相等或使用 totalCurve≈0 校验）
  - 既有 `createDefaultTrack()` 改为基于控制点生成（视觉与原赛道近似：9 组曲线的折点转控制点），`lapLength` 不变（92000）

- [ ] **Step 1: 写失败测试（插值数学）**

```ts
test('createSmoothTrack 在控制点间线性插值 curve', () => {
  const track = createSmoothTrack([
    { z: 0, curve: 0 },
    { z: 800, curve: 0.4 },
    { z: 1600, curve: 0 },
  ])
  // 段长 200：0..1600 共 8 段，curve 序列应为 [0, 0.1, 0.2, 0.3, 0.4, 0.3, 0.2, 0.1, 0]
  expect(track).toHaveLength(9)
  expect(track.map(s => s.curve)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.3, 0.2, 0.1, 0])
})
```

- [ ] **Step 2: 运行验证失败**
Run: `npx vitest run tests/unit/track.test.ts`
Expected: FAIL（createSmoothTrack 未定义）

- [ ] **Step 3: 实现**

```ts
export interface CurveControlPoint { z: number; curve: number }
export function createSmoothTrack(controlPoints: CurveControlPoint[], segmentLength = SEGMENT_LENGTH): Segment[] {
  const lastZ = controlPoints[controlPoints.length - 1].z
  const segments: Segment[] = []
  for (let z = 0; z <= lastZ; z += segmentLength) {
    // 找到所在控制点区间，线性插值
    let i = 0
    while (i < controlPoints.length - 2 && controlPoints[i + 1].z < z) i++
    const a = controlPoints[i], b = controlPoints[i + 1]
    const t = (z - a.z) / Math.max(b.z - a.z, 1)
    const curve = round3(a.curve + (b.curve - a.curve) * t)
    segments.push({ z, curve })
  }
  return segments
}
```

- [ ] **Step 4: 运行验证通过**
Run: `npx vitest run tests/unit/track.test.ts`
Expected: PASS（含旧测试）

- [ ] **Step 5: 补充测试（端点/回绕/默认赛道兼容）**
```ts
test('createDefaultTrack 改用控制点后仍为闭环且可跑圈', () => {
  const track = createDefaultTrack()
  expect(totalCurve(track)).toBeCloseTo(0, 5)
  expect(track).toHaveLength(460)
  expect(trackIndexForCameraZ(track, 460 * 200 - 100)).toBe(459)
})
```

- [ ] **Step 6: 全量验证**
Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`
Expected: 全绿，bot 报告 passed=true

- [ ] **Step 7: 浏览器冒烟**（dev server 5173，agent-browser）
Run: 页面刷新 → keydown ArrowUp 3s → eval 读 `__gameDebug`（若未加 phase 读 canvas 非空）
Expected: 画面滚动正常、无坍缩

- [ ] **Step 8: 提交**
```bash
git add src/engine/track.ts tests/unit/track.test.ts
git commit -m "feat(track): M6 smooth curves via control point interpolation"
```

---

### Task 2: 路面景物（路灯 / 树木）

**Files:**
- Create: `src/engine/sprites.ts`
- Modify: `src/engine/renderer.ts`
- Test: `tests/unit/sprites.test.ts`

**Interfaces:**
- Consumes: `Segment`、`ROAD_HALF_WIDTH`、`trackIndexForCameraZ`、`mulberry32`
- Produces:
  - `SpriteKind='tree'|'lamp'`；`Sprite={kind, z, offset, height}`
  - `createRoadsideSprites(track, seed=1234, spacing=800): Sprite[]` —— 从 z=400 起每 spacing 沿赛道放置一对（左 offset=-1.4、右 offset=+1.4），kind 由 PRNG 决定（tree 70% / lamp 30%），高度 tree=3 / lamp=2
  - `spritesInRange(sprites, track, cameraZ, viewDistance): Sprite[]` —— 环形取模窗口 `[cameraZ, cameraZ+viewDistance]`，返回带绝对 z 的可见对象

- [ ] **Step 1: 写失败测试**

```ts
test('createRoadsideSprites 按间距放置且确定性', () => {
  const track = createStraightTrack(50) // 0..10000
  const a = createRoadsideSprites(track, 1234)
  const b = createRoadsideSprites(track, 1234)
  expect(a).toEqual(b)
  expect(a.length).toBeGreaterThan(0)
  for (const s of a) {
    expect(s.z % 800).toBe(0) // 起点偏移 400 时按绝对位置断言
    expect(Math.abs(s.offset)).toBe(1.4)
  }
})

test('spritesInRange 环形取模且含边界', () => {
  const track = createStraightTrack(10) // lapLength 2000
  const sprites = [{ kind: 'tree', z: 1500, offset: -1.4, height: 3 }, { kind: 'lamp', z: 2500, offset: 1.4, height: 2 }]
  const seen = spritesInRange(sprites, track, 1800, 2000)
  // 窗口 [1800, 3800)：1500 不可见（模后 1500 < 1800），2500 可见（模后 500... 需按 trackIndex 逻辑取模）
})
```

- [ ] **Step 2: 验证失败**
Run: `npx vitest run tests/unit/sprites.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 sprites.ts**（mulberry32 确定性；环形窗口内 `zNorm = ((s.z % lapLen) + lapLen) % lapLen`，`relZ = (zNorm - cameraZ + lapLen) % lapLen`，`relZ <= viewDistance` 可见；返回对象含绝对 z = cameraZ + relZ）

- [ ] **Step 4: 验证通过**
Run: `npx vitest run tests/unit/sprites.test.ts`
Expected: PASS

- [ ] **Step 5: Renderer 集成**
- `renderer.ts` 构造接受 `sprites?: Sprite[]`；`render(cameraZ)` 在路面绘制后、调用 `drawSprites(cameraZ)`：
  - 对 `spritesInRange(...)` 排序（近→远），对每个 sprite：`project({x: offset + curveSumAtZ, y: 0, z})`（curveSum 按段累计，取 sprite 所在段的累计值）得底点 (sx, sy) 与 `scale=depth/(z-cameraZ)`；树高 = `sprite.height * scale * height * 0.5`；树：棕色树干 + 两层绿色三角；路灯：灰色杆 + 黄色灯头（发光圆）
  - 实现辅助 `curveOffsetAtZ(track, z): number`（从段起点累计 curve 到该 z）
- `main.ts`：`createRoadsideSprites(track)` 传入 Renderer

- [ ] **Step 6: 全量验证**
Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: 全绿

- [ ] **Step 7: 浏览器验证**：截图 shots/m6-sprites.png，eval 采样屏幕中部两侧行：存在非路面/非草地色（树绿 #2d5a27、灯黄 #ffd75e）像素
Expected: 景物出现且随滚动移动（两帧 hash 不同）

- [ ] **Step 8: 提交**
```bash
git add src/engine/sprites.ts src/engine/renderer.ts src/main.ts tests/unit/sprites.test.ts
git commit -m "feat(render): M6 roadside sprites (trees and lamps)"
```

---

### Task 3: 漂移系统

**Files:**
- Modify: `src/physics/car.ts`
- Create: `src/physics/drift.ts`
- Test: `tests/unit/drift.test.ts`

**Interfaces:**
- Consumes: `updateCar`、`CarConfig`、`CarInput`、`CarState`
- Produces:
  - `DriftState={charge:number, active:boolean, smoke:{x:number,z:number,t:number}[]}`
  - `updateDrift(dt, input, state, config, drift): DriftState` —— 规则：
    - 漂移条件：`|input.steer| > 0.7` 且 `state.speed > config.maxSpeed * 0.5` 且未出界（`|state.position| <= config.roadHalfWidth`）
    - 满足时 `charge += dt`；否则 `charge = max(0, charge - dt * 2)`（快速衰减）
    - `active = charge > 0.25`
    - active 时每秒 spawn 1 个烟雾粒子 `{x: position*±1 侧, z: cameraZ 附近, t: 0}`；所有粒子 `t += dt`，`t > 0.6` 移除
  - `effectiveTurnRate(config, drift)`：active ? `config.turnRate * 1.5` : `config.turnRate`
  - `driftSpeedFactor(drift)`：active ? 0.985 : 1（每帧速度乘数，模拟漂移损耗）

- [ ] **Step 1: 写失败测试**

```ts
test('高速强转向积累 charge 并激活漂移', () => {
  const cfg = createCarConfig()
  let drift: DriftState = { charge: 0, active: false, smoke: [] }
  const state = { position: 0, speed: cfg.maxSpeed * 0.8 }
  for (let i = 0; i < 30; i++) drift = updateDrift(1 / 60, { throttle: 1, brake: false, steer: 1 }, state, cfg, drift)
  expect(drift.active).toBe(true)
})

test('低速不激活漂移', () => {
  // speed = maxSpeed*0.3 时循环 60 帧，active 仍为 false
})

test('松转向后 charge 衰减、active 消失、烟雾老化移除', () => {
  // 激活后 steer=0 跑 2s → active=false；烟雾 t>0.6 被移除
})

test('漂移损耗降低速度', () => {
  // active 时 speed *= driftSpeedFactor 每帧，1s 后速度明显下降
})
```

- [ ] **Step 2: 验证失败**
Run: `npx vitest run tests/unit/drift.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 drift.ts**（规则如上，纯函数返回新状态；smoke 数组不可变更新或 in-place——选 in-place 简单，测试断言字段）

- [ ] **Step 4: 验证通过**
Run: `npx vitest run tests/unit/drift.test.ts`
Expected: PASS

- [ ] **Step 5: 集成**
- `main.ts`：维护 `driftState`；每帧 `updateDrift`；`updateCar` 前应用 `driftSpeedFactor`；转向率经 `effectiveTurnRate`（把 config.turnRate 临时覆盖传入 updateCar 或直接改 config 副本：`createCarConfig({ turnRate: effectiveTurnRate(cfg, drift) })` 每帧开销大——改为 updateCar 支持可选 turnRate 覆盖参数：`updateCar(dt, input, state, config, turnRateOverride?)`）
- HUD：`index.html` 加 `#drift-indicator`（隐藏），active 时显示 "DRIFT!" 橙色闪烁
- 烟雾渲染：canvas 画灰色半透明圆（投影位置），`renderer` 加 `drawSmoke(smoke, cameraZ)`（近大远小，透明度随 t 衰减）

- [ ] **Step 6: 全量验证**
Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`
Expected: 全绿（bot 不受漂移影响——bot 的 steer 由位置误差驱动，可能触发漂移，速度损耗可能改变圈速；断言 bot passed=true 即可）

- [ ] **Step 7: 浏览器验证**：W+D 全速按住 3s → eval 读 HUD `#drift-indicator` 可见、截图 shots/m6-drift.png 含烟雾灰点
Expected: DRIFT 显示、烟雾出现

- [ ] **Step 8: 提交**
```bash
git add src/physics/car.ts src/physics/drift.ts src/main.ts index.html src/style.css src/engine/renderer.ts tests/unit/drift.test.ts
git commit -m "feat(physics): M6 drift system with smoke particles"
```

---

### Task 4: 双人分屏

**Files:**
- Modify: `src/engine/renderer.ts`、`src/main.ts`、`index.html`、`src/style.css`
- Create: `src/physics/input.ts`
- Test: `tests/unit/input.test.ts`

**Interfaces:**
- Consumes: `Renderer.render`、`updateCar`、`CarInput`
- Produces:
  - `PlayerMapping={up,down,left,right:string}`；`PLAYER1_MAPPING={up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD'}`；`PLAYER2_MAPPING={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'}`
  - `inputFromKeys(pressed: Set<string>, mapping: PlayerMapping): CarInput` —— throttle=left? no：`throttle = pressed.has(up)?1:0`、`brake = pressed.has(down)`、`steer = (pressed.has(right)?1:0) - (pressed.has(left)?1:0)`（同时按→0）
  - `Renderer.renderRegion(cameraZ, viewX, viewW)`：在 (viewX,0) 起 viewW 宽区域内绘制（内部 opts.width=viewW、translate+clip）；`render(cameraZ)` 保持 = `renderRegion(cameraZ, 0, width)`

- [ ] **Step 1: 写失败测试（input 映射）**

```ts
test('inputFromKeys 映射 P1 WASD', () => {
  const pressed = new Set(['KeyW', 'KeyD'])
  expect(inputFromKeys(pressed, PLAYER1_MAPPING)).toEqual({ throttle: 1, brake: false, steer: 1 })
})
test('左右同按抵消', () => {
  const pressed = new Set(['ArrowLeft', 'ArrowRight'])
  expect(inputFromKeys(pressed, PLAYER2_MAPPING).steer).toBe(0)
})
test('无键输入全零', () => {
  expect(inputFromKeys(new Set(), PLAYER2_MAPPING)).toEqual({ throttle: 0, brake: false, steer: 0 })
})
```

- [ ] **Step 2: 验证失败**
Run: `npx vitest run tests/unit/input.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 input.ts**（如上）

- [ ] **Step 4: 验证通过**
Run: `npx vitest run tests/unit/input.test.ts`
Expected: PASS

- [ ] **Step 5: Renderer 分屏改造**
- `renderRegion(cameraZ, viewX, viewW)`：`ctx.save(); ctx.translate(viewX, 0); ctx.beginPath(); ctx.rect(0, 0, viewW, height); ctx.clip();` 内部所有绘制用 `buildOpts(viewW, height)`；`ctx.restore()` 结束
- `render(cameraZ)` → `renderRegion(cameraZ, 0, this.width)`
- `main.ts`：单人模式保持现状；新增 `SPLIT_MODE`（临时常量 true 测试分屏）：两个 carState（P1/P2）、两个 raceTime、`renderer1.renderRegion(z1, 0, w/2)`、`renderer2.renderRegion(z2, w/2, w/2)`（第二个 Renderer 实例或同一实例二次调用——用两个实例各 setCameraX）
- 分屏 HUD：两列（P1 左上、P2 右上）；中间分隔线 `#split-divider`（CSS 1px 白线居中）
- 分屏模式完赛逻辑：任一玩家超圈即 finished（P1 判定优先）

- [ ] **Step 6: 全量验证**
Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: 全绿

- [ ] **Step 7: 浏览器验证**：eval 读 `__gameDebug.phase`；CDP press W+D 与 ArrowUp+ArrowRight 各 2s → 截图 shots/m6-split.png，左右半屏路面色区域均存在且位置不同
Expected: 分屏渲染、两车各自移动

- [ ] **Step 8: 提交**
```bash
git add src/engine/renderer.ts src/physics/input.ts src/main.ts index.html src/style.css tests/unit/input.test.ts
git commit -m "feat(game): M6 split-screen two player mode"
```

---

### Task 5: 存档（localStorage 最佳成绩）

**Files:**
- Create: `src/ui/save.ts`
- Modify: `src/main.ts`、`index.html`（finish 屏显示最佳）
- Test: `tests/unit/save.test.ts`

**Interfaces:**
- Consumes: `StorageLike`（注入接口，浏览器传 `localStorage`，测试传内存对象）
- Produces:
  - `StorageLike={getItem(key:string):string|null, setItem(key:string,value:string):void}`
  - `SAVE_KEY='ai-racing-best'`
  - `BestScore={timeSec:number, avgSpeed:number}`
  - `loadBest(storage: StorageLike): BestScore | null`（损坏 JSON/类型不符 → null）
  - `saveBest(storage: StorageLike, score: BestScore): void`（仅当 timeSec 更小或不存在时写入）

- [ ] **Step 1: 写失败测试**

```ts
const memory = (): StorageLike => { const m = new Map<string,string>(); return { getItem: k => m.get(k) ?? null, setItem: (k,v) => m.set(k,v) } }

test('无存档返回 null', () => expect(loadBest(memory())).toBeNull())
test('保存后可读回', () => {
  const s = memory()
  saveBest(s, { timeSec: 30.5, avgSpeed: 4000 })
  expect(loadBest(s)).toEqual({ timeSec: 30.5, avgSpeed: 4000 })
})
test('更差成绩不覆盖', () => {
  const s = memory()
  saveBest(s, { timeSec: 30.5, avgSpeed: 4000 })
  saveBest(s, { timeSec: 40, avgSpeed: 3000 })
  expect(loadBest(s)!.timeSec).toBe(30.5)
})
test('损坏 JSON 返回 null', () => {
  const s = memory(); s.setItem('ai-racing-best', '{oops')
  expect(loadBest(s)).toBeNull()
})
```

- [ ] **Step 2: 验证失败**
Run: `npx vitest run tests/unit/save.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 save.ts**（如上；JSON.parse try/catch；写入时校验对象形状）

- [ ] **Step 4: 验证通过**
Run: `npx vitest run tests/unit/save.test.ts`
Expected: PASS

- [ ] **Step 5: 集成**
- `main.ts`：模块加载时 `best = loadBest(localStorage)`；完赛（applyPhase finished 时）：`saveBest(localStorage, { timeSec: raceTime, avgSpeed })`；finish 屏与 start 屏显示 `最佳: M:SS.mmm / XXX km/h`（`#best-score` 元素，无存档隐藏）
- `__gameDebug` 加 `best` getter 便于浏览器断言

- [ ] **Step 6: 全量验证**
Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run bot`
Expected: 全绿

- [ ] **Step 7: 浏览器验证**：临时 TOTAL_LAPS=1 跑 1 圈完赛 → eval `__gameDebug.best` 非空、finish 屏显示最佳；reload 后 start 屏最佳仍在（localStorage 持久）
Expected: 存档写入与持久化

- [ ] **Step 8: 提交**
```bash
git add src/ui/save.ts src/main.ts index.html tests/unit/save.test.ts
git commit -m "feat(ui): M6 best score persistence via localStorage"
```

---

## Self-Review

- **Spec 覆盖**：用户 5 个方向全部有 Task（弯道控制点=T1、路灯树木=T2、漂移=T3、双人分屏=T4、存档=T5）；每 Task 独立可验证（单测+浏览器）
- **占位符扫描**：无 TBD/TODO；Step 3 的实现为关键代码骨架，执行时按 TDD 补齐（模块边界与签名已定死）
- **类型一致性**：`createSmoothTrack` 在 T1 定义、T2 使用 `Segment`/`trackIndexForCameraZ` 均为既有 API；`Sprite` 字段在 T2 全 Task 内一致；`updateCar` 的 turnRateOverride 可选参数在 T3 定义、T4 不依赖；`renderRegion` T4 定义并保持 `render` 兼容
- **风险**：T2 的 `curveOffsetAtZ` 需与 renderer 既有 curveSum 逻辑一致（从段起点累计到目标 z）；T4 分屏与 T3 烟雾/漂移渲染并存时共用 camera 逻辑需在 renderRegion 内隔离（每实例独立 camera）
