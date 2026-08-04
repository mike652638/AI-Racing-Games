# AI-Racing-Games 差异化景物与地形扩展实施交付报告

## 概述

按 M17 报告"下一步建议"，实施两项增强：(1) SpriteKind 扩展为 cactus/palm/snowpile 并新增差异化景物绘制；(2) EnvironmentProfile 增加 terrain 字段，渲染层在草地层之后绘制沙漠沙丘/海岸海面/峡谷岩壁地形装饰。新增 2 个回归测试（636 → 640 全绿），全量验证（typecheck + lint + format:check + 640 单测 + bot 9 赛道 0 违规 + build + Playwright e2e 13 通过 + 1 跳过）一次性通过。Playwright 实测四张目标截图视觉差异化效果显著。

## 一、实施改动

### 1.1 差异化景物形状（SpriteKind 扩展）

**`src/engine/sprites.ts`**：
- `SpriteKind = 'tree' | 'lamp' | 'cactus' | 'palm' | 'snowpile'`（联合扩展）
- `RoadsideEnv` 增加 `spriteKind?: SpriteKind` 字段
- `clampSpriteHeight(kind, hpx)` 共享 MAX_TREE_HEIGHT_PX（树/仙人掌/棕榈/雪堆），lamp 用 MAX_LAMP_HEIGHT_PX
- `createRoadsideSprites` 内部 `kindAtTreeSlot = env.spriteKind ?? 'tree'`，按环境决定"树位"的实际形状

**`src/game/track-context.ts`**：
- `createTrackContext(def)` 传入 `env.spriteKind` 给 `createRoadsideSprites`

**`src/engine/renderer.ts`** 新增 3 个绘制方法：

```ts
/** 仙人掌：矮柱 + 左右双臂（沙漠灰绿；高度较树矮 0.8） */
private drawCactus(x, y, hpx, cactusColor)

/** 棕榈：弯曲树干 + 扇形冠（热带海岛/海岸） */
private drawPalm(x, y, hpx, trunkColor, leafColor)

/** 雪堆：圆顶雪包 + 覆雪小树（山岳冷色） */
private drawSnowpile(x, y, hpx, snowColor, treeColorLight)
```

`drawSprites` 用 `switch` 按 kind 分发。

### 1.2 地形扩展（terrain 字段）

**`src/engine/environment.ts`**：
- `EnvironmentProfile` 增加 `terrain?: 'dunes' | 'sea' | 'rock'`
- desert 配置 `terrain: 'dunes'`、coast 配置 `terrain: 'sea'`、canyon 配置 `terrain: 'rock'`、其余省略

**`src/engine/renderer.ts` 新增 `drawTerrain` 方法**：

```ts
/** M17 地形装饰：在草地层上叠加与赛道名称关联的地形视觉。
 *  视口固定纹理（不随 cameraZ 滚动），仅在对应 environment 时绘制；其他环境零开销。 */
private drawTerrain(ctx, opts, environment, night)
```

- **dunes（沙漠沙丘）**：路面左侧叠加 3 道半透明深黄椭圆弧形（`ellipse + Math.PI→0`），近大远小
- **sea（海岸海面）**：道路右侧整片海蓝多边形（`fillQuadCoords` 替代：4 点多边形 + fill）
- **rock（峡谷岩壁）**：道路两侧 3 层暗红棕竖条（近宽远窄），填充外侧区域

`renderWithOpts` 在草地 `fillRect` 之后、`renderRoadSurface` 之前调用 `drawTerrain`。

## 二、测试补强（2 个新增用例）

`tests/unit/environment.test.ts` 新增：

| 用例 | 覆盖点 |
|---|---|
| 差异化景物形状：desert 仙人掌 / coast 棕榈 / alpine 雪堆（非 tree） | spriteKind 环境驱动 + plains 仍为 tree |
| 地形装饰：desert/coast/canyon 配置 terrain，其余环境省略 | terrain 字段映射正确 |

测试总数：636 → **640**（+2），44 个测试文件。

## 三、Playwright 实测验证

启动 dev server 5173，针对 desert/canyon/coast/alpine 四条赛道截图 + 采样左右两侧/远端像素：

| 赛道 | 左侧近处 | 右侧近处 | 远端 | 视觉确认 |
|---|---|---|---|---|
| **desert** | (75,71,71) 棕 | (76,72,72) 棕 | (77,62,22) **棕橙远山** | 暖橙天空 + 棕橙沙丘装饰 + 沙黄草地 |
| **coast** | (208,48,48) 红车 | (208,48,48) 红车 | (50,125,168) **海蓝** | 海蓝天 + **右侧整片海蓝海面** + 棕榈树 |
| **canyon** | (45,22,12) **暗红棕** | (45,22,12) **暗红棕** | (40,29,21) 暗棕草地 | 暗夜 + **四周红棕岩壁** + 仙人掌双臂 |
| **alpine** | (41,40,21) 冷灰 | (42,40,21) 冷灰 | (40,40,21) 冷灰 | 暗夜 + **冷灰雪山** + **白色雪堆景物** + 冷色系 |

## 四、全量验证结果

| 验证项 | 命令 | 结果 |
|---|---|---|
| TypeScript | `npm run typecheck` | 通过 |
| ESLint | `npm run lint` | 通过 |
| Prettier | `npm run format:check` | 通过 |
| 单元测试 | `npm test` | 640 用例全绿（44 文件，+2） |
| Bot 矩阵 | `npm run bot` | 9 赛道全部 finished，0 违规 |
| 生产构建 | `npm run build` | PWA 产物生成 |
| Playwright e2e | `npm run test:e2e` | 13 通过 + 1 跳过 |

## 五、修改的文件清单

| 文件 | 变更 |
|---|---|
| `src/engine/sprites.ts` | SpriteKind 扩展 + RoadsideEnv.spriteKind + createRoadsideSprites 按环境生成形状 |
| `src/engine/environment.ts` | EnvironmentProfile.terrain 字段 + desert/coast/canyon 赋值 + spriteKind 类型对齐 |
| `src/game/track-context.ts` | createTrackContext 传 spriteKind |
| `src/engine/renderer.ts` | drawSprites switch 分发 + drawCactus/drawPalm/drawSnowpile 新增 + drawTerrain 地形装饰方法 + renderWithOpts 调用 |
| `tests/unit/environment.test.ts` | 新增 2 个测试用例 |

## 六、产出文档

- 本报告：`research_report_sprite_terrain.md`
- 实测截图：`.codebuddy/screenshots/35-terrain-desert.png`、`35-terrain-coast.png`、`35-terrain-canyon.png`、`35-terrain-alpine.png`

## 七、结论

两项增强全部实施完成：

1. **差异化景物形状**：沙漠出现绿色双臂仙人掌剪影、海岸出现扇形棕榈、山岳出现白色雪堆，三种新景物形状与普通三角树明显区分
2. **地形扩展**：沙漠路面左侧弧形沙丘起伏、海岸路面右侧整片海蓝色海面、峡谷四周暗红棕色岩壁，三种地形装饰与赛道名称对应

**关键设计原则**：
- **单一真源延续**：所有配置仍来自 `getEnvironmentProfile(env)`，新增字段不加双份配置漂移风险
- **零回归保持**：plains（classic）环境无 terrain 配置、`drawTerrain` 立即 return，不破坏 640 个测试
- **性能保持**：地形装饰为视口固定绘制（fillQuad/ellipse/fillRect 固定调用数），不随 cameraZ 滚动；远山缓存懒重建已有
- **向后兼容**：`RoadsideEnv.spriteKind` 可选，缺省为 `'tree'`；`EnvironmentProfile.terrain` 可选，缺省 undefined

**下一步建议**（M17 之外）：
- 海面加白色波浪纹理（海岸丰富感）
- 沙漠仙人掌按 SPACING 在更远处生成小的仙人掌剪影
- 峡谷岩壁顶部加不规则岩壁顶线（更逼真峡谷感）
- 在 `Sprite` 加 `rotation` 字段让棕榈弯曲方向随机化