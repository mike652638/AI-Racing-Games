export interface LightingColors {
  skyTop: string
  skyBottom: string
  grass: string
  mountainFar: string
  mountainNear: string
}

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

export function updateLighting(timeSec: number, overcast = false, raining = false, night = false): LightingColors {
  // 夜晚模式（赛道级）：锁定深暗蓝紫/暗绿色板，不随昼夜时段插值；其余路径与旧版逐字节一致
  if (night) {
    return {
      skyTop: hsl(220, 55, 12),
      skyBottom: hsl(210, 50, 8),
      grass: hsl(120, 30, 12),
      mountainFar: hsl(220, 30, 10),
      mountainNear: hsl(220, 35, 8),
    }
  }
  // 非 overcast/raining 时 build === hsl，输出与历史版本逐字节一致；阴天/雨天降饱和压暗
  // （雨天复用阴天配色，仅语义区分，供 renderer 三态天气循环消费）
  const build = overcast || raining ? overcastHsl : hsl
  const phase = (((timeSec % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS) / CYCLE_SECONDS

  if (phase < 0.25) {
    const t = phase / 0.25
    return {
      skyTop: build(210, 60, lerp(12, 45, t)),
      skyBottom: build(200, 50, lerp(18, 55, t)),
      grass: build(130, 40, lerp(10, 28, t)),
      mountainFar: build(210, 30, lerp(10, 22, t)),
      mountainNear: build(210, 35, lerp(8, 18, t)),
    }
  } else if (phase < 0.5) {
    const t = (phase - 0.25) / 0.25
    return {
      // 白天段：色相恒蓝（skyTop 210 / skyBottom 200），仅明度随 t 变化，避免插值中途经过绿色
      skyTop: build(210, 60, lerp(45, 55, t)),
      skyBottom: build(200, 50, lerp(55, 50, t)),
      grass: build(lerp(130, 35, t), lerp(40, 50, t), lerp(28, 18, t)),
      mountainFar: build(lerp(210, 30, t), 30, lerp(22, 15, t)),
      mountainNear: build(lerp(210, 30, t), 35, lerp(18, 12, t)),
    }
  } else if (phase < 0.75) {
    const t = (phase - 0.5) / 0.25
    return {
      // 黄昏段：从蓝 210 过渡到紫 220（不再经过橙黄 25）
      skyTop: build(lerp(210, 220, t), lerp(60, 55, t), lerp(55, 10, t)),
      skyBottom: build(lerp(200, 210, t), lerp(50, 45, t), lerp(50, 15, t)),
      grass: build(130, 40, lerp(18, 8, t)),
      mountainFar: build(210, 30, lerp(15, 8, t)),
      mountainNear: build(210, 35, lerp(12, 6, t)),
    }
  } else {
    const t = (phase - 0.75) / 0.25
    return {
      skyTop: build(lerp(220, 210, t), 55, lerp(10, 12, t)),
      skyBottom: build(lerp(210, 200, t), lerp(45, 50, t), lerp(15, 18, t)),
      grass: build(130, 40, lerp(8, 10, t)),
      mountainFar: build(210, 30, lerp(8, 10, t)),
      mountainNear: build(210, 35, lerp(6, 8, t)),
    }
  }
}
