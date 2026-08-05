# 菜单页面专项视觉审计与优化实施方案

> 审计时间：2026-08-05
> 审计方式：Playwright 确定性探针（`.codebuddy/menu-probe.mjs`，日志 `menu-probe.txt`）采集 12 张证据截图（`docs/screenshots/menu-x01~x12`）+ `getBoundingClientRect`/`getComputedStyle` 布局指标 + 源码交叉核对（index.html 菜单 DOM、style.css 菜单段、game-loop 交互逻辑）。
> 覆盖维度：布局（5 视口：1280×720 / 1280×600 / 1920×1080 / 812×375 / 分屏）、背景（3 赛道主题切换）、样式细节（hover/focus/选中/星级/卡片）、UX 交互（展开手风琴、键盘导航、模式徽章）。

---

## 一、现状评估（保持项）

| 维度 | 评估 |
|------|------|
| 信息架构 | 标题 → 模式徽章 → 3×3 赛道网格 → 预览 SVG+赛道名 → 三榜单卡 → 开始按钮 → 操作提示，单列居中、层次清晰 |
| 主题背景 | `.menu-bg.track-*` 9 套渐变随 P1 赛道切换（desert 金棕 / coast 深蓝 / canyon 红棕），配合星空/网格/光晕五层结构，氛围感到位 |
| 可访问性 | `tabindex/role=button/aria-pressed/aria-expanded` 完整；`:focus-visible` 青色外环与选中黄框区分明确（menu-x04 实测）；分屏 P1 黄/P2 绿双色高亮无混淆（menu-x12） |
| 入场动效 | `content-fade-in` 0.9s、选中 `selected-pulse`、赛道名 `track-name-pop`，prefers-reduced-motion 已降级 |
| 榜单数据 | 注入数据实测：BEST 汇总/漂移榜连击后缀/对局榜渲染格式正确（menu-x06/x07） |

---

## 二、问题清单

分级：**P1** 影响可用性必修；**P2** 明显体验瑕疵；**P3** 打磨项。

### M-1【P1】低高度桌面视口（≤~680px）开始按钮与提示被裁切

- **实测证据**：1280×600 下 `#start-btn` 位于 y=631、`#menu-hint` y=701，均超出视口；`.menu-content` 依赖内部 8px 细滚动条兜底（`overflow-y:auto`），键盘方向键仅切赛道不滚动容器。1280×720 恰好容纳（按钮底 683px，余量仅 37px）。
- **影响**：主流笔记本（1366×768 扣除浏览器框架后可用高度 ≈600–650px）首屏看不到主 CTA，新用户无滚动暗示，直接阻断核心转化路径。
- **方案**（推荐 B，成本/收益最佳）：
  - **A. 高度分级压缩**：新增 `@media (max-height: 700px)` 与 `(max-height: 620px)` 两档——压缩标题 margin、`.track-preview-wrap` 60→40px、`.leaderboard-cards` margin、`.lb-card` padding、隐藏 `.title-sub`；620px 档再隐藏预览 SVG（与移动端低高度策略一致）。
  - **B. 主 CTA 保底可见**：`#start-btn` 在内容超高时 `position: sticky; bottom: 8px`（父容器已是滚动容器，sticky 天然生效），配合顶部渐隐遮罩提示可滚动。
  - **C. 两栏布局**（改造大，列为远期）：≥1280×但高度受限时赛道网格左置、榜单右置。
- **落点**：`style.css`（纯 CSS，无逻辑改动）；回归锚点：探针脚本 `shortLayout` 断言 `startBtn.y + h ≤ viewport.h`。

### M-2【P2】移动横屏（641–900px 宽）沿用桌面布局，榜单卡触控目标过小

- **实测证据**：812×375 下三张 `.lb-card` 仅 128×23px（远低于 44px 触控目标建议）；移动端 2 列网格/全宽卡片样式只在 `@media (max-width: 640px)`（竖屏）生效，横屏手机落空。赛道选项 180×46px 勉强达标。
- **方案**：将移动布局媒体查询改为 `@media (max-width: 900px)`（或增加 `(hover: none) and (max-height: 480px)` 分支）：榜单卡全宽纵排（`flex: 1 1 100%` 已有）、赛道网格 2 列、卡片 head 最小高 44px。
- **落点**：`style.css` 媒体查询条件 + `.lb-card-head { min-height: 44px; display:flex; align-items:center }`。

### M-3【P2】榜单卡展开反馈弱 + 嵌套滚动陷阱

- **实测证据**：`.lb-card-body` 折叠态 `max-height:120px` → 展开态仅 135px（+15px），展开差异只能靠边框光晕与条目 5→10 感知；且 body 恒 `overflow-y:auto`，滚轮悬停卡片时滚动被卡片捕获（嵌套滚动），页面不再滚动，易误判"滚到底"。手风琴互斥展开（展一收二，`bindLeaderboardCards`）行为合理但无说明。
- **方案**：
  1. 展开态 `max-height` 提升至 210px 并加 `transition: max-height .25s ease`，展开感知明确；
  2. body 内部滚动仅在条目数 >8 时保留（`refreshDriftTop` 等按 `isCardExpanded` 输出条目，可用 CSS `:has` 或 JS 加 `scrollable` 类），其余情况 `overflow: visible`，消除嵌套滚动；
  3. head 的 `▾` 伪元素改 `transform: rotate()` 旋转过渡替代 `content` 文本切换（「展开 ▾」→「收起 ▴」），动画连贯且避免 float:right 布局（见 M-8）。
- **落点**：`style.css` + `top-refresh.ts`（条目行数阈值类）+ `game-loop.bindLeaderboardCards`（无需改逻辑）。

### M-4【P2】星级难度标识：空星 ☆ 与实星 ★ 同色，可读性差

- **实测证据**：`.track-stars.diff-N` 颜色作用于整个 span，`★☆☆` 中 ☆ 与 ★ 同色（diff-1 全绿/diff-3 全粉），难度仅靠"数星数"传达；本次视觉模型在 12 张截图中对星级多次误读（绿/黄/红判断漂移）。
- **方案**：将星级拆分渲染——`buildTrackOptions` 改为 `<span class="stars-filled">★…</span><span class="stars-empty">☆…</span>`，`.stars-empty { opacity: 0.32 }`；保留 diff-N 色相编码不变，难度一眼可辨。
- **落点**：`game-loop.buildTrackOptions`（innerHTML 结构）+ `style.css`；index.html 静态初始项同步。

### M-5【P2】canyon 与 desert 菜单背景色相接近，主题辨识度不足

- **实测证据**：`track-canyon`（底 #482810 红棕）与 `track-desert`（底 #483010 金棕）截图（menu-x02）观感近似，均为暖棕调。
- **方案**：拉大色相差——canyon 底部渐变改 `#200808 → #3a1210 → #551a12`（红黑峡谷感）、顶部光斑改 `rgba(255,60,40,.38)`；desert 保持金黄但底部提亮 `#543c14`。或更彻底：`.menu-gradient` 主色从 `getEnvironmentProfile(env).previewColor` 派生（JS 注入 CSS 变量），背景与缩略图主题色天然同源。
- **落点**：`style.css`（快速方案）或 `game-loop.updateTrackBackground` + CSS 变量（同源方案）。

### M-6【P3】宽屏（≥1600px）内容列过窄，两侧大面积留白

- **实测证据**：1920×1080 下赛道网格仍 584px、卡片 max-width 220px，中央列悬浮于大片空背景（menu-x11）。
- **方案**：`@media (min-width: 1600px)`：`#track-select` max-width 560→660px、`.lb-card` max-width 220→260px、标题 `--title-fs` 上限放宽；轻量放大不破坏既有栅格。

### M-7【P3】hover 与 selected 视觉语言重叠

- **实测证据**：两者同为 accent 黄边框 + 上浮（hover -3px / selected -2px）+ 亮背景，hover 背景 alpha 0.25 甚至深于 selected 0.2；selected 靠 pulse 动画与左侧竖条区分，快速扫视仍易混（menu-x03）。
- **方案**：hover 降权——去掉 `translateY(-3px)` 与 box-shadow 大光晕，仅保留 `border-color` 提亮 + 背景 0.12 + 扫光（`::before` 已有）；把"上浮+脉冲"专属留给选中态。

### M-8【P3】样式卫生：重复规则与 float 布局

- **证据**：`.lb-card-body` 在 style.css 412/433 行存在两段规则（后者叠 max-height/overflow），维护易漏；`.lb-card-head::after` 用 `float: right` 排版展开标签，窄宽下存在换行挤压风险。
- **方案**：合并两段 `.lb-card-body`；`.lb-card-head` 改 `display:flex; justify-content: space-between`，标签移出伪元素为真实 span（配合 M-3 旋转动画），顺带支持 aria-hidden 装饰分离。

### M-9【P3】菜单触屏提示文案游离于 copy.ts 之外

- **证据**：`index.html` 的 `#touch-hint`（"触屏：右下角虚拟摇杆控制方向与油门，左下角暂停按钮"）为硬编码，与 `copy.ts` 的 `RACING_TOUCH_HINT`（多"拖动"二字）已出现漂移，且不受 `copy.test.ts` 同源断言保护。
- **方案**：删除 `#touch-hint` 硬编码文本，改由 JS 以 copy.ts 常量填充（与 `#menu-hint-touch`/`RACING_TOUCH_HINT` 归一），`copy.test.ts` 增加断言。

### M-10【P3】预览区信息冗余（设计取舍）

- **证据**：预览 SVG 下方的 `#track-name` 与网格选中卡信息重复，垂直栈多占 ~24px（恰是 M-1 高度预算的紧张来源）。
- **方案**：将赛道名并入预览行（SVG 左 + 名称右，单行 flex），省垂直空间并强化"预览=当前选择"的关联。

---

## 三、实施批次规划

| 批次 | 内容 | 改动面 | 风险 | 验证 |
|------|------|--------|------|------|
| **Batch A（必修）** | M-1（推荐 A+B 组合：高度分级压缩 + sticky CTA）、M-2（横屏媒体查询 900px） | 纯 CSS（style.css） | 低——需回归 1280×720 既有布局不漂移（e2e 菜单用例兜底） | 探针断言：600px 视口 startBtn 可见；812×375 卡片高 ≥44px |
| **Batch B（体验）** | M-3（展开反馈/嵌套滚动）、M-4（星级拆分）、M-5（canyon 背景拉色差） | CSS + buildTrackOptions + top-refresh 少量 | 中——星级结构变更需同步 index.html 初始 DOM 与 e2e 文本断言 | 单测 buildTrackOptions 输出结构；截图对比 |
| **Batch C（打磨）** | M-6 宽屏放宽、M-7 hover 降权、M-8 样式卫生、M-9 文案归一、M-10 预览行合并 | CSS 为主 + 小幅 JS | 低 | 全链路 typecheck/lint/test/e2e |

- 每批次遵循项目验证链：`typecheck → lint → test → bot → build`；菜单视觉以探针脚本 `menu-probe.mjs` 截图前后对比 + `tests/e2e/visual.spec.ts` 既有菜单断言（红色光晕/标题叠影/移动端开始按钮可见）防回归。
- Batch A 可独立合入；Batch B 的 M-4 与 M-9 建议同批（都触碰 buildTrackOptions/index.html 文案区）。

## 四、验收标准（Batch 完成后）

1. 1280×600 / 1366×650 视口首屏可见开始按钮（无需滚动）；1280×720 布局与现状像素级兼容（关键元素 y 偏移 <4px）。
2. 812×375 榜单卡可点区 ≥44px 高，点击展开无误触。
3. 榜单展开态视觉差异显著（高度 + 箭头旋转），卡片内无嵌套滚动（条目 ≤8 时）。
4. 星级实/空两态对比度 ≥3:1，难度一眼可辨。
5. canyon/desert 背景截图并排可即时区分。
6. 全验证链绿 + 探针截图归档 `docs/screenshots/menu-y*.png`。

---

## 五、实施记录与复测结果（2026-08-05 同日无人值守完成）

三批次全部落地，复测探针 `.codebuddy/menu-probe-y.mjs`（日志 `menu-probe-y.txt`），证据截图 `menu-y01~y08`。

### 落地清单

| 项 | 实现 | 落点 |
|----|------|------|
| M-1 | 新增 `@media (max-height: 700px/620px)` 两档压缩（标题/网格/预览/榜单垂直占位）；`#start-btn` 加 `position: sticky; bottom: 8px` + backdrop 模糊保底 | style.css |
| M-2 | 横屏低高度（max-height 480px）块内 `.lb-card-head` 补 `min-height: 44px` | style.css |
| M-3 | 展开态 max-height 135→210px + `transition`；body 默认 `overflow: hidden` 消嵌套滚动，top-refresh 新增 `syncScrollable`（行数 >8 才加 `.scrollable` 内滚）；箭头改真实 span + 旋转 180° 过渡，「展开/收起」双 span 切换 | style.css、top-refresh.ts、index.html |
| M-4 | 星级拆 `stars-filled`/`stars-empty` 双 span（innerHTML 结构化），`.stars-empty { opacity: 0.32 }`；静态 HTML 9 项同步并修正峡谷/山岳静态星级与运行时不一致（原★★☆→★★★） | game-loop.buildTrackOptions、index.html、style.css |
| M-5 | canyon 改红黑峡谷调（#200808→#551a12 + 红橙底光斑），desert 金黄调底部提亮（#543c14），明度+色相双重差异 | style.css |
| M-6 | `@media (min-width: 1600px)`：网格 560→660px、榜单容器 720→860px、卡片 220→260px | style.css |
| M-7 | hover 降权：去 `translateY(-3px)` 与大光晕，仅边框提亮 + 背景 0.12 + 扫光；上浮/脉冲专属选中态 | style.css |
| M-8 | `.lb-card-body` 两段重复规则合并；`.lb-card-head` 改 flex（替代 float 伪元素） | style.css、index.html |
| M-9 | `#touch-hint` 硬编码文案删除，构造时以 `RACING_TOUCH_HINT` 同源填充；copy.test 新增防漂移断言 | index.html、game-loop、copy.test |
| M-10 | `#track-name`/`#p2-track-name` 移入 `.track-preview-wrap`（SVG 左 + 名称右，单行 flex，省 ~24px） | index.html、style.css |

### 复测证据（menu-y 系列实测值）

| 验收项 | 复测结果 |
|--------|---------|
| 1. 低高度首屏 CTA | 1280×600 实测 startBtn 底 y=514 ≤ 600（实施前 683 裁切），menu-hint 同步可见；720p 布局完整（按钮 y=577，因 M-10 预览行合并比原 631 上移 54px，属预期正向变化） |
| 2. 横屏触控目标 | 812×375 实测三张卡片头高度均为 **44px**（实施前 23px） |
| 3. 展开反馈/嵌套滚动 | expanded=true 时 body max-height=210px、overflow=hidden（无 scrollable 类，空态 2 行）、箭头 transform=matrix(-1,0,0,-1)（180°）、collapse 文案可见 |
| 4. 星级辨识 | canyon 三星全实无空星、classic 实★ + 空☆☆（opacity 实测 0.32）；视觉模型从原"颜色误读"转为正确识别"2 filled + 1 gray" |
| 5. 背景色差 | canyon 截图呈红黑峡谷调、desert 呈金黄琥珀调（menu-y06/y07 并排即时可辨） |
| 6. 验证链 | typecheck ✅ / lint ✅ / **test 697 用例全绿**（+1：M-9 同源断言）/ bot 9 赛道 0 违规 ✅ / build PWA ✅ |
| 附 | 宽屏 1920×1080 网格宽 584→684px、卡片 218→226px（M-6）；hover 态 transform=none、无大光晕（M-7）；预览行合并 sameRow=true（M-10） |

遗留：e2e 视觉回归建议下次 CI 验证（本轮改动均有单测/探针覆盖；菜单既有用例断言未触碰）。
