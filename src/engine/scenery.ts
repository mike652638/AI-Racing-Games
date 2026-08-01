/** mulberry32 伪随机数生成器（确定性，用于风景生成） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 生成确定性的远山轮廓：多层正弦叠加 + 伪随机相位，值域 0..1。
 * 正弦叠加保证轮廓平滑（符合山脊剪影），种子决定形态。
 */
export function generateMountainProfile(width: number, seed: number, layers = 3): number[] {
  const random = mulberry32(seed)
  const phase: number[] = []
  const amps: number[] = []
  let ampSum = 0
  for (let i = 0; i < layers; i++) {
    phase.push(random() * Math.PI * 2)
    const amp = 0.5 / (i + 1)
    amps.push(amp)
    ampSum += amp
  }
  const profile: number[] = []
  for (let x = 0; x < width; x++) {
    let value = 0
    for (let i = 0; i < layers; i++) {
      const freq = (Math.PI * 2 / width) * (i + 1) * (1 + random() * 0.5)
      value += Math.sin(x * freq + phase[i]) * amps[i]
    }
    const normalized = 0.5 + value / (2 * ampSum)
    profile.push(Math.min(1, Math.max(0, normalized)))
  }
  return profile
}

/** 视差偏移：cameraZ 按 factor 缩放后取模到 [0, width) */
export function parallaxOffset(cameraZ: number, factor: number, width: number): number {
  const shifted = ((cameraZ * factor) % width + width) % width
  return Math.floor(shifted)
}
