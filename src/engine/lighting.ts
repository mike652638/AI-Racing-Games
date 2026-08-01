export interface LightingColors {
  skyTop: string
  skyBottom: string
  grass: string
  mountainFar: string
  mountainNear: string
}

const CYCLE_SECONDS = 120

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

export function updateLighting(timeSec: number): LightingColors {
  const phase = ((timeSec % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS / CYCLE_SECONDS

  if (phase < 0.25) {
    const t = phase / 0.25
    return {
      skyTop: hsl(210, 60, lerp(12, 45, t)),
      skyBottom: hsl(200, 50, lerp(18, 55, t)),
      grass: hsl(130, 40, lerp(10, 28, t)),
      mountainFar: hsl(210, 30, lerp(10, 22, t)),
      mountainNear: hsl(210, 35, lerp(8, 18, t)),
    }
  } else if (phase < 0.5) {
    const t = (phase - 0.25) / 0.25
    return {
      skyTop: hsl(lerp(210, 25, t), 60, lerp(45, 55, t)),
      skyBottom: hsl(lerp(200, 35, t), 50, lerp(55, 50, t)),
      grass: hsl(lerp(130, 35, t), lerp(40, 50, t), lerp(28, 18, t)),
      mountainFar: hsl(lerp(210, 30, t), 30, lerp(22, 15, t)),
      mountainNear: hsl(lerp(210, 30, t), 35, lerp(18, 12, t)),
    }
  } else if (phase < 0.75) {
    const t = (phase - 0.5) / 0.25
    return {
      skyTop: hsl(lerp(25, 220, t), lerp(60, 55, t), lerp(55, 10, t)),
      skyBottom: hsl(lerp(35, 210, t), lerp(50, 45, t), lerp(50, 15, t)),
      grass: hsl(130, 40, lerp(18, 8, t)),
      mountainFar: hsl(210, 30, lerp(15, 8, t)),
      mountainNear: hsl(210, 35, lerp(12, 6, t)),
    }
  } else {
    const t = (phase - 0.75) / 0.25
    return {
      skyTop: hsl(lerp(220, 210, t), 55, lerp(10, 12, t)),
      skyBottom: hsl(lerp(210, 200, t), lerp(45, 50, t), lerp(15, 18, t)),
      grass: hsl(130, 40, lerp(8, 10, t)),
      mountainFar: hsl(210, 30, lerp(8, 10, t)),
      mountainNear: hsl(210, 35, lerp(6, 8, t)),
    }
  }
}
