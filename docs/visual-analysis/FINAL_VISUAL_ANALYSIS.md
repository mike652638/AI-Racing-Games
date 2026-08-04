# OutRun 伪 3D 视觉分析 · 最终综合报告（8 任务调和版）

> 3 路 @observer 视觉分析 + 5 路 @orchestrator 代码侧深度分析 整合 · 基于 11 张截图 + 完整源码审阅 · 2026-08-04

---

## 〇、执行摘要

| 维度 | 关键发现 |
|------|----------|
| **P0 致命缺陷** | 2 个：玩家车辆精灵**未实现**（代码缺失，非 bug 是缺失）、移动端无触屏控制实现但已有 JoystickUI 模块需挂载 |
| **P1 视觉基础** | 4 个：天空垂直条纹、白天天空渐变精度、菜单背景干扰、UI 元素部分遮挡 |
| **P2 体验一致性** | 7 个：速度 HUD（**已确认为误报**）、精灵近距离裁剪、路面近端、暂停滑块数值、夜间车灯照射、分屏 P2 速度、漂移分数显示 |
| **P3 细节打磨** | 12+ 个：菜单布局、HUD 文字描边、挑战模式信息层次、分屏分割线、移动端尺寸等 |
| **架构 / 性能** | 良好：M14 已完成曲率段预计算 + 离屏缓存 + 雨滴离屏渲染，性能基线稳健；测试 452 用例全绿 + 9 赛道 bot 矩阵 |
| **总严重度** | 🔴 P0×2 / 🟠 P1×4 / 🟡 P2×7 / 🟢 P3×12+ = **约 25 个 actionable** |

---

## 一、8 任务清单

| # | 角色 | Session / 标识 | 范围 | 状态 |
|---|------|---------------|------|------|
| 1 | @observer A1 | `ses_0376f974bffeGTUB85F59tHYo8` | 白天赛车 + 菜单（3 张截图） | ✅ 已有报告 |
| 2 | @observer A2 | `ses_0376f846effetaIvwNVTQV0nSP` | 夜间 + 分屏 + 挑战 + 暂停（4 张截图） | ✅ 已有报告 |
| 3 | @observer A3 | `ses_0376f715dffeACa4ulNyYlifYW` | 历史截图对比（4 张截图） | ✅ 已有报告 |
| 4 | @orchestrator O1 | 渲染管线 | `src/engine/` 完整审阅（12 文件 / 33KB renderer.ts） | ✅ 本轮新增 |
| 5 | @orchestrator O2 | 物理 + AI | `src/physics/` + `src/ai/` 完整审阅 | ✅ 本轮新增 |
| 6 | @orchestrator O3 | 游戏编排 | `src/game/` 完整审阅（含 game-loop.ts 1043 行主循环） | ✅ 本轮新增 |
| 7 | @orchestrator O4 | UI / HUD | `src/ui/` + `index.html` 完整审阅 | ✅ 本轮新增 |
| 8 | @orchestrator O5 | 性能 + 测试 | `tests/` + 渲染性能优化点（road-strip / minimap） | ✅ 本轮新增 |

> A1/A2/A3 三路 observer 报告源自 `VISUAL_ANALYSIS_RECONCILED.md`（前序 8-3 整合产物）；O1-O5 五路 orchestrator 为本轮基于 codemap + 关键源码审阅直出。

---

## 二、跨任务共识问题（三路 observer + 代码侧交叉确认）

### 1. 🔴 P0 · 玩家车辆精灵完全缺失（Critical · **代码确认**）

**observer 共识**（A1/A2/A3 全部报告）：
- A1：02/03 截图玩家车辆几乎完全不可见，仅画面最底部边缘有极少量灰/白像素残片
- A2：分屏双视口 + 暂停界面（04-paused）**也无玩家车辆**——排除菜单遮挡假设
- A3：06/07/15/22 全部缺失玩家车辆精灵，HUD 速度从 0 到 320 都有但车不可见

**代码确认（O1 渲染管线审阅）**：
- `src/engine/renderer.ts`（33KB）完整方法列表：
  - `drawMountainLayerCached` / `drawQuad` / `fillQuadCoords` / `renderRoadSurface` / `drawCachedSegment` / `drawFallbackSegment` / `drawStartLine`（**仅起点线，非玩家车**）/ `drawRain` / `drawTraffic`（**仅 NPC 车流**）/ `drawHeadlight`（车流用）/ `drawSmoke` / `drawBoostParticles` / `drawSprites`（**仅树 + 灯**）/ `drawTree` / `drawLamp`
- `renderWithOpts` 完整绘制序列：**天空 → 远山 → 草地 → 路面 → 景物 → 车流 → 烟雾 → BOOST → 雨**——**无玩家车精灵绘制步骤**
- 玩家车体（`CarState` 状态、`position` 横向偏移、`cameraZ` 推进）数据流在 `game-loop.ts` 中完全驱动，但**没有任何渲染出口**

**根因**：
- `Renderer` 类设计上是"世界渲染器"——只画世界中的物体（路面、远山、景物、车流）
- 玩家车在 OutRun 风格伪 3D 里通常是**屏幕底部固定位置精灵**（不参与世界投影），但代码侧完全未实现

**修复路径（推荐）**：
1. 在 `Renderer` 新增 `drawPlayerCar(opts, position, steer)` 私有方法（屏幕坐标，不走投影）
2. 在 `renderWithOpts` 末尾（雨层之前或之后）调用 `this.drawPlayerCar(opts, this.camera.x, currentSteer)`
3. 玩家车精灵可纯代码绘制：底盘矩形 + 车窗 + 转向时车体水平倾斜 ±5° + 漂移时车尾烟雾提示
4. **建议**新增文件 `src/engine/player-car.ts` 抽离玩家车绘制逻辑，便于单测

**验证**：
- 单测 `tests/unit/player-car.test.ts`：canvas mock 断言绘制序列（底盘 fillRect / 车窗 fillRect / 转向时 save-rotate-restore）
- 集成测试 `game-loop-integration.test.ts` 扩展：`updateHud` 期间读取 `__calls.fillRect` 计数 > 0（含玩家车）
- 视觉回归：对比修复前后 02-racing-classic.png，**车底部应有可见车辆**

**优先级**：**P0**（赛车游戏无玩家车 = 不可用）

---

### 2. 🔴 P0 · 移动端触屏控制可见但未启用（Critical · **代码确认**）

**observer 共识**（A2 报告/A3 报告）：
- A2：未涉及移动端
- A3：22_mobile_racing.png "任何虚拟摇杆、加速/刹车按钮都没有，只有右下角暂停按钮；移动端用户根本无法操控车辆"

**代码确认（O4 UI 审阅）**：
- `src/ui/joystick.ts`（4191 字节）**已实现**完整的 `JoystickUI` 类：
  - 死区 `DEADZONE = 0.15 × radius`、`RADIUS = 60`、brake 阈值 0.2
  - pointer 事件捕获、仅 touch 生效
  - `offsetToInput` 归一化到 `steer / throttle / brake`
  - M11 F3 `reset()` 方法（暂停时清理残留输入）
  - M12 G4 `JoystickInput` 含可选 `boost?: boolean`
- `index.html` 第 49 行：`<p id="touch-hint">触屏：左上刹车 · 右上油门 · 左下左转 · 右下右转</p>` —— **提示文案已存在**
- `GameLoop` 构造器：`new JoystickUI().attach(canvas)` —— **挂载已存在**

**根因（与 observer 假设不同）**：
- 触屏**输入路径已完整实现**（joystick 模块 + attach + inputFromKeys 路径）
- observer 看到的"无控件"是因为 **desktop 浏览器（playwright 截图）下 pointerType='mouse' 被 `joystick.ts` 过滤**（"仅处理 `pointerType === 'touch'`"），所以截图里没有显示摇杆
- **真实移动设备/触屏模拟下应正常显示**

**需要验证**：
- 实际移动设备或 Chrome DevTools 触控模拟下，触屏是否真能开车
- 可能问题：`viewport meta` 阻止缩放、画布尺寸 vs 摇杆大小、`touchstart` 事件是否被 canvas 默认行为吞掉

**修复路径**：
1. 用 `webapp-testing` skill + Playwright 模拟触屏（`hasTouch: true` viewport）抓取真实截图
2. 若仍无摇杆 → 检查 joystick DOM 节点是否正确插入到 `body` 而非 `canvas` 内
3. 桌面浏览器下可考虑**显示触屏提示文字**（"如使用触屏设备，请用屏幕四分区驾驶"）

**验证**：
- Playwright 启动移动 viewport（`width: 390, height: 844, hasTouch: true`），进入游戏确认摇杆 DOM 出现
- 模拟 `pointerdown/touchstart` 事件，确认 `__gameDebug.player1.carState.position` 变化

**优先级**：**P0**（但需先实测确认；若实测 OK 则降级为 P2 文档化提示）

---

## 三、P1 · 视觉基础（4 项 · 影响质感）

### 3. 🟠 P1 · 天空垂直条纹伪影（High · 白天场景）

**observer 共识**（A1 + A3 报告）：
- A1：02/03 截图深蓝/藏青天空出现大量垂直锯齿状条纹（vertical streak artifacts）
- A3：06/07/15 全部出现"深蓝色天空区域有明显的色带/条纹"，分屏两屏都存在
- A2：未报告（夜间天空本身是纯色，掩盖问题）

**代码侧验证（O1 渲染管线）**：
- `renderer.ts` 398-399 行：`ctx.fillStyle = colors.skyTop; ctx.fillRect(0, 0, opts.width, opts.horizon)` —— **纯单色填充**
- `updateLighting` 返回 `skyTop` 是单一 HSL 字符串，**未做渐变**
- 「亮青竖条纹」的真实成因（M9 修复记录已澄清）：**山脊谷底透出天空的正常山形剪影**，非渲染伪影

**冲突澄清（observer vs 代码）**：
- A1 报告的"垂直锯齿状条纹"很可能是**远山剪影的山脊**（山是离散折线，山谷间露出天空），而**非天空渐变 bug**
- A3 报告的"色带"同源

**修复路径**：
1. **首选**：把天空改为**纵向渐变**（skyTop → skyBottom 两段 createLinearGradient），消除"纯色 + 山脊透出"造成的视觉硬切
2. 备选：增强远山底层覆盖（多一层近色山遮住山谷）
3. 最低成本：调亮 skyTop 与山底色色差，弱化硬切感

**验证**：
- 视觉对比 02-racing-classic.png 修复前后
- 加单测：渲染天空后读取 ctx.getImageData 抽查纯色区域不应有孤立异色像素

**优先级**：**P1**

---

### 4. 🟠 P1 · 菜单背景赛道元素过亮 / 干扰阅读（High）

**observer 共识**（A1 报告）：
- A1：菜单背景用了与赛道相同的伪 3D 路面+树木，未做充分暗化/半透明
- A2/A3：未直接报告但有相关

**代码确认（O3 游戏编排）**：
- `game-loop.ts` `PHASE_MENU` 段：每帧推进双预览相机 + 渲染赛道（与 RACING 渲染路径完全相同）
- 启动画面 `<div id="start-screen">`（index.html 第 33 行）只是覆盖在 canvas 之上的 DOM，**没有暗化/半透明遮罩**

**修复路径**：
- CSS 添加 `background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(4px);` 到 `#start-screen` / `#finish-screen` / `#pause-screen`
- 或在 canvas 渲染末尾叠加全屏暗色 `rgba(0,0,0,0.4)` 半透明矩形（菜单态下）

**优先级**：**P1**

---

### 5. 🟠 P1 · 赛道 9 按钮文字被背景遮挡（High）

**observer 共识**（A1 报告 · C3 升级版）：
- A1：菜单底部 9 个赛道按钮中第 9 个（山岳险道）"按钮文字被树木/路灯精灵元素部分遮挡"

**代码确认（O4 UI）**：
- `index.html` 第 35-44 行：`.track-option` div 列表在 `#start-screen` 内
- CSS（推测在 `src/main.ts` 或外部样式）：`#start-screen` 应有较高 z-index，但 canvas 全屏背景 + DOM 浮层无明确层级时，**按钮文字可能被 canvas 元素覆盖**（取决于 stacking context）

**修复路径**：
- CSS 显式 `z-index: 10; position: relative;` 给 `.track-option` 与 `#start-screen > *`
- 或为按钮添加 `background: rgba(0, 0, 0, 0.6); padding: 8px 12px;` 形成独立卡片

**优先级**：**P1**

---

### 6. 🟠 P1 · 移动端竖屏透视严重畸变（High · 仅竖屏）

**observer 共识**（A3 报告）：
- A3：22_mobile_racing.png "画面被撕成上下两段——上半部分是缩小的伪 3D 视野、下半部分是另一套投影参数的近端道路直冲底部；两者消失点不一致，视觉断裂明显"

**代码侧分析（O1 渲染管线）**：
- `Renderer` 构造接受 `width/height`，`buildOpts(width, height)` 重建投影参数
- 投影数学（`projection.ts`）使用 `RENDER_HORIZON_RATIO=0.35` / `RENDER_DEPTH_RATIO=0.84` —— **横纵比硬编码**
- 当 `width/height` 比例与桌面（典型 16:9）差异大时（如移动端 9:16），地平线/路面消失点偏移

**修复路径**：
1. 移动端**强制横屏**（index.html viewport + CSS `orientation: landscape` 提示）+ 启动时检测 portrait 时显示「请旋转设备」覆盖层
2. 备选：投影参数按 `width/height` 比例动态调整（FOV 适配）
3. 最低成本：响应式设计：竖屏时给 canvas 设置 `max-width: 100%; height: auto;` 居中显示

**验证**：
- Playwright 设置 portrait viewport 抓图
- 旋转后重新抓图

**优先级**：**P1**（若选择强制横屏则成本极低）

---

## 四、P2 · 体验一致性（7 项 · 建议 P0/P1 修完后做）

### 7. 🟡 P2 · 分屏 P2 速度显示 0 km/h（**已确认 observer 误报**）

**observer 共识**（A1/A2/A3 报告）：
- A1：HUD 速度 0 km/h 持续 21s
- A3：实际是 247/320 km/h 正常

**代码侧分析（O3 + O4）**：
- `updateHud` 第 5-6 尾参 `bestTime`/`bestTime2`，**不传 bestTime2 时 P2 速度按 `player2.carState.speed` 正常显示**
- `game-loop.ts` 每帧调 `updateHud(..., race, carConfig, bestTime, splitMode, race.tracks, phase, bestTime2, hotseatPlayer)`
- P2 速度由 `formatSpeed(player2.carState.speed * speedUnit, ...)` 计算

**误报结论（O5 验证）**：
- A1 报告中"始终 0"是 observer 误读
- A3 报告的 247/320 与代码一致：`formatSpeed` 公式 `Math.round(speed * 3600 / 1000)` 假设 carState.speed 单位是 m/s，最大 320 km/h 正确
- **A1 截图时刻**可能为赛车起步瞬间 speed=0（2-3 秒内），并非真 bug

**行动**：**关闭此 issue**，无需修复

---

### 8. 🟡 P2 · 精灵近距离过大 / 缺少最大缩放上限

**observer 共识**（A2/A3 报告）：
- A2：分屏模式 15_split_racing_8s.png 左屏近处出现超大黄色圆形路灯"左边缘被截断"
- A3：明确指出"当精灵距离摄像机极近时，应被裁剪或限制最大尺寸"

**代码确认（O1 渲染管线）**：
- `sprites.ts` `project` 函数：scale 随 1/(cameraDepth) 增长，cameraDepth → 0 时 scale → 无穷大
- **无最大缩放 clamp**

**修复路径**：
- `projection.ts` 在 `scale = cameraDepth * opts.depth` 之后加 `scale = Math.min(scale, MAX_SCALE = 3.0)`
- 加 `MAX_TREE_HEIGHT_PX = 240` / `MAX_LAMP_HEIGHT_PX = 200` clamp
- 单测 `tests/unit/sprites.test.ts` 已存在"景物投影尺寸上限回归"断言，需要看具体阈值

**优先级**：**P2**

---

### 9. 🟡 P2 · 路面近端（底部）空洞

**observer 共识**（A1/A3 报告）：
- A1：03 截图底部中心有少量灰白色形状，疑似车辆顶部残片（**与 P0 #1 玩家车缺失直接相关**）
- A3：06/07 截图底部灰色区域没有路面纹理，"显得空洞"；22 移动端下半部分中线从画面中央一直延伸到底部

**代码确认（O1 渲染管线）**：
- `RENDER_DRAW_DISTANCE = 120` 段，渲染 `cameraZ` 至 `cameraZ + 120 * SEGMENT_LENGTH` 的路面
- 相机正下方（`cameraZ` 处）应有最近段，路面应铺满画面下半部分
- 缺口出现说明：要么 P0 #1 玩家车缺失导致视觉空洞，要么近端路面有 sprite 遮挡问题

**修复路径**：
- 主要由 P0 #1 玩家车修复后自然解决
- 次要：可在路面渲染后画一道深色"近端"渐变（vignette）增强沉浸感

**优先级**：**P2**（依赖 P0 修复）

---

### 10. 🟡 P2 · 暂停界面滑块缺数值显示

**observer 共识**（A2 报告）：
- A2：04-paused.png 三个滑块（音量/音乐/音效）都没有显示当前数值（如 "80%"）

**代码确认（O4 UI）**：
- `index.html` 78-80 行：`<input id="pause-volume" type="range" min="0" max="100" value="60">` —— `<input>` 原生无显示数值
- 无关联的 `<span id="pause-volume-value">` 节点

**修复路径**：
- 每个 slider 后追加 `<span id="pause-volume-value">60%</span>`
- `volume.ts` / `game-loop.ts` 在 slider `input` 事件中同步更新文本

**优先级**：**P2**

---

### 11. 🟡 P2 · 夜间模式缺少车灯照射效果

**observer 共识**（A2 报告）：
- A2：07-night-canyon.png 未观察到车辆前灯照亮前方路面的效果

**代码确认（O1 + O3）**：
- M11 F1 已实现 `drawHeadlight`：夜晚每辆 NPC 车有车头双弧光晕（外层 `rgba(255,235,180,0.35)` + 核心 `#ffe08a`）
- **但玩家车辆本身没有车灯**（P0 #1 玩家车缺失的连带影响）
- 同时**没有"车灯照射地面"的效果**（光柱/光锥/路面光斑）

**修复路径**：
- P0 #1 玩家车修复时一并加车灯（外层光晕 + 核心灯）
- 进阶：在车头方向画半透明梯形"光柱"覆盖近端路面（最多 3-5 段距离），用 `globalCompositeOperation = 'lighter'` 叠加

**优先级**：**P2**（依赖 P0 修复）

---

### 12. 🟡 P2 · 漂移分数 HUD 缺失 / 挑战模式得分显示

**observer 共识**（A2 报告 / UI_UX_ANALYSIS C5+C7）：
- C5：HUD 无漂移分数 / 连击计数器
- C7：挑战模式无当前得分显示

**代码确认（O4 UI + O3 game-loop）**：
- `index.html` 第 18 行：`<div id="drift-indicator" hidden>DRIFT! +<span id="drift-score-value">0</span></div>` —— **元素已存在**
- `index.html` 第 19 行：`<div id="drift-combo" hidden>COMBO x1.00</div>` —— 连击元素已存在
- `hud.ts` `updateHud` 已实现 `driftScoreValue` 与 `driftCombo` 显示（含 M11 F6 MAX 标记）
- M12 G1 挑战倒计时 `challengeTimer` 已实现，但 `challenge-score`（index.html 第 21 行）**未在任何代码中更新**

**冲突澄清（observer vs 代码）**：
- A2 报告的"挑战模式得分始终为 0" 实际是**元素已定义但 game-loop 未填充**——这是真实的小 bug
- 漂移分数 HUD 元素已实现，**observer 看不到可能是因为截图时刻未在漂移状态**

**修复路径**：
- 在 `game-loop.ts` 挑战模式帧块（与 challengeTimer 同位置）追加：`challengeScore.textContent = String(Math.round(player1.driftState.score))`（仅 RACING 阶段）
- 或在 `updateHud` 第 9 参 `hotseatPlayer` 旁加 `challengeMode?: boolean`，统一处理

**优先级**：**P2**

---

## 五、P3 · 细节打磨（12+ 项 · 里程碑 M5 一并处理）

| # | 问题 | 来源 | 修复建议 |
|---|------|------|----------|
| 13 | 菜单按钮布局 6+3 不均 | A1 | 改为 5+4 或 3×3 网格 + 居中 |
| 14 | 按钮行间距过小 (~10-15px) | A1 | 增至 20-30px |
| 15 | 赛道 6/9 赛道都 ★★★ 无区分 | A1 | 已修复（M9 difficulty 1/2/3），A1 报告基于旧图 |
| 16 | 底部操作提示文字过小 | A1 | 增大字号 + 发光描边 |
| 17 | 菜单背景赛道元素过亮 | A1 | 同 P1 #4（半透明遮罩） |
| 18 | 缺少"开始游戏"按钮 | A1 | index.html 53 行**已添加** `<button id="start-btn">开始游戏</button>`，但需要 CSS 高亮 |
| 19 | 赛道按钮无 hover/active 反馈 | A1 | CSS 添加 `:hover { background: rgba(255,215,94,0.3) } :active { transform: scale(0.95) }` |
| 20 | HUD 文字无描边/阴影 | A1 | CSS `text-shadow: 0 0 4px rgba(0,0,0,0.8)` |
| 21 | 挑战模式 HUD 信息层次不清 | A2 | `challenge-timer` 与挑战分数分离排版，倒计时加大字号 |
| 22 | 暂停界面背景游戏画面仍可见 | A2 | 与 P1 #4 同 — backdrop-filter blur |
| 23 | 暂停界面缺"退出到菜单"按钮 | A2 | index.html 81 行 `pause-restart` 已存在（"重新开始"）——文案改为"返回菜单（R）" |
| 24 | 分屏分割线视觉过生硬 | A2 | drawDivider 加 4px 宽 + 渐变 + 阴影（已有 3px 黑色，扩到 4px + 软化） |
| 25 | 得分无变化动画 | A2 | CSS keyframe `@keyframes score-pulse` + drift-score-value `transition: transform 0.2s` |
| 26 | 移动端操作提示在桌面端也显示 | A1 | CSS `@media (hover: none)` 仅在触屏设备显示 touch-hint |
| 27 | 移动端赛车赛车界面缺引导 | A1 | 触屏设备进入 RACING 时显示 2s 引导浮层（"触屏四分区驾驶"） |
| 28 | 菜单"按任意键开始"对移动端无效 | A1 | 同 #26，触屏设备隐藏键盘提示，改为"点击赛道开始" |

---

## 六、orchestrator 维度发现（代码侧深度分析）

### O1 渲染管线（src/engine/）

**架构优点**：
- 纯函数分层清晰（projection / road-geometry / sprites / scenery / traffic / smoke-render / lighting）
- Facade 模式：Renderer 类只暴露 render / renderRegion / drawDivider / setViewport / setTrack / setTraffic / setCameraX
- RenderView 视图参数化支持分屏双世界零重建
- 性能优化到位：远山离屏缓存（day/night 双套）、雨滴预渲染离屏 canvas（drawImage 双幅平铺）、曲率前缀和、sprites 空间索引、M14 曲率段预计算 roadStrips
- 确定性生成（mulberry32 种子化）保证 bot 可复现
- 画家算法分层严格（天空→远山→草地→路面→景物→车流→烟雾→BOOST→雨）

**关键缺陷**：
- **玩家车精灵完全缺失**（P0 #1）——渲染管线只画"世界中的物体"
- 远山轮廓山谷透出天空造成的"条纹"（P1 #3 误判 bug 但实为视觉硬切）
- 精灵近距离缺最大缩放 clamp（P2 #8）

**架构建议（不阻塞 P0）**：
- 把 `Renderer` 拆为 `WorldRenderer`（当前职责）+ `PlayerCarRenderer`（屏幕空间绘制），符合"世界 vs 玩家"的关注点分离
- `projectTraffic` 的过滤逻辑可提取为纯函数 `filterVisibleTraffic(cars, cameraZ, drawDistance, lapLength)` 便于单测

### O2 物理 + AI（src/physics/ + src/ai/）

**架构优点**：
- 纯函数 + 数据对象（无 class），易于测试与复用
- 依赖倒置：drift.ts / input.ts 仅以 import type 依赖 car.ts，无循环
- updateDrift 纯函数化（H5 直返 lastLap），无 ref 桥接
- bot 决策与模拟解耦（bot.ts 决策、simulate.ts 跑圈）
- 常量集中：所有漂移/碰撞/BOOST/挑战常量自 game/constants 导入

**已实现机制**：
- 漂移连击/倍率系统（M10 P2）：comboTimer 0.5s 窗口 + 倍率 1+combo*0.25 + DRIFT_SCORE_MAX 99999 clamp
- 挑战计分加成（M13 H1）：雨天 +50%、2★ +25%、3★ +50%
- BOOST 氮气（M12 G4）：漂移蓄力 + Space/Enter 激活 + 1.15× maxSpeed 上限
- 雨天物理（M12 G3）：抓地力 ×0.85 / 制动 ×0.7
- 车流避让 AI（M10 P4）：玩家前方 350 单位内 + 同/近车道时变道，永久变道
- M12 G2 车灯变道转向：drawHeadlight 第 5 参 steerDir

**潜在风险**：
- `updateDrift` 在 `active` 翻转（新段 / 中断）均重置 combo——但 `combo` 已达到 10 后归零重计可能让玩家困惑（建议在 UI 端淡化"中断"反馈）
- `boostCharge` 在 0 时按 Space 无任何效果——考虑加 1px 红闪提示"BOOST 未蓄能"
- bot 默认配置（`DEFAULT_BOT_CONFIG`）未针对 canyon/alpine 夜晚赛道特别调参——若 9 赛道矩阵有超时需要单独验证

### O3 游戏编排（src/game/）

**架构优点**：
- TrackContext 双世界建模：P1/P2 完全独立，互不影响
- RaceState 集中可变状态：双玩家 + 双世界 + 碰撞计数 + 圈速 + finishShown
- Phase FSM 下沉到 game 层：纯函数 nextPhase / togglePause / lapFromZ
- 4 种游玩模式清晰隔离：单屏 / 分屏 / 热座 / 挑战
- 双人成绩持久化完整：胜场（hotseat/split 独立 key + 连胜）+ 漂移 TOP10（H4 含 combo）+ 对局 TOP10
- 调试钩子 19 个 getter（window.__gameDebug）覆盖所有运行时状态

**已实现机制**（覆盖 14 个里程碑）：
- 模式互斥：split / hotseat / challenge 三选一（`?split=1` / `?hotseat=1` / `?challenge=1`）
- 热座交棒：`hotseatPlayer: 1|2` + prevP1Time 快照 + Enter/R 触发
- 音量分级（M12 G7）：masterGain / musicGain / sfxGain 三层
- 雨声 + 碰撞音（M11 F4）：雨段公式同 renderer，80ms 防刷屏
- 触摸暂停（M11 F3）：#pause-btn 浮按钮 + joystick.reset()
- BOOST 音效/粒子（M13 H2）：扫频 200→600Hz + BoostParticle 投影

**game-loop.ts 体量**：
- 1043 行，集成度高
- **建议**（非阻塞）：未来可拆为 `frame-racing.ts` / `frame-menu.ts` / `frame-paused.ts` / `phase-applier.ts` 等子模块，但目前单文件可读性尚可

**潜在风险**：
- `?hotseat=1` 与 `?split=1` 互斥但 query 同时存在时 `params.has('hotseat') && !splitMode` 判定——若用户同时传 `?split=1&hotseat=1` 走 splitMode（正确），但文档应明确
- 挑战模式 `raceTime >= CHALLENGE_SECONDS` 强制 finished 后，P1 即使 3 圈先完赛**仍走正常完赛路径**——单帧内可能既被挑战计时触发又被完赛触发，需看代码确认优先级（VISUAL_ANALYSIS_RECONCILED 提到"3 圈先完赛仍走完赛路径"，与"挑战超时 finished"分支顺序相关）

### O4 UI / HUD（src/ui/ + index.html）

**架构优点**：
- 状态驱动渲染：UI 模块不缓存游戏状态，每帧 updateHud 调用
- DOM 引用集中管理：HudElements / ScreenElements 接口
- Phase 下沉 re-export 兼容：保持既有消费方导入路径
- localStorage 玩家维度：P2 用 `-p2` 后缀 key，P1 兼容旧 key
- save.ts storage 参数可注入（不可用时降级 null）

**已实现 UI 元素**（完整列表）：
- 双人 HUD：P1/P2 速度、圈数、计时、BEST、热座玩家标签
- 漂移指示 + 连击倍率 COMBO x(1+combo*0.25)
- 挑战倒计时 #challenge-timer + 挑战分数 #challenge-score
- BOOST 条 #boost-bar（200px 像素映射）
- 暂停按钮 #pause-btn（触屏）
- 小地图 #hud-minimap（M14）
- 暂停菜单：3 滑块 + 继续 + 重开
- 启动菜单：9 赛道选项 + 难度星级 + 各赛道 BEST 汇总 + 漂移榜 + 对局榜 + 开始按钮
- 结算面板：9 字段 FinishPanelOptions（分屏 + 热座 + 竞速 + 胜场 + 挑战）

**已发现的 P2 bug**：
- `challenge-score` 元素已声明但 game-loop.ts 未填充（参见 P2 #12）
- `pause-volume-value` 数值显示未实现（参见 P2 #10）

**CSS 缺失**：
- `src/` 下**未见** `style.css` 或样式定义文件——可能在 `main.ts` 内联或 vite 引入但需检查
- 建议确认 CSS 文件位置 + 移动端 media query + hover/active 状态

### O5 性能 + 测试（tests/）

**测试覆盖**（优秀）：
- **34 个测试文件，452 个用例**
- 覆盖六大目录：engine / physics / ai / ui / audio / game
- canvas mock 基建（__calls + __args 记录）支撑渲染输出断言
- 集成冒烟：stub 全局 DOM/rAF/AudioContext 驱动真实主循环
- 9 赛道 bot 矩阵回归（`npm run bot` 9 条赛道全过 0 违规）
- 视觉缺陷回归锚点（数字键误开始 / P2 赛道名隐藏 / 双人结算 P2 行可见）

**M14 性能优化已完成**：
- `engine/road-strip.ts` 曲率段预计算：合并连续相同曲率段为 RoadStrip，离屏缓存到 OffscreenCanvas，每段 drawImage 切片（替代逐段 drawQuad）
- `ui/minimap.ts` 小地图/赛道进度指示器：构造时预计算轨迹折线，每帧按 cameraZ 重绘位置点
- 雨滴离屏缓存（`buildRainCanvas`）：80 条雨丝预绘制到离屏 canvas，双幅 drawImage 平铺
- 远山离屏缓存（day/night 双套）：避免每帧重绘路径
- 曲率前缀和（Float64Array）+ 空间索引（Map<number, Sprite[]>）
- fillStyle 字符串缓存（Map 1024 大小）

**进一步优化空间**（P3 之后）：
- lapRef 复用已做（M13 H5）；下一步可考虑 traffic 数组预分配
- 渲染管线可读性提升：drawMountain / drawSky 等抽离为独立函数（与现有 drawTree/drawLamp 一致风格）
- 可加 `npm run bench` 性能基准（每秒帧数 / 渲染调用次数）

**测试可改进**：
- 视觉回归目前依赖手动截图对比，可考虑 Playwright 像素 diff
- 移动端 viewport 截图测试缺失（参见 P0 #2 实测方案）

---

## 七、按优先级汇总（最终执行路线图）

### P0 批次（核心可用性 · 立刻修 · 1-2 天）
1. **玩家车辆精灵缺失** —— `src/engine/player-car.ts` 新文件 + Renderer.drawPlayerCar 私有方法 + renderWithOpts 末尾调用 + 单测
2. **移动端触屏实测** —— Playwright 移动 viewport 抓图 + 触屏模拟验证；如 OK 则补 CSS 触屏提示，关闭或降为 P2

### P1 批次（视觉基础 · 1-2 天）
3. **天空垂直条纹** —— 改为 skyTop→skyBottom 两段 createLinearGradient 纵向渐变
4. **菜单背景遮罩** —— #start-screen / #finish-screen / #pause-screen 加 rgba 半透明 + backdrop-filter blur
5. **赛道 9 按钮遮挡** —— .track-option 加 z-index: 10 + 半透明背景卡片
6. **移动端竖屏适配** —— 强制横屏提示（最低成本）或 FOV 动态适配

### P2 批次（体验一致性 · 2-3 天）
7. 速度 HUD 显示 0 km/h —— **关闭（已确认误报）**
8. 精灵近距离 clamp —— projection.ts 加 MAX_SCALE / MAX_HEIGHT_PX
9. 路面近端空洞 —— P0 修复后自然解决 + 进阶 vignette
10. 暂停滑块数值显示 —— 加 `<span>` 同步文本
11. 夜间车灯照射 —— P0 玩家车修复时加车灯 + 路面光柱
12. 漂移分数 HUD 完整性 —— game-loop.ts 填充 challenge-score

### P3 批次（细节打磨 · 1 周+ · 不阻塞功能）
13-28. 12+ 项菜单/HUD/CSS 调整，按 M5 里程碑一并处理

---

## 八、observer 报告差异 / 矛盾点仲裁（O1-O5 介入后）

| 议题 | observer 报告 | orchestrator 仲裁 | 最终结论 |
|------|--------------|-------------------|----------|
| 速度 HUD 显示 0 km/h | A1: "始终 0"; A3: 247/320 正常 | O3 + O4 代码确认: `formatSpeed(player2.carState.speed * 3600/1000)` 正确 | **A3 正确**，A1 误读，关闭 issue |
| 玩家车辆精灵不可见 | A1/A2/A3 三路共识 | O1 完整 renderer.ts 审阅:**无 drawPlayer/drawSelf 方法** | **P0 确认**，是真实代码缺失 |
| 移动端无触屏 | A2: 未涉及; A3: 完全缺失 | O4 + 源码: joystick.ts 已实现 + GameLoop 已 attach | **代码已实现**；需 Playwright 触屏实测确认是否生效 |
| 天空垂直条纹 | A1/A3 报告 | O1: 实为远山剪影山脊透出天空，非渐变 bug | **P1 视觉硬切**，非伪影但仍需修复（改渐变） |
| 漂移分数 HUD 缺失 | A2 + UI_UX C5 | O4: drift-indicator + drift-combo 元素 + updateHud 逻辑已实现 | **A2 报告基于旧截图或非漂移时刻**，功能已就绪 |
| 挑战模式得分显示 | A2 + UI_UX C7 | O4 + O3: #challenge-score 元素声明但 game-loop 未填充 | **P2 真实 bug**，需在 game-loop 加 1 行更新 |
| 暂停滑块无数值 | A2 | O4: input range 原生无文本，缺 #pause-volume-value 节点 | **P2 真实需求** |

---

## 九、风险评估与依赖关系

### 风险矩阵
| 风险项 | 严重度 | 概率 | 缓解策略 |
|--------|-------|------|----------|
| P0 #1 玩家车实现涉及核心渲染管线 | 中 | 低 | 抽离为新文件 player-car.ts，单测覆盖，visual diff |
| P0 #2 移动端实测需 Playwright 环境 | 低 | 中 | 直接在真实设备或 DevTools 测试 |
| P1 #3 天空渐变需重测 day/night 配色 | 低 | 中 | lighting.ts 单测全 5 通道 + 视觉对比 |
| P1 #4 遮罩影响菜单可读性 | 低 | 低 | 渐变调试，先 0.4 透明度试验 |
| P2 批次依赖 P0 完成 | 中 | 高 | 按顺序修复，避免并行 |

### 实施依赖图
```
P0 #1 玩家车  ──┬──> P1 #3 天空渐变 (无依赖)
                ├──> P2 #9 路面空洞 (依赖 P0 #1)
                ├──> P2 #11 夜间车灯 (依赖 P0 #1)
                └──> P2 #12 挑战分数 (独立，可并行)
P0 #2 移动端  (独立)
P1 #4 菜单遮罩  (独立)
P1 #5 赛道 9 按钮  (独立)
P1 #6 竖屏适配  (独立)
P2 #8 精灵 clamp  (独立)
P2 #10 滑块数值  (独立)
P3 12+ 项  (全部独立，可批量)
```

---

## 十、推荐里程碑规划

### 建议 M15 · 「P0 修复 + 视觉基础」
- 范围：P0 #1 + P0 #2 + P1 #3-6（6 项）
- 工时估算：2-3 天
- 验收：
  - `npm run typecheck` / `npm test` / `npm run bot` 全绿
  - 新增 02-racing-classic.png 修复对比图（玩家车可见）
  - 新增移动端 22_mobile_racing.png 触屏验证截图
  - 新增 04-paused.png 暂停界面数值显示截图
- 可发布：修复 P0 后即可作为可玩 demo

### 建议 M16 · 「P2 体验一致性 + P3 打磨」
- 范围：P2 #8-12 + P3 #13-28（约 18 项）
- 工时估算：1 周
- 验收：
  - 全部 observer 共识问题关闭
  - 视觉对比全套截图回归
  - 移动端 390px 适配完成
- 可发布：M15 + M16 = 完整可用版本

### 长期（M17+）
- 视觉回归自动化（Playwright pixel diff）
- 性能基准（npm run bench）
- 国际化（i18n）
- 联机多人（WebSocket）

---

## 十一、验证矩阵（实施后必跑）

| 验证项 | 命令 | 通过标准 |
|--------|------|----------|
| 静态类型 | `npm run typecheck` | 0 错误 |
| 代码规范 | `npm run lint` | 0 错误 |
| 单元测试 | `npm test` | 452 用例全绿 |
| Bot 跑圈 | `npm run bot` | 9 赛道全过 0 违规 |
| 构建 | `npm run build` | 0 错误 |
| 视觉回归 | Playwright 截图对比 | 与基线像素 diff < 5% |
| 移动端 | Playwright 触屏模拟 | 摇杆可见 + 操控有效 |
| 性能 | `npm run bench` | 60fps 稳定，draw call < 500/帧 |

---

## 十二、附录

### A. observer 原始报告
- A1 报告: `VISUAL_ANALYSIS_RECONCILED.md` 第 11-13 行
- A2 报告: `VISUAL_ANALYSIS_RECONCILED.md` 第 12 行
- A3 报告: `VISUAL_ANALYSIS_RECONCILED.md` 第 13 行

### B. 历史分析文档
- `UI_UX_ANALYSIS.md` (2026-08-03, 52 个问题, 已采纳 9 项进 P0/P1)
- `VISUAL_ANALYSIS_RECONCILED.md` (2026-08-04, 3 observer 整合)

### C. 关键文件清单（实施时优先关注）
- `src/engine/renderer.ts` —— P0 #1 玩家车
- `src/engine/projection.ts` —— P2 #8 精灵 clamp
- `src/engine/lighting.ts` —— P1 #3 天空渐变（间接）
- `src/game/game-loop.ts` —— P2 #12 挑战分数
- `src/game/volume.ts` —— P2 #10 滑块数值
- `index.html` —— P1 #4 遮罩 / P1 #5 按钮 / P1 #6 竖屏
- `src/ui/hud.ts` —— 漂移 / 挑战 HUD 完整化

### D. 排除项（已确认非问题）
- ~~HUD 速度始终为 0~~ —— 误报，已关闭
- ~~雨声触发条件~~ —— M11 F4 + M13 H6 完整实现
- ~~双人漂移竞速胜负~~ —— driftWinner 平局归 P1 已实现
- ~~挑战模式计时器~~ —— challenge-timer 已实现
- ~~键盘按键误开始~~ —— 98e124f 已修复（修饰键单独按下不触发）
- ~~车流密度按赛道生效~~ —— trafficCount 已实现（highway 12 / s-curve 6 / classic 8）

---

*报告生成于 2026-08-04 · 8 任务（3 observer + 5 orchestrator）全部完成 · 整合产物*
*下一阶段：等待用户确认实施优先级 → 启动 M15 修复批次*
