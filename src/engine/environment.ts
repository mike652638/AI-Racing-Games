/**
 * 赛道环境配置（M17）：为 9 条赛道提供与名称关联的场景视觉差异。
 * 每个环境定义：天空色相偏移、草地色相/饱和度/明度、远山配色、景物类型与密度、树木配色。
 * 纯数据模块，无副作用；渲染层（lighting / renderer / sprites）按 environment 取值。
 */

export type Environment =
  'plains' | 'highway' | 's-curve' | 'island' | 'canyon' | 'desert' | 'forest' | 'coast' | 'alpine'

export interface EnvironmentProfile {
  /** 环境标识 */
  id: Environment
  /** 天空色相（day 路径覆盖默认 210；night 不适用——夜间统一深暗蓝紫） */
  skyHue: number
  /** 草地色相（day 路径覆盖默认 130） */
  grassHue: number
  /** 草地饱和度（day 路径覆盖默认 40） */
  grassSat: number
  /** 草地明度（day 路径覆盖默认 28，最终值按天气相位插值） */
  grassLight: number
  /** 远山主色（day 路径 buildMountains far 层） */
  mountainFar: string
  /** 远山次色（day 路径 buildMountains near 层） */
  mountainNear: string
  /** 远景远山主色（night 路径，峡谷/山岳等夜间赛道） */
  mountainFarNight: string
  /** 远景远山次色（night 路径） */
  mountainNearNight: string
  /** 景物类型概率：树/仙人掌/棕榈/雪堆 等（'tree' 为基准树形） */
  spriteKind: 'tree' | 'cactus' | 'palm' | 'snowpile'
  /** 树（或替代景物）出现概率（其余为路灯）；desert 仙人掌、coast 棕榈、alpine 雪堆 */
  treeRatio: number
  /** 路边景物间距（世界单位；forest 更密、desert 更稀） */
  spacing: number
  /** 树冠主色（树干色固定 #5a3a22 棕） */
  treeColor: string
  /** 树冠亮色（两层树冠的上层） */
  treeColorLight: string
  /** 菜单赛道缩略图主题色（亮色，随环境区分；缺省回退金黄 #ffd75e，2026-08-05 菜单优化） */
  previewColor?: string
  /** M18 环境车灯配色（night 赛道可见）：canyon 红棕暖光 / alpine 冷白；其余不设（玩家车默认黄白） */
  headlightColor?: string
  /** M17 地形装饰：沙漠沙丘（dunes）/ 海岸海面（sea）/ 峡谷岩壁（rock）；无则省略（默认草原无地形装饰） */
  terrain?: 'dunes' | 'sea' | 'rock'
  /**
   * 跳过右侧（+offset，海侧）景物生成（V-2，2026-08-05 审计）：
   * coast 环境海面绘制在屏幕右侧地面，右侧路边棕榈会叠压海面呈“树长在海里”；
   * 置 true 时 createRoadsideSprites 仅生成左侧（-offset）景物，其余环境不设。
   */
  skipRightSprites?: boolean
}

const PROFILES: Record<Environment, EnvironmentProfile> = {
  plains: {
    id: 'plains',
    skyHue: 210,
    grassHue: 130,
    grassSat: 40,
    grassLight: 28,
    mountainFar: '#27425e',
    mountainNear: '#1f3046',
    mountainFarNight: '#101a2a',
    mountainNearNight: '#0a1220',
    spriteKind: 'tree',
    treeRatio: 0.7,
    spacing: 800,
    treeColor: '#2d5a27',
    treeColorLight: '#3a7a35',
    previewColor: '#ffd75e',
  },
  highway: {
    id: 'highway',
    skyHue: 205,
    grassHue: 95,
    grassSat: 32,
    grassLight: 30,
    mountainFar: '#2a3a4e',
    mountainNear: '#22324a',
    mountainFarNight: '#101a2a',
    mountainNearNight: '#0a1220',
    spriteKind: 'tree',
    treeRatio: 0.55,
    spacing: 900,
    treeColor: '#2e5427',
    treeColorLight: '#3a6a32',
    previewColor: '#7ec8ff',
  },
  's-curve': {
    id: 's-curve',
    skyHue: 215,
    grassHue: 135,
    grassSat: 42,
    grassLight: 26,
    mountainFar: '#2a4058',
    mountainNear: '#213349',
    mountainFarNight: '#101a2a',
    mountainNearNight: '#0a1220',
    spriteKind: 'tree',
    treeRatio: 0.75,
    spacing: 750,
    treeColor: '#2a5525',
    treeColorLight: '#367033',
    previewColor: '#8eff9e',
  },
  island: {
    id: 'island',
    skyHue: 200,
    grassHue: 90,
    grassSat: 48,
    grassLight: 32,
    mountainFar: '#2c5a6e',
    mountainNear: '#244a60',
    mountainFarNight: '#10202e',
    mountainNearNight: '#0a1824',
    spriteKind: 'palm',
    treeRatio: 0.8,
    spacing: 850,
    treeColor: '#2f6a2f',
    treeColorLight: '#3d8a3d',
    previewColor: '#6ee7d8',
  },
  canyon: {
    id: 'canyon',
    skyHue: 15,
    grassHue: 25,
    grassSat: 30,
    grassLight: 20, // C4：22→20 调暗地面，与灰色路面拉开明度差（路面边缘更易判断）
    mountainFar: '#5a3a2a',
    mountainNear: '#4a2e20',
    mountainFarNight: '#3a2418',
    mountainNearNight: '#2c1a10',
    spriteKind: 'cactus',
    treeRatio: 0.6,
    spacing: 1000,
    treeColor: '#4a5a2a',
    treeColorLight: '#5a6a30',
    previewColor: '#ff9a6e',
    headlightColor: '#ff8a5c', // M18：峡谷夜间车灯红棕暖光
    terrain: 'rock',
  },
  desert: {
    id: 'desert',
    skyHue: 35,
    grassHue: 45,
    grassSat: 55,
    grassLight: 55,
    mountainFar: '#8a6a3a',
    mountainNear: '#7a5c30',
    mountainFarNight: '#4a3820',
    mountainNearNight: '#3a2c18',
    spriteKind: 'cactus',
    treeRatio: 0.85,
    spacing: 1100,
    treeColor: '#5a6a2a',
    treeColorLight: '#6a7a35',
    previewColor: '#ffb347',
    terrain: 'dunes',
  },
  forest: {
    id: 'forest',
    skyHue: 195,
    grassHue: 120,
    grassSat: 55,
    grassLight: 18,
    mountainFar: '#1a3a2a',
    mountainNear: '#14301f',
    mountainFarNight: '#0e1a14',
    mountainNearNight: '#0a140e',
    spriteKind: 'tree',
    treeRatio: 0.95,
    spacing: 600,
    treeColor: '#1f4a1f',
    treeColorLight: '#2a5c28',
    previewColor: '#6eff8e',
  },
  coast: {
    id: 'coast',
    skyHue: 195,
    grassHue: 170,
    grassSat: 45,
    grassLight: 30,
    mountainFar: '#2a5a7a',
    mountainNear: '#22486a',
    mountainFarNight: '#14202e',
    mountainNearNight: '#0e1824',
    spriteKind: 'palm',
    treeRatio: 0.7,
    spacing: 900,
    treeColor: '#2a6a3a',
    treeColorLight: '#388048',
    previewColor: '#6ec6ff',
    terrain: 'sea',
    // V-2（2026-08-05 审计）：海侧（屏幕右侧）不生成棕榈，消除“树长在海里”叠压穿帮
    skipRightSprites: true,
  },
  alpine: {
    id: 'alpine',
    skyHue: 205,
    grassHue: 60,
    grassSat: 25,
    grassLight: 50,
    mountainFar: '#6a7a8a',
    mountainNear: '#5a6a7a',
    mountainFarNight: '#3a4654',
    mountainNearNight: '#2e3844',
    spriteKind: 'snowpile',
    treeRatio: 0.5,
    spacing: 1000,
    treeColor: '#4a5a5a',
    treeColorLight: '#c8d8e8',
    previewColor: '#c8d8ff',
    headlightColor: '#dff1ff', // M18：山岳夜间车灯冷白
  },
}

/** 按环境标识取配置文件（未知环境回退 plains，防未定义崩溃） */
export function getEnvironmentProfile(env: Environment): EnvironmentProfile {
  return PROFILES[env] ?? PROFILES.plains
}

/** 菜单赛道缩略图默认主题色（金黄；环境未配 previewColor 时回退，2026-08-05） */
export const PREVIEW_COLOR_DEFAULT = '#ffd75e'

/** 按环境取菜单缩略图主题色（未配回退金黄，2026-08-05 菜单优化） */
export function getEnvironmentPreviewColor(env: Environment): string {
  return getEnvironmentProfile(env).previewColor ?? PREVIEW_COLOR_DEFAULT
}
