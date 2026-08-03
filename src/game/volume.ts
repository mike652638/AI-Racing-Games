/**
 * 音量持久化与增益同步（Task D 拆分自 game-loop.ts）：
 * localStorage 读写（clamp 0-1、静默降级）与 gain 节点同步的纯函数集合。
 * GameLoop 只保留音量字段与 slider 闭包调用，行为与拆分前逐字节一致。
 */

/** 主音量持久化 key（localStorage，存 0-1 字符串） */
export const VOLUME_KEY = 'outrun-pseudo3d-volume'
/** 音乐/音效分级音量持久化 key（G7：独立于总音量的分轨控制） */
export const MUSIC_VOLUME_KEY = 'outrun-pseudo3d-music-volume'
export const SFX_VOLUME_KEY = 'outrun-pseudo3d-sfx-volume'

/** 主音量默认值（无存档/不可用回退） */
export const VOLUME_DEFAULT = 0.6
/** 音乐分轨音量默认值（G7） */
export const MUSIC_VOLUME_DEFAULT = 0.8
/** 音效分轨音量默认值（G7） */
export const SFX_VOLUME_DEFAULT = 1.0

/** 从 localStorage 读取数值音量（clamp 0-1）；不可用/无效回退默认值（防御模式仿 save.ts getStorage） */
function loadVolumeFromStorageInternal(key: string, fallback: number): number {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) {
        const v = Number(raw)
        if (Number.isFinite(v)) {
          return Math.max(0, Math.min(1, v))
        }
      }
    }
  } catch {
    // localStorage 被禁用（隐私模式等）
  }
  return fallback
}

/** 读取持久化主音量（0-1；不可用/无效回退 0.6） */
export function loadVolumeFromStorage(): number {
  return loadVolumeFromStorageInternal(VOLUME_KEY, VOLUME_DEFAULT)
}

/** 读取持久化音乐分轨音量（0-1；不可用/无效回退 0.8，G7） */
export function loadMusicVolumeFromStorage(): number {
  return loadVolumeFromStorageInternal(MUSIC_VOLUME_KEY, MUSIC_VOLUME_DEFAULT)
}

/** 读取持久化音效分轨音量（0-1；不可用/无效回退 1.0，G7） */
export function loadSfxVolumeFromStorage(): number {
  return loadVolumeFromStorageInternal(SFX_VOLUME_KEY, SFX_VOLUME_DEFAULT)
}

/** 持久化音量：clamp 0-1 后写 localStorage（不可用/失败静默忽略） */
export function persistVolume(key: string, value: number): void {
  const clamped = Math.max(0, Math.min(1, value))
  try {
    if (typeof localStorage !== 'undefined') {
      window.localStorage.setItem(key, String(clamped))
    }
  } catch {
    // localStorage 不可用时忽略持久化
  }
}

/** clamp 音量 0-1 并同步 gain 节点（gain 为 null——音频尚未惰性创建——时仅 clamp）；返回 clamp 后值 */
export function clampAndSyncGain(v: number, gain: GainNode | null): number {
  const clamped = Math.max(0, Math.min(1, v))
  if (gain) {
    gain.gain.value = clamped
  }
  return clamped
}
