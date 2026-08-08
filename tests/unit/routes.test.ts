/**
 * M28 方案 9：OutRun 式分支路线数据结构单测。
 * 覆盖 RouteDef/Stage 定义完整性、岔路图查询、阶段计数/序号解析。
 */
import { describe, expect, test } from 'vitest'
import {
  getRouteDef,
  getRouteStage,
  ROUTE_DEFS,
  routeBranches,
  routeStageCount,
  routeStageIndex,
} from '../../src/engine/routes'
import { TRACK_DEFS } from '../../src/engine/tracks'

describe('ROUTE_DEFS 预设路线', () => {
  test('至少 3 条路线', () => {
    expect(ROUTE_DEFS.length).toBeGreaterThanOrEqual(3)
  })

  test('每条路线：id/name/难度/起始阶段/阶段列表完整', () => {
    for (const route of ROUTE_DEFS) {
      expect(route.id.length).toBeGreaterThan(0)
      expect(route.name.length).toBeGreaterThan(0)
      expect([1, 2, 3]).toContain(route.difficulty)
      expect(route.startStageId.length).toBeGreaterThan(0)
      expect(route.stages.length).toBeGreaterThanOrEqual(2)
      // 起始阶段必须存在于 stages
      expect(getRouteStage(route, route.startStageId)).not.toBeNull()
    }
  })

  test('每个阶段引用的 trackId 必须存在于 TRACK_DEFS', () => {
    const trackIds = new Set(TRACK_DEFS.map((d) => d.id))
    for (const route of ROUTE_DEFS) {
      for (const stage of route.stages) {
        expect(trackIds.has(stage.trackId)).toBe(true)
      }
    }
  })

  test('每条路线恰好 1 个终点阶段（isFinish），且分支引用均指向有效阶段', () => {
    for (const route of ROUTE_DEFS) {
      const finishes = route.stages.filter((s) => s.isFinish === true)
      expect(finishes).toHaveLength(1)
      for (const stage of route.stages) {
        const b = routeBranches(route, stage.id)
        for (const target of [b.left, b.right]) {
          if (target !== undefined) {
            expect(getRouteStage(route, target)).not.toBeNull()
          }
        }
      }
    }
  })
})

describe('岔路图查询', () => {
  test('routeBranches 返回起始阶段的出口', () => {
    const route = ROUTE_DEFS[0]
    const b = routeBranches(route, route.startStageId)
    expect(b.left).toBeTruthy()
    expect(b.right).toBeTruthy()
  })

  test('终点阶段无出口（返回空对象）', () => {
    const route = ROUTE_DEFS[0]
    const finish = route.stages.find((s) => s.isFinish)
    expect(finish).toBeDefined()
    expect(routeBranches(route, finish!.id)).toEqual({})
  })

  test('未知阶段返回空对象', () => {
    expect(routeBranches(ROUTE_DEFS[0], 'nope')).toEqual({})
  })
})

describe('阶段计数/序号', () => {
  test('routeStageCount 返回阶段总数（≥2）', () => {
    for (const route of ROUTE_DEFS) {
      expect(routeStageCount(route)).toBe(route.stages.length)
    }
  })

  test('routeStageIndex 从 1 起（数组下标 + 1），未知阶段回退 1', () => {
    const route = ROUTE_DEFS[0]
    expect(routeStageIndex(route, route.startStageId)).toBeGreaterThanOrEqual(1)
    expect(routeStageIndex(route, 'nope')).toBe(1)
  })
})

describe('getRouteDef 按 id 查询', () => {
  test('有效 id 命中、无效回退 null', () => {
    expect(getRouteDef(ROUTE_DEFS[0].id)).toBe(ROUTE_DEFS[0])
    expect(getRouteDef('missing-route')).toBeNull()
  })
})
