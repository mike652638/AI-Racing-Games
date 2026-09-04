import { TRACK_DEFS, createTrackFromDef } from '../../src/engine/tracks'
import { createCarConfig } from '../../src/physics/car'
import { createBotConfig } from '../../src/ai/bot'
import { simulateLaps } from '../../src/ai/simulate'

const MAX_VIOLATIONS = 3
/** 车流模式下碰撞数的告警上限（非失败条件）：超出说明 bot 避让或车流密度异常 */
const MAX_TRAFFIC_COLLISIONS = 30

/**
 * 无车流基线总时长（秒，2026-09-04 实测）。
 * simulateLaps 为固定步长（1/60）的确定性模拟，与机器性能无关，故圈速逐位稳定，
 * 可作为物理/AI 退化的硬门禁——此前只判「是否完赛 + 违规数」，物理被改慢也照常通过。
 * 物理或 bot 参数的有意调整需同步更新本表（这正是回归门禁的用意）。
 */
const BASELINE_TOTAL_SEC: Record<string, number> = {
  classic: 76.017,
  highway: 100.233,
  's-curve': 44.883,
  island: 52.167,
  canyon: 56.467,
  desert: 71.967,
  forest: 34.767,
  coast: 54.983,
  alpine: 43.867,
}
/** 圈速退化告警线（相对基线的比例）：超出仅提示 */
const LAP_TIME_WARN_RATIO = 0.05
/** 圈速退化失败线：超出即判定性能回归 */
const LAP_TIME_FAIL_RATIO = 0.1

interface TrafficRun {
  finished: boolean
  totalTimeSec: number
  violations: number
  collisions: number
}

interface TrackReport {
  trackId: string
  name: string
  laps: number
  finished: boolean
  lapTimesSec: number[]
  totalTimeSec: number
  avgSpeed: number
  violations: number
  offRoadTimeSec: number
  /** 车流模式（withTraffic=true）跑圈结果——多圈车流语义的回归门禁（2026-09-04 P0-1） */
  traffic: TrafficRun | null
}

// 全赛道矩阵回归：遍历 TRACK_DEFS（9 条，含 canyon/alpine 夜间赛道），
// 每条按自身圈数跑两遍：
//   1) 无车流（历史基线，判定 finished && violations <= MAX_VIOLATIONS）——经典赛道 3 圈 76.017s；
//   2) 有车流（withTraffic=true）——2026-09-04 新增。
// 原先只跑第 1 种，导致「多圈车流失效」（cameraZ 单调累加 vs car.z 取模，碰撞/投影第二圈起
// 整体失效）这一核心玩法缺陷在 bot 侧完全无感知：车流碰撞数恒为 0 并非跑得好，而是从未判定。
// 车流模式同时验证 bot 的车流感知避让在跨圈后仍生效（避让用环形距离，第三圈起旧式取模返回负值）。
const reports: TrackReport[] = TRACK_DEFS.map((def) => {
  const track = createTrackFromDef(def)
  const carConfig = createCarConfig()
  const botConfig = createBotConfig()
  const result = simulateLaps(track, carConfig, botConfig, { laps: def.laps })
  const withTraffic = simulateLaps(track, carConfig, botConfig, {
    laps: def.laps,
    withTraffic: true,
  })
  return {
    trackId: def.id,
    name: def.name,
    laps: def.laps,
    finished: result.finished,
    lapTimesSec: result.lapTimes.map((t) => Number(t.toFixed(3))),
    totalTimeSec: Number(result.timeSec.toFixed(3)),
    avgSpeed: Number((result.distance / result.timeSec).toFixed(1)),
    violations: result.violations,
    offRoadTimeSec: Number(result.offRoadTimeSec.toFixed(3)),
    traffic: {
      finished: withTraffic.finished,
      totalTimeSec: Number(withTraffic.timeSec.toFixed(3)),
      violations: withTraffic.violations,
      collisions: withTraffic.collisions ?? 0,
    },
  }
})

for (const report of reports) {
  console.log(JSON.stringify(report))
}

const baseOk = reports.every((r) => r.finished && r.violations <= MAX_VIOLATIONS)
const trafficOk = reports.every(
  (r) => r.traffic !== null && r.traffic.finished && r.traffic.violations <= MAX_VIOLATIONS,
)
const collisionsHigh = reports.filter((r) => (r.traffic?.collisions ?? 0) > MAX_TRAFFIC_COLLISIONS)

/** 无车流圈速相对基线的退化比例（确定性模拟，机器无关） */
function slowdownOf(report: TrackReport): number {
  const base = BASELINE_TOTAL_SEC[report.trackId]
  if (base === undefined) return 0
  return report.totalTimeSec / base - 1
}
const slowed = reports.filter((r) => slowdownOf(r) > LAP_TIME_WARN_RATIO)
const regress = reports.filter((r) => slowdownOf(r) > LAP_TIME_FAIL_RATIO)
const ok = baseOk && trafficOk && regress.length === 0

if (!baseOk) console.error('❌ bot 跑圈失败（无车流基线）')
if (!trafficOk) console.error('❌ bot 跑圈失败（车流模式：未完赛或违规超标）')
if (collisionsHigh.length > 0) {
  console.warn(
    `⚠️ 车流碰撞数偏高（> ${MAX_TRAFFIC_COLLISIONS}）：${collisionsHigh
      .map((r) => `${r.trackId}=${r.traffic?.collisions}`)
      .join(', ')}`,
  )
}
if (slowed.length > 0) {
  const detail = slowed.map((r) => `${r.trackId}=${r.totalTimeSec}s(+${(slowdownOf(r) * 100).toFixed(1)}%)`).join(', ')
  console.warn(`⚠️ 圈速慢于基线 ${LAP_TIME_WARN_RATIO * 100}%：${detail}`)
}
if (regress.length > 0) {
  console.error(`❌ 圈速性能回归（超出基线 ${LAP_TIME_FAIL_RATIO * 100}%）：需确认物理/AI 改动是否有意`)
}
if (ok) {
  console.log(`✅ bot 跑圈通过（${reports.length} 条赛道 × 无车流/有车流两种模式全部完成，违规与圈速均未退化）`)
}
process.exit(ok ? 0 : 1)
