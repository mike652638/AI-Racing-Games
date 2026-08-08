/**
 * M28 方案 9：OutRun 式分支路线（Route 模式，?route= 驱动）。
 *
 * 设计：一条路线（RouteDef）由多个阶段（Stage）串联——每个阶段复用一条现有赛道
 * （TrackDef.trackId），玩家跑完该阶段 1 圈（lapLength）后进入岔路选择（左/右二选一），
 * 选择决定下一阶段赛道；跑完最后一个阶段即完赛。全程累计用时（段末累加）。
 *
 * 架构约束：完全复用现有引擎（渲染/物理/车流/碰撞/HUD），仅新增本数据结构 +
 * mode-strategy ROUTE 实例 + GameLoop 段末交互；不影响现有环形赛道系统
 * （bot 9 赛道矩阵 / e2e 视觉回归零影响）。
 */

/** 单阶段定义：复用一条现有赛道 + 岔路出口（指向下一阶段 id；缺省/null 表示该方向无路） */
export interface RouteStageDef {
  /** 阶段唯一 id（路线内） */
  id: string
  /** 阶段名称（岔路选择 UI / STAGE 指示显示） */
  name: string
  /** 本阶段复用的赛道 id（须存在于 TRACK_DEFS） */
  trackId: string
  /** 岔路：左/右各指向下一阶段 id；缺省/null = 该方向不可选（单出口时两方向指向同一段） */
  branches?: { left?: string; right?: string }
  /** 是否终点阶段（跑完即完赛，无岔路选择） */
  isFinish?: boolean
}

/** 路线定义：起始阶段 + 全部阶段（岔路图通过 branches 引用） */
export interface RouteDef {
  id: string
  /** 路线名称（菜单/结算显示） */
  name: string
  /** 难度（1=★ 2=★★ 3=★★★），菜单星级显示 */
  difficulty: 1 | 2 | 3
  /** 起始阶段 id（startGame 时载入） */
  startStageId: string
  /** 全部阶段（顺序无关紧要，岔路图驱动；至少 2 个） */
  stages: RouteStageDef[]
}

/** 路线 1「经典之旅」：经典 → 森林/环岛（岔路）→ 海岸（终点），难度 ★ */
const CLASSIC_TOUR: RouteDef = {
  id: 'classic-tour',
  name: '经典之旅',
  difficulty: 1,
  startStageId: 'a1',
  stages: [
    { id: 'a1', name: '经典赛道', trackId: 'classic', branches: { left: 'a2-forest', right: 'a2-island' } },
    { id: 'a2-forest', name: '森林穿梭', trackId: 'forest', branches: { left: 'a3', right: 'a3' } },
    { id: 'a2-island', name: '环岛巡回', trackId: 'island', branches: { left: 'a3', right: 'a3' } },
    { id: 'a3', name: '海岸公路', trackId: 'coast', isFinish: true },
  ],
}

/** 路线 2「高手之旅」：高速 → 沙漠/S弯（岔路）→ 山岳（终点），难度 ★★ */
const PRO_TOUR: RouteDef = {
  id: 'pro-tour',
  name: '高手之旅',
  difficulty: 2,
  startStageId: 'b1',
  stages: [
    { id: 'b1', name: '高速公路', trackId: 'highway', branches: { left: 'b2-desert', right: 'b2-scurve' } },
    { id: 'b2-desert', name: '沙漠疾驰', trackId: 'desert', branches: { left: 'b3', right: 'b3' } },
    { id: 'b2-scurve', name: 'S 弯挑战', trackId: 's-curve', branches: { left: 'b3', right: 'b3' } },
    { id: 'b3', name: '山岳险道', trackId: 'alpine', isFinish: true },
  ],
}

/** 路线 3「极限之旅」：峡谷 → 山岳/森林（岔路）→ 环岛（终点），难度 ★★★ */
const EXTREME_TOUR: RouteDef = {
  id: 'extreme-tour',
  name: '极限之旅',
  difficulty: 3,
  startStageId: 'c1',
  stages: [
    { id: 'c1', name: '峡谷疾驰', trackId: 'canyon', branches: { left: 'c2-alpine', right: 'c2-forest' } },
    { id: 'c2-alpine', name: '山岳险道', trackId: 'alpine', branches: { left: 'c3', right: 'c3' } },
    { id: 'c2-forest', name: '森林穿梭', trackId: 'forest', branches: { left: 'c3', right: 'c3' } },
    { id: 'c3', name: '环岛巡回', trackId: 'island', isFinish: true },
  ],
}

/** 全部预设路线（?route=<id> 或 ?route=1/2/3 索引；缺省第一条） */
export const ROUTE_DEFS: RouteDef[] = [CLASSIC_TOUR, PRO_TOUR, EXTREME_TOUR]

/** 按 id 查找路线，未命中返回 null */
export function getRouteDef(id: string): RouteDef | null {
  return ROUTE_DEFS.find((route) => route.id === id) ?? null
}

/** 按阶段 id 查找阶段定义，未命中返回 null */
export function getRouteStage(route: RouteDef, stageId: string): RouteStageDef | null {
  return route.stages.find((stage) => stage.id === stageId) ?? null
}

/** 阶段总数（STAGE 指示 X/Y 的 Y） */
export function routeStageCount(route: RouteDef): number {
  return route.stages.length
}

/** 阶段序号（STAGE 指示 X/Y 的 X，从 1 起）——按 startStageId 出发的链上位置不便直接求，
 *  这里以「该阶段在 stages 数组中的下标 + 1」作为显示序号（岔路合流处可能出现序号非严格递增，
 *  但展示语义足够清晰）。 */
export function routeStageIndex(route: RouteDef, stageId: string): number {
  const idx = route.stages.findIndex((stage) => stage.id === stageId)
  return idx === -1 ? 1 : idx + 1
}

/** 阶段岔路出口解析：返回 { left?, right? }（可能缺省）；终点阶段无岔路返回 {} */
export function routeBranches(route: RouteDef, stageId: string): { left?: string; right?: string } {
  const stage = getRouteStage(route, stageId)
  return stage?.branches ?? {}
}
