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
      readonly selectedTrack: string
      readonly selectedTrack2: string
      readonly touchActive: boolean
      readonly volume: number
      readonly rainPlaying: boolean
      readonly challengeTimeLeft: number | null
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
  selectedTrack: () => string
  selectedTrack2: () => string
  touchActive: () => boolean
  volume: () => number
  rainPlaying: () => boolean
  challengeTimeLeft: () => number | null
}

/** 安装调试钩子：把运行时状态暴露到 window.__gameDebug（自动化验证脚本读取） */
export function installDebugHook(sources: DebugHookSources): void {
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
  }
}
