import type { Phase } from './phase'

/** 调试钩子类型：供自动化验证脚本读取运行时状态（与 installDebugHook 保持同步） */
declare global {
  interface Window {
    __gameDebug?: {
      readonly audioState: AudioContextState | null
      readonly musicState: 'stopped' | 'running'
      readonly phase: Phase
      readonly driftActive: boolean
      readonly split: boolean
      readonly hotseatPlayer: 1 | 2
      readonly player2CameraZ: number
      readonly p2TrafficZ: number
      readonly bestTime: number | null
      readonly bestTime2: number | null
      readonly trafficCount: number
      readonly collisions: number
      readonly collisionFlash: number
      readonly selectedTrack: string
      readonly selectedTrack2: string
      readonly touchActive: boolean
      readonly volume: number
      readonly rainPlaying: boolean
      readonly challengeTimeLeft: number | null
      readonly boostCharge: number
      readonly weatherOverride: 'auto' | 'sunny' | 'rain' | 'night'
      readonly weatherMode: 'auto' | 'random' | 'sunny' | 'rain' | 'night'
      readonly trafficRubber: number
      readonly trafficDynamic: boolean
      readonly guideStrength: number
      readonly routeStageId: string | null
      readonly routeStageIndex: number
      readonly routeStageCount: number
      readonly routeIsFinish: boolean
      readonly routeChoosing: boolean
      /** M31 方案 9 三次打磨：分叉淡入动画进度（0-1，routeChoosing 期间递增） */
      readonly routeForkAlpha: number
      /** M28 方案 14：每日挑战状态（今日赛道/完成标记/连续天数；供自动化验证） */
      readonly dailyState: { date: string; trackId: string; done: boolean; streak: number }
    }
  }
}

/** 调试钩子取值源：GameLoop 注入运行时状态的读取器 */
export interface DebugHookSources {
  audioState: () => AudioContextState | null
  musicState: () => 'stopped' | 'running'
  phase: () => Phase
  driftActive: () => boolean
  split: boolean
  hotseatPlayer: () => 1 | 2
  player2CameraZ: () => number
  p2TrafficZ: () => number
  bestTime: () => number | null
  bestTime2: () => number | null
  trafficCount: () => number
  collisions: () => number
  /** M16：碰撞红闪强度（0-1，调试/测试观察碰撞视觉反馈） */
  collisionFlash: () => number
  selectedTrack: () => string
  selectedTrack2: () => string
  touchActive: () => boolean
  volume: () => number
  rainPlaying: () => boolean
  challengeTimeLeft: () => number | null
  boostCharge: () => number
  /** M23 方案 11：本局生效的天气变体（startGame 设置） */
  weatherOverride: () => 'auto' | 'sunny' | 'rain' | 'night'
  /** M23 方案 11：URL 解析的天气模式（auto/random/固定变体） */
  weatherMode: () => 'auto' | 'random' | 'sunny' | 'rain' | 'night'
  /** M23 方案 13：当前车流橡皮筋系数（P1 世界，frame-update 平滑收敛；static 模式恒 1） */
  trafficRubber: () => number
  /** M23 方案 13：URL 解析的车流橡皮筋开关（dynamic=true / static=false） */
  trafficDynamic: () => boolean
  /** M28 方案 10：URL 解析的导航辅助线强度（?guide=1 开启 0.8 / 缺省 0 关闭） */
  guideStrength: () => number
  /** M28 方案 9：当前路线阶段 id（非路线模式 null） */
  routeStageId: () => string | null
  /** M28 方案 9：当前阶段序号（STAGE 指示 X） */
  routeStageIndex: () => number
  /** M28 方案 9：路线阶段总数（STAGE 指示 Y） */
  routeStageCount: () => number
  /** M28 方案 9：当前阶段是否为终点 */
  routeIsFinish: () => boolean
  /** M28 方案 9：是否处于段末岔路选择（覆盖层显示中） */
  routeChoosing: () => boolean
  /** M31 方案 9 三次打磨：分叉淡入动画进度 */
  routeForkAlpha: () => number
  /** M28 方案 14：每日挑战状态快照 */
  dailyState: () => { date: string; trackId: string; done: boolean; streak: number }
}

/**
 * 安装调试钩子：把运行时状态暴露到 window.__gameDebug（自动化验证脚本读取）。
 * 生产构建剥离（2026-08-05）：非 DEV 环境直接 no-op——vite build 下
 * import.meta.env.DEV 静态替换为 false，整段赋值被死码消除；
 * vitest（mode=test，DEV=true）与 dev 服务器保持安装，测试断言不受影响。
 */
export function installDebugHook(sources: DebugHookSources): void {
  if (!import.meta.env.DEV) return
  window.__gameDebug = {
    get audioState() {
      return sources.audioState()
    },
    get musicState() {
      return sources.musicState()
    },
    get phase() {
      return sources.phase()
    },
    get driftActive() {
      return sources.driftActive()
    },
    get split() {
      return sources.split
    },
    get hotseatPlayer() {
      return sources.hotseatPlayer()
    },
    get player2CameraZ() {
      return sources.player2CameraZ()
    },
    get p2TrafficZ() {
      return sources.p2TrafficZ()
    },
    get bestTime() {
      return sources.bestTime()
    },
    get bestTime2() {
      return sources.bestTime2()
    },
    get trafficCount() {
      return sources.trafficCount()
    },
    get collisions() {
      return sources.collisions()
    },
    get collisionFlash() {
      return sources.collisionFlash()
    },
    get selectedTrack() {
      return sources.selectedTrack()
    },
    get selectedTrack2() {
      return sources.selectedTrack2()
    },
    get touchActive() {
      return sources.touchActive()
    },
    get volume() {
      return sources.volume()
    },
    get rainPlaying() {
      return sources.rainPlaying()
    },
    get challengeTimeLeft() {
      return sources.challengeTimeLeft()
    },
    get boostCharge() {
      return sources.boostCharge()
    },
    get weatherOverride() {
      return sources.weatherOverride()
    },
    get weatherMode() {
      return sources.weatherMode()
    },
    get trafficRubber() {
      return sources.trafficRubber()
    },
    get trafficDynamic() {
      return sources.trafficDynamic()
    },
    get guideStrength() {
      return sources.guideStrength()
    },
    get routeStageId() {
      return sources.routeStageId()
    },
    get routeStageIndex() {
      return sources.routeStageIndex()
    },
    get routeStageCount() {
      return sources.routeStageCount()
    },
    get routeIsFinish() {
      return sources.routeIsFinish()
    },
    get routeChoosing() {
      return sources.routeChoosing()
    },
    get routeForkAlpha() {
      return sources.routeForkAlpha()
    },
    get dailyState() {
      return sources.dailyState()
    },
  }
}
