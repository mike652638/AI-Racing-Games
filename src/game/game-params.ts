import type { WeatherOverride } from '../engine/lighting'
import { getRouteDef, ROUTE_DEFS } from '../engine/routes'

/**
 * 运行模式 URL 参数解析（M34 拆分自 game-loop.ts 构造器）：纯函数，
 * 输入 URLSearchParams 输出全部模式标志，互斥判定（split 优先）在此集中完成。
 */

export interface GameParams {
  /** 分屏双人同屏（?split=1）：最高优先级，与 hotseat/challenge 互斥 */
  splitMode: boolean
  /** 性能模式（?perf=1，Task 8）：渲染降级档位；与 split 不互斥 */
  perfMode: boolean
  /** 热座轮流模式（?hotseat=1）：双人先后跑同赛道比成绩；split 优先互斥 */
  hotseatMode: boolean
  /** 漂移挑战模式（?challenge=1）：60 秒限时刷分；与 split/hotseat 互斥 */
  challengeMode: boolean
  /**
   * 对局天气模式（M23 方案 11，URL `?weather=` 驱动）：
   * 'auto' 缺省三态时间循环；'random' 每局开局骰子（晴/雨/夜三选一）；
   * 'sunny'/'rain'/'night' 固定变体。startGame 时写入 race.weatherOverride。
   */
  weatherMode: WeatherOverride | 'random'
  /**
   * 车流橡皮筋动态难度（M23 方案 13，URL `?traffic=` 驱动）：
   * 'dynamic'（缺省）车流巡航速度随玩家速度平滑调整（快→提速保持挑战，慢→减速便于追赶）；
   * 'static' 固定车流速度（与旧版完全一致，simulate/bot 确定性路径不受影响）。
   */
  trafficDynamic: boolean
  /** M28 方案 10：导航辅助线强度（?guide=1 开启，0-1；缺省 0 关闭零绘制）。菜单预览不绘制 */
  guideStrength: number
  /** M28 方案 14：每日挑战模式（缺省启用；?daily=0 关闭，菜单进度/结算完成判定一并关闭） */
  dailyModeEnabled: boolean
  /**
   * M28 方案 9：路线模式（OutRun 式分段递进 + 岔路）。URL `?route=<id|1|2|3>` 驱动：
   * 每阶段复用一条赛道，玩家跑完该段 1 圈 → 段末岔路二选一 → 切换下一段赛道继续；
   * 终点段跑完完赛。全程累计用时/漂移得分（race.routeCumulative*）。
   */
  routeId: string | null
}

/** 解析 URL 参数为模式标志（缺省/无效值一律回退默认；route 与 split/hotseat 互斥） */
export function parseGameParams(params: URLSearchParams): GameParams {
  const splitMode = params.has('split')
  const perfMode = params.has('perf')
  const hotseatMode = params.has('hotseat') && !splitMode
  // G1（G1）：挑战模式——限时刷分（60 秒收束），与分屏/热座互斥
  const challengeMode = params.has('challenge') && !splitMode && !hotseatMode
  // M23 方案 11：对局天气模式——?weather=random 每局骰子 / 固定变体 / 缺省 auto 时间循环
  const weatherParam = params.get('weather')
  const weatherMode: WeatherOverride | 'random' =
    weatherParam === 'random' || weatherParam === 'sunny' || weatherParam === 'rain' || weatherParam === 'night'
      ? weatherParam
      : 'auto'
  // M23 方案 13：车流橡皮筋动态难度——?traffic=static 关闭（固定车流速度，simulate/bot 确定性不变），
  // 缺省 dynamic（运行时按玩家速度平滑调整车流巡航速度）
  const trafficDynamic = params.get('traffic') !== 'static'
  // M28 方案 10：导航辅助线——?guide=1 开启（强度固定 0.8，新手辅助线亮度），缺省/0 关闭
  const guideStrength = params.get('guide') === '1' ? 0.8 : 0
  // M28 方案 14：每日挑战——缺省启用；?daily=0 显式关闭（菜单进度/结算判定一并关闭）
  const dailyModeEnabled = params.get('daily') !== '0'
  // M28 方案 9：路线模式——?route=<id|1|2|3>（数字为 ROUTE_DEFS 下标 1 基；缺省/无效 → null 不启用）。
  // 与 split/hotseat/challenge 互斥（challenge 判定已排除 route 场景不冲突，此处显式 route 优先）。
  const routeParam = params.get('route')
  const routeId =
    routeParam !== null && !splitMode && !hotseatMode
      ? (getRouteDef(routeParam)?.id ??
        (routeParam === '1' || routeParam === '2' || routeParam === '3' ? ROUTE_DEFS[Number(routeParam) - 1].id : null))
      : null
  return {
    splitMode,
    perfMode,
    hotseatMode,
    challengeMode,
    weatherMode,
    trafficDynamic,
    guideStrength,
    dailyModeEnabled,
    routeId,
  }
}
