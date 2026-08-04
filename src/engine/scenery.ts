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
 *
 * P0 修复（实测发现）：频率必须每层固定（在外层循环求值一次），且随机倍数收敛到小范围。
 * 原实现在 x 内层循环每像素调用 random() 求 freq，导致每个像素频率随机跳变，
 * 相邻像素轮廓高度满量程震荡（实测 maxDelta≈0.98），渲染为密集黑色条纹。
 */
export function generateMountainProfile(width: number, seed: number, layers = 3): number[] {
  const random = mulberry32(seed)
  const phase: number[] = []
  const amps: number[] = []
  const freqs: number[] = []
  let ampSum = 0
  for (let i = 0; i < layers; i++) {
    phase.push(random() * Math.PI * 2)
    const amp = 0.5 / (i + 1)
    amps.push(amp)
    ampSum += amp
    // 固定频率（每层只随机一次），随机倍数收窄到 ±15%，避免高频震荡
    freqs.push(((Math.PI * 2) / width) * (i + 1) * (1 + random() * 0.3))
  }
  const profile: number[] = []
  for (let x = 0; x < width; x++) {
    let value = 0
    for (let i = 0; i < layers; i++) {
      value += Math.sin(x * freqs[i] + phase[i]) * amps[i]
    }
    const normalized = 0.5 + value / (2 * ampSum)
    profile.push(Math.min(1, Math.max(0, normalized)))
  }
  return profile
}

/** 视差偏移：cameraZ 按 factor 缩放后取模到 [0, width) */
export function parallaxOffset(cameraZ: number, factor: number, width: number): number {
  const shifted = (((cameraZ * factor) % width) + width) % width
  return Math.floor(shifted)
}
