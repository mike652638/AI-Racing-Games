/**
 * 菜单主题接线（rt4 批次自 game-loop.ts 拆分）：赛道缩略图刷新 + 菜单背景主题类切换。
 * SVG 轨迹生成为 track-preview.ts 纯函数；主题色取 environment.ts 配置（均已有单测）。
 * 预览经 innerHTML 注入：内容为内部 buildTrackPreviewSvg 生成的静态 SVG，无用户可控输入面
 * （DOMParser 在 node 测试环境不可用，维持 innerHTML 并在此固化注释说明）。
 */
import { TRACK_DEFS } from '../engine/tracks'
import { getEnvironmentPreviewColor } from '../engine/environment'
import { buildTrackPreviewBackgroundSvg, buildTrackPreviewSvg } from './track-preview'

/** 刷新赛道缩略图：同时更新中央信息区预览与宽屏背景层预览。
 * 背景层 1920×480（4:1）用于 1920×1080 大屏沉浸式氛围，中央 560×140 用于小屏降级。 */
export function applyTrackPreview(trackIndex: number): void {
  const def = TRACK_DEFS[trackIndex]
  if (!def) return
  const color = getEnvironmentPreviewColor(def.environment)

  const preview = document.getElementById('track-preview')
  if (preview) {
    const svg = buildTrackPreviewSvg(def, 560, 140, 14, color)
    if (svg !== null) preview.innerHTML = svg
  }

  const bgPreview = document.getElementById('track-preview-bg')
  if (bgPreview) {
    // 背景层轨迹使用纯白色，确保在压暗滤镜下仍清晰可辨并带有冷辉光
    const bgColor = '#ffffff'
    const bgSvg = buildTrackPreviewBackgroundSvg(def, 1920, 480, 28, bgColor)
    if (bgSvg !== null) bgPreview.innerHTML = bgSvg
  }
}

/** 更新菜单背景色类（赛道主题：切换赛道时 .menu-bg 追加 track-xxx 类） */
export function updateMenuBackground(trackIndex: number): void {
  const menuBg =
    typeof document.querySelector === 'function' ? (document.querySelector('.menu-bg') as HTMLElement | null) : null
  if (!menuBg) return
  const def = TRACK_DEFS[trackIndex]
  if (!def) return
  // 移除所有 track-* 类，再添加当前赛道类
  menuBg.className = 'menu-bg'
  menuBg.classList.add(`track-${def.id}`)
}
