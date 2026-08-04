import { TRACK_DEFS } from '../engine/tracks'
import { createTrackContext, type TrackContext } from './track-context'

/** TrackManager 依赖注入：重置回调与选单 DOM（P1/P2 双赛道名、双类高亮） */
export interface TrackManagerDeps {
  /** 切换赛道后的对局重置回调（由 GameLoop 提供） */
  resetRace: () => void
  /** P1 赛道名显示元素 */
  trackName: HTMLSpanElement
  /** P2 赛道名显示元素（分屏时显示；可选，未传则跳过） */
  p2TrackName?: HTMLSpanElement
  /** 分屏模式标志：单屏（false）时不应用 P2 的 selected-p2 高亮，避免 P2 选择残留绿色边框 */
  splitMode: boolean
  /** 赛道选项元素（P1 用 selected 类、P2 用 selected-p2 类分别高亮） */
  trackOptions: HTMLDivElement[]
}

/**
 * 赛道管理器：按玩家索引持有独立的 TrackContext（分段/圈长/圈数/预计算/车流），
 * 封装单玩家赛道切换（selectTrack）与选单双类高亮（updateTrackSelect）。
 * 分屏时 P1/P2 各自选赛道互不影响；单人模式始终操作玩家 0（P1 上下文）。
 */
export class TrackManager {
  /** 双玩家各自选中的赛道下标（[P1, P2]，默认均 classic） */
  private selectedIndexes: [number, number] = [0, 0]
  /** 双玩家各自的赛道世界上下文（构造时各用 TRACK_DEFS[0] 创建，互不共享） */
  private readonly contexts: [TrackContext, TrackContext] = [
    createTrackContext(TRACK_DEFS[0]),
    createTrackContext(TRACK_DEFS[0]),
  ]

  constructor(private readonly deps: TrackManagerDeps) {
    this.updateTrackSelect()
  }

  /** 获取指定玩家的赛道上下文 */
  getContext(playerIndex: 0 | 1): TrackContext {
    return this.contexts[playerIndex]
  }

  /** 获取指定玩家的单圈长度（世界单位） */
  getLapLength(playerIndex: 0 | 1): number {
    return this.contexts[playerIndex].lapLength
  }

  /** 获取指定玩家的总圈数 */
  getTotalLaps(playerIndex: 0 | 1): number {
    return this.contexts[playerIndex].totalLaps
  }

  /** 获取指定玩家的赛道 id（URL/存档用） */
  getTrackId(playerIndex: 0 | 1): string {
    return this.contexts[playerIndex].def.id
  }

  /** 获取指定玩家的赛道下标（菜单方向键导航用） */
  getSelectedIndex(playerIndex: 0 | 1): number {
    return this.selectedIndexes[playerIndex]
  }

  /**
   * 切换指定玩家的赛道：重建该玩家 TrackContext（含渲染预计算与车流）、
   * 触发 resetRace 回调并刷新选单高亮。另一玩家不受影响。
   */
  selectTrack(playerIndex: 0 | 1, trackIndex: number): void {
    this.selectedIndexes[playerIndex] = trackIndex
    this.contexts[playerIndex] = createTrackContext(TRACK_DEFS[trackIndex])
    this.deps.resetRace()
    this.updateTrackSelect()
  }

  /** 刷新选单高亮与赛道名（P1 selected / P2 selected-p2 双类高亮） */
  updateTrackSelect(): void {
    this.deps.trackName.textContent = this.contexts[0].def.name
    if (this.deps.p2TrackName) this.deps.p2TrackName.textContent = this.contexts[1].def.name
    this.deps.trackOptions.forEach((option, i) => {
      option.classList.toggle('selected', i === this.selectedIndexes[0])
      option.classList.toggle('selected-p2', this.deps.splitMode && i === this.selectedIndexes[1])
      // a11y：aria-pressed 与选中态同步（测试 stub 元素无 setAttribute 时跳过）
      if (typeof option.setAttribute === 'function') {
        option.setAttribute('aria-pressed', String(i === this.selectedIndexes[0]))
      }
    })
  }
}
