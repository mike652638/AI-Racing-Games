#!/usr/bin/env node
/**
 * 测试可达性检查（零依赖，2026-09-04 引入）。
 *
 * 目的：为 CI 提供一层轻量但有效的"覆盖门禁"，弥补此前完全没有覆盖率度量的空白。
 * 由于本仓库的 npm 环境在新增 devDependency（@vitest/coverage-v8）时稳定报
 * `Cannot read properties of null (reading 'children')`，改用无需安装任何包的静态分析：
 *
 * 1. 扫描 `src/**\/*.ts` 构建模块依赖图（相对 import 解析）；
 * 2. 扫描 `tests/**\/*.ts`（含 unit/bot/bench）提取它们直接导入的 src 模块，作为"直接被测集合"；
 * 3. 沿 src 内部依赖图做 BFS 扩散——被测试文件依赖到的模块视为"间接覆盖"；
 * 4. 剩余不可达模块即"无任何测试触达"，按阈值判定通过/失败。
 *
 * 与行覆盖率的区别：本脚本衡量的是"模块级可达性"而非"语句执行比例"，
 * 无法发现已测模块内的未覆盖分支；但它能稳定捕获最昂贵的一类问题——
 * 新增模块完全没有测试（如 `applyRuntimeParams` 所在的 game-loop 热切路径曾长期零覆盖）。
 *
 * 用法：`node scripts/check-test-coverage.mjs [--max-uncovered N]`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = join(ROOT, 'src')
const TESTS_DIR = join(ROOT, 'tests')

/** 不参与可达性判定的文件（入口壳、环境声明） */
const EXCLUDED = new Set(['src/main.ts', 'src/vite-env.d.ts'])

/** 允许的未覆盖模块数（默认 0：所有模块都必须被至少一个测试触达） */
const DEFAULT_MAX_UNCOVERED = 0

/** 递归收集 .ts 文件（跳过 node_modules 与声明文件以外的所有目录） */
function collectTs(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...collectTs(full))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

/**
 * 提取文件的相对 import 目标（静态 import/export...from 与副作用 import）。
 * 不处理动态 import() 与 require——本仓库未使用。
 */
function extractImports(file) {
  const src = readFileSync(file, 'utf8')
  const targets = []
  const patterns = [
    /(?:^|[\s;}])(?:import|export)\s[\s\S]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g,
  ]
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      targets.push(m[1])
    }
  }
  return targets
}

/** 将 import 目标解析为仓库相对路径（仅保留指向 src/ 的模块；非相对与 src 外目标忽略） */
function resolveToSrcKey(importerFile, spec) {
  if (!spec.startsWith('.')) return null
  const abs = resolve(dirname(importerFile), spec)
  const rel = relative(ROOT, abs).replace(/\\/g, '/')
  if (!rel.startsWith('src/')) return null
  // 补上扩展名：src 内 import 通常省略 .ts
  for (const candidate of [rel, `${rel}.ts`, `${rel}/index.ts`]) {
    if (srcKeys.has(candidate)) return candidate
  }
  return null
}

const srcFiles = collectTs(SRC_DIR)
const srcKeys = new Set(srcFiles.map((f) => relative(ROOT, f).replace(/\\/g, '/')))
const testFiles = collectTs(TESTS_DIR)

/** src 模块 → 它导入的 src 模块（依赖图正向边） */
const depsOf = new Map()
for (const file of srcFiles) {
  const key = relative(ROOT, file).replace(/\\/g, '/')
  const deps = new Set()
  for (const spec of extractImports(file)) {
    const dep = resolveToSrcKey(file, spec)
    if (dep && dep !== key) deps.add(dep)
  }
  depsOf.set(key, deps)
}

/** 直接被测集合：测试文件导入的 src 模块 */
const directlyTested = new Set()
for (const file of testFiles) {
  for (const spec of extractImports(file)) {
    const dep = resolveToSrcKey(file, spec)
    if (dep) directlyTested.add(dep)
  }
}

/** BFS：从直接被测集合沿依赖图扩散，得到全部"测试可达"模块 */
const reachable = new Set()
const queue = [...directlyTested]
while (queue.length > 0) {
  const key = queue.pop()
  if (reachable.has(key)) continue
  reachable.add(key)
  for (const dep of depsOf.get(key) ?? []) {
    if (!reachable.has(dep)) queue.push(dep)
  }
}

const uncovered = [...srcKeys].filter((key) => !EXCLUDED.has(key) && !reachable.has(key)).sort()

const maxUncovered = (() => {
  const idx = process.argv.indexOf('--max-uncovered')
  if (idx >= 0 && process.argv[idx + 1] !== undefined) return Number(process.argv[idx + 1])
  return DEFAULT_MAX_UNCOVERED
})()

const total = [...srcKeys].filter((k) => !EXCLUDED.has(k)).length
const covered = total - uncovered.length

console.log(`src 模块 ${total} 个，测试可达 ${covered} 个（${((covered / total) * 100).toFixed(1)}%）`)
console.log(`直接被测 ${directlyTested.size} 个，间接覆盖 ${covered - directlyTested.size} 个`)

if (uncovered.length > 0) {
  console.log(`未被任何测试触达的模块（${uncovered.length}）：`)
  for (const key of uncovered) console.log(`  - ${key}`)
}

if (uncovered.length > maxUncovered) {
  console.error(
    `❌ 测试可达性门禁失败：未覆盖 ${uncovered.length} 个模块，阈值 ${maxUncovered}。请为上述模块补充测试，或在确有理由时用 --max-uncovered 调整阈值。`,
  )
  process.exit(1)
}
console.log(`✅ 测试可达性门禁通过（未覆盖 ${uncovered.length} ≤ 阈值 ${maxUncovered}）`)
