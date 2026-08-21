import type { HudElements } from '../ui/hud'
import type { ScreenElements } from '../ui/screens'
import { togglePause } from '../shared/phase-logic'
import { PHASE_MENU, type Phase } from '../shared/phase'
import { clampAndSyncGain, MUSIC_VOLUME_KEY, persistVolume, SFX_VOLUME_KEY, VOLUME_KEY } from './volume'

/**
 * 暂停菜单控件绑定（M34 拆分自 game-loop.ts）：三个音量 slider、重开/继续/触屏暂停/岔路按钮。
 * 依赖（元素/回调/gain getter/音量 setter）注入式传递，可单测。
 */

/** 分轨标识（gain getter 与音量 setter 的索引） */
export type VolumeTrack = 'master' | 'music' | 'sfx'

export interface PauseControlsArgs {
  screenElements: ScreenElements
  hudElements: HudElements
  /** 注入式元素查询（真实环境 document.getElementById） */
  getElement: (id: string) => HTMLElement | null
  /** 清理登记（destroy() 时移除监听） */
  onCleanup: (fn: () => void) => void
  getPhase: () => Phase
  applyPhase: (phase: Phase) => void
  chooseRouteBranch: (dir: 'left' | 'right') => void
  /** 分轨增益节点（音频未惰性创建时为 null，clampAndSyncGain 仅 clamp 不同步） */
  getGain: (track: VolumeTrack) => GainNode | null
  /** 分轨音量 setter（返回 clamp 后值供持久化） */
  setVolume: (track: VolumeTrack, v: number) => number
}

/** 绑定暂停菜单控件事件：三个音量 slider + 重开/继续/触屏暂停按钮（守卫式，缺失元素跳过） */
export function bindPauseControls(args: PauseControlsArgs): void {
  const {
    screenElements,
    hudElements,
    getElement,
    onCleanup,
    getPhase,
    applyPhase,
    chooseRouteBranch,
    getGain,
    setVolume,
  } = args
  // 主音量 / 音乐分轨 / 音效分轨（P6 总控 + G7 分轨独立调节，仿 pauseVolume 模式）
  bindVolumeSlider({
    slider: screenElements.pauseVolume,
    labelId: 'pause-volume-value',
    volumeKey: VOLUME_KEY,
    gain: () => getGain('master'),
    setValue: (v) => setVolume('master', v),
    getElement,
    onCleanup,
  })
  bindVolumeSlider({
    slider: screenElements.pauseMusicVolume,
    labelId: 'pause-music-volume-value',
    volumeKey: MUSIC_VOLUME_KEY,
    gain: () => getGain('music'),
    setValue: (v) => setVolume('music', v),
    getElement,
    onCleanup,
  })
  bindVolumeSlider({
    slider: screenElements.pauseSfxVolume,
    labelId: 'pause-sfx-volume-value',
    volumeKey: SFX_VOLUME_KEY,
    gain: () => getGain('sfx'),
    setValue: (v) => setVolume('sfx', v),
    getElement,
    onCleanup,
  })
  bindPhaseButton(screenElements.pauseRestart, () => applyPhase(PHASE_MENU), onCleanup)
  bindPhaseButton(screenElements.pauseQuit, () => applyPhase(PHASE_MENU), onCleanup)
  // M19：结算屏返回主菜单按钮（触屏/鼠标可用）
  bindPhaseButton(screenElements.finishRestartBtn, () => applyPhase(PHASE_MENU), onCleanup)
  // M28 方案 9：岔路选择按钮（触屏/鼠标点击选择左右路线；守卫式绑定缺失元素跳过——
  // 测试 stub 的 getElementById 对未知 id 返回通用 stub，addEventListener 缺失时跳过）
  const routeLeftBtn = getElement('route-choice-left')
  const routeRightBtn = getElement('route-choice-right')
  if (routeLeftBtn && typeof routeLeftBtn.addEventListener === 'function') {
    routeLeftBtn.addEventListener('click', () => chooseRouteBranch('left'))
  }
  if (routeRightBtn && typeof routeRightBtn.addEventListener === 'function') {
    routeRightBtn.addEventListener('click', () => chooseRouteBranch('right'))
  }
  // F3（F3）：触屏暂停/恢复入口——#pause-btn 悬浮按钮进入暂停、#pause-resume「继续」按钮恢复
  bindPhaseButton(hudElements.pauseBtn, () => applyPhase(togglePause(getPhase())), onCleanup)
  bindPhaseButton(screenElements.pauseResume, () => applyPhase(togglePause(getPhase())), onCleanup)
}

/**
 * 绑定暂停菜单音量 slider（P6/G7）：input → clampAndSyncGain 同步对应分轨 gain → setValue 写回
 * 音量字段 → persistVolume 持久化 → 同步数值标签；绑定后初始同步一次。
 * gain 惰性为 null 时 clampAndSyncGain 仅 clamp 不同步（与旧 setVolume 行为一致）。
 */
function bindVolumeSlider(args: {
  slider: HTMLInputElement | undefined
  labelId: string
  volumeKey: string
  gain: () => GainNode | null
  setValue: (v: number) => number
  getElement: (id: string) => HTMLElement | null
  onCleanup: (fn: () => void) => void
}): void {
  const { slider, labelId, volumeKey, gain, setValue, getElement, onCleanup } = args
  if (!slider) {
    return
  }
  const onInput = (): void => {
    const v = setValue(clampAndSyncGain(Number(slider.value) / 100, gain()))
    persistVolume(volumeKey, v)
    syncVolumeLabel(slider, labelId, getElement)
  }
  slider.addEventListener('input', onInput)
  // S 修复 S3：监听经清理函数登记（destroy() 时移除）
  onCleanup(() => slider.removeEventListener('input', onInput))
  // P2（P2）：初始同步一次（UI 层 span 初始文本可能为空，保证与 slider 当前值一致）
  syncVolumeLabel(slider, labelId, getElement)
}

/** 绑定暂停菜单按钮 click（重开/继续/触屏暂停；元素缺失守卫式跳过） */
function bindPhaseButton(
  btn: HTMLButtonElement | undefined,
  action: () => void,
  onCleanup: (fn: () => void) => void,
): void {
  if (!btn) {
    return
  }
  btn.addEventListener('click', action)
  // S 修复 S3：监听经清理函数登记（destroy() 时移除）
  onCleanup(() => btn.removeEventListener('click', action))
}

/** 同步暂停菜单滑块数值标签（P2：UI 层新增 #pause-*-value span，显示百分比整数）；元素缺失静默跳过 */
function syncVolumeLabel(
  slider: HTMLInputElement,
  labelId: string,
  getElement: (id: string) => HTMLElement | null,
): void {
  const label = getElement(labelId)
  if (label) {
    label.textContent = `${Math.round(Number(slider.value))}%`
  }
}

/** 开始按钮加载态：禁用点击 + 文案切换（dataset 缺失元素安全跳过） */
export function setStartBtnLoading(btn: HTMLElement, loading: boolean): void {
  btn.classList.toggle('loading', loading)
  if (loading) {
    if (typeof btn.dataset === 'object' && btn.dataset !== null) {
      btn.dataset.originalText = btn.textContent ?? '开始游戏'
    }
    btn.textContent = '开始中…'
  } else {
    const original = typeof btn.dataset === 'object' && btn.dataset !== null ? btn.dataset.originalText : null
    btn.textContent = original ?? '开始游戏'
  }
}
