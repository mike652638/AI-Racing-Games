import {
  getRouteDef,
  getRouteStage,
  routeBranches,
  routeStageCount,
  routeStageIndex,
  type RouteDef,
  type RouteStageDef,
} from '../engine/routes'
import { TRACK_DEFS, getTrackDef } from '../engine/tracks'
import type { RouteFork } from '../engine/guide-line'
import type { RaceState } from '../shared/types'

/**
 * 路线模式集中模块（M34 拆分自 game-loop.ts）：OutRun 式分段递进 + 段末岔路二选一。
 * 逻辑此前散落在 startGame/beginRouteChoice/chooseRouteBranch/frame/applyPhase 五处，
 * 现收敛为单一真源；GameLoop 仅保留 routeDef/routeChoosing/routeFork/routeForkAlpha 状态字段。
 * DOM 经注入式 getElement 解耦（测试 stub 环境覆盖层缺失时可安全回退）。
 */

/** 段末推进判定结果 */
export type RouteAdvanceAction = 'none' | 'finish' | 'choice'

/**
 * 纯解析路线定义与起始段赛道下标（不写 race，2026-09-06 拆分）：
 * startGame 中需先取得 startTrackIndex 才能 selectTrackFor（其内部触发 resetRace，
 * resetRaceState 现重置 route 六字段），故 route 字段写入推迟到 selectTrackFor 之后。
 */
export function parseRouteRun(routeId: string | null): { routeDef: RouteDef | null; startTrackIndex: number } {
  const routeDef = routeId !== null ? getRouteDef(routeId) : null
  if (!routeDef) {
    return { routeDef: null, startTrackIndex: -1 }
  }
  const startStage = getRouteStage(routeDef, routeDef.startStageId)
  return { routeDef, startTrackIndex: TRACK_DEFS.findIndex((d) => d.id === startStage?.trackId) }
}

/** 写入路线起始段状态（resetRace 清空 route 字段后由调用方重写；幂等） */
export function applyRouteStart(race: RaceState, routeDef: RouteDef): void {
  const startStage = getRouteStage(routeDef, routeDef.startStageId)
  race.routeStageId = routeDef.startStageId
  race.routeStageCount = routeStageCount(routeDef)
  race.routeStageIndex = routeStageIndex(routeDef, routeDef.startStageId)
  // 起始段即终段时置位（防 resetRaceState 清空后误判非终段）
  race.routeIsFinish = startStage?.isFinish === true
  race.routeCumulativeTime = 0
  race.routeCumulativeDriftScore = 0
}

/**
 * 路线模式开局初始化（原 startGame 内联块）：加载路线定义、置起始阶段、
 * 清累计用时/得分，返回起始段赛道在 TRACK_DEFS 的下标（-1 = 不可用）。
 */
export function initRouteRun(
  routeId: string | null,
  race: RaceState,
): { routeDef: RouteDef | null; startTrackIndex: number } {
  const parsed = parseRouteRun(routeId)
  if (parsed.routeDef) {
    applyRouteStart(race, parsed.routeDef)
  }
  return parsed
}

/**
 * 选定岔路方向（原 chooseRouteBranch 纯计算部分）：累计本段时间/得分到 routeCumulative*，
 * 更新段状态（下一段 id/下标/终段标记），返回下一段赛道下标；无该方向出口返回 null。
 * DOM 隐藏与 selectTrackFor（触发 resetRace）由调用方执行。
 */
export function selectRouteBranch(args: {
  routeDef: RouteDef | null
  race: RaceState
  dir: 'left' | 'right'
}): { trackIndex: number } | null {
  const { routeDef, race, dir } = args
  if (!routeDef || !race.routeStageId) return null
  const branches = routeBranches(routeDef, race.routeStageId)
  const nextId = dir === 'left' ? branches.left : branches.right
  if (!nextId) return null
  const nextStage = getRouteStage(routeDef, nextId)
  if (!nextStage) return null
  // 累计本段时间/得分（本段 raceTime 从 0 起计时；结算总用时 = routeCumulativeTime + 最后段 raceTime）
  race.routeCumulativeTime += race.player1.raceTime
  race.routeCumulativeDriftScore += Math.round(race.player1.driftState.score + race.player1.nearMissScore)
  const trackIndex = TRACK_DEFS.findIndex((d) => d.id === nextStage.trackId)
  if (trackIndex < 0) return null
  // 更新段状态（终段标记供完赛判定）
  race.routeStageId = nextId
  race.routeStageIndex = routeStageIndex(routeDef, nextId)
  race.routeIsFinish = nextStage.isFinish === true
  return { trackIndex }
}

/**
 * 进入段末岔路选择（原 beginRouteChoice）：填充 #route-choice 覆盖层 DOM 并计算分叉渲染参数。
 * 返回 { fork, overlayMissing }——覆盖层缺失（测试 stub 环境）时 overlayMissing=true，
 * 调用方回退直接取左路继续（防卡死）。
 */
export function openRouteChoice(args: {
  routeDef: RouteDef | null
  race: RaceState
  getElement: (id: string) => HTMLElement | null
}): { fork: RouteFork | null; overlayMissing: boolean } {
  const { routeDef, race, getElement } = args
  const overlay = getElement('route-choice')
  if (!overlay) {
    return { fork: null, overlayMissing: true }
  }
  if (!routeDef) {
    return { fork: null, overlayMissing: false }
  }
  const stage = getRouteStage(routeDef, race.routeStageId ?? '')
  const branches = routeBranches(routeDef, race.routeStageId ?? '')
  const leftStage = branches.left ? getRouteStage(routeDef, branches.left) : null
  const rightStage = branches.right ? getRouteStage(routeDef, branches.right) : null
  const title = overlay.querySelector<HTMLElement>('.route-choice-title')
  if (title) title.textContent = '选择路线'
  const stageEl = overlay.querySelector<HTMLElement>('.route-choice-stage')
  if (stageEl) {
    stageEl.textContent = `第 ${race.routeStageIndex}/${race.routeStageCount} 段 · ${stage?.name ?? ''}`
  }
  const leftBtn = overlay.querySelector<HTMLButtonElement>('.route-choice-btn.route-left')
  if (leftBtn) leftBtn.textContent = leftStage ? `← ${leftStage.name}` : '（无路）'
  const rightBtn = overlay.querySelector<HTMLButtonElement>('.route-choice-btn.route-right')
  if (rightBtn) rightBtn.textContent = rightStage ? `${rightStage.name} →` : '（无路）'
  overlay.hidden = false
  // M28 方案 9 三次打磨：岔路阶段预览——展示左右下一段赛道难度星级 + 环境名（getTrackDef 读取）
  const previewEl = overlay.querySelector<HTMLElement>('#route-choice-preview')
  if (previewEl) {
    const describe = (s: RouteStageDef | null): string => {
      if (!s) return '——'
      const def = getTrackDef(s.trackId)
      if (!def) return s.name
      const stars = '★'.repeat(def.difficulty)
      return `${s.name} · ${stars}`
    }
    previewEl.textContent = `左路：${describe(leftStage)}　右路：${describe(rightStage)}`
  }
  // M28 方案 9 深化：计算分叉渲染参数（左/右分支名 + 横向偏移——正右负左；单出口时两方向同偏移）
  // 分叉偏移量基于当前阶段车道宽度（ROAD_HALF_WIDTH × 2 为路面全宽，分支各向外偏 3 个路面宽）
  const lane = 3
  return {
    fork: {
      active: true,
      leftName: leftStage?.name ?? '',
      rightName: rightStage?.name ?? '',
      leftOffset: -lane * 2,
      rightOffset: lane * 2,
    },
    overlayMissing: false,
  }
}

/**
 * 路线段末推进判定（原 frame 段末检测）：超圈后按终段标记返回 finish / choice；
 * 非超圈或非路线阶段返回 none。phase/routeMode/routeChoosing 守卫由调用方负责。
 */
export function routeAdvanceAction(race: RaceState, lapComplete: boolean): RouteAdvanceAction {
  if (!lapComplete || race.routeStageId === null) return 'none'
  return race.routeIsFinish ? 'finish' : 'choice'
}

/** 分叉引导带淡入动画进度（原 frame 内联：约 0.3s 淡入，clamp 0-1） */
export function advanceRouteForkAlpha(alpha: number, dt: number): number {
  return Math.min(1, alpha + dt * 3.5)
}

/** 隐藏岔路选择覆盖层（元素缺失安全跳过；applyPhase 离开 RACING 与选路后调用） */
export function hideRouteChoiceOverlay(getElement: (id: string) => HTMLElement | null): void {
  const overlay = getElement('route-choice')
  if (overlay) overlay.hidden = true
}
