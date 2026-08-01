import { createDefaultTrack } from '../../src/engine/track'
import { createCarConfig } from '../../src/physics/car'
import { createBotConfig } from '../../src/ai/bot'
import { simulateLaps } from '../../src/ai/simulate'

const LAPS = 3
const MAX_VIOLATIONS = 3

const result = simulateLaps(createDefaultTrack(), createCarConfig(), createBotConfig(), { laps: LAPS })

const report = {
  laps: LAPS,
  finished: result.finished,
  lapTimesSec: result.lapTimes.map(t => Number(t.toFixed(3))),
  totalTimeSec: Number(result.timeSec.toFixed(3)),
  avgSpeed: Number((result.distance / result.timeSec).toFixed(1)),
  violations: result.violations,
  offRoadTimeSec: Number(result.offRoadTimeSec.toFixed(3)),
}
console.log(JSON.stringify(report, null, 2))

const ok = result.finished && result.violations <= MAX_VIOLATIONS
console.log(ok ? '✅ bot 跑圈通过' : '❌ bot 跑圈失败')
process.exit(ok ? 0 : 1)
