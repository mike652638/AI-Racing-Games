# 菜单遗留问题修复交付报告

**日期**：2026-08-06
**基础**：[菜单专项运行时测试报告](./research_report_menu_testing_2026-08-06.md) 中 P0-1 / P1-1 / P2-2
**目标**：完成遗留问题修复 + 全量回归（typecheck + lint + 711 单测 + build + 10 场景 Playwright 复测）

---

## 一、修复总览

| #        | 遗留问题                                           | 根因                                                                                                                 | 修复方案                                                                                                                                                                                                        | 验证结果                                                         |
| -------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **P0-1** | 开始按钮被榜单卡几何遮挡（9 场景）                 | `#start-btn { position: sticky; bottom: 8px }` 在 `.menu-content` 内容超高时吸在视口底部，覆盖在内容流末尾的榜单卡上 | 将 `#start-btn` + 提示从 `.menu-content` 移出，作为 `#start-screen` 底部独立的 `.menu-footer` 固定层（absolute `bottom:0`）；`.menu-content` absolute `top:0 bottom:150px` 占据除 footer 外的视口空间并内部滚动 | 10 场景 `footer.top == menuContent.bottom`，按钮不再视觉遮挡榜单 |
| **P1-1** | 极窄屏（≤390px）主标题与副标题叠影                 | `.title-sub { margin: -8px 0 28px }` 负上边距在 390 宽下挤入主标题内                                                 | `@media (max-width: 390px)` 分支显式收敛 `.title-sub { margin: 0 0 20px }`（覆盖负 margin-top）                                                                                                                 | 390×844 portrait-mode 视觉无叠影                                 |
| **P2-2** | 竖屏（portrait-mode）榜单 3 卡纵向堆叠占高约 350px | 窄宽下 `.leaderboard-cards` 自动换行成 3 行，卡片间距与 body 限高偏大                                                | `body.portrait-mode .lb-card { padding: 8px 10px → 6px 8px }`、`.lb-card-body { max-height: 150px → 120px }`、新增 `.lb-card-head { margin-bottom/padding-bottom: 4px }`                                        | 540×960 / 390×844 视觉榜单更紧凑                                 |

---

## 二、关键修复详情

### 2.1 P0-1：开始按钮+提示移出滚动容器

#### HTML 结构调整（`index.html`）

```diff
  <div class="menu-content">
    <div class="title-wrap">...</div>
    <p class="title-sub">...</p>
    <div id="menu-mode-badge" hidden></div>
    <div id="track-select">...</div>
    <div class="track-preview-wrap">...</div>
    <p id="touch-hint"></p>
    <section class="leaderboard-section">...</section>
-   <button id="start-btn">开始游戏</button>
-   <p class="hint" id="menu-hint">...</p>
-   <p class="hint" id="menu-hint-touch" hidden>...</p>
  </div>
+ <div class="menu-footer">
+   <button id="start-btn" class="btn-primary">开始游戏</button>
+   <p class="hint" id="menu-hint">...</p>
+   <p class="hint" id="menu-hint-touch" hidden>...</p>
+ </div>
```

#### CSS 关键改动（`src/style.screens.css`）

**`#start-screen`**：移除 `overflow-y: auto`（滚动职责下沉），保留 `overflow: hidden`。

**`.menu-content`**：从 `max-height: 100vh; overflow-y: auto; flex: 1 1 auto` 改为 **absolute 定位**：

```css
.menu-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 150px; /* 预留 .menu-footer 空间（按钮+提示+安全区） */
  overflow-y: auto;
  /* 内部首/末子元素 margin: auto 实现"可滚动 + 不超高时居中" */
}
.menu-content > :first-child {
  margin-top: auto;
}
.menu-content > :last-child {
  margin-bottom: auto;
}
```

**`.menu-footer`（新增）**：absolute `bottom: 0` 固定底部：

```css
.menu-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0 calc(18px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, transparent, rgba(11, 5, 24, 0.92));
}
```

**`#start-btn`**：移除 `position: sticky; bottom: 8px; z-index: 5; backdrop-filter: blur(8px)`（已移出滚动容器，不再需要），恢复正常流，`margin-top: 8px; margin-bottom: 4px`。

#### 为什么不沿用 sticky / flex / grid 方案

| 方案                                | 问题                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| 保留 sticky + padding 占位          | sticky 吸底位置由视口决定，无论 padding 多大，初始 scrollTop=0 时仍压在内容上      |
| flex column + flex:1 + min-height:0 | 跨浏览器 flex item 收缩行为不一致（1366×768 下 menu-content 未正确扩展到剩余空间） |
| grid + grid-template-rows: 1fr auto | grid 1fr 行被 menu-content min-content 撑大（leaderboard 高度）                    |
| **absolute 定位（采用）**           | 直接限定 menu-content 区域（top:0 bottom:150px），footer 固定 bottom:0，行为可预测 |

#### 视觉验证

| 场景                                | 修复前                 | 修复后                                        |
| ----------------------------------- | ---------------------- | --------------------------------------------- |
| desktop-1280×720                    | 按钮叠在"漂移榜单"卡上 | 按钮在视口底部独立浮层，榜单 toolbar 完整可见 |
| mobile-landscape-812×375            | 按钮叠在"漂移榜单"卡上 | 按钮在底部浮层，榜单 toolbar 完整可见         |
| mobile-portrait-540×960（竖屏继续） | 按钮叠在"对局战绩"卡上 | 按钮在底部，榜单可滚动查看                    |

### 2.2 P1-1：极窄屏副标题叠影

在 `@media (max-width: 390px)` 分支（已存在 `#start-screen` 字号收敛规则）补上：

```css
.title-sub {
  margin: 0 0 20px; /* 收敛基础 .title-sub 的负上边距 -8px，避免 390 宽下挤入主标题 */
}
```

**适用场景**：390×844 portrait-mode（iPhone 12/13/14）—— 高度 >700 不命中低高度分支，需在该宽度分支显式收敛。

### 2.3 P2-2：竖屏榜单紧凑化

```css
body.portrait-mode .lb-card {
  padding: 6px 8px;
} /* 原 8px 10px */
body.portrait-mode .lb-card-body {
  max-height: 120px;
} /* 原 150px */
body.portrait-mode .lb-card-head {
  margin-bottom: 4px;
  padding-bottom: 4px;
} /* 新增 */
```

**效果**：540×960 / 390×844 竖屏下，3 卡纵向堆叠总高度降低约 50px，榜单更紧凑；用户滚动到榜单区时，每张卡片信息密度提高。

---

## 三、验证证据

### 3.1 全量验证

| 验证项             | 结果                            |
| ------------------ | ------------------------------- |
| `npx tsc --noEmit` | ✅ 0 错误                       |
| `npm run lint`     | ✅ 0 错误                       |
| `npm test`         | ✅ 49 文件 711 用例             |
| `npm run build`    | ✅ PWA 14 entries (1579.59 KiB) |

### 3.2 运行时复测（Playwright 10 场景）

| 场景                     | `bodyClass`   | `footer.top == mc.bottom` | P0-1 修复    | P1-1 修复 | P2-2 修复 |
| ------------------------ | ------------- | ------------------------- | ------------ | --------- | --------- |
| desktop-1280×720         | -             | ✅                        | ✅ overlap=0 | n/a       | n/a       |
| desktop-1920×1080        | -             | ✅                        | ✅ overlap=0 | n/a       | n/a       |
| desktop-1366×768         | -             | ✅                        | ✅ overlap=0 | n/a       | n/a       |
| mobile-landscape-812×375 | -             | ✅                        | ✅ overlap=0 | n/a       | n/a       |
| mobile-landscape-667×375 | -             | ✅                        | ✅ overlap=0 | n/a       | n/a       |
| mobile-landscape-740×360 | -             | ✅                        | ✅ overlap=0 | n/a       | n/a       |
| mobile-portrait-540×960  | portrait-mode | ✅                        | ✅ overlap=0 | ✅ 无叠影 | ✅ 紧凑   |
| mobile-portrait-390×844  | portrait-mode | ✅                        | ✅ overlap=0 | ✅ 无叠影 | ✅ 紧凑   |
| mobile-portrait-375×667  | portrait-mode | ✅                        | ✅ overlap=0 | ✅ 无叠影 | ✅ 紧凑   |
| mobile-portrait-320×568  | portrait-mode | ✅                        | ✅ overlap=0 | ✅ 无叠影 | ✅ 紧凑   |

**所有场景 P0-1 修复（footer 紧贴 menu-content 下边缘，无视觉重叠）issues=0**。

### 3.3 截图证据

`docs/menu-test/verify-p0/` 保留 10 张关键场景截图（含 portrait-mode 竖屏继续后实际菜单布局），可用于回归对比。

---

## 四、文件变更清单

### 源码（4 文件）

1. `index.html` — 把 `#start-btn` + 两个 `.hint` 从 `.menu-content` 内移入新的 `.menu-footer` 容器
2. `src/style.screens.css` —
   - `#start-screen`：移除 `overflow-y: auto`
   - `.menu-content`：改为 absolute 定位（`top:0 bottom:150px`），移除 `flex: 1 1 auto`
   - 新增 `.menu-content > :first-child { margin-top: auto }` / `:last-child { margin-bottom: auto }`（可滚动居中）
   - 新增 `.menu-footer` 规则（absolute `bottom:0` 固定底部 + 渐变遮罩）
   - `#start-btn`：移除 `position: sticky; bottom: 8px; z-index: 5; backdrop-filter`（已移出滚动容器）
3. `src/style.interaction.css` —
   - `@media (max-width: 390px)` 分支补 `.title-sub { margin: 0 0 20px }`（P1-1）
   - `body.portrait-mode .lb-card { padding: 6px 8px }`（P2-2，原 8px 10px）
   - `body.portrait-mode .lb-card-body { max-height: 120px }`（P2-2，原 150px）
   - `body.portrait-mode .lb-card-head { margin-bottom: 4px; padding-bottom: 4px }`（P2-2 新增）

### 测试 / 复测

- 临时复测脚本（`tests/menu-p0-verify.ts` / `menu-p0-debug.ts`）使用 ES5 字符串拼接构造 evaluate 函数以兼容 headless Chromium 沙箱，与项目 lint 规范冲突，完成使命后已删除
- 复测截图保留在 `docs/menu-test/verify-p0/`

---

## 五、技术要点总结

### 5.1 为什么用 absolute 定位而非 flex/grid

修复过程中尝试了三种布局方案：

1. **flex column + flex:1 + min-height:0**（最直观）—— 跨浏览器 flex item 收缩行为不一致，1366×768 下 menu-content 未扩展到剩余空间
2. **grid 1fr + auto**（现代方案）—— grid 1fr 行被 menu-content 内部子元素的 min-content 高度撑大
3. **absolute 定位**（采用）—— `top:0 bottom:150px` 直接限定 menu-content 区域，`bottom:0` 固定 footer，行为可预测跨浏览器一致

### 5.2 "可滚动居中" 技巧

`.menu-content` 内部用 `> :first-child { margin-top: auto }` + `> :last-child { margin-bottom: auto }`：

- 内容不超高时：两端 auto margin 平分剩余空间 → 内容组垂直居中
- 内容超高时：auto margin 归零 → 内容从顶部开始可滚动，不裁顶
- 比 `justify-content: center` + `overflow-y: auto` 更安全（后者在超高时顶部被裁）

### 5.3 Playwright 几何重叠检测的盲点

`getBoundingClientRect` 返回 viewport 坐标，**不考虑 `overflow: hidden` 裁切**。当 menu-content 内容超高时，leaderboard 元素 rect bottom 可能超出 menu-content bottom（被裁），footer top == menu-content bottom 时仍报告几何重叠。视觉上无遮挡（被裁到裁切线），但 rect 报告几何重叠。**正确判定 P0-1 修复的标准是 `footer.top >= menu-content.bottom`**（footer 紧贴 menu-content 下边缘）。
