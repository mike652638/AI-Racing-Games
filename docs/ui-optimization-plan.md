# UI/UX 专项优化实施计划

> **For agentic workers:** 使用 fixer specialists 执行各任务，orchestrator 协调与验证。

**Goal:** 修复 22 张截图分析中确认的 UI/UX 问题，提升菜单可读性、HUD 信息密度、多模式一致性和移动端适配。

**Architecture:** 纯 CSS/HTML/DOM 修改为主，不涉及游戏引擎/物理/渲染管线改动。所有修改集中在 `index.html`、`src/style.css`、`src/ui/hud.ts`、`src/ui/screens.ts`、`src/game/game-loop.ts`。

**Tech Stack:** TypeScript + Canvas 2D + CSS Variables + Media Queries

## 经代码审查确认的真实问题

以下问题经过代码审查确认为真实问题（排除了 observer 的假阳性）：

1. ✅ **菜单无 "开始" 按钮** — 仅键盘提示，无鼠标可点击区域
2. ✅ **菜单背景干扰** — 赛道实时渲染与菜单文字竞争注意力
3. ✅ **按钮布局 6+3 不均衡** — 第二行大量空白
4. ✅ **行间距过小** — 两行按钮几乎紧贴
5. ✅ **底部提示文字过小** — 新手引导可发现性低
6. ✅ **挑战模式无实时得分** — 仅结算面板显示，竞赛中无反馈
7. ✅ **暂停菜单未区分玩家** — 分屏时不知谁暂停
8. ✅ **移动端显示键盘提示** — 触屏设备无意义
9. ✅ **赛道按钮移动端太密集** — 触控操作易误触
10. ✅ **星级无区分度** — 6/9 赛道显示 ★★★
11. ✅ **标题 "S" 渲染断裂** — 字体渲染问题
12. ✅ **赛道9按钮被背景遮挡** — z-index 不足

## 已确认的假阳性（无需修复）

- 玩家车辆精灵：通过 sprite 系统正常渲染
- P2 速度绑定：`hud.ts:107` 正确绑定
- 漂移分数显示：`drift-indicator` 元素存在且正常更新
- 触控控制：`joystick.ts` 已实现虚拟摇杆
- 挑战倒计时：`game-loop.ts:873-876` 已实现

---

## 批次 1：菜单视觉基础（P0 — 核心可用性）

### Task 1: 菜单背景遮罩 + 开始按钮
**Files:**
- Modify: `src/style.css`
- Modify: `index.html`

**Changes:**
1. 在 `#start-screen` 添加半透明深色遮罩覆盖赛道背景
2. 在 `index.html` 菜单底部添加 "开始游戏" 按钮（支持鼠标点击）
3. 按钮样式使用 `--accent` 色调，与赛道选择按钮风格一致

### Task 2: 按钮布局优化（6+3 → 5+4）+ 行间距
**Files:**
- Modify: `src/style.css`

**Changes:**
1. `#track-select` 改为 `max-width: 750px`，每行 5 个按钮
2. 增加行间距 `gap: 16px`（当前 12px）
3. 按钮 `min-width: 130px` 确保均匀分布

### Task 3: 底部提示文字放大 + 赛道9遮挡修复
**Files:**
- Modify: `src/style.css`

**Changes:**
1. `.hint` 字号从 `--hint-fs` 增大至 `--subtitle-fs`
2. 赛道按钮添加 `position: relative; z-index: 1` 确保在背景精灵之上
3. 按钮添加 `background: rgba(0,0,0,0.6)` 不透明背景

### Task 4: 星级差异化
**Files:**
- Modify: `index.html`

**Changes:**
为 9 条赛道分配有意义的难度星级：
1. 经典赛道 ★☆☆（入门）
2. 高速公路 ★☆☆（直道为主）
3. S 弯挑战 ★★☆（连续弯道）
4. 环岛巡回 ★★☆（混合节奏）
5. 峡谷疾驰 ★★☆（长直道+大弯）
6. 沙漠疾驰 ★★☆（开放路段）
7. 森林穿梭 ★★★（复杂地形）
8. 海岸公路 ★★★（混合+风景）
9. 山岳险道 ★★★（最难关卡）

---

## 批次 2：HUD 增强（P1 — 信息密度）

### Task 5: 挑战模式实时得分显示
**Files:**
- Modify: `index.html` — 添加 `#challenge-score` 元素
- Modify: `src/style.css` — 挑战得分样式
- Modify: `src/game/game-loop.ts` — 帧循环中更新得分

**Changes:**
1. 在 `#hud` 中添加 `<div id="challenge-score" hidden></div>`
2. game-loop 帧块中：挑战模式时显示 `得分 ${Math.round(driftState.score)}`
3. 样式与 `#challenge-timer` 一致

### Task 6: HUD 文字描边/阴影增强
**Files:**
- Modify: `src/style.css`

**Changes:**
1. `#hud-speed` 添加 `text-shadow: 0 2px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)`
2. `#hud-lap`, `#hud-time` 添加 `text-shadow: 0 1px 6px rgba(0,0,0,0.8)`
3. `#drift-indicator` 增强阴影

---

## 批次 3：多模式一致性（P2 — 体验统一）

### Task 7: 暂停菜单区分玩家 + 分屏分割线加粗
**Files:**
- Modify: `index.html` — 暂停标题改为动态
- Modify: `src/ui/screens.ts` — `applyPhaseToScreens` 传入玩家标识
- Modify: `src/style.css` — 分割线样式

**Changes:**
1. 暂停标题改为 `PAUSED` + 玩家标识（P1/P2）
2. 分屏分割线从 1px 黑色改为 2px 白色半透明
3. `applyPhaseToScreens` 增加 `pausedBy` 参数

### Task 8: 移动端适配
**Files:**
- Modify: `src/style.css` — 移动端媒体查询
- Modify: `src/game/game-loop.ts` — 检测触屏设备

**Changes:**
1. `@media (pointer: coarse)` 下隐藏键盘操作提示
2. 赛道按钮在小屏上增大间距 `gap: 12px`
3. 添加 "点击赛道开始" 提示替换 "按任意键开始"

### Task 9: 菜单操作说明统一格式
**Files:**
- Modify: `src/game/game-loop.ts` — 构造器中统一格式

**Changes:**
统一为：`[模式说明] · [操作说明] · [开始方式]`
- 单屏：`WASD/方向键驾驶 · 1-9选赛道 · 按任意键开始`
- 分屏：`P1: 1-9选赛道 · P2: Shift+1-9选赛道 · 按任意键开始`
- 热座：`P1先跑 · 完成按回车交棒P2 · 1-9选赛道`
- 挑战：`60秒限时刷分 · WASD/方向键驾驶 · 按任意键开始`

---

## 批次 4：细节打磨（P3 — 视觉 polish）

### Task 10: 标题 "S" 渲染修复 + 按钮边框统一
**Files:**
- Modify: `src/style.css`

**Changes:**
1. 赛道按钮边框统一为 `rgba(255,255,255,0.35)`（移除绿色偏色）
2. 标题字体统一使用 `--font-mono`

### Task 11: 信息文字对比度增强
**Files:**
- Modify: `src/style.css`

**Changes:**
1. `#best-summary`, `#drift-top`, `#match-top` 颜色从 `0.7` 提升至 `0.85`
2. 添加 `text-shadow: 0 1px 4px rgba(0,0,0,0.6)`

---

## 验证矩阵

每批次完成后执行：
1. `npm run typecheck` — 类型安全
2. `npm run lint` — 代码规范
3. `npm test` — 功能回归
4. `npm run bot` — Bot 跑圈验证
5. 截图对比（Playwright）— 视觉回归

---

## 批次 5-7：遗留项增强（第二批优化）

> 代码侦察结论（explorer exp-1）：
> - 天气：纯时间循环三态（`floor(timeSec/45)%3`，0晴/1阴/2雨），雨丝纯装饰 overlay，`renderer.ts:352-355` 内部自算 phase，改动可完全收在 renderer.ts 内
> - 起终点线：完全不存在；过线判定是 `lapFromZ(cameraZ)` 距离取模（lap.ts:2-4），起点即 cameraZ=0
> - 小地图数据齐全：`TrackContext.segments[]`（每段 z+curve）、`cameraZ`、`trackIndexForCameraZ`（track.ts:94-98）
> - 摇杆：仅 touch pointerdown 才显示（joystick.ts:57-67），桌面/非触屏永远不可见；CSS 初始 `display:none`（style.css:498-509）

### 批次 5：移动端摇杆可见性优化（P1）

**Files:**
- Modify: `src/ui/joystick.ts`
- Modify: `src/style.css`

**Changes:**
1. `JoystickUI` 构造器检测 `navigator.maxTouchPoints > 0`，触屏设备时底座常驻显示（半透明、右下角 fixed 定位），非触屏保持隐藏
2. 触屏按下时底座转为不透明/高亮，`pointerup` 后恢复半透明常驻（不再 display:none）
3. `.joystick-base` 增加常驻态样式：fixed 右下角（right:16px bottom:16px）、半透明背景、`opacity 0.35`；`.active` 类时 opacity 1

### 批次 6：小地图 / 赛道进度指示器（P1）

**Files:**
- Create: `src/ui/minimap.ts`
- Modify: `index.html` — `#hud` 内加 `<canvas id="hud-minimap">`
- Modify: `src/style.css` — 小地图样式
- Modify: `src/game/game-loop.ts` — frame 中更新小地图

**Changes:**
1. `src/ui/minimap.ts`：`Minimap` 类，构造时接收 `TrackContext`，预计算轨迹点（每 10 段取一点，累计 curve 转角生成路径），归一化到画布（约 110×110px）
2. `update(cameraZ)`：绘制半透明背景圆角、赛道轨迹线、起点标记、玩家当前位置点（`cameraZ % lapLength` 定位）
3. `index.html`：`#hud` 容器内（`#challenge-score` 之后）添加 `<canvas id="hud-minimap" width="110" height="110"></canvas>`，默认 hidden
4. `game-loop.ts`：构造器新建 Minimap（需 trackContext）；frame 的 HUD 更新块中，单屏/热座/挑战 RACING 阶段显示并 `update(player1.cameraZ)`；分屏模式隐藏（避免与 hud2 布局冲突）；`applyPhase` 退出 RACING 时隐藏

### 批次 7：天气交互化 + 起终点线（P2）

**Files:**
- Modify: `src/engine/renderer.ts`
- Modify: `tests/unit/renderer-state.test.ts`（如断言涉及绘制顺序需同步）

**Changes — 天气交互（全部收在 renderer.ts 内）：**
1. `buildRainCanvas`：雨丝预渲染改为固定 15° 倾斜（风向感），线长/透明度微调
2. 雨天路面：`renderWithOpts` 逐段循环中，`raining` 时每段路面叠加暗色（`rgba(10,15,30,0.15)`），近处段（k 小）叠加中心高光条（半透明白细长条），营造湿滑反光
3. 雨天天空：微调 `lighting.ts` 雨天色板（可选，若改动量小则包含）

**Changes — 起终点线（renderer.ts）：**
4. 逐段循环中，`wrappedIndex = (baseIndex + k) % track.length === 0` 且 `k < 40`（近处）时，在该段路面绘制黑白棋盘格横条（沿该段左右边缘投影，每段 16 格交替），作为起点线

**验证：** 每批次后 `typecheck + lint + test`；全部完成后 `npm run bot` + 截图对比（菜单/竞赛/雨天/起点处）

---

*第一批计划创建时间：2026-08-03；遗留项批次追加：2026-08-03*
