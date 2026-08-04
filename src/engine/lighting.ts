export interface LightingColors {
  skyTop: string
  skyBottom: string
  grass: string
  mountainFar: string
  mountainNear: string
}

/** M17 环境基准色（不引入运行时依赖：渲染层按 env id 直接选调色板） */
import { getEnvironmentProfile, type Environment as LightingEnvironment } from './environment'

export type { LightingEnvironment }

const CYCLE_SECONDS = 120

/** 天气循环周期（秒）：晴天 45 秒 → 阴天 45 秒交替（overcast = 累计秒数 / 45 取整为奇数） */
export const WEATHER_CYCLE_SECONDS = 45

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

/** 阴天降饱和压暗：饱和度 ×0.4、明度 ×0.8，四舍五入取整（h 不变） */
function overcastHsl(h: number, s: number, l: number): string {
  return hsl(h, Math.round(s * 0.4), Math.round(l * 0.8))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

/** M17 环境色相/草地参数（skyHue/grassHue/grassSat/grassLight 取自 environment.ts 的 Profile 字段，避免双份配置漂移） */
function getEnvTuning(envId: LightingEnvironment): {
  skyHue: number
  grassHue: number
  grassSat: number
  grassLight: number
} {
  const profile = getEnvironmentProfile(envId)
  return {
    skyHue: profile.skyHue,
    grassHue: profile.grassHue,
    grassSat: profile.grassSat,
    grassLight: profile.grassLight,
  }
}

export function updateLighting(
  timeSec: number,
  overcast = false,
  raining = false,
  night = false,
  environment: LightingEnvironment = 'plains',
): LightingColors {
  const env = getEnvTuning(environment)
  // 夜晚模式（赛道级）：锁定深暗蓝紫/暗绿色板，不随昼夜时段插值；其余路径与旧版逐字节一致
  if (night) {
    // M17：夜晚仍按环境微调草地色相（峡谷红棕/山岳冷灰），天空/远山保持暗蓝紫（夜间统一）
    return {
      skyTop: hsl(220, 55, 12),
      skyBottom: hsl(210, 50, 8),
      grass: hsl(env.grassHue, 30, 12),
      mountainFar: hsl(220, 30, 10),
      mountainNear: hsl(220, 35, 8),
    }
  }
  // 非 overcast/raining 时 build === hsl，输出与历史版本逐字节一致；阴天/雨天降饱和压暗
  // （雨天复用阴天配色，仅语义区分，供 renderer 三态天气循环消费）
  const build = overcast || raining ? overcastHsl : hsl
  const phase = (((timeSec % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS) / CYCLE_SECONDS

  // M17：直接使用环境色相（plains 与旧版逐字节一致：sky 210 / grass 130；
  //   desert 天空 35 暖橙、草地 45 沙黄；coast 天空 195 更蓝；forest 草地 120 更绿）
  const skyHueT = env.skyHue
  const grassHueT = env.grassHue

  if (phase < 0.25) {
    const t = phase / 0.25
    return {
      skyTop: build(skyHueT, 60, lerp(12, 45, t)),
      skyBottom: build(skyHueT - 10, 50, lerp(18, 55, t)),
      grass: build(grassHueT, env.grassSat, lerp(10, env.grassLight, t)),
      mountainFar: build(210, 30, lerp(10, 22, t)),
      mountainNear: build(210, 35, lerp(8, 18, t)),
    }
  } else if (phase < 0.5) {
    const t = (phase - 0.25) / 0.25
    return {
      // 白天段：色相按环境偏移，明度随 t 变化，避免插值中途经过无关色相
      skyTop: build(skyHueT, 60, lerp(45, 55, t)),
      skyBottom: build(skyHueT - 10, 50, lerp(55, 50, t)),
      grass: build(lerp(grassHueT, 35, t), lerp(env.grassSat, 50, t), lerp(env.grassLight, 18, t)),
      mountainFar: build(210, 30, lerp(22, 15, t)),
      mountainNear: build(210, 35, lerp(18, 12, t)),
    }
  } else if (phase < 0.75) {
    const t = (phase - 0.5) / 0.25
    return {
      // 黄昏段：从 skyHueT 过渡到紫 220（不再经过橙黄 25）
      skyTop: build(lerp(skyHueT, 220, t), lerp(60, 55, t), lerp(55, 10, t)),
      skyBottom: build(lerp(skyHueT - 10, 210, t), lerp(50, 45, t), lerp(50, 15, t)),
      grass: build(grassHueT, env.grassSat, lerp(18, 8, t)),
      mountainFar: build(210, 30, lerp(15, 8, t)),
      mountainNear: build(210, 35, lerp(12, 6, t)),
    }
  } else {
    const t = (phase - 0.75) / 0.25
    return {
      skyTop: build(lerp(220, skyHueT, t), 55, lerp(10, 12, t)),
      skyBottom: build(lerp(210, skyHueT - 10, t), lerp(45, 50, t), lerp(15, 18, t)),
      grass: build(grassHueT, env.grassSat, lerp(8, 10, t)),
      mountainFar: build(210, 30, lerp(8, 10, t)),
      mountainNear: build(210, 35, lerp(6, 8, t)),
    }
  }
}
