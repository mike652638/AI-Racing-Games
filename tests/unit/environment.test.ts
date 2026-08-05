import { describe, expect, it } from 'vitest'
import { TRACK_DEFS } from '../../src/engine/tracks'
import { getEnvironmentProfile, getEnvironmentPreviewColor, PREVIEW_COLOR_DEFAULT } from '../../src/engine/environment'
import { updateLighting } from '../../src/engine/lighting'
import { createTrackFromDef } from '../../src/engine/tracks'
import { createRoadsideSprites } from '../../src/engine/sprites'
import { createTrackContext } from '../../src/game/track-context'

describe('赛道环境映射（M17 名称关联场景）', () => {
  it('9 条赛道全部配置 environment 且与名称语义对应', () => {
    const ids = new Set(TRACK_DEFS.map((d) => d.id))
    expect(ids.size).toBe(9)
    // 每条赛道的 environment 都能命中环境配置
    for (const def of TRACK_DEFS) {
      const env = getEnvironmentProfile(def.environment)
      expect(env.id).toBe(def.environment)
    }
    // 名称关联抽查
    const byId = Object.fromEntries(TRACK_DEFS.map((d) => [d.id, d]))
    expect(byId['desert'].environment).toBe('desert')
    expect(byId['forest'].environment).toBe('forest')
    expect(byId['coast'].environment).toBe('coast')
    expect(byId['canyon'].environment).toBe('canyon')
    expect(byId['alpine'].environment).toBe('alpine')
    expect(byId['classic'].environment).toBe('plains')
  })

  it('环境配置非退化：8 种环境至少 skyHue/grassHue 各有差异', () => {
    const envs = ['plains', 'highway', 's-curve', 'island', 'canyon', 'desert', 'forest', 'coast', 'alpine'] as const
    const skyHues = new Set(envs.map((e) => getEnvironmentProfile(e).skyHue))
    const grassHues = new Set(envs.map((e) => getEnvironmentProfile(e).grassHue))
    expect(skyHues.size).toBeGreaterThanOrEqual(3)
    expect(grassHues.size).toBeGreaterThanOrEqual(3)
  })

  it('菜单预览主题色随环境区分，未配回退金黄（2026-08-05 菜单优化）', () => {
    expect(getEnvironmentPreviewColor('plains')).toBe(PREVIEW_COLOR_DEFAULT)
    expect(getEnvironmentPreviewColor('desert')).toBe('#ffb347')
    expect(getEnvironmentPreviewColor('coast')).toBe('#6ec6ff')
    // 9 环境预览色高区分度（≥ 8 种不同色）
    const envs = ['plains', 'highway', 's-curve', 'island', 'canyon', 'desert', 'forest', 'coast', 'alpine'] as const
    const colors = new Set(envs.map((e) => getEnvironmentPreviewColor(e)))
    expect(colors.size).toBeGreaterThanOrEqual(8)
  })
})

describe('updateLighting 环境差异化（M17）', () => {
  it('plains 白天与旧版逐字节一致（timeSec=15 晴天相位）', () => {
    const base = updateLighting(15)
    const plains = updateLighting(15, false, false, false, 'plains')
    expect(plains).toEqual(base)
  })

  it('desert 白天草地明显偏黄（grassHue 45 < plains 130）', () => {
    const desert = updateLighting(15, false, false, false, 'desert')
    const plains = updateLighting(15, false, false, false, 'plains')
    expect(desert.grass).not.toBe(plains.grass)
    // hsl 字符串中 hue 应不同
    expect(desert.grass).toMatch(/hsl\((45|4[4-9]|5\d),/)
  })

  it('coast 白天天空更偏蓝（skyHue 195 与 plains 210 不同）', () => {
    const coast = updateLighting(15, false, false, false, 'coast')
    const plains = updateLighting(15, false, false, false, 'plains')
    expect(coast.skyTop).not.toBe(plains.skyTop)
    expect(coast.skyTop).toMatch(/hsl\((19[0-9]|20[0-3]),/)
  })

  it('night 模式按环境微调草地色相（canyon 红棕 vs alpine 冷灰）', () => {
    const canyon = updateLighting(0, false, false, true, 'canyon')
    const alpine = updateLighting(0, false, false, true, 'alpine')
    expect(canyon.grass).not.toBe(alpine.grass)
    // 天空保持夜间统一暗蓝紫
    expect(canyon.skyTop).toBe(alpine.skyTop)
  })
})

describe('createRoadsideSprites 环境景物（M17）', () => {
  it('forest 比 plains 更密集（spacing 600 < 800 → 树数量更多）', () => {
    const track = createTrackFromDef(TRACK_DEFS[0]) // classic 的几何（plains）
    const plainsEnv = getEnvironmentProfile('plains')
    const forestEnv = getEnvironmentProfile('forest')
    const plainsSprites = createRoadsideSprites(track, 1234, plainsEnv.spacing, {
      treeRatio: plainsEnv.treeRatio,
      treeColor: plainsEnv.treeColor,
      treeColorLight: plainsEnv.treeColorLight,
    })
    const forestSprites = createRoadsideSprites(track, 1234, forestEnv.spacing, {
      treeRatio: forestEnv.treeRatio,
      treeColor: forestEnv.treeColor,
      treeColorLight: forestEnv.treeColorLight,
    })
    expect(forestSprites.length).toBeGreaterThan(plainsSprites.length)
    // 树色随环境不同
    const plainsTree = plainsSprites.find((s) => s.kind === 'tree')
    const forestTree = forestSprites.find((s) => s.kind === 'tree')
    expect(plainsTree?.treeColor).toBe('#2d5a27')
    expect(forestTree?.treeColor).toBe(forestEnv.treeColor)
    expect(forestTree?.treeColor).not.toBe(plainsTree?.treeColor)
  })

  it('createTrackContext 按赛道环境生成景物（forest 密度/颜色随 def.environment）', () => {
    const forestDef = TRACK_DEFS.find((d) => d.id === 'forest')!
    const plainsDef = TRACK_DEFS.find((d) => d.id === 'classic')!
    const forestCtx = createTrackContext(forestDef)
    const plainsCtx = createTrackContext(plainsDef)
    expect(forestCtx.sprites.length).toBeGreaterThan(plainsCtx.sprites.length)
    const forestTree = forestCtx.sprites.find((s) => s.kind === 'tree')
    expect(forestTree?.treeColor).toBe(getEnvironmentProfile('forest').treeColor)
  })

  it('M17 差异化景物形状：desert 仙人掌 / coast 棕榈 / alpine 雪堆（非 tree）', () => {
    const desertDef = TRACK_DEFS.find((d) => d.id === 'desert')!
    const coastDef = TRACK_DEFS.find((d) => d.id === 'coast')!
    const alpineDef = TRACK_DEFS.find((d) => d.id === 'alpine')!
    const desertCtx = createTrackContext(desertDef)
    const coastCtx = createTrackContext(coastDef)
    const alpineCtx = createTrackContext(alpineDef)
    // 环境驱动 spriteKind：仙人掌位（树位槽）kind 为 cactus
    expect(desertCtx.sprites.some((s) => s.kind === 'cactus')).toBe(true)
    expect(desertCtx.sprites.some((s) => s.kind === 'tree')).toBe(false)
    // 棕榈位
    expect(coastCtx.sprites.some((s) => s.kind === 'palm')).toBe(true)
    expect(coastCtx.sprites.some((s) => s.kind === 'tree')).toBe(false)
    // 雪堆位
    expect(alpineCtx.sprites.some((s) => s.kind === 'snowpile')).toBe(true)
    expect(alpineCtx.sprites.some((s) => s.kind === 'tree')).toBe(false)
    // plains 仍为普通树
    const plainsDef = TRACK_DEFS.find((d) => d.id === 'classic')!
    const plainsCtx = createTrackContext(plainsDef)
    expect(plainsCtx.sprites.some((s) => s.kind === 'tree')).toBe(true)
  })

  it('M17 地形装饰：desert/coast/canyon 配置 terrain，其余环境省略', () => {
    expect(getEnvironmentProfile('desert').terrain).toBe('dunes')
    expect(getEnvironmentProfile('coast').terrain).toBe('sea')
    expect(getEnvironmentProfile('canyon').terrain).toBe('rock')
    expect(getEnvironmentProfile('plains').terrain).toBeUndefined()
    expect(getEnvironmentProfile('forest').terrain).toBeUndefined()
    expect(getEnvironmentProfile('alpine').terrain).toBeUndefined()
    expect(getEnvironmentProfile('highway').terrain).toBeUndefined()
  })

  it('M18 环境车灯配色：canyon 红棕暖光 / alpine 冷白，其余环境缺省（默认玩家车黄白）', () => {
    expect(getEnvironmentProfile('canyon').headlightColor).toBe('#ff8a5c')
    expect(getEnvironmentProfile('alpine').headlightColor).toBe('#dff1ff')
    // 非 night 环境不设（缺省 undefined → drawPlayerCar 走默认 HEADLIGHT_CORE）
    expect(getEnvironmentProfile('plains').headlightColor).toBeUndefined()
    expect(getEnvironmentProfile('highway').headlightColor).toBeUndefined()
    expect(getEnvironmentProfile('s-curve').headlightColor).toBeUndefined()
    expect(getEnvironmentProfile('island').headlightColor).toBeUndefined()
    expect(getEnvironmentProfile('desert').headlightColor).toBeUndefined()
    expect(getEnvironmentProfile('forest').headlightColor).toBeUndefined()
    expect(getEnvironmentProfile('coast').headlightColor).toBeUndefined()
  })

  it('M17 棕榈 rotation 随机化：coast 棕榈既有左弯(-1)也有右弯(+1)', () => {
    const coastDef = TRACK_DEFS.find((d) => d.id === 'coast')!
    const ctx = createTrackContext(coastDef)
    const palms = ctx.sprites.filter((s) => s.kind === 'palm')
    expect(palms.length).toBeGreaterThanOrEqual(4)
    expect(palms.some((s) => s.rotation === -1)).toBe(true)
    expect(palms.some((s) => s.rotation === 1)).toBe(true)
  })

  it('V-2 coast 海侧不生成景物：全部 offset ≤ 0，其余环境左右成对（防棕榈叠压海面）', () => {
    const coastDef = TRACK_DEFS.find((d) => d.id === 'coast')!
    const coastCtx = createTrackContext(coastDef)
    expect(coastCtx.sprites.length).toBeGreaterThan(0)
    expect(coastCtx.sprites.every((s) => s.offset <= 0)).toBe(true)
    // 对照：非海岸环境（forest）仍左右成对（存在正 offset 景物）
    const forestDef = TRACK_DEFS.find((d) => d.id === 'forest')!
    const forestCtx = createTrackContext(forestDef)
    expect(forestCtx.sprites.some((s) => s.offset > 0)).toBe(true)
    expect(forestCtx.sprites.some((s) => s.offset < 0)).toBe(true)
    // 配置层：仅 coast 置 skipRightSprites
    expect(getEnvironmentProfile('coast').skipRightSprites).toBe(true)
    expect(getEnvironmentProfile('plains').skipRightSprites).toBeUndefined()
    expect(getEnvironmentProfile('desert').skipRightSprites).toBeUndefined()
  })

  it('M17 沙漠小仙人掌：desert 在树位之间插入 scale 0.5 的小仙人掌（数量 ≈ 大仙人掌 + 小仙人掌成对）', () => {
    const desertDef = TRACK_DEFS.find((d) => d.id === 'desert')!
    const ctx = createTrackContext(desertDef)
    const bigCacti = ctx.sprites.filter((s) => s.kind === 'cactus' && (s.scale === undefined || s.scale === 1))
    const smallCacti = ctx.sprites.filter((s) => s.kind === 'cactus' && s.scale === 0.5)
    expect(bigCacti.length).toBeGreaterThan(0)
    expect(smallCacti.length).toBeGreaterThanOrEqual(bigCacti.length)
    expect(smallCacti[0].height).toBeLessThan(bigCacti[0].height)
    // 小仙人掌不与树位重叠（z 间隔 spacing/2）
    const smallZ = smallCacti[0].z
    const bigZs = bigCacti.map((s) => s.z)
    expect(bigZs.some((z) => Math.abs(z - smallZ) < 1)).toBe(false)
  })
})
