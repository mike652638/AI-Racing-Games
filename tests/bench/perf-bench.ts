/**
 * 性能基准（性能/安全修复专项）：对比修复前后渲染/物理/输入热路径的「每帧对象分配数」与「每帧耗时」。
 * 运行：node --expose-gc --import tsx tests/bench/perf-bench.ts
 *
 * 指标说明：
 * - roadProjectionAlloc：模拟 renderRoadSurface 主循环（120 段 × cur/next 两段投影 × 4 角点 + 中心虚线）
 *   每帧新建的 Projected/Quad 对象数（经 Set 记录不同对象身份实测）。
 * - roadProjectionMs：上述循环单帧平均耗时（5 次采样取中位数，采样间强制 GC）。
 * - driftAllocPerFrame：持续漂移场景下 updateDrift 单帧新建对象数（DriftState/烟雾数组/粒子）。
 * - inputAllocPerFrame：单屏合并输入路由单帧新建对象数（getP1/getP2 展开 + mergeCarInputs + 零输入）。
 *
 * 修复前（alloc 路径）与修复后（复用路径）均可运行本脚本：
 * - 修复前：projectSegmentQuad 每帧返回全新 Quad（含 4 个新 Projected），Set 全量记录。
 * - 修复后：传入模块级 scratch quad（第五参），同一批对象被反复复用，Set 只记录到常量个数。
 *   两条路径输出同一组指标便于对比：`npm run bench`（alloc 基线）/ `npm run bench:reuse`（reuse 复用）。
 */
import { performance } from 'node:perf_hooks'
import { projectSegmentQuad, type Quad } from '../../src/engine/road-geometry'
import { project, type ProjectionOptions } from '../../src/engine/projection'
import { updateDrift, type DriftState } from '../../src/physics/drift'
import { createCarConfig, type CarInput } from '../../src/physics/car'
import { inputFromKeys, mergeCarInputs, PLAYER1_MAPPING, PLAYER2_MAPPING } from '../../src/physics/input'

declare const gc: (() => void) | undefined

const opts: ProjectionOptions = { width: 1280, height: 720, horizon: 252, depth: 1075 }
const camera = { x: 0, y: 1, z: 0 }

/** 是否使用修复后的「复用」路径（npm run bench:reuse 传 --reuse；alloc 基线为默认） */
const USE_REUSE = process.argv.includes('--reuse')

// ---------- 1. 道路投影热路径（renderRoadSurface 主循环等价） ----------

/** 模拟单帧道路投影：120 段 × cur/next 两段 quad + 每 2 段一次中心线投影 */
function roadProjectionFrame(seen: Set<object>): void {
  let curveSum = 0
  for (let k = 0; k < 120; k++) {
    const z = 100 + k * 200
    let cur: Quad | null
    let next: Quad | null
    if (USE_REUSE) {
      cur = projectSegmentQuad(opts, camera, z, curveSum, scratchQuadA())
      next = projectSegmentQuad(opts, camera, z + 200, curveSum + 0.01, scratchQuadB())
    } else {
      cur = projectSegmentQuad(opts, camera, z, curveSum)
      next = projectSegmentQuad(opts, camera, z + 200, curveSum + 0.01)
    }
    if (!cur || !next) {
      curveSum += 0.01
      continue
    }
    seen.add(cur)
    seen.add(cur.l1)
    seen.add(cur.l2)
    seen.add(cur.r1)
    seen.add(cur.r2)
    seen.add(next)
    seen.add(next.l1)
    seen.add(next.l2)
    seen.add(next.r1)
    seen.add(next.r2)
    if (k % 2 === 0) {
      const centerProj = project(opts, camera, { x: curveSum, y: 0, z }, USE_REUSE ? scratchCenter() : undefined)
      if (centerProj) seen.add(centerProj)
    }
    curveSum += 0.01
  }
}

/** 复用路径 scratch（修复后 projectSegmentQuad 第五参 / project 第四参）；修复前不使用 */
const _scratchA = makeQuadScratch()
const _scratchB = makeQuadScratch()
const _scratchCenter = { x: 0, y: 0, scale: 0 }
function scratchQuadA(): Quad {
  return _scratchA
}
function scratchQuadB(): Quad {
  return _scratchB
}
function scratchCenter(): { x: number; y: number; scale: number } {
  return _scratchCenter
}

function makeQuadScratch(): Quad {
  return {
    l1: { x: 0, y: 0, scale: 0 },
    l2: { x: 0, y: 0, scale: 0 },
    r1: { x: 0, y: 0, scale: 0 },
    r2: { x: 0, y: 0, scale: 0 },
  }
}

/** 单帧对象分配数：Set 记录本次运行全部不同对象身份 */
function allocPerFrame(run: (seen: Set<object>) => void, frames = 120): number {
  const seen = new Set<object>()
  for (let f = 0; f < frames; f++) {
    run(seen)
  }
  return seen.size / frames
}

/** 单帧耗时（ms）：先预热，再采样 samples 次取中位数（采样间强制 GC） */
function msPerFrame(run: (seen: Set<object>) => void, frames = 120, samples = 5): number {
  const seen = new Set<object>()
  for (let f = 0; f < 30; f++) run(seen)
  seen.clear()
  const times: number[] = []
  for (let s = 0; s < samples; s++) {
    if (typeof gc === 'function') gc()
    const t0 = performance.now()
    const local = new Set<object>()
    for (let f = 0; f < frames; f++) run(local)
    times.push((performance.now() - t0) / frames)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

// ---------- 2. 漂移状态更新（updateDrift 每帧分配） ----------

const DRIFT_CFG = createCarConfig({ maxSpeed: 6000 })
const DRIFT_STATE = { position: 0.5, speed: 6000 }
const DRIFT_INPUT: CarInput = { throttle: 0, brake: false, steer: 1 }

function driftFrame(seen: Set<object>, prev: DriftState): DriftState {
  const next = updateDrift(1 / 60, DRIFT_INPUT, DRIFT_STATE, DRIFT_CFG, prev, 100)
  seen.add(next)
  seen.add(next.smoke)
  for (const p of next.smoke) seen.add(p)
  return next
}

function driftAllocPerFrame(frames = 1200): number {
  const seen = new Set<object>()
  let drift: DriftState = {
    charge: 1,
    active: true,
    lastSmoke: 0,
    smoke: [],
    score: 0,
    combo: 2,
    comboTimer: 0,
    turbo: 0,
    turboLevel: 0,
  }
  // 预热 60 帧（烟雾生成节奏稳定）
  for (let f = 0; f < 60; f++) drift = driftFrame(seen, drift)
  seen.clear()
  for (let f = 0; f < frames; f++) drift = driftFrame(seen, drift)
  return seen.size / frames
}

function driftMsPerFrame(frames = 1200, samples = 5): number {
  const times: number[] = []
  for (let s = 0; s < samples; s++) {
    if (typeof gc === 'function') gc()
    let drift: DriftState = {
      charge: 1,
      active: true,
      lastSmoke: 0,
      smoke: [],
      score: 0,
      combo: 2,
      comboTimer: 0,
      turbo: 0,
      turboLevel: 0,
    }
    const t0 = performance.now()
    for (let f = 0; f < frames; f++) drift = driftFrame(new Set(), drift)
    times.push((performance.now() - t0) / frames)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

// ---------- 3. 输入路由（单屏合并：getP1 + getP2 + merge + 零输入） ----------

function inputFrame(seen: Set<object>): void {
  const p1 = inputFromKeys(new Set(['KeyW']), PLAYER1_MAPPING)
  const p2 = inputFromKeys(new Set(['ArrowUp']), PLAYER2_MAPPING)
  const merged = mergeCarInputs(p1, p2)
  const zero: CarInput = { throttle: 0, brake: false, steer: 0 }
  seen.add(p1)
  seen.add(p2)
  seen.add(merged)
  seen.add(zero)
}

function inputAllocPerFrame(frames = 120): number {
  const seen = new Set<object>()
  for (let f = 0; f < frames; f++) inputFrame(seen)
  return seen.size / frames
}

function inputMsPerFrame(frames = 1200, samples = 5): number {
  const times: number[] = []
  for (let s = 0; s < samples; s++) {
    if (typeof gc === 'function') gc()
    const t0 = performance.now()
    for (let f = 0; f < frames; f++) inputFrame(new Set())
    times.push((performance.now() - t0) / frames)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

// ---------- 输出 ----------

const pad = (s: string, n = 16): string => s.padEnd(n)
console.log('==== 性能基准（修复前 alloc 路径 / 修复后 reuse 路径） ====')
console.log(`路径: ${USE_REUSE ? 'reuse（复用）' : 'alloc（每帧新建）'}`)
console.log(pad('roadProjectionAlloc'), `${allocPerFrame(roadProjectionFrame).toFixed(1)} 对象/帧`)
console.log(pad('roadProjectionMs'), `${msPerFrame(roadProjectionFrame).toFixed(4)} ms/帧`)
console.log(pad('driftAllocPerFrame'), `${driftAllocPerFrame().toFixed(2)} 对象/帧`)
console.log(pad('driftMsPerFrame'), `${driftMsPerFrame().toFixed(5)} ms/帧`)
console.log(pad('inputAllocPerFrame'), `${inputAllocPerFrame().toFixed(1)} 对象/帧`)
console.log(pad('inputMsPerFrame'), `${inputMsPerFrame().toFixed(5)} ms/帧`)
