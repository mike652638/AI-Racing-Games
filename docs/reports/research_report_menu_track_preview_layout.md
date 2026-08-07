# 菜单“赛道预览”区域布局优化建议书

> 分析对象：`像素狂飙` #start-screen 在 1920×1080 大屏下的赛道预览（track-preview）区域
> 分析时间：2026-08-06
> 当前版本基线：M20 完成态（typecheck / lint / 单测 711 / bot 0 违规 / build / e2e 全绿）

---

## 一、现状与问题定位

### 1.1 当前 DOM 与视觉层级

在 `index.html` 中，`#start-screen` 的内容按垂直顺序排列为：

1. `.title-wrap` 主标题“像素狂飙” + `.title-sub` 副标题
2. `#menu-mode-badge` 模式徽章
3. `#track-select` 3×3 赛道选择网格（含赛道名、难度星级）
4. `.track-preview-wrap` + `#track-preview` 赛道预览 SVG（560×140 viewBox）
5. `.leaderboard-section` 我的榜单（三卡片）
6. `.menu-footer` 开始按钮 + 操作提示

`.menu-content` 采用 `display:flex; flex-direction:column; align-items:center` 单列居中；在 1920×1080 大屏下，其宽度被限制为 `min(100%, 1280px)`，因此所有模块在中央窄列内垂直堆叠。

### 1.2 赛道预览的实现

- 文件：`src/game/track-preview.ts` 提供 `buildTrackPreviewSvg()` 纯函数
- 数据源：`src/engine/tracks.ts` 的赛道控制点 + `src/engine/environment.ts` 的环境配色
- 渲染内容：环境背景（天空渐变、远山、地形特征）+ 赛道轨迹 path + 起点圆点
- 注入方式：`src/game/menu-preview.ts` 的 `applyTrackPreview()` 通过 `innerHTML` 写入 `#track-preview`
- 主题联动：`updateMenuBackground()` 同步为 `.menu-bg` 追加 `track-{id}` 类，触发 9 套 CSS 渐变背景

当前 CSS 对 `.track-preview-wrap` 的处理：

```css
.track-preview-wrap {
  margin: 18px auto 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 720px;
}
```

在 `@media (max-height: 620px)` 与移动端低高度媒体查询下，`.track-preview-wrap` 被 `display:none` 隐藏，说明项目本身已经意识到该模块在高度紧张时应优先牺牲。

### 1.3 1920×1080 下的核心问题

从用户截图可见，预览区夹在 3×3 赛道网格与“我的榜单”之间，呈现为一个横向细长条。它带来的问题包括：

- **纵向挤压**：标题、网格、预览、榜单、按钮全部挤在中央列，导致 1080p 大屏也无法一次性完整展示所有内容，必须依赖 `.menu-content` 内部滚动。
- **信息重复**：赛道选择网格已经包含赛道名称与难度星级；预览 SVG 再展示一次“当前选中赛道”，二者信息高度重叠。
- **横向空间浪费**：1920px 宽度下，中央内容列仅 1280px，两侧留出大面积装饰背景；预览区没有利用横向余量，反而在中央窄列内继续抢高度。
- **视觉层级断裂**：预览 SVG 作为“信息卡片”嵌入内容流，打断了从“选择赛道”到“查看榜单/开始游戏”的操作动线。
- **缩放比例尴尬**：560×140 的 viewBox 在宽屏下若按 100% 宽度渲染，高度约 140–180px；若缩小则视觉特征（如弯道形状）难以辨认。

---

## 二、方案评估

### 方案一：完全移除“赛道预览”区域

#### 2.1.1 设计思路

直接删除 `.track-preview-wrap` 及其内部 `#track-preview`，将赛道形状/环境特征信息通过其他更紧凑的方式传达，例如：

- 在赛道选择卡片内增加微型 SVG 轨迹缩略图（16–24px 高）
- 在选中态卡片上显示环境主题色竖条或图标
- 利用 `.menu-bg` 现有的 `track-{id}` 主题渐变 already 区分环境氛围

#### 2.1.2 可行性

| 维度     | 评估                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工程成本 | 低。只需删除 DOM、移除 `applyTrackPreview` 调用、清理相关 CSS 与测试断言；`buildTrackPreviewSvg` 可保留供将来复用。                                        |
| 回归风险 | 低。当前已有 `@media (max-height: 620px)` 隐藏预览的逻辑，说明隐藏预览不会造成功能不可用；需同步删除 `menu-preview.ts` 中的 `applyTrackPreview` 单测断言。 |
| 信息损失 | 中。玩家失去“一眼看清新赛道大致走向”的能力，但赛道选择卡片仍保留名称与难度，对核心玩法无阻断。                                                             |
| 性能收益 | 轻微。每次切换赛道不再重绘 SVG，但 SVG 本身开销极小，收益可忽略。                                                                                          |
| 空间收益 | 高。直接释放约 140–180px 纵向空间，使“我的榜单”与开始按钮整体上移，降低首屏滚动概率。                                                                      |

#### 2.1.3 优点

- 最简洁、最稳健，符合项目当前“功能完整后做减法”的打磨节奏。
- 彻底解决 1920×1080 下中央列纵向拥挤的问题。
- 减少一个需要维护的 UI 模块，DOM 更轻量。

#### 2.1.4 缺点

- 赛道形状预览彻底消失，对“每条赛道弯道特征不同”这一卖点是信息损失。
- 如果未来想强调赛道差异化，需要重新设计信息传递方式。

### 方案二：将赛道预览扩展并融入全屏背景层

#### 2.2.1 设计思路

将当前 560×140 的 SVG 预览放大，作为 `#start-screen` 全屏背景的一部分（或底层装饰层），让玩家在菜单阶段就能“沉浸式”看到当前赛道的视觉特征。实现形态可分三种子方案：

- **子方案 A：SVG 背景化**——复用现有 `buildTrackPreviewSvg()`，生成大尺寸 SVG（如 1920×480 或视口全宽），作为 `.menu-bg` 内的新一层，放在网格/榜单背后。
- **子方案 B：伪 3D 实时背景**——在菜单阶段启动一个低速滚动的游戏渲染器，直接在背景画布上绘制道路与景物，模拟驾驶视角。
- **子方案 C：预渲染静态/动态素材**——为每条赛道生成一张宽屏背景图或短视频循环，切换赛道时替换背景。

#### 2.2.2 可行性

| 子方案            | 工程成本             | 性能影响              | 视觉冲击力 | 维护成本 |
| ----------------- | -------------------- | --------------------- | ---------- | -------- |
| A. SVG 背景化     | 中低                 | 极低                  | 中         | 低       |
| B. 伪 3D 实时背景 | 高                   | 中（持续 RAF + 渲染） | 高         | 高       |
| C. 预渲染素材     | 中（资源生产与打包） | 中（图片/视频体积）   | 高         | 中       |

#### 2.2.3 优点

- **沉浸式体验**：菜单不再是静态表单，而是游戏世界的“窗口”，与 OutRun 街机美学高度契合。
- **解决空间问题**：预览从内容流移到背景层，不再挤占中央 UI 列的纵向空间。
- **差异化表达**：不同赛道的环境色板、地形特征在背景中一目了然，强化赛道选择的意义。
- **1920×1080 优势放大**：大屏的横向空间被背景层充分利用，避免两侧空洞。

#### 2.2.4 缺点

- **文字可读性风险**：背景层若过于复杂，可能降低前景标题、赛道卡片的对比度，需要叠加遮罩或玻璃态面板。
- **响应式复杂度提升**：小屏/低高度设备上，背景化预览需要降级（隐藏或恢复为小卡片），否则同样会干扰 UI。
- **性能与资源**：子方案 B/C 会引入额外运行时开销或打包体积；项目当前为 PWA，需考虑离线缓存大小。
- **与现有动画冲突**：`.menu-bg` 已有网格滚动、星空闪烁、呼吸渐变等动效，新增背景层需要协调动画节奏，避免杂乱。

---

## 三、推荐方案

**主推荐：方案二的子方案 A——“SVG 背景化 + 精简内容区”**，即将现有 `buildTrackPreviewSvg` 生成的 SVG 扩展为全屏背景层的一部分，同时从 `.menu-content` 中央列中移除 `.track-preview-wrap`。

**次推荐（稳健备选）：方案一 + 赛道卡片内嵌微型轨迹**，即完全移除独立预览区，但在每个赛道选择卡片中加入 16–24px 高的微型 SVG 轨迹，保留赛道形状信息。

### 3.1 推荐方案 A 的核心逻辑

1. **保留赛道视觉特征**：`track-preview.ts` 已能按环境生成带天空、远山、地形、轨迹的 SVG，复用成本低。
2. **释放中央列空间**：预览从内容流移到背景层后，1920×1080 下标题、赛道网格、榜单、按钮纵向堆叠更从容。
3. **增强沉浸感**：背景层在玩家切换赛道时同步变化，形成“菜单即赛道”的氛围。
4. **工程可控**：不需要引入新的渲染管线或资源文件，纯 SVG + CSS 即可实现。

### 3.2 为什么不选方案一作为主推荐

方案一虽然最简单，但会完全放弃“赛道形状预览”这一信息维度。考虑到项目已经投入大量工作实现 9 条赛道的环境差异化（M17）和菜单预览 SVG（M-10），直接删除会造成已有设计资产浪费，且玩家无法在选择阶段直观感受赛道差异。

### 3.3 为什么不选方案二的 B/C 子方案

子方案 B（实时伪 3D 背景）会显著增加 GameLoop 在菜单阶段的复杂度，与当前“菜单阶段不运行游戏渲染”的架构假设冲突，可能破坏 `phase` 状态机与音频/输入的边界。子方案 C（预渲染素材）需要新增图片/视频资源，增加 PWA 打包体积和离线缓存压力，且与项目“零外部资源、纯代码生成”的美术方向不符。

---

## 四、关键实现要点

### 4.1 DOM 结构调整

将 `.track-preview-wrap` 从 `.menu-content` 中移出，改为 `.menu-bg` 的子元素（或 #start-screen 下与 .menu-bg 同级的背景层）：

```html
<div id="start-screen">
  <div class="menu-bg" aria-hidden="true">
    <div class="menu-gradient"></div>
    <div class="menu-grid"></div>
    <div class="menu-stars"></div>
    <div class="menu-light"></div>
    <!-- 新增：赛道预览背景层 -->
    <div class="track-preview-bg" aria-hidden="true">
      <svg id="track-preview-bg" viewBox="0 0 1920 540" preserveAspectRatio="xMidYMid slice"></svg>
    </div>
  </div>
  <div class="menu-content">
    <!-- 移除 .track-preview-wrap -->
    ...
  </div>
  ...
</div>
```

### 4.2 SVG 生成扩展

复用 `buildTrackPreviewSvg()`，但新增一个宽屏版本：

- viewBox 建议 `1920×540`（21:9 电影感比例）或按视口动态计算
- 横向铺满、纵向居中偏下，让地平线位于画面下半部分，给标题留天空
- 轨迹路径保持清晰可读，stroke-width 从 4 提高到 6–8
- 背景装饰（远山、地形）放大并降低饱和度/对比度，避免抢夺前景注意力

建议新增函数 `buildTrackPreviewBackgroundSvg(def, W, H)`，与现有 `buildTrackPreviewSvg` 共用 `integrateControlPoints` 和 `buildBackground` 核心逻辑。

### 4.3 背景层样式

```css
.track-preview-bg {
  position: absolute;
  inset: 0;
  z-index: 1; /* 位于 menu-gradient(0) 之上、menu-grid/stars 之下或之间 */
  pointer-events: none;
  opacity: 0.55; /* 初始低对比，切换赛道时动画渐入 */
  transition: opacity 0.5s ease;
}

#track-preview-bg {
  width: 100%;
  height: 100%;
}
```

前景 `.menu-content` 需要增加半透明磨砂或渐变遮罩，确保文字可读性：

```css
.menu-content {
  /* 已有样式保持不变 */
  background: radial-gradient(
    ellipse 80% 100% at 50% 50%,
    rgba(11, 5, 24, 0.72) 0%,
    rgba(11, 5, 24, 0.42) 60%,
    transparent 100%
  );
}
```

### 4.4 切换动画

当前 `applyTrackPreview()` 直接替换 `innerHTML`，可用于背景层：

```typescript
export function applyTrackPreview(trackIndex: number): void {
  const preview = document.getElementById('track-preview')
  const bgPreview = document.getElementById('track-preview-bg')
  const def = TRACK_DEFS[trackIndex]
  if (!def) return

  // 中央小预览（如保留为降级方案）
  if (preview) {
    preview.innerHTML = buildTrackPreviewSvg(def, 560, 140, 14, getEnvironmentPreviewColor(def.environment)) ?? ''
  }

  // 背景层
  if (bgPreview) {
    bgPreview.style.opacity = '0'
    requestAnimationFrame(() => {
      bgPreview.innerHTML = buildTrackPreviewBackgroundSvg(def, 1920, 540) ?? ''
      bgPreview.style.opacity = '0.55'
    })
  }
}
```

### 4.5 响应式降级

| 视口条件                                   | 行为                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `min-width: 1280px` 且 `min-height: 700px` | 启用全屏 SVG 背景预览，隐藏中央 `.track-preview-wrap`                |
| `max-width: 1279px` 或 `max-height: 699px` | 禁用背景预览，在中央列显示原有 `.track-preview-wrap`（保持现有体验） |
| `max-height: 620px`                        | 完全隐藏预览（与现有逻辑一致）                                       |
| `prefers-reduced-motion`                   | 关闭背景切换淡入淡出，避免视觉疲劳                                   |

### 4.6 可访问性

- 背景预览层设置 `aria-hidden="true"` 与 `pointer-events: none`，不干扰屏幕阅读器与键盘导航。
- 前景内容保持现有 `tabindex`、`role`、`aria-pressed`、`aria-expanded` 属性不变。
- 确保背景层颜色与前景文字对比度仍满足 WCAG AA（可通过 `backdrop-filter` 或渐变遮罩控制）。

### 4.7 需要同步修改的文件

| 文件                        | 改动                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `index.html`                | 新增 `.track-preview-bg` 层，移除/保留 `.track-preview-wrap`（按降级策略）           |
| `src/game/track-preview.ts` | 新增 `buildTrackPreviewBackgroundSvg()`                                              |
| `src/game/menu-preview.ts`  | `applyTrackPreview()` 同时写入背景和中央预览；`updateMenuBackground()` 无需改动      |
| `src/style.screens.css`     | 新增 `.track-preview-bg`、调整 `.menu-content` 遮罩                                  |
| `src/style.interaction.css` | 调整响应式媒体查询，控制背景层显隐                                                   |
| `tests/`                    | 更新 e2e/单测中断言（若有断言 `#track-preview` 内容或 `.track-preview-wrap` 可见性） |

---

## 五、实施风险与缓解

| 风险                                  | 缓解措施                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 背景 SVG 与前景文字对比度不足         | 添加径向渐变遮罩；将背景 opacity 控制在 0.45–0.6；必要时为背景层加 `backdrop-filter: blur(2px)`                   |
| 背景层动画与菜单现有呼吸/扫光动画冲突 | 背景层仅做静态 SVG + 切换淡入淡出，不参与 `menu-breathe`/`light-sweep` 动画；或让背景色调与 `track-{id}` 渐变同源 |
| 小屏/低高度下背景 SVG 仍显杂乱        | 媒体查询完全隐藏背景层，回退到中央小预览或完全移除                                                                |
| 切换赛道时背景层重绘导致轻微闪烁      | 使用 `opacity` 过渡做交叉淡化；预渲染下一条 SVG 到 off-screen 元素再替换                                          |
| 单测/e2e 断言失效                     | 保留 `#track-preview` 元素作为降级容器，仅在宽屏下隐藏；e2e 用例可继续断言其存在性                                |

---

## 六、结论

在 1920×1080 大屏下，当前 `.track-preview-wrap` 作为中央列内的独立信息卡片，确实挤占了宝贵的纵向空间，并与上方赛道选择网格形成信息重复。**推荐采用“方案二子方案 A：SVG 背景化”**，即将现有赛道预览 SVG 扩展为 `#start-screen` 的全屏背景层装饰，同时从中央内容列中移除独立预览区。这样可以在不引入复杂实时渲染或外部资源的前提下，同时解决空间挤压问题、增强沉浸感、保留并放大赛道视觉差异化信息。

如果团队希望优先保证工程稳健性与测试回归速度，**备选方案一 + 赛道卡片微型轨迹**同样可行，但会牺牲一部分赛道形状的直观表达。建议先以方案 A 做一个快速原型，在 1920×1080、1280×720、812×375 三个视口下验证可读性与响应式降级，再决定是否合并。

---

## 七、实施记录（2026-08-06 已合并）

### 7.1 实施内容

已按主推荐方案完成实施：

- `src/game/track-preview.ts`：为 `buildTrackPreviewSvg` 增加 `gradientId` 参数以支持独立渐变 ID；新增 `buildTrackPreviewBackgroundSvg()` 生成 1920×480 宽屏背景版 SVG，复用现有控制点积分与环境背景逻辑。
- `src/game/menu-preview.ts`：`applyTrackPreview()` 现在同时更新中央 `#track-preview` 与背景 `#track-preview-bg`，切换赛道时两者同步变化。
- `index.html`：在 `.menu-bg` 内新增 `.track-preview-bg` 层（默认隐藏），保留 `.track-preview-wrap` 作为小屏/低高度降级容器。
- `src/style.screens.css`：定义 `.track-preview-bg` 背景层样式（底部对齐、max-height 38vh、opacity 0.42、顶部 mask 渐变融入星空）；为 `#track-preview-bg .tp-route/.tp-start` 补充光晕样式；为 `.menu-content` 增加底部渐变遮罩保证前景可读性。
- `src/style.interaction.css`：新增响应式规则，在 `(min-width: 1280px) and (min-height: 700px)` 下启用背景层并隐藏中央预览；在 `(max-height: 620px)` 下同时禁用背景层；为 `prefers-reduced-motion` 增加 `#track-preview-bg .tp-route` 的降级动画。
- `tests/unit/track-preview.test.ts`：新增 4 个用例覆盖 `buildTrackPreviewBackgroundSvg` 的非空生成、独立渐变 ID、默认 1920×480 尺寸与空控制点安全语义。

### 7.2 验证结果

| 检查项              | 结果                             |
| ------------------- | -------------------------------- |
| `npm run typecheck` | 通过                             |
| `npm run lint`      | 通过                             |
| `npm test`          | 49 文件 714 用例全绿             |
| `npm run bot`       | 9 赛道 0 违规                    |
| `npm run build`     | PWA 14 条目 1581 KiB 产物正常    |
| `npm run test:e2e`  | 40 通过 + 8 视口条件跳过，0 失败 |

### 7.3 视觉验证

- 1920×1080 大屏：中央 `.track-preview-wrap` 已隐藏，底部出现低透明度赛道预览背景层，标题/赛道网格/榜单/按钮纵向空间显著改善；切换赛道（如按 `6` 到沙漠）背景层会同步更新为对应环境配色。
- 1280×720 桌面：仍走原有布局，中央预览保持显示。
- 812×375 移动横屏：保持原有紧凑布局，预览在低高度下隐藏。

### 7.4 关键文件变更

- `src/game/track-preview.ts`
- `src/game/menu-preview.ts`
- `index.html`
- `src/style.screens.css`
- `src/style.interaction.css`
- `tests/unit/track-preview.test.ts`

未引入新依赖、未新增外部资源文件，完全符合项目“纯代码生成、零 WebGL/外部素材”的技术方向。

---

## 八、融合度深度优化（2026-08-06 第二轮迭代）

### 8.1 问题诊断

第一轮实施后，1920×1080 大屏下赛道预览背景层已能释放纵向空间，但截图反馈显示：

- 背景层天空/地面亮度偏高，与菜单深紫星空形成明显色温与亮度断层；
- 地平线上方边界感重，背景像“贴上去的图片”而非菜单氛围的延伸；
- 赛道轨迹在压暗后几乎不可见，失去“预览”意义；
- 前景 `.menu-content` 底部遮罩与 `.menu-footer` 遮罩较重，进一步割裂背景。

### 8.2 优化策略与实施

**SVG 层面（`src/game/track-preview.ts`）**：

- 为 `buildBackground` / `buildTrackPreviewSvg` 增加 `forBackground` 参数；
- 背景层专用绘制逻辑：
  - 天空 rect 改为顶部透明、向下渐变为深紫（`#0b0518` → `#1a0b2e`），让菜单星空自然透出来；
  - 不绘制太阳/星星等明亮装饰；
  - 地平线从 `H*0.62` 压低到 `H*0.5`，地面占比更大，内容更充实；
  - 地面与远山亮度/不透明度压暗（地面 `hsl(... 16% 12%)`、远山 opacity 0.55/0.7）；
  - rect 无圆角，适配全宽背景层。

**JS 驱动层面（`src/game/menu-preview.ts`）**：

- 背景层轨迹统一使用纯白色 `#ffffff`，确保在滤镜压暗后仍带有冷辉光、清晰可见。

**CSS 层面（`src/style.screens.css`）**：

- `.track-preview-bg` 增加 `filter: saturate(0.65) brightness(0.72) contrast(0.95) hue-rotate(-4deg)`，统一色调、压暗去饱和；
- 增加 `::after` 氛围叠加层（紫橙霓虹渐变），与 `.menu-gradient` 呼应；
- 调整 mask：顶部透明区缩短到 18%，让更多内容显现；
- `#track-preview-bg` 高度从 38vh 提升到 42vh，增强大气感；
- 背景层轨迹样式加粗到 7px 并双层 glow；
- `.menu-content` 与 `.menu-footer` 底部遮罩强度减轻、起始点下移，减少“切掉”背景的感觉。

**测试层面（`tests/unit/track-preview.test.ts`）**：

- 新增 2 个用例覆盖背景层“顶部透明/无太阳/无圆角”与“压暗地面/压低地平线”。

### 8.3 验证结果

| 检查项                                | 结果                             |
| ------------------------------------- | -------------------------------- |
| `npm run typecheck`                   | 通过                             |
| `npm run lint`                        | 通过                             |
| `npm test`                            | 49 文件 716 用例全绿             |
| `npm run bot`                         | 9 赛道 0 违规                    |
| `npm run build`                       | PWA 14 条目 1581 KiB 产物正常    |
| `npx playwright test --reporter=list` | 40 通过 + 8 视口条件跳过，0 失败 |

### 8.4 视觉验证

- **1920×1080 经典赛道**：背景层与星空自然融合，地平线若隐若现，白色轨迹清晰发光，整体氛围统一；
- **1920×1080 沙漠赛道（按 `6`）**：背景转为暖黄棕色调，像黄昏沙漠，沉浸感强；
- **1920×1080 峡谷赛道（按 `5`）**：背景呈现红棕色调，与菜单霓虹形成戏剧性对比，极具视觉冲击力；
- **1280×720 经典赛道**：背景层仍启用但效果更淡，前景布局未被挤压，赛道网格与榜单完整可见。

### 8.5 关键文件变更

- `src/game/track-preview.ts`（背景层专用 SVG 绘制逻辑）
- `src/game/menu-preview.ts`（背景层轨迹统一高亮色）
- `src/style.screens.css`（滤镜、叠加层、mask、遮罩、轨迹 glow）
- `tests/unit/track-preview.test.ts`（新增 2 个背景层语义用例）

未引入新依赖、未新增外部资源文件。
