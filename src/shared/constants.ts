/**
 * 游戏参数集中配置（唯一真源，位于独立共享层）。
 * 解环说明（2026-08-05）：原位于 game/constants，game↔ui 双向依赖环的运行时实质
 * 即 ui（及 engine/physics）对 game/constants 的导入；将常量层提升为 src/shared 后，
 * engine/physics/ui 不再依赖 game 层，运行时环消除（ui 对 game 仅剩 import type）。
 * 各模块从此处导入常量，禁止在模块内散落魔法数字。
 * 改动数值前请同步更新 tests/unit/constants.test.ts 的注册表断言。
 */

/** 漂移激活所需的最小转向输入绝对值 */
export const DRIFT_STEER_THRESHOLD = 0.7
/** 漂移激活所需的最小蓄力值 */
export const DRIFT_CHARGE_THRESHOLD = 0.25
/** 漂移激活时的每帧速度损耗因子 */
export const DRIFT_SPEED_FACTOR = 0.985
/** 单次漂移得分上限（drift.ts 的 updateDrift 已实现 clamp，HUD 得分触顶显示 MAX） */
export const DRIFT_SCORE_MAX = 99999

/** 漂移挑战模式限时时长（秒，?challenge=1 时按此倒计时收束对局） */
export const CHALLENGE_SECONDS = 60
/** 漂移挑战模式目标分数（?challenge=1 时结算展示达标/未达标；M15） */
export const CHALLENGE_TARGET_SCORE = 5000

/** BOOST 氮气加速的加速度倍率（相对 config.acceleration，G4） */
export const BOOST_ACCEL_MULT = 0.6
/** BOOST 速度上限倍率（突破 maxSpeed 但不超过 1.15×，G4） */
export const BOOST_MAX_SPEED_MULT = 1.15
/** BOOST 蓄力速率（漂移激活期间 charge/秒，G4） */
export const BOOST_CHARGE_RATE = 0.3
/** BOOST 消耗速率（激活期间 charge/秒，G4） */
export const BOOST_DRAIN_RATE = 0.5

// —— P0 可玩性（2026-08-07：near-miss 贴身超车 / 完美氮气 / 漂移小喷）——

/** near-miss 横向近身容差（offset 单位，> TRAFFIC_X_TOL 碰撞容差 0.55——低于该值会先判碰撞） */
export const NEAR_MISS_X_TOL = 0.9
/** near-miss 纵向触发距离（世界单位）：车在玩家前方该距离内视为接近 */
export const NEAR_MISS_Z_DIST = 200
/** near-miss 触发冷却（秒），防同辆车连续触发刷分 */
export const NEAR_MISS_COOLDOWN = 0.6
/** near-miss 基础得分（× 当前连击倍率，clamp 到 DRIFT_SCORE_MAX） */
export const NEAR_MISS_SCORE = 100
/** near-miss 蓄能增量（每次触发 boostCharge += 该值，封顶 1） */
export const NEAR_MISS_CHARGE = 0.1

/** 完美氮气触发阈值：激活 BOOST 时 charge ≥ 该值即本次为完美氮气（加速更强） */
export const PERFECT_BOOST_MIN_CHARGE = 0.8
/** 完美氮气加速度倍率（BOOST_ACCEL_MULT 0.6 × 1.2 = 0.72，比普通快 20%） */
export const PERFECT_BOOST_ACCEL_MULT = 0.72

/** 漂移小喷（Mini-Turbo）蓝火触发阈值：释放时 charge ≥ 该值触发短喷（0.4s） */
export const MINI_TURBO_CHARGE_SHORT = 0.4
/** 漂移小喷橙火触发阈值：释放时 charge ≥ 该值触发长喷（0.8s） */
export const MINI_TURBO_CHARGE_LONG = 0.7
/** 漂移小喷短喷时长（秒，蓝火） */
export const MINI_TURBO_SHORT_SECONDS = 0.4
/** 漂移小喷长喷时长（秒，橙火） */
export const MINI_TURBO_LONG_SECONDS = 0.8
/** 漂移小喷加速度倍率（相对 config.acceleration，不突破 maxSpeed） */
export const MINI_TURBO_ACCEL_MULT = 1.0

// —— M23 可玩性 v2（2026-08-07：赛道 S/A/B 奖牌 / 成就解锁 / 挑战检查站）——

/**
 * 奖牌金（S）门槛系数：玩家总用时 ≤ bot 基准总用时 × 该系数 → S 级。
 * bot 基准总用时来自 tests/bot 9 赛道矩阵实测（getTrackDef(id).medalBaseSec）。
 */
export const MEDAL_GOLD_MULT = 1.0
/** 奖牌银（A）门槛系数：总用时 ≤ bot 基准 × 1.15 → A 级 */
export const MEDAL_SILVER_MULT = 1.15
/** 奖牌铜（B）门槛系数：总用时 ≤ bot 基准 × 1.3 → B 级（更慢不获牌） */
export const MEDAL_BRONZE_MULT = 1.3

/** 挑战模式检查点奖励时长（秒，M23：每通过一个检查点剩余时间 +该值，检查站制时间奖励） */
export const CHALLENGE_CHECKPOINT_BONUS = 2
/** 挑战模式每圈检查点数（按赛道单圈长度等分位置生成，M23） */
export const CHALLENGE_CHECKPOINTS_PER_LAP = 2

/**
 * 各赛道 bot 基准总用时（秒，M23 奖牌判定基准）：来自 tests/bot 9 赛道矩阵实测
 * （2026-08-07，avgSpeed 按各赛道直道/弯道分布，总用时含全部圈数）。
 * 玩家总用时 ≤ base × MEDAL_GOLD_MULT/SILVER_MULT/BRONZE_MULT 对应 S/A/B 奖牌。
 */
export const MEDAL_BASE_SEC: Record<string, number> = {
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

/** 碰撞速度惩罚因子（速度 ×0.5） */
export const COLLISION_SPEED_FACTOR = 0.5
/** 碰撞冷却时长（秒），冷却期内不重复触发 */
export const COLLISION_COOLDOWN = 1
/**
 * 起步保护期（秒，2026-08-05 运行时实测修复）：开赛/回合重置时碰撞冷却初值。
 * 环形赛道上后方车流会在倒计时期（≈2.9s）环绕穿越出生点（classic 实测首次穿越 ≈1.9s），
 * 静止玩家会被误撞（开局即「碰撞 ×1」）；保护期结束时玩家正常已起步驶离出生点，
 * 不影响行驶中的正常碰撞。与 TRAFFIC_SPAWN_SAFE_ZONE（出生窗口排除）配套生效。
 */
export const RACE_START_GRACE = 5

/**
 * 起步倒计时冻结时长（秒，2026-08-05 运行时审计 F-1 修复）：
 * 与 runCountdown 视觉节奏对齐（3→2→1 各 0.8s，GO 出现时刻 = 2.4s）。
 * 该窗口内 raceTime/车流/玩家物理全部冻结，GO 后才正式起计——
 * 消除圈速记录中约 2.9s 的倒计时水分，与 bot 无倒计时圈速口径一致。
 */
export const RACE_COUNTDOWN_SECONDS = 2.4

/** 渲染可视距离（分段数） */
export const RENDER_DRAW_DISTANCE = 120
/** 地平线在屏幕高度中的比例 */
export const RENDER_HORIZON_RATIO = 0.35
/** 投影深度在屏幕宽度中的比例 */
export const RENDER_DEPTH_RATIO = 0.84

/** 路面半宽（世界单位） */
export const ROAD_HALF_WIDTH = 1
/** 路缘宽度（世界单位） */
export const EDGE_WIDTH = 0.15
/**
 * 出界内侧推回量（归一化路面半宽比例，2026-08-05 BUG-2 修复）：出界钳制后把车从边缘线
 * 向内侧推回该量——旧逻辑钳制恰在边缘（|position| == halfWidth），低速转向率 ∝ speed
 * 导致「钉死边缘无法回路面」（research_report_runtime_testing.md BUG-2）；
 * 推回后脱离出界判定，恢复正常加速与转向权限。
 */
export const OFF_ROAD_PUSHBACK = 0.05

/** 车流默认密度（条/圈）；赛道可通过 TrackDef.trafficCount 覆盖 */
export const TRAFFIC_DEFAULT_COUNT = 14

/** 漂移烟雾粒子存活时长（秒，S 修复：drift.ts 生成/老化与 smoke-render.ts 透明度衰减共用同一真源） */
export const SMOKE_LIFETIME = 0.6
/** BOOST 尾焰粒子存活时长（秒，S 修复：frame-update 移除判定与 renderer 透明度衰减共用同一真源） */
export const BOOST_PARTICLE_LIFETIME = 0.6
/** 每级漂移连击的得分倍率步进（S 修复：drift 得分/hud COMBO 文案/top-refresh 榜单倍率共用同一真源） */
export const COMBO_MULTIPLIER_STEP = 0.25

// —— 视觉调参（R5/R6 收敛，2026-08-05：绘制模块的视觉常量集中于此，调参只改一处）——

/** 雨滴数量（renderer 确定性生成，渲染时按 timeSec 下落） */
export const RAIN_DROPS = 80
/** 雨丝倾斜角（度，固定 15° 风向感；renderer 预计算 sin/cos 供离屏预渲染复用） */
export const RAIN_TILT_DEG = 15
/** 仙人掌明暗：远处明暗分档的投影 scale 阈值（scale 小于该值视为远处，两档明暗） */
export const CACTUS_SHADE_SCALE_THRESHOLD = 0.35
/** 仙人掌明暗：远处明暗亮度因子（shadeColor ×0.8 ≈ 变暗 20%，偏冷降饱和） */
export const CACTUS_SHADE_FACTOR = 0.8
/** 雨天湿滑路面：整段暗色压暗叠加色 */
export const WET_OVERLAY_COLOR = 'rgba(10, 15, 30, 0.15)'
/** 雨天湿滑路面：近处中心高光反光条颜色 */
export const WET_HIGHLIGHT_COLOR = 'rgba(180, 200, 230, 0.08)'
/** 雨天湿滑路面：高光反光条作用的最大段数（近处 k < 该值） */
export const WET_HIGHLIGHT_MAX_K = 30
