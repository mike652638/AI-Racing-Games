/**
 * 安全静态扫描（性能/安全修复专项）：扫描 src/ 全部 TS 源码中的危险 API 与健全性指标。
 * 运行：node --import tsx tests/bench/security-scan.ts
 *
 * 指标：
 * - 危险 sink（内联/动态 HTML 注入面）：innerHTML / insertAdjacentHTML / document.write / eval / new Function
 *   ——逐处列出文件:行号与代码行，供人工确认数据是否受控。
 * - 事件监听平衡：addEventListener 总数 vs removeEventListener 总数（文件级）。
 * - 定时器平衡：setInterval/setTimeout 总数 vs clearInterval/clearTimeout 总数。
 * - 类型安全泄漏：@ts-ignore / @ts-expect-error / as any / : any。
 * 输出 JSON 摘要 + 逐处 sink 清单，便于修复前后对比。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(import.meta.dirname, '..', '..', 'src')

interface SinkHit {
  file: string
  line: number
  code: string
}

interface ScanResult {
  files: number
  innerHTML: SinkHit[]
  insertAdjacentHTML: SinkHit[]
  documentWrite: SinkHit[]
  evalHits: SinkHit[]
  newFunction: SinkHit[]
  addEventListener: number
  removeEventListener: number
  setInterval: number
  setTimeout: number
  clearInterval: number
  clearTimeout: number
  tsIgnore: number
  tsExpectError: number
  anyCast: number
  anyType: number
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

function count(src: string, re: RegExp): number {
  // 注意：count 用的正则必须带 g 标志（跨行/多处匹配），否则 match 只返回首个
  const m = src.match(re)
  return m ? m.length : 0
}

function hits(lines: string[], re: RegExp): SinkHit[] {
  const out: SinkHit[] = []
  lines.forEach((line, i) => {
    if (re.test(line)) {
      out.push({ file: '', line: i + 1, code: line.trim().slice(0, 140) })
    }
  })
  return out
}

const result: ScanResult = {
  files: 0,
  innerHTML: [],
  insertAdjacentHTML: [],
  documentWrite: [],
  evalHits: [],
  newFunction: [],
  addEventListener: 0,
  removeEventListener: 0,
  setInterval: 0,
  setTimeout: 0,
  clearInterval: 0,
  clearTimeout: 0,
  tsIgnore: 0,
  tsExpectError: 0,
  anyCast: 0,
  anyType: 0,
}

for (const file of walk(SRC)) {
  result.files++
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const rel = relative(process.cwd(), file).replace(/\\/g, '/')
  const stamp = (list: SinkHit[]): SinkHit[] => list.map((h) => ({ ...h, file: rel }))
  result.innerHTML.push(...stamp(hits(lines, /\.innerHTML\s*=[^=]|innerHTML\s*\+=/)))
  result.insertAdjacentHTML.push(...stamp(hits(lines, /insertAdjacentHTML/)))
  result.documentWrite.push(...stamp(hits(lines, /document\.write\s*\(/)))
  result.evalHits.push(...stamp(hits(lines, /(?:^|[^.\w])eval\s*\(/)))
  result.newFunction.push(...stamp(hits(lines, /new\s+Function\s*\(/)))
  result.addEventListener += count(src, /addEventListener\s*\(/g)
  result.removeEventListener += count(src, /removeEventListener\s*\(/g)
  result.setInterval += count(src, /setInterval\s*\(/g)
  result.setTimeout += count(src, /setTimeout\s*\(/g)
  result.clearInterval += count(src, /clearInterval\s*\(/g)
  result.clearTimeout += count(src, /clearTimeout\s*\(/g)
  result.tsIgnore += count(src, /@ts-ignore/g)
  result.tsExpectError += count(src, /@ts-expect-error/g)
  result.anyCast += count(src, /\bas\s+any\b/g)
  result.anyType += count(src, /:\s*any\b/g)
}

console.log('==== 安全静态扫描（src/**/*.ts） ====')
console.log(`扫描文件数: ${result.files}`)
const sinkCount =
  result.innerHTML.length +
  result.insertAdjacentHTML.length +
  result.documentWrite.length +
  result.evalHits.length +
  result.newFunction.length
console.log(`危险 sink 总数: ${sinkCount}`)
for (const kind of ['innerHTML', 'insertAdjacentHTML', 'documentWrite', 'evalHits', 'newFunction'] as const) {
  const list = result[kind]
  console.log(`\n[${kind}] ${list.length} 处`)
  for (const hit of list) {
    console.log(`  ${hit.file}:${hit.line}  ${hit.code}`)
  }
}
console.log(
  `\n[事件监听] addEventListener=${result.addEventListener} removeEventListener=${result.removeEventListener}`,
)
console.log(
  `[定时器] setInterval/setTimeout=${result.setInterval + result.setTimeout} clearInterval/clearTimeout=${result.clearInterval + result.clearTimeout}`,
)
console.log(
  `[类型安全泄漏] @ts-ignore=${result.tsIgnore} @ts-expect-error=${result.tsExpectError} as any=${result.anyCast} :any=${result.anyType}`,
)
