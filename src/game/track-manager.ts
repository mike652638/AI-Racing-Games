import { SEGMENT_LENGTH, type Segment } from '../engine/track'
import { createRoadsideSprites } from '../engine/sprites'
import { createTrackFromDef, TRACK_DEFS, type TrackDef } from '../engine/tracks'
import type { Renderer } from '../engine/renderer'

/** TrackManager 依赖注入：渲染器（惰性）、重置回调与赛道选单 DOM */
export interface TrackManagerDeps {
  /** 惰性获取渲染器（GameLoop 构造后才创建，applyTrack 时才使用） */
  renderer: () => Renderer
  /** 切换赛道后的对局重置回调（由 GameLoop 提供） */
  resetRace: () => void
  /** 赛道名显示元素 */
  trackName: HTMLSpanElement
  /** 赛道选项元素（高亮当前选中项） */
  trackOptions: HTMLDivElement[]
}

/**
 * 赛道管理器：持有当前赛道定义/分段/圈长/圈数，封装赛道切换（applyTrack）
 * 与选单高亮更新（updateTrackSelect）。迁移自 main.ts 的 applyTrack/updateTrackSelect。
 */
export class TrackManager {
  /** 当前选中索引 */
  selectedIndex: number
  /** 当前赛道定义 */
  trackDef: TrackDef
  /** 当前赛道分段数据 */
  track: Segment[]
  /** 单圈长度（世界单位） */
  lapLength: number
  /** 当前赛道总圈数 */
  totalLaps: number

  constructor(private readonly deps: TrackManagerDeps) {
    this.selectedIndex = 0
    this.trackDef = TRACK_DEFS[0]
    this.track = createTrackFromDef(this.trackDef)
    this.lapLength = this.track.length * SEGMENT_LENGTH
    this.totalLaps = this.trackDef.laps
    this.updateTrackSelect()
  }

  /** 切换赛道定义：重建 track/lapLength/totalLaps/景物/车流并重置对局 */
  applyTrack(index: number): void {
    this.selectedIndex = index
    this.trackDef = TRACK_DEFS[index]
    this.track = createTrackFromDef(this.trackDef)
    this.lapLength = this.track.length * SEGMENT_LENGTH
    this.totalLaps = this.trackDef.laps
    this.deps.renderer().setTrack(this.track, createRoadsideSprites(this.track))
    this.deps.resetRace()
    this.updateTrackSelect()
  }

  /** 更新选单高亮与赛道名 */
  updateTrackSelect(): void {
    this.deps.trackName.textContent = this.trackDef.name
    this.deps.trackOptions.forEach((option, i) =>
      option.classList.toggle('selected', i === this.selectedIndex),
    )
  }
}
