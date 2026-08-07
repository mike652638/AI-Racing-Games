import type { TrackDef } from '../engine/tracks'
import { getEnvironmentProfile, type EnvironmentProfile } from '../engine/environment'

/**
 * 赛道缩略图生成（2026-08-05 自 game-loop 下沉）：
 * 控制点积分生成平面轨迹 + 归一化 SVG path（菜单中央信息区预览用）。
 *
 * 2026-08-06（菜单专项测试报告 P2-2/P3）：扩展尺寸（560×140）并重绘——
 * 按赛道环境加入背景装饰（天空渐变/远山/太阳/地形特征），直观体现不同赛道特点，
 * 替代原「SVG 左 + 赛道名文字右」布局（赛道名文字已移除，预览全宽展示）。
 */

/**
 * 由赛道控制点积分生成轨迹点列（伪 3D 曲率 → 平面 x/z 曲线）：
 * angle += curve*dz；x += sin(angle)*dz。总采样约 160 点，段内按曲率线性插值。
 */
export function integrateControlPoints(controlPoints: { z: number; curve: number }[]): { x: number; z: number }[] {
  const totalZ = controlPoints.reduce((sum, p) => sum + p.z, 0)
  const points: { x: number; z: number }[] = []
  let x = 0
  let z = 0
  let angle = 0
  for (let i = 0; i < controlPoints.length; i++) {
    const seg = controlPoints[i]
    const steps = Math.max(1, Math.round((160 * seg.z) / totalZ))
    const dz = seg.z / steps
    for (let s = 0; s < steps; s++) {
      // 段内曲率线性插值（与下一段衔接平滑）
      const next = controlPoints[i + 1]
      const t = next ? s / steps : 1
      const curve = seg.curve + (next ? (next.curve - seg.curve) * t : 0)
      angle += curve * dz
      x += Math.sin(angle) * dz
      z += dz
      points.push({ x, z })
    }
  }
  return points
}

/** 环境特征标签：由 environment id 映射出简短的装饰类型（背景绘制用） */
type TerrainKind = 'plain' | 'sea' | 'dune' | 'rock' | 'snow' | 'forest'

function terrainKindOf(profile: EnvironmentProfile): TerrainKind {
  switch (profile.terrain) {
    case 'sea':
      return 'sea'
    case 'dunes':
      return 'dune'
    case 'rock':
      return 'rock'
    default:
      break
  }
  // 无 terrain 字段的环境：按景物类型区分（雪堆 → 雪山、仙人掌 → 荒漠、棕榈 → 海岸）
  switch (profile.spriteKind) {
    case 'snowpile':
      return 'snow'
    case 'cactus':
      return 'dune'
    case 'palm':
      return 'sea'
    default:
      return profile.treeRatio >= 0.9 ? 'forest' : 'plain'
  }
}

/**
 * 生成背景装饰 SVG 片段（天空渐变 + 太阳/星 + 远山 + 地形特征），
 * 与游戏内环境色板一致（getEnvironmentProfile），夜间赛道用深色夜空 + 星光。
 */
function buildBackground(
  profile: EnvironmentProfile,
  night: boolean,
  W: number,
  H: number,
  pad: number,
  gradientId = 'tp-sky',
  forBackground = false,
): string {
  // 背景层：压低地平线、压暗地面/远山，让赛道预览作为底部氛围层与菜单星空自然融合
  const horizonY = forBackground ? Math.round(H * 0.5) : Math.round(H * 0.62)
  const farY = forBackground ? Math.round(H * 0.3) : Math.round(H * 0.4)
  const nearY = forBackground ? Math.round(H * 0.4) : Math.round(H * 0.52)

  const ground = forBackground
    ? night
      ? '#080b12'
      : `hsl(${profile.grassHue} 16% 12%)`
    : night
      ? '#141a24'
      : `hsl(${profile.grassHue} ${profile.grassSat}% ${Math.max(profile.grassLight, 26)}%)`

  // 远山：白天用 mountainFar/Near，夜间用 *Night 深色；背景层进一步降低不透明度
  const far = night ? profile.mountainFarNight : profile.mountainFar
  const near = night ? profile.mountainNearNight : profile.mountainNear
  const farOpacity = forBackground ? 0.55 : 0.85
  const nearOpacity = forBackground ? 0.7 : 0.9

  const skyTop = night ? `hsl(${profile.skyHue} 12% 16%)` : `hsl(${profile.skyHue} 68% 74%)`
  const skyBottom = night ? `hsl(${profile.skyHue} 10% 8%)` : `hsl(${profile.skyHue} 62% 88%)`

  // 地形特征（地平线之上/之下装饰）
  let terrain = ''
  const kind = terrainKindOf(profile)
  if (kind === 'sea') {
    // 海面：地平线以下蓝绿色渐变 + 两道波浪线
    terrain =
      `<path d="M${pad} ${horizonY} L${W - pad} ${horizonY} L${W - pad} ${H - pad} L${pad} ${H - pad} Z" fill="hsl(${profile.skyHue} 55% 40%)" opacity="0.9"/>` +
      `<path d="M${pad + 4} ${horizonY + 10} Q${W * 0.3} ${horizonY + 2} ${W - pad - 4} ${horizonY + 12} L${W - pad - 4} ${horizonY + 16} Q${W * 0.3} ${horizonY + 6} ${pad + 4} ${horizonY + 16} Z" fill="#cfe8ff" opacity="0.35"/>`
  } else if (kind === 'dune') {
    // 沙丘：两段起伏沙丘
    terrain =
      `<path d="M${pad} ${horizonY + 8} Q${W * 0.25} ${horizonY - 10} ${W * 0.5} ${horizonY + 6} T${W - pad} ${horizonY + 6} L${W - pad} ${H - pad} L${pad} ${H - pad} Z" fill="hsl(${profile.grassHue} 60% 62%)" opacity="0.95"/>` +
      `<path d="M${pad} ${horizonY + 22} Q${W * 0.4} ${horizonY + 10} ${W - pad} ${horizonY + 20} L${W - pad} ${H - pad} L${pad} ${H - pad} Z" fill="hsl(${profile.grassHue} 55% 48%)" opacity="0.9"/>`
  } else if (kind === 'rock') {
    // 峡谷岩壁：红棕锯齿
    const teeth = Array.from({ length: 7 }, (_, i) => {
      const x1 = pad + (i * (W - 2 * pad)) / 6
      const x2 = pad + ((i + 1) * (W - 2 * pad)) / 6
      return `${x1.toFixed(0)} ${nearY + 6} L${((x1 + x2) / 2).toFixed(0)} ${nearY - 14} L${x2.toFixed(0)} ${nearY + 6}`
    }).join(' ')
    terrain = `<path d="M${pad} ${farY + 10} ${teeth} L${W - pad} ${farY + 10} L${W - pad} ${H - pad} L${pad} ${H - pad} Z" fill="${near}" opacity="0.95"/>`
  } else if (kind === 'snow') {
    // 雪山：白色山尖（主山 + 副山）
    terrain =
      `<path d="M${W * 0.22} ${nearY} L${W * 0.42} ${farY - 18} L${W * 0.62} ${nearY} Z" fill="#e8f2ff" opacity="0.9"/>` +
      `<path d="M${W * 0.58} ${nearY} L${W * 0.72} ${farY - 6} L${W * 0.86} ${nearY} Z" fill="#cfe0f4" opacity="0.85"/>`
  } else if (kind === 'forest') {
    // 森林：树冠圆点排
    terrain = Array.from({ length: 8 }, (_, i) => {
      const cx = pad + 12 + i * ((W - 2 * pad - 24) / 7)
      const cy = nearY - 4 + (i % 2) * 6
      return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="6" fill="${profile.treeColor}" opacity="0.85"/><circle cx="${cx.toFixed(0)}" cy="${(cy - 4).toFixed(0)}" r="4" fill="${profile.treeColorLight}" opacity="0.8"/>`
    }).join('')
  }
  // plain：无额外地形装饰（远山即视觉主体）

  // 太阳（白天）/ 星点（夜间）
  const skyDecor = night
    ? `<circle cx="${W * 0.18}" cy="${H * 0.22}" r="2.5" fill="#dfe8ff" opacity="0.8"/><circle cx="${W * 0.8}" cy="${H * 0.16}" r="1.8" fill="#cfe0ff" opacity="0.7"/><circle cx="${W * 0.62}" cy="${H * 0.1}" r="1.4" fill="#bfd4ff" opacity="0.6"/>`
    : `<circle cx="${W * 0.84}" cy="${H * 0.22}" r="16" fill="hsl(${profile.skyHue} 85% 90%)" opacity="0.9"/><circle cx="${W * 0.84}" cy="${H * 0.22}" r="22" fill="hsl(${profile.skyHue} 80% 92%)" opacity="0.35"/>`

  // 背景层天空：顶部透明，让菜单星空透出来；向下渐变为深紫，与菜单主氛围衔接
  const skyStops = forBackground
    ? `<stop offset="0" stop-color="#0b0518" stop-opacity="0"/><stop offset="0.52" stop-color="#0b0518" stop-opacity="0.78"/><stop offset="1" stop-color="#1a0b2e" stop-opacity="0.92"/>`
    : `<stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBottom}"/>`
  const skyRect = forBackground
    ? `<rect x="${pad}" y="${pad}" width="${W - 2 * pad}" height="${H - 2 * pad}" fill="url(#${gradientId})"/>`
    : `<rect x="${pad}" y="${pad}" width="${W - 2 * pad}" height="${H - 2 * pad}" rx="10" fill="url(#${gradientId})"/>`

  return (
    `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">` +
    skyStops +
    `</linearGradient></defs>` +
    skyRect +
    (forBackground ? '' : skyDecor) +
    // 远山（两层）
    `<path d="M${pad} ${horizonY} L${W * 0.25} ${farY} L${W * 0.5} ${horizonY - 4} L${W * 0.78} ${farY + 6} L${W - pad} ${horizonY} Z" fill="${far}" opacity="${farOpacity}"/>` +
    `<path d="M${pad} ${horizonY} L${W * 0.38} ${nearY} L${W * 0.66} ${horizonY - 2} L${W - pad} ${nearY + 4} L${W - pad} ${horizonY} Z" fill="${near}" opacity="${nearOpacity}"/>` +
    // 地面
    `<rect x="${pad}" y="${horizonY}" width="${W - 2 * pad}" height="${H - pad - horizonY}" fill="${ground}"/>` +
    terrain
  )
}

/**
 * 构建赛道缩略图 SVG innerHTML（环境背景装饰 + 主题色轨迹 path + 起点圆点）。
 * 归一化到 W×H viewBox：x 按全段跨度、z 按总长纵向铺满；空控制点返回 null。
 * color 为轨迹主题色（随环境区分，2026-08-05 菜单优化），缺省金黄 #ffd75e。
 */
export function buildTrackPreviewSvg(
  def: TrackDef,
  W = 560,
  H = 140,
  pad = 14,
  color = '#ffd75e',
  gradientId = 'tp-sky',
  forBackground = false,
): string | null {
  const pts = integrateControlPoints(def.controlPoints)
  if (pts.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z > maxZ) maxZ = p.z
  }
  const spanX = maxX - minX || 1
  const sx = (x: number): number => pad + ((x - minX) / spanX) * (W - 2 * pad)
  const sy = (z: number): number => pad + (z / maxZ) * (H - 2 * pad)
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)} ${sy(p.z).toFixed(1)}`).join(' ')
  const profile = getEnvironmentProfile(def.environment)
  const night = def.timeOfDay === 'night'
  const bg = buildBackground(profile, night, W, H, pad, gradientId, forBackground)
  // color 表现属性供 CSS drop-shadow(currentColor) 生成同色光晕（2026-08-05 菜单优化）；
  // 轨迹/起点加 class（tp-route/tp-start）与背景装饰 path 区分（CSS 只美化轨迹，不误伤背景 fill）
  return (
    `<g>${bg}</g>` +
    `<path class="tp-route" d="${d}" fill="none" stroke="${color}" color="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle class="tp-start" cx="${sx(pts[0].x).toFixed(1)}" cy="${sy(0).toFixed(1)}" r="5" fill="${color}" color="${color}"/>`
  )
}

/**
 * 构建宽屏背景版赛道预览 SVG 内部内容（2026-08-06 菜单布局优化）。
 * 与 buildTrackPreviewSvg 共用控制点积分、环境背景与轨迹归一化逻辑，
 * 但使用 1920×480 的 4:1 viewBox 以适配 1920×1080 大屏底部背景层。
 * forBackground=true 会启用：顶部透明天空、压暗地面/远山、不绘制太阳星星。
 */
export function buildTrackPreviewBackgroundSvg(
  def: TrackDef,
  W = 1920,
  H = 480,
  pad = 28,
  color = '#ffd75e',
): string | null {
  return buildTrackPreviewSvg(def, W, H, pad, color, 'tp-sky-bg', true)
}
