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
