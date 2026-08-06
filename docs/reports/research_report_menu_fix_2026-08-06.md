# 菜单专项修复交付报告

**日期**：2026-08-06
**基础**：[菜单专项运行时测试报告](./research_report_menu_testing_2026-08-06.md)
**目标**：实施 4 项修复并通过全量回归验证（typecheck + lint + 711 单测 + build + 5 场景运行时复测）

---

## 一、修复总览

| #   | 修复项                                | 根因                                          | 改动范围                                                                         | 复测结果                                                                 |
| --- | ------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | 去掉 `.menu-sun` 光晕矩形             | 刺眼 + 与开始按钮几何重叠（报告 P2-1）        | HTML × 1 + CSS × 4 处 + e2e 测试                                                 | 5 场景 `menu-sun` 不存在                                                 |
| 2   | 去掉 `#track-name` / `#p2-track-name` | 预览区扩展为全宽 SVG，文字与 SVG 信息冗余     | HTML × 2 + CSS × 4 处 + JS × 2 文件（TrackManager/game-loop.ts） + 单测 × 3 文件 | 5 场景 `track-name`/`p2-track-name` 不存在                               |
| 3   | 重绘 `<svg id="track-preview">`       | 报告 P3「扩展尺寸 + 融合背景 + 体现赛道特点」 | TS × 2 文件（track-preview.ts/menu-preview.ts）+ HTML + CSS × 4 处 + 单测        | 5 场景 `viewBox=560×140`、含 `<defs>+<linearGradient>+tp-route+tp-start` |
| 4   | 去掉各榜单内 `.lb-card-toggle`        | 报告 P3「仅保留外部 master 整体控制」         | HTML × 3 span + CSS × 2 处规则块（display:none + 完整 toggle 样式）+ e2e 测试    | 5 场景 `lb-card-toggle` 数量=0，master 切换正常（收起 88→展开 46）       |

**全部 5 场景**（1280×720、1920×1080、812×375、540×960、390×844）issues=0 复测通过。

---

## 二、修复详情

### 2.1 任务 1：去掉 `.menu-sun` 光晕矩形

#### 改动

- `index.html` 第 93 行：删除 `<div class="menu-sun"></div>`（保留 `.menu-stars` / `.menu-light` / `.menu-gradient` / `.menu-grid` 等其它背景元素）
- `src/style.screens.css` 109-121 行：删除 `.menu-sun` 规则（保留 `@keyframes sun-pulse`——`finish-sun` 仍使用该动画）
- `src/style.interaction.css` 578-583 行：删除低高度分支的 `.menu-sun` 规则
- `src/style.interaction.css` 929 行：删除 prefers-reduced-motion 列表中的 `.menu-sun`
- `tests/e2e/visual.spec.ts`：「红色光晕不遮挡任何赛道卡片（P1-1 回归）」测试改为「菜单不再渲染 `.menu-sun` 光晕元素」回归断言
- `src/game/codemap.md` / `tests/e2e/codemap.md`：文档同步更新

#### 视觉效果

- **修改前**：1280×720 菜单底部中央有红色/橙色光晕圆形（`.menu-sun`），box-shadow 扩散至半径 32+10px，视觉刺眼且与开始按钮（`#start-btn`）几何重叠
- **修改后**：光晕元素完全消失，菜单背景更简洁，与开始按钮的重叠问题自然解决

### 2.2 任务 2：去掉 `#track-name` 与 `#p2-track-name`

#### 改动

- `index.html` 173-174 行：删除两个 `<p>` 元素
- `src/game/game-loop.ts`：
  - 241-242 行：删除 `const p2TrackName = $('p2-track-name')` + `p2TrackName.hidden = !this.mode.splitMode`
  - 252 行：删除 `const trackName = $('track-name')`
  - 257-263 行：TrackManager 构造参数移除 `trackName, p2TrackName`
- `src/game/track-manager.ts`：
  - TrackManagerDeps 接口移除 `trackName` / `p2TrackName?` 字段
  - `updateTrackSelect` 移除 74-75 行的 `trackName.textContent` / `p2TrackName.textContent` 写入
- `src/style.screens.css`：删除 `#track-name` / `#p2-track-name` 规则（保留 `@keyframes track-name-pop`——`#track-preview .tp-route` 动画仍使用）
- `src/style.interaction.css`：删除 3 处 `#track-name` / `#p2-track-name` 引用（低高度隐藏 + prefers-reduced-motion）
- `tests/unit/track-manager.test.ts`：移除 `createHarness` 中 `trackName` / `p2TrackName` mock 字段与相关断言
- `tests/unit/game-loop-integration.test.ts`：移除 5 处 `getElement('track-name')` 断言 + 2 处 `getElement('p2-track-name')` 断言 + 删除「p2-track-name 可见/隐藏」两个测试用例（元素已不存在）

#### 视觉效果

预览行从「SVG + 赛道名文字」简化为「全宽 SVG」，视觉重心从分散变为聚焦。赛道名称仍可在 `.track-option` 卡上看到（保留）。

### 2.3 任务 3：重绘 `<svg id="track-preview">`

#### 改动

- `src/game/track-preview.ts`：重构 `buildTrackPreviewSvg`，新增 `buildBackground` 子函数
  - 默认尺寸扩展 200×64 → **560×140**（与 HTML `viewBox` 一致）
  - 背景由 `getEnvironmentProfile` 驱动：天空渐变 `<linearGradient id="tp-sky">` + 远山两层（mountainFar/Near 或 *Night）+ 地面 + 地形特征
  - 地形特征按 `terrain` + `spriteKind` 分发：沙漠沙丘 / 海岸海面波浪 / 峡谷岩壁锯齿 / 雪山 / 森林树冠
  - 白天赛道含太阳光晕（`r="16"` + `opacity="0.35"`）；夜间赛道（canyon/alpine）为深色夜空 + 星点
  - 轨迹 path 加 `class="tp-route"`，起点圆点加 `class="tp-start"`，与背景装饰的 path 区分（CSS 只美化轨迹，不误伤背景 fill）
- `src/game/menu-preview.ts`：`applyTrackPreview` 调用从 `(200, 64, 8)` 改为 `(560, 140, 14)`
- `index.html` `viewBox="0 0 200 64"` → `viewBox="0 0 560 140"`
- `src/style.screens.css`：
  - `.track-preview-wrap` 去除固定 `height: 60px`，改为 flex 居中（删除 `gap: 14px`）
  - `#track-preview` 改为 `width: min(560px, 86vw) + aspect-ratio: 4/1 + drop-shadow`
  - `#track-preview path` → `#track-preview .tp-route`（精确选择器，避免背景装饰被 `fill:none` 误覆盖）
  - `#track-preview circle` → `#track-preview .tp-start`
- `src/style.interaction.css`：
  - 低高度 160×52 改 `width: min(400px, 86vw) + aspect-ratio: 4/1`
  - 移除 `.track-preview-wrap` 的固定 height
  - prefers-reduced-motion 中 `#track-preview path` → `#track-preview .tp-route`
- `tests/unit/track-preview.test.ts`：更新测试
  - 「9 条赛道均生成非空 SVG」改为检查 `<defs>` + `<linearGradient>` + `class="tp-route"` + `class="tp-start"`
  - 「坐标归一化在 viewBox 内」改为检查轨迹 path `d` 中数值 ∈ [0, 560]
  - 新增「环境背景差异」测试：沙漠沙丘/海岸海面/雪山白色/森林树冠
  - 新增「夜间赛道深色夜空」测试：canyon/alpine 天空含 `hsl(15/205 12% 16%)`

#### 视觉效果

桌面 1280×720 预览区：原本是 200×64 的小轨迹 + 右侧赛道名，现在变成 560×140 的全宽 SVG，含蓝天渐变 + 远山 + 草地 + 沙丘状金黄弧线 + 右上角太阳（经典赛道环境色）。不同赛道切换时背景装饰会随环境色板与地形特征变化（沙漠沙丘、海岸波浪、雪山等），直观体现赛道特点。

### 2.4 任务 4：去掉各榜单内 `.lb-card-toggle`

#### 改动

- `index.html` 192/199/206 行：删除三个 `.lb-card-toggle` span（`#best-summary` / `#drift-top` / `#match-top` 三张卡的头部）
- `src/style.screens.css`：
  - 删除 M20 加的 `.lb-card-toggle { display: none }` 规则（780-784 行）+ 注释 + 重复的 `.lb-card-head` 定义
  - 删除 M-3/M-8 的 `.lb-card-toggle` 完整样式块（873-914 行）：含 hover、`.lb-expand-text` / `.lb-collapse-text` 双文本切换、`.lb-arrow` 旋转过渡
  - `.lb-card-head` 的 `justify-content` 由 `space-between` 改为 `flex-start`（去掉按钮后标题居左，注释同步更新）
- `src/game/leaderboard-cards.ts`：JS 早已是整体控制（M20 重构移除单卡 toggle 逻辑），无需改动
- `tests/e2e/visual.spec.ts`：测试已不引用 `.lb-card-toggle`（M20 后已无单卡 toggle 引用）

#### 视觉效果

各榜单卡头部只显示「赛道最佳 / 漂移榜单 / 对局战绩」标题，不再有右侧「收起 ▾」小字 + 箭头。外部 master 按钮 `#lb-toggle-all`（位置：榜单整体容器 `.leaderboard-section` 的工具栏）保留，一次性控制三张卡的展开/收起。交互验证：master toggle 收起 88px → 展开 46px，往返正常。

---

## 三、验证证据

### 3.1 全量验证（无人值守）

| 验证项             | 结果                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `npx tsc --noEmit` | ✅ 0 错误                                                            |
| `npm run lint`     | ✅ 0 错误                                                            |
| `npm test`         | ✅ 49 文件 711 用例（原 707 + 新增 4 个 track-preview 环境差异测试） |
| `npm run build`    | ✅ PWA precache 14 entries (1579 KiB)                                |

### 3.2 运行时复测（Playwright 5 场景）

| 场景                     | `.menu-sun` | `#track-name` | `#p2-track-name` | `.lb-card-toggle` | `#lb-toggle-all` | `viewBox`  | 装饰要素                                        |
| ------------------------ | ----------- | ------------- | ---------------- | ----------------- | ---------------- | ---------- | ----------------------------------------------- |
| desktop-1280×720         | ✅ 不存在   | ✅ 不存在     | ✅ 不存在        | ✅ 0 个           | ✅「收起」       | ✅ 560×140 | ✅ defs+route+start                             |
| desktop-1920×1080        | ✅ 不存在   | ✅ 不存在     | ✅ 不存在        | ✅ 0 个           | ✅「收起」       | ✅ 560×140 | ✅ defs+route+start                             |
| mobile-landscape-812×375 | ✅ 不存在   | ✅ 不存在     | ✅ 不存在        | ✅ 0 个           | ✅「收起」       | ✅ 560×140 | ✅ defs+route+start（低高度下 SVG 由 CSS 隐藏） |
| mobile-portrait-540×960  | ✅ 不存在   | ✅ 不存在     | ✅ 不存在        | ✅ 0 个           | ✅「收起」       | ✅ 560×140 | ✅ defs+route+start（rotate-hint 遮罩覆盖）     |
| mobile-portrait-390×844  | ✅ 不存在   | ✅ 不存在     | ✅ 不存在        | ✅ 0 个           | ✅「收起」       | ✅ 560×140 | ✅ defs+route+start（rotate-hint 遮罩覆盖）     |

**issues=0**。

### 3.3 交互回归

- **master toggle 展开/收起**：`cardHeight 88 → 46`，按钮文案「收起 → 展开」，往返正常 ✅
- **键盘切赛道 preview 刷新**：按 6（沙漠）→ 7（森林），`#track-preview` innerHTML 差异确认 `desert != forest` ✅
- **控制台无报错**：5 场景页面无 JS 错误 ✅

### 3.4 截图证据

`docs/menu-test/verify/` 目录保留 7 张截图（5 场景 + 1 交互收起态 + 1 1920 大屏）：

- `desktop-1280x720.png`：经典赛道预览含蓝天/远山/草地/沙丘金弧/右上太阳，9 赛道 3×3，3 榜单并排，标题清爽
- `desktop-1920x1080.png`：大屏整体居中，3 榜单 dashboard 完整，菜单底部无刺眼光晕
- `mobile-landscape-812x375.png`：低高度横屏 3×3 紧凑赛道，触屏提示完整，榜单 toolbar 可见
- `mobile-portrait-540x960.png`：rotate-hint 遮罩覆盖菜单，提示「建议横屏游玩」
- `mobile-portrait-390x844.png`：iPhone 尺寸 portrait 行为同上
- `interaction-collapsed.png`：master toggle 收起态（88 → 46 高度）

---

## 四、文件变更清单

### 源码（7 文件）

1. `index.html` — 移除 `.menu-sun`、两个 `<p>`、三个 `.lb-card-toggle` span、扩展 SVG viewBox
2. `src/style.screens.css` — 移除 `.menu-sun`、`#track-name`、`#p2-track-name`、`.lb-card-toggle` 全部规则；调整 `.track-preview-wrap` / `#track-preview` / `.lb-card-head`；新增精确选择器 `.tp-route` / `.tp-start`
3. `src/style.interaction.css` — 移除 4 处 `.menu-sun` / `#track-name` / `.p2-track-name` / `#track-preview path` 引用；调整低高度 `.track-preview-wrap` / `#track-preview` 尺寸
4. `src/game/track-manager.ts` — TrackManagerDeps 移除 `trackName` / `p2TrackName`；`updateTrackSelect` 移除文字写入
5. `src/game/game-loop.ts` — 移除 `trackName` / `p2TrackName` DOM 获取与 TrackManager 注入
6. `src/game/track-preview.ts` — 重写：默认尺寸 560×140，新增 `buildBackground`（天空渐变/远山/地形特征/昼夜区分）
7. `src/game/menu-preview.ts` — `applyTrackPreview` 调用改为 `(560, 140, 14)`

### 测试（3 文件）

8. `tests/unit/track-preview.test.ts` — 更新 2 个原断言 + 新增 2 个环境背景测试
9. `tests/unit/track-manager.test.ts` — 移除 `trackName` / `p2TrackName` mock 字段
10. `tests/unit/game-loop-integration.test.ts` — 移除 7 处 `track-name` / `p2-track-name` 断言 + 删除 2 个测试用例
11. `tests/e2e/visual.spec.ts` — 「红色光晕」测试改为「`.menu-sun` 不存在」回归断言；`menuBoxes` 移除 `sun` 字段

### 文档（2 文件）

12. `src/game/codemap.md` — 注释更新（`p2-track-name` 已移除）
13. `tests/e2e/codemap.md` — DOM 列表与描述更新

---

## 五、未在本任务范围（已知遗留）

以下报告 P0/P1 项用户未要求实施，本任务不予处理（保持原状）：

- **P0-1「开始游戏」按钮与榜单卡几何重叠**（报告 P0）：9 场景 sticky 按钮压住榜单卡。修复方向已在报告「修复方向建议」列出，需用户单独决策。
- **P1-1 极窄屏（320×568）主标题与副标题重叠**：与本任务无直接关联。
- **P2-2 竖屏榜单卡 3 行堆叠**：竖屏 3 卡单列布局，内容超高加剧。可作为下一轮优化项。

如需后续优化，建议优先级 P0-1 > P2-2 > P1-1。
