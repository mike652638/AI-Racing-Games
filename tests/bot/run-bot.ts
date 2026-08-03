import { TRACK_DEFS, createTrackFromDef } from '../../src/engine/tracks'
import { createCarConfig } from '../../src/physics/car'
import { createBotConfig } from '../../src/ai/bot'
import { simulateLaps } from '../../src/ai/simulate'

const MAX_VIOLATIONS = 3

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
}

// 全赛道矩阵回归：遍历 TRACK_DEFS（9 条，含 canyon/alpine 夜间赛道），
// 每条按自身圈数跑圈，判定 finished && violations <= MAX_VIOLATIONS。
// 经典赛道（第一条）为基线对照（3 圈 76.017s / 0 违规）。
const reports: TrackReport[] = TRACK_DEFS.map((def) => {
  const result = simulateLaps(createTrackFromDef(def), createCarConfig(), createBotConfig(), {
    laps: def.laps,
  })
  return {
    trackId: def.id,
    name: def.name,
    laps: def.laps,
    finished: result.finished,
    lapTimesSec: result.lapTimes.map(t => Number(t.toFixed(3))),
    totalTimeSec: Number(result.timeSec.toFixed(3)),
    avgSpeed: Number((result.distance / result.timeSec).toFixed(1)),
    violations: result.violations,
    offRoadTimeSec: Number(result.offRoadTimeSec.toFixed(3)),
  }
})

for (const report of reports) {
  console.log(JSON.stringify(report))
}

const ok = reports.every(r => r.finished && r.violations <= MAX_VIOLATIONS)
console.log(ok ? `✅ bot 跑圈通过（${reports.length} 条赛道全部完成，0 违规超标）` : '❌ bot 跑圈失败')
process.exit(ok ? 0 : 1)
