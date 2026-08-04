# AI-Racing-Games 9 条赛道差异化与名称关联场景验证报告

## 概述

按"分析并验证9条赛道是否有差异且符合赛道名称关联的场景"任务，从代码层与浏览器实测双重视角系统验证。结论：**9 条赛道在几何（弯道形状）、难度、圈数、车流密度、昼夜上有明确差异，但在"场景视觉环境"维度严重缺失——所有 day 赛道共享同一套天空/草地/远山色板与固定树木/路灯景物，沙漠没有沙地、森林没有密林、海岸没有海、峡谷没有岩壁、山岳没有雪山、高速公路没有护栏**。这是一个真实的环境视觉缺陷，需要通过为 TrackDef 增加 environment 字段并让渲染层差异化解决。

## 一、代码层分析：差异维度

### 1.1 几何差异 ✓

`src/engine/tracks.ts` 中 9 条赛道控制点完全不同（每条赛道控制点决定弯道形状）：

| id | 名称 | 难度 | 圈数 | 几何特征 |
|---|---|---|---|---|
| classic | 经典赛道 | 1★ | 3 | DEFAULT_CONTROL_POINTS 均衡曲线 |
| highway | 高速公路 | 2★ | 3 | 长直道 + 大半径缓弯（±0.015） |
| s-curve | S 弯挑战 | 2★ | 2 | 短距离密集连续弯（±0.02~0.03） |
| island | 环岛巡回 | 2★ | 3 | 混合节奏（直道 + 缓弯 + 小 S） |
| canyon | 峡谷疾驰 | 3★ | 2 | 超长直道 + 两个大半径反向弯（±0.015） |
| desert | 沙漠疾驰 | 1★ | 3 | 长直道 + 两个宽缓反向弯（±0.002） |
| forest | 森林穿梭 | 2★ | 2 | 连续中弯成对交替（±0.005） |
| coast | 海岸公路 | 2★ | 3 | 长弯与直道交替（±0.004） |
| alpine | 山岳险道 | 3★ | 2 | S 弯 + 大弯组合（±0.01） |

### 1.2 车流密度差异 ✓

`createTraffic(lapLength, 777, def.trafficCount ?? TRAFFIC_DEFAULT_COUNT)`：

- 16 条：highway、coast（车流密集）
- 14 条：classic、island、desert（默认密度）
- 12 条：canyon、forest（车流较稀疏）
- 8 条：s-curve、alpine（车流稀疏）

### 1.3 昼夜差异 ✓

`timeOfDay: 'night'` 仅 canyon 与 alpine 两条，其余 7 条为 `day`。渲染层根据 `view.night = ctx.def.timeOfDay === 'night'` 切换：

- **night 模式**：`updateLighting(..., night=true)` 锁定深暗蓝紫色板（hsl 220/210 hue、12%/8% lightness），深色远山、车灯光晕、车头光柱
- **day 模式**：天空/草地/远山随 120 秒天气循环（晴天 45s → 阴天 45s → 雨天 45s）插值

### 1.4 场景视觉环境差异 ✗（核心缺陷）

**`TrackDef` 只有 `timeOfDay: 'day' | 'night'` 字段，没有 `environment` 字段**。所有 day 赛道共享：

- `createRoadsideSprites(segments, seed=1234)` 固定 70% 树 + 30% 路灯，无赛道类型分支
- `buildMountains(width, '#27425e', '#1f3046')` 远山固定配色
- `updateLighting(...)` day 路径无赛道名分支
- `createTraffic` 车流颜色固定
- `grass` 颜色固定

**结果**：沙漠疾驰看不到沙地、森林穿梭看不到密林、海岸公路看不到海、峡谷疾驰看不到岩壁（只有夜色）、山岳险道看不到雪山（只有夜色）、高速公路看不到护栏/隔离带——**赛道名称暗示的环境特征在视觉上完全缺失**。

## 二、浏览器实测验证

启动 dev server 5177，用 Playwright 自动化循环 9 条赛道（按数字键选择、空格开始、加速 2.5s），采样天空/草地/路面/近端像素 + 截图。截图归档于 `.codebuddy/screenshots/32-track-1~9-*.png`。

### 2.1 像素采样量化对比

| 赛道 | sky RGB | grass RGB | roadFar RGB | roadNear RGB | 视觉特征 |
|---|---|---|---|---|---|
| classic 经典 | (165,172,181) | (21,49,26) | (61,61,61) | (218,166,163) | 蓝灰天+深绿草+灰路 |
| highway 高速 | (115,134,150) | (21,49,25) | (61,61,61) | (199,121,117) | 同上，仅天气相位差 |
| s-curve S弯 | (22,54,81) | (21,49,25) | (21,49,25) | (162,33,26) | 阴天相位+雨滴反射 |
| island 环岛 | (161,174,185) | (45,90,39) | (61,61,61) | (218,166,163) | 同 classic，仅时间相位 |
| canyon 峡谷 | (13,24,44) | (58,122,53) | (118,114,104) | (162,33,26) | **night 暗色板 + 车灯** |
| desert 沙漠 | (22,54,81) | (58,122,53) | (157,157,157) | (162,33,26) | 与 s-curve 高度相似 |
| forest 森林 | (121,140,155) | (58,122,53) | (61,61,61) | (202,127,123) | 与 highway 相似 |
| coast 海岸 | (161,174,185) | (21,49,25) | (61,61,61) | (218,166,163) | 与 classic/island 相似 |
| alpine 山岳 | (13,24,44) | (22,40,21) | (109,105,95) | (162,33,26) | **night 暗色板 + 车灯** |

### 2.2 视觉对比关键结论

**公路 vs 沙漠疾驰（截图 32-track-2 vs 32-track-6）**：
- 同样的蓝天、深绿草地、绿色树、黄色路灯
- 唯一区别是弯道方向（高速右弯、沙漠偏直道）
- ❌ **沙漠没有沙地色、棕黄色调或沙丘**

**海岸公路 vs 森林穿梭（截图 32-track-8 vs 32-track-7）**：
- 同样的蓝天+草地+树木+路灯
- 弯道走向不同
- ❌ **海岸没有海、棕榈树或沙滩；森林没有密集树林**

**峡谷疾驰 vs 山岳险道（截图 32-track-5 vs 32-track-9）**：
- 都是 night 模式（深暗天空、车灯、深色远山）
- 唯一区别是弯道形状
- ❌ **峡谷没有岩壁/红棕色峡谷墙体；山岳没有雪峰或寒冷感**

**白天赛道视觉高度雷同**：classic、highway、s-curve、island、desert、forest、coast 这 7 条赛道在浏览器截图中除弯道几何外**视觉环境完全一致**——同样的蓝天+深绿草地+绿色树+黄色路灯+深灰路面。

差异仅来自：
- **天气时间相位**（45s 晴天/阴天/雨天循环）——影响天空和草地颜色
- **昼/夜**（canyon/alpine）——影响整体色板

**没有任何与赛道名称（沙漠/森林/海岸/峡谷/山岳/高速/环岛）关联的环境视觉差异**。

## 三、根因定位

**文件**：`src/engine/tracks.ts`、`src/game/track-context.ts`、`src/engine/lighting.ts`、`src/engine/sprites.ts`、`src/engine/renderer.ts`

```ts
// tracks.ts：缺少 environment 字段
export interface TrackDef {
  id: string
  name: string
  difficulty: 1 | 2 | 3
  controlPoints: CurveControlPoint[]
  laps: number
  trafficCount?: number
  timeOfDay?: 'day' | 'night'
  // ❌ 没有 environment: 'plains' | 'forest' | 'desert' | 'coast' | 'canyon' | 'alpine' | 'highway' | 'island'
}

// track-context.ts：所有赛道用同一景物/参数
createRoadsideSprites(segments) // 固定 seed=1234，无赛道差异
buildSpriteIndex(sprites, SEGMENT_LENGTH) // 同上
createTraffic(lapLength, 777, ...) // 同上

// lighting.ts：只有 day/night 两分支
export function updateLighting(timeSec, overcast, raining, night) {
  if (night) { /* 深暗蓝紫色板 */ }
  else { /* 公共 day 路径，无赛道差异 */ }
}

// renderer.ts：远山固定色
this.mountains = this.buildMountains(width, '#27425e', '#1f3046') // day 赛道共享
this.mountainsNight = this.buildMountains(width, '#101a2a', '#0a1220') // night 赛道共享
```

## 四、结论

| 差异维度 | 状态 | 证据 |
|---|---|---|
| 几何（弯道形状） | ✓ 全部 9 条不同 | `tracks.ts` 控制点 |
| 难度/圈数 | ✓ 1-3 星、2-3 圈 | `tracks.ts` difficulty/laps |
| 车流密度 | ✓ 8-16 条/赛道 | `tracks.ts` trafficCount |
| 昼夜 | ✓ canyon/alpine night | `tracks.ts` timeOfDay |
| 名称关联场景 | ✗ 缺失 | 浏览器截图对比 + 像素采样 |

**核心结论**：9 条赛道在玩法机制（几何/难度/圈数/车流/昼夜）上有明确差异，玩家能感受到不同赛道的"难度和驾驶节奏"，但在视觉沉浸感上**赛道名称与场景环境完全脱钩**——沙漠与高速看起来一样、森林与海岸看起来一样、峡谷与山岳看起来一样（仅 night 与 day 区别）。

## 五、优化建议（不在本次范围）

为解决"场景视觉与名称脱钩"缺陷，建议按以下方向实施（下一里程碑）：

### 5.1 TrackDef 增加 `environment` 字段

```ts
type Environment = 'plains' | 'highway' | 'forest' | 'desert' | 'coast' | 'canyon' | 'alpine' | 'island'
export interface TrackDef {
  // ... 现有字段
  environment: Environment
}
```

### 5.2 环境差异化清单

| environment | 草地色 | 远山色 | 天空偏向 | 景物类型 | 景物颜色 |
|---|---|---|---|---|---|
| plains (经典/环岛) | 草绿 hsl(120, 40%, 25%) | 蓝灰 | 蓝 | 70% 树+30% 路灯 | 绿树/黄灯 |
| highway (高速) | 灰绿 hsl(90, 30%, 28%) | 灰蓝 | 蓝 | 70% 树+30% 护栏 | 绿树/灰护栏 |
| forest (森林) | 深绿 hsl(120, 50%, 18%) | 深绿 | 深绿调 | 95% 密树+5% 灯 | 深绿树 |
| desert (沙漠) | 沙黄 hsl(40, 50%, 45%) | 棕橙 | 暖橙黄 | 仙人掌+沙丘+灯 | 仙人掌 |
| coast (海岸) | 海蓝绿 hsl(170, 40%, 30%) | 海蓝 | 浅蓝 | 棕榈树+沙丘+灯 | 棕榈绿 |
| canyon (峡谷) | 红棕 hsl(20, 40%, 25%) | 红棕 | 暗紫红 | 岩壁+稀疏树 | 红棕岩 |
| alpine (山岳) | 灰白 hsl(210, 20%, 60%) | 雪山白 | 冷蓝 | 稀疏树+雪堆+灯 | 雪覆盖 |
| island (环岛) | 棕绿 hsl(90, 35%, 30%) | 海蓝 | 浅蓝 | 棕榈+热带树 | 热带绿 |

### 5.3 渲染层改动

1. `updateLighting(timeSec, overcast, raining, night, environment)` 增加第 5 参，按 environment 在 day 路径中调整色相与饱和度
2. `buildMountains(width, envProfile, seed)` 远山按 environment 配色（添加 envProfile 参数）
3. `createRoadsideSprites(track, envSeed, envSpacing, envProfile)` 景物按 environment 调整种子（产生不同树木分布）和间距（森林更密、沙漠更稀）
4. `SpriteKind` 扩展 `'cactus' | 'palm' | 'snowpile' | 'guardrail'`，渲染层按 kind 选择不同绘制策略
5. `RenderView` 新增 `environment` 字段，`viewFor` 从 `ctx.def.environment` 透传

### 5.4 回归测试

新增 `tests/unit/environment.test.ts` 验证：
- `updateLighting(..., 'forest')` 草地饱和度 > day plains
- `updateLighting(..., 'desert')` 天空 hue ∈ [40, 60]（暖橙黄）
- `createRoadsideSprites(forest)` 树密度 > plains

### 5.5 工作量评估

中等改动（约 8-10 个文件修改 + 1 个新测试文件）。`environment` 是新增字段，对已有赛道逐条赋值即可；渲染层在 track 切换时无需重建（环境色板是纯函数）。预计 4-6 小时实施工作量。

## 六、产出文档

- 本报告：`research_report_track_validation.md`
- 验证截图：`.codebuddy/screenshots/32-track-1-classic.png` 至 `32-track-9-alpine.png`（共 9 张）