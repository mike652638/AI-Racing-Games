# M18 UI/UX 深度打磨实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 M18 UI/UX 深度打磨：可访问性（键盘/ARIA/reduced-motion）、颜色令牌化与样式去重、反馈增强（碰撞闪白/HUD 碰撞计数衰减/BOOST 未蓄能反馈）、环境渲染细节（近距缩放上限/环境车灯/路缘柔和过渡/地形细节）、文案增强与移动端触屏引导。

**Architecture:** 按文件边界划分为 2 个并行工作流（Lane A = designer 表现层、Lane B = fixer 引擎渲染层），文件所有权互不重叠，并行执行；收尾由编排者统一全量验证（typecheck → lint → test → bot → build → test:e2e）+ 无人值守视觉验证，最后提交。

**Tech Stack:** TypeScript 6.0 strict / Vite 8.2 / Vitest 4.1 / ESLint 10 + typescript-eslint / Canvas 2D / Playwright（e2e）

## Global Constraints

- 语言：所有回复、注释、文档使用中文；代码、命令、标识符保留英文
- 验证门禁顺序（AGENTS.md）：`npm run typecheck` → `npm run lint` → `npm test` → `npm run bot` → `npm run build` → `npm run test:e2e`
- 技术栈不更换：Canvas 2D 伪 3D、无 Three.js/WebGL、无新运行时依赖
- 不破坏既有导出 API：`project`、`drawPlayerCar`、`updateCollisionFlash`、`flashSeedFromSpeedRatio`、`shadeColor`、`getEnvironmentProfile` 等被测试引用的导出必须保留签名（扩展参数必须为可选/向后兼容）
- 引擎渲染遵循帧内零新建数组约束（复用对象，不每帧 new Array）
- **两个 lane 只改文件，不执行 git commit**（收尾由编排者统一验证后提交）
- 现有测试全绿是硬性验收：`npm test` 45 文件 639 用例 + `npm run bot` 9 赛道矩阵 0 违规 + `npm run test:e2e` 13 通过
- 文案新增必须进 `src/ui/copy.ts`（与 README 同源，`tests/unit/copy.test.ts` 关键词锁定），不得在 HTML/TS 中硬编码用户可见文案
- e2e 断言的 DOM 结构（id/class）若被改动，须同步更新 `tests/e2e/visual.spec.ts` 对应断言

---

## Lane A：UI 表现层打磨（@designer 执行）

**文件所有权（Lane A 独占）：**
- `index.html`
- `src/style.css`
- `src/ui/`（hud.ts、screens.ts、copy.ts、format.ts、gamestate.ts、save.ts、joystick.ts、minimap.ts）
- `src/game/game-loop.ts`（仅 UI 相关片段：阶段切换 class、浮层计时、BOOST 反馈检测）
- `src/game/dom-setup.ts`（如新增 DOM 元素收集）
- `tests/unit/copy.test.ts`、`tests/unit/hud.test.ts`、`tests/e2e/visual.spec.ts`（仅同步断言）

**禁止触碰：** `src/engine/**`、`src/game/collision-feedback.ts`、`src/shared/**`（Lane B 或编排者所有）

### Task A1: 键盘可访问性补全

**Files:**
- Modify: `index.html`（榜单卡片 tabindex/role/aria 属性）
- Modify: `src/game/game-loop.ts`（榜单卡片键盘事件处理，与现有 click 展开逻辑合并）
- Modify: `src/style.css`（`:focus-visible` 覆盖）

**设计要点：**
- `.lb-card-clickable`（3 个榜单卡片）加 `tabindex="0"` + `role="button"` + `aria-expanded="false"`（初始，展开时置 true）
- game-loop 中现有 click 展开处理改为统一 `toggleLbCard(target)`，并为 Enter/Space 键盘事件复用（keydown 时 `event.code === 'Enter' || 'Space'` → preventDefault + 同一 toggle）
- `:focus-visible` 补充：`.lb-card-clickable`、`#pause-btn`、`#pause-controls` 内按钮与 range slider、`#finish-restart-btn`、`#pause-resume`、`#pause-restart`、`#pause-quit-btn`（沿用现有 track-option 的青色外环样式，抽公共 class 或选择器组）
- ARIA 补全：`#pause-btn` 加 `aria-label="暂停"`；`.track-stars` 加 `aria-label`（如"难度 2 星"，由 track-name 关联即可，用现有 diff-N 类生成中文描述）；`#countdown-overlay` 内容加 `aria-live="polite"`；暂停屏加 `role="dialog"` + `aria-modal="true"` + `aria-labelledby="pause-title"`
- 验证：`npm run typecheck` + 手动确认 e2e 仍通过（DOM 结构未变，仅加属性）

- [ ] 榜单卡片键盘可展开（tabindex/role/aria-expanded/keydown）
- [ ] focus-visible 覆盖全部可交互元素
- [ ] ARIA 补全（pause-btn/track-stars/countdown/pause dialog）
- [ ] typecheck + 相关单测通过

### Task A2: prefers-reduced-motion 降级

**Files:**
- Modify: `src/style.css`

**设计要点：**
- 新增 `@media (prefers-reduced-motion: reduce)` 区块：将全部 22 个动画中**无限循环/大幅位移**的置为 `animation: none`（rotate-phone、grid-scroll、sun-pulse、stars-twinkle、light-sweep、title-bounce、title-shimmer、stroke-flicker、glow-pulse、selected-pulse、selected-pulse-p2、menu-breathe、pulse、finish-banner-glow、timer-pulse）
- 保留必要淡入但缩短：`content-fade-in`、`finish-title-in`、`finish-line-in`、`countdown-pop`、`card-rise`、`track-name-pop`、`score-pulse` → 统一 `animation-duration: 150ms` + 去掉位移（仅 opacity）
- 同时将 `#rotate-hint` 断点 `max-width: 768px` → `max-width: 1024px`（修复平板竖屏不提示缺陷，见 A8 可合并此处）

- [ ] reduced-motion 区块覆盖全部动画
- [ ] 旋转提示断点 1024px 修复
- [ ] 验证：无新依赖，CSS 变更 typecheck 无关，build 通过即可

### Task A3: 颜色令牌化 + 死代码清理 + 样式去重

**Files:**
- Modify: `src/style.css`

**设计要点：**
- `:root` 新增语义令牌：`--color-p1: #fde047`、`--color-p2: #4ade80`、`--color-danger: #ff5252`、`--color-accent: #ffd75e`（与现有 `--accent` 并存，逐步迁移；迁移完 `--accent` 保留或别名）
- 替换硬编码：`#fde047`（hud-player-tag p1、finish-banner p1 等）、`#4ade80`（p2 相关 10+ 处）、`#ff5252`（碰撞计数/警示）、`#ffd75e`（散落 10+ 处）→ 对应变量
- 删除死变量：`--menu-purple`、`--bg-overlay`（grep 确认无引用后删除）
- `.score-pop`：在 hud.ts 漂移得分更新时实现触发（`#drift-score-value` 更新瞬间加 class，250ms 后移除——用现有 requestAnimationFrame 循环内时间戳或 setTimeout；hud.ts 是每帧刷新，注意用 classList.remove 防重复），实现"得分数字放大回弹"动画激活；若实现成本过高可删除该 CSS（二选一，优先实现）
- 样式合并：`#start-btn` 与 `#finish-restart-btn` 抽公共 `.btn-primary`（两处现有 ~40 行重复）；`#best-summary`/`#drift-top`/`#match-top` 三段相同样式合并为 `.lb-card-body` 选择器组
- 清理 `#keyboard-hint` 残留规则（HTML 无此元素，grep 确认后删除）
- `#hud-minimap` 110px 提取为 `--minimap-size: 110px`（canvas 属性同步用 JS 读取或保持双处一致即可，CSS 侧用变量）

- [ ] 语义令牌定义与硬编码替换
- [ ] 死变量/死规则清理
- [ ] score-pop 激活或删除（推荐激活）
- [ ] 按钮/榜单样式去重
- [ ] build 通过 + 移动端 e2e 通过

### Task A4: 屏幕切换过渡

**Files:**
- Modify: `src/game/game-loop.ts`（阶段切换处加 class）
- Modify: `src/style.css`

**设计要点：**
- 菜单→比赛：`#start-screen` 隐藏前加 `.leaving`（`opacity 0` + `150ms` transition），transitionend 后加 hidden（game-loop 现有阶段切换逻辑处）
- RACING→PAUSED / PAUSED→RACING：`#pause-screen` 加进入动画（`pause-in`：opacity + backdrop blur 淡入 180ms）；退出加 `.leaving` 淡出
- 结算→菜单：`#finish-screen` 加 `.leaving` 淡出 150ms
- 实现注意：所有过渡动画必须 150-200ms 内完成，且**不阻塞游戏循环**（用 CSS transition + transitionend 或 setTimeout，勿在帧循环内同步等待）
- 若 game-loop 中过渡逻辑复杂度过高，可简化为仅暂停屏入场动画 + 菜单/结算淡出（最可见的 3 处），其余保持硬切

- [ ] 暂停屏入场/退场过渡
- [ ] 菜单/结算退场淡出
- [ ] e2e 通过（DOM hidden 时序不得破坏既有断言）

### Task A5: 文案增强（copy.ts 同源）

**Files:**
- Modify: `src/ui/copy.ts`
- Modify: `src/ui/screens.ts`（结算面板/空态填充）
- Modify: `index.html`（如空态占位改为 JS 填充）
- Modify: `tests/unit/copy.test.ts`（同步关键词）

**设计要点（3 条文案，全部进 copy.ts）：**
1. 结算面板漂移提示：结算面板分数区（`.finish-card` 的 `#finish-score` 下方或 `.finish-laps` 附近）新增一行小字提示，如 `FINISH_DRIFT_HINT = '甩尾过弯可获得漂移得分！'`——仅当玩家漂移得分为 0 时显示（screens.ts 填充逻辑判断）
2. 对局战绩空态：`#match-top` 空态（现"暂无对局记录"）追加说明"仅分屏对局计入"（copy.ts 新增 `MATCH_EMPTY_HINT`，空态时同时显示两行）
3. 菜单统计面板空状态引导：`#best-summary`/`#drift-top` 空态追加引导文案，如 `STATS_EMPTY_HINT = '完成比赛后这里会显示你的最佳成绩'`（copy.ts 新增常量，screens.ts 空态填充时追加）

- [ ] copy.ts 新增 3 条常量 + 使用处替换
- [ ] screens.ts 空态/零分条件渲染
- [ ] copy.test.ts 同步
- [ ] typecheck + test 通过

### Task A6: 移动端 RACING 触屏引导浮层

**Files:**
- Modify: `index.html`（新增 `#racing-touch-hint`）
- Modify: `src/style.css`（浮层样式 + 2s 淡出动画 + 仅 `(hover: none)` 显示）
- Modify: `src/game/game-loop.ts`（RACING 阶段首次进入时显示，2s 后隐藏）
- Modify: `src/game/dom-setup.ts`（如需要收集该元素）
- Modify: `src/ui/copy.ts`（文案）

**设计要点：**
- 浮层文案（copy.ts）：`RACING_TOUCH_HINT = '触屏四分区驾驶：左侧转向，右侧加速/刹车'`（与实际 joystick 布局一致——需先读 joystick.ts 确认分区语义再定稿文案）
- 样式：画面中央偏下、半透明深色圆角卡片、金色文字、2s 后 `opacity 0` 淡出（CSS `fade-out 2s forwards` + `pointer-events: none`），初始 `display: none`，仅 `(hover: none)` 媒体查询内显示
- game-loop：进入 RACING 阶段且首次（`!raceHasShownTouchHint` 布尔）且移动端（可用 `matchMedia('(hover: none)')` 或直接显示后由 CSS 控制）→ 显示，2s 后加隐藏类；热座 P2 换人时不重复显示（每局首次即可）
- 不阻塞游戏：仅一次性 class 操作

- [ ] 浮层 DOM + 样式 + 动画
- [ ] game-loop 一次性触发逻辑
- [ ] 移动端 e2e 通过（浮层不得影响 812×375 布局断言）

### Task A7: BOOST 未蓄能反馈

**Files:**
- Modify: `src/game/game-loop.ts`（检测逻辑）
- Modify: `src/ui/hud.ts`（boost-bar class 切换）
- Modify: `src/style.css`（`.no-charge` 红色闪烁样式）

**设计要点：**
- 检测：每帧 boost 按键按下（input 状态）&& `boostCharge <= 0` && 非 boosting → 触发一次 `.no-charge`（300ms 后移除）
- 视觉：`#boost-bar` 边框/填充 1px 红色闪烁（`box-shadow` 红晕 + 边框红，`no-charge-flash` 动画 300ms 两次闪烁），不打断正常蓄能
- 实现：game-loop 中维护 `lastBoostDeniedAt` 时间戳（防每帧重复触发，300ms 冷却）；hud.ts 或 game-loop 直接 classList 操作 `#boost-bar`
- 移动端：触屏按钮无 BOOST 键，无需处理（仅键盘路径）

- [ ] 检测 + 冷却逻辑
- [ ] 视觉反馈样式
- [ ] 手动验证：蓄能为 0 时按 Space 出现红闪

### Task A8: 杂项修复

**Files:**
- Modify: `src/style.css`

**设计要点（全部小改动，可并入 A2/A3 一起做）：**
- `.menu-content` 滚动条定制（与 `.finish-screen` 同款金色细条 + gutter，见现有滚动条规则）
- 对比度：`.lb-card-head::after`（"展开 ▾"青色）透明度 0.75→0.9；`.finish-stats`/`.finish-laps` 小字透明度 0.75-0.85 → 提至 0.9 或增强 text-shadow
- `#hud-best` 字号层级（继承 `--hud-fs`，可微调小一号区分主数字）
- 星级 tooltip（可选，若时间充裕）：`.track-option` 加 `title` 属性（如"难度：★★★"）或 CSS 纯 tooltip——**推荐 title 属性方案**（一行 HTML 属性，低成本）

- [ ] 菜单滚动条定制
- [ ] 对比度提升
- [ ] 星级 title 提示

---

## Lane B：引擎渲染细节打磨（@fixer 执行）

**文件所有权（Lane B 独占）：**
- `src/engine/renderer.ts`、`src/engine/player-car.ts`、`src/engine/projection.ts`、`src/engine/environment.ts`、`src/engine/road-surface.ts`、`src/engine/terrain-draw.ts`、`src/engine/traffic-render.ts`（如需）
- `src/game/collision-feedback.ts`（如需扩展，保持导出签名兼容）
- `tests/unit/` 对应测试（player-car、environment、projection、road-surface、terrain、renderer-state 等）

**禁止触碰：** `index.html`、`src/style.css`、`src/ui/**`、`src/game/game-loop.ts`、`src/shared/**`（Lane A 或编排者所有）

### Task B1: 碰撞车身边框闪白（collideFlash 落地）

**Files:**
- Modify: `src/engine/player-car.ts`（drawPlayerCar 增加 flash 参数）
- Modify: `src/engine/renderer.ts`（将 renderView.collisionFlash 传入 drawPlayerCar）
- Test: `tests/unit/player-car.test.ts`（断言新增绘制行为）

**设计要点：**
- `drawPlayerCar` 签名扩展：第 3 参或 opts 增加 `flash?: number`（0-1，默认 0，向后兼容旧调用——先读现有签名与调用点再定，若已是 opts 对象则加字段）
- 实现：flash > 0 时在车身外描边（`strokeRect` 或路径描边），颜色白→红随 flash 强度（`rgba(255, 80, 60, flash)` 或白 `rgba(255,255,255,flash*0.8)`），线宽 3px，随 flash 指数衰减（状态已由 collision-feedback 驱动，此处纯消费）
- renderer.ts 调用处：`drawPlayerCar(ctx, opts, view.collisionFlash)`（先读现有调用签名）
- 文件头注释已声明"M16 设计意图：车身边框闪白"，落地后更新注释为已实现
- 测试：新增用例断言 flash>0 时绘制了描边路径（mock ctx 记录 strokeRect/stroke 调用），flash=0 时不绘制

- [ ] drawPlayerCar 支持 flash（向后兼容）
- [ ] renderer 传入 collisionFlash
- [ ] 单测新增 + 既有 player-car 测试全绿

### Task B2: 精灵近距缩放上限 MAX_SCALE

**Files:**
- Modify: `src/engine/projection.ts`（scale clamp）
- Test: `tests/unit/projection.test.ts`（或对应测试文件）

**设计要点：**
- 新增导出常量 `MAX_SPRITE_SCALE = 2.2`（阈值依据：道路半宽 1、相机高度——近距精灵最大视觉高度约 240px * 2.2 ≈ 528px，超过即 clamp；具体值可实施时按 drawWorldObjects 中 scale 用途微调，但必须导出常量并测试）
- `project` 返回值中 scale 字段 clamp：`scale = Math.min(scale, MAX_SPRITE_SCALE)`（仅对景物/车流投影生效的路径 clamp；先读 projection.ts 确认 project 是否被路面 quad 共用——若共用，clamp 放在 drawWorldObjects/projectSprite 侧而非 project 内）
- 验证：bot 矩阵不受影响（bot 不消费渲染）；既有 projection 测试补充"近距 scale 不超上限"用例

- [ ] MAX_SPRITE_SCALE 常量 + clamp
- [ ] 单测新增
- [ ] bot 9 赛道 0 违规确认

### Task B3: 环境车灯配色（canyon 红棕 / 其余按环境）

**Files:**
- Modify: `src/engine/environment.ts`（EnvironmentProfile 加可选 `headlightColor` 字段）
- Modify: `src/engine/player-car.ts`（车灯颜色参数化）
- Modify: `src/engine/renderer.ts`（传入环境色）
- Test: `tests/unit/environment.test.ts`（断言新增字段）

**设计要点：**
- `EnvironmentProfile` 增加可选字段 `headlightColor?: string`（默认保持现车灯色）；值建议：canyon `'#ff8a5c'`（红棕暖光）、alpine `'#dff1ff'`（冷白）、其余不设（默认色）
- drawPlayerCar 车灯绘制处颜色改为参数（opts 或第 3 参），renderer 从 trackContext 环境（`getEnvironmentProfile` 结果）取值传入
- 只改 night 赛道可见效果（canyon/alpine 为 night），day 赛道车灯本就低可见度，无副作用
- 测试：environment.test.ts 断言 canyon/alpine 的 headlightColor 字段值

- [ ] EnvironmentProfile.headlightColor + canyon/alpine 赋值
- [ ] drawPlayerCar 车灯参数化 + renderer 传入
- [ ] 单测新增

### Task B4: 路缘柔和过渡

**Files:**
- Modify: `src/engine/road-surface.ts`（路缘绘制）
- Test: `tests/unit/road-surface.test.ts`（如已有 shadeColor 契约测试则扩展）

**设计要点：**
- 现状：路缘红/白硬切换（road-strip 烘焙中已有 9 带渐变 + 双路缘色）
- 增强：路缘内侧加 1 条 2px 暗色分隔线（`shadeColor(路缘色, -0.25)` 或直接半透明黑），路缘外侧加高光条（`shadeColor(路缘色, +0.15)`），形成"高光-主体-阴影"立体感
- 复用 `shadeColor` 纯函数（road-strip.ts 导出），不引入新色值魔法数字（可用既有 shadeColor 或预计算常量）
- 若 road-strip 烘焙层改动复杂，最小方案：仅在 road-surface.ts 逐段回退绘制路径加分隔线（弯道可见），直道路段（缓存切片）不动——**以最小改动优先**，先读代码判断哪个路径成本低
- 测试：扩展 shadeColor/路缘相关断言（若有），否则手动视觉验证 + bot 无回归

- [ ] 路缘立体感（高光/阴影/分隔线，最少 1 项）
- [ ] 无渲染回归（renderer-state 测试 + bot）

### Task B5（可选，低优先级）: 地形细节增强

**Files:**
- Modify: `src/engine/terrain-draw.ts`
- Test: `tests/unit/terrain-draw.test.ts`（如存在）

**设计要点（3 项独立小增强，每项独立可交付，做完 2 项即达标）：**
1. 沙丘曲线变形：沙漠沙丘从纯 ellipse 改为 sin 噪声叠加（预计算 1 组相位常量，帧内零新建数组）
2. 仙人掌明暗：按投影 scale 远近做颜色明暗（远处 `shadeColor(色, -0.2)` 偏冷降饱和；scale 阈值两档即可）
3. 海面波浪：波浪线 y 随 `time * speed + phase` 轻微上下漂移（terrain-draw 是否有 time 参数需先读代码；若无则给绘制函数加可选 time 参数，renderer 传入累计时间）

- [ ] 沙丘变形 / 仙人掌明暗 / 波浪动画（≥2 项）
- [ ] 帧内零新建数组复核
- [ ] 单测 + bot 无回归

---

## 收尾（编排者执行）

1. 全量验证：`npm run typecheck` → `npm run lint` → `npm test` → `npm run bot` → `npm run build` → `npm run test:e2e`
2. 无人值守视觉验证：agent-browser 截图（菜单/赛道选择/比赛 HUD/暂停/结算 + 移动端 812×375），@observer 检查打磨效果（碰撞闪白、路缘立体感、令牌色一致性）
3. 更新文档：AGENTS.md 里程碑追加 M18 条目、README 如有 UI 说明同步
4. git 提交（按 lane 分 2 个 commit 或 1 个 M18 commit，遵循 Conventional Commits：`feat: M18 UI/UX 深度打磨...`）

---

## 风险与回退

- Lane A 与 Lane B 并行，文件零重叠（已按所有权隔离）；唯一联动点是 `drawPlayerCar` 签名（B1/B3 均改它，同 lane 内串行即可）
- e2e 断言若因 DOM 属性新增而脆弱：visual.spec.ts 为 DOM 几何/像素采样断言，加属性不影响，仅删改元素 id/class 才需同步
- A7 BOOST 反馈若与 game-loop 现有帧块耦合困难：可降级为仅样式层（hud 每帧检查 boostCharge<=0 且 boosting 状态切换，不读按键）
- B4 若 road-strip 烘焙路径复杂：仅做弯道回退路径增强，直道保持现状
- 全部任务完成后若任一验证失败：由对应 lane 持有者修复（恢复会话），不得跨 lane 修补对方文件
