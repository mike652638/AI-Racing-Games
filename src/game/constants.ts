/**
 * 游戏参数集中配置（唯一真源）。
 * 各模块从此处导入常量，禁止在模块内散落魔法数字。
 * 改动数值前请同步更新 tests/unit/constants.test.ts 的注册表断言。
 */

/** 漂移激活所需的最小转向输入绝对值 */
export const DRIFT_STEER_THRESHOLD = 0.7
/** 漂移激活所需的最小蓄力值 */
export const DRIFT_CHARGE_THRESHOLD = 0.25
/** 漂移激活时的每帧速度损耗因子 */
export const DRIFT_SPEED_FACTOR = 0.985
/** 单次漂移得分上限（当前仅为注册，score clamp 逻辑未落地） */
export const DRIFT_SCORE_MAX = 99999

/** 碰撞速度惩罚因子（速度 ×0.5） */
export const COLLISION_SPEED_FACTOR = 0.5
/** 碰撞冷却时长（秒），冷却期内不重复触发 */
export const COLLISION_COOLDOWN = 1

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

/** 车流默认密度（条/圈）；赛道可通过 TrackDef.trafficCount 覆盖 */
export const TRAFFIC_DEFAULT_COUNT = 8
