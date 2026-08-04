# AI-Racing-Games 运行时实测与问题归纳报告

## 执行摘要

本报告基于 agent-browser（Chrome/CDP headless 自动化）在 1280×720 桌面视口与 812×375 移动端横屏、375×667 移动端竖屏三种配置下对游戏全流程的实测，覆盖单屏比赛、分屏双玩家、热座轮流、漂移挑战四种游玩模式，共采集 22 张关键截图归档于 `.codebuddy/screenshots/`。实测发现 **1 个严重全局渲染 bug**（天空密集黑色条纹）、**1 个核心可玩性 bug**（热座 P2 回合画面与 HUD 全部冻结在 P1 状态）、**3 类视觉一致性问题**（菜单红色光晕遮挡结算/赛道选择、移动端横屏标题叠影与按钮截断、雨天高速时 HUD 时间数字淡灰不易辨识）、**1 个 UX 文案不一致**（操作提示"Shift 漂移"在 drift.ts 自动蓄力机制下不成立）、以及若干边缘数值问题（LAP 2/3 圈速异常短）。其中热座 P2 bug 已定位至 `src/game/frame-render.ts` 第 103-110 行 `else` 单屏分支永远渲染 `race.player1` 与 `src/ui/hud.ts` 第 88-90 行同样永远读取 `race.player1`——M15 模式策略重构遗漏了对"热座单屏下数据源应随 hotseatPlayer 切换"的处理，是 mode-strategy 工厂未能完全隔离模式差异的核心证据。

## 一、测试方法与环境

### 1.1 工具栈

工具：agent-browser 0.26.0（Chrome/CDP headless），用于页面打开、元素快照、截图、视口切换；agent-browser eval 注入 JS，用于派发键盘事件、读取 window.__gameDebug 调试钩子（game-loop.ts 的 debug-hook.ts 暴露 19 个 getter）、查询 DOM 文本；PowerShell Copy-Item 用于将 agent-browser 临时目录截图归档至工作区 `.codebuddy/screenshots/`。

### 1.2 测试配置

桌面单屏 1280×720 默认 URL；桌面分屏 1280×720 加 `?split=1` 参数（P1/P2 同赛道 1）；桌面挑战 1280×720 加 `?challenge=1`；桌面热座 1280×720 加 `?hotseat=1`；移动端竖屏 375×667 加 `?hotseat=1`（强制旋转锁定）；移动端横屏 812×375 加 `?hotseat=1`。

### 1.3 关键限制

agent-browser 通过 `dispatchEvent(new KeyboardEvent(...))` 派发到 window 的方式模拟按键，与原生键盘事件存在差异：浏览器进程隔离导致原生 keydown w（按住）在工具内无法长按生效，因此加速与漂移测试均通过 JS 直接派发。同时 `keydown w` 不会自动 keyup，会持续保持 W 按下状态——这导致部分画面里"车一直加速"的现象与测试方法有关，需在阅读时区分。

## 二、截图清单（22 张归档于 `.codebuddy/screenshots/`）

01-menu.png 桌面默认菜单，中央红色光晕遮挡赛道 5/6；02-game-racing.png 桌面单屏开局，速度 0 km/h、LAP 1/3、天空已有伪影；03-game-accel.png 加速失败测试，W 键未生效（agent-browser 限制），speed=0 但路面滚动；05-high-speed.png 高速 320 km/h，天空密集黑色条纹伪影、雨丝效果；06-coast.png LAP 3/3 末段，天空伪影持续、车流稀疏；07-paused.png 单屏完赛结算，红色光晕遮挡结算面板、分数脱出面板外；08-pause-menu.png 暂停菜单，PAUSED、音量/音乐/音效三 slider 正常；09-split-menu.png 分屏菜单，P1（绿）/P2 当前选中赛道显示；10-split-game.png 分屏双世界，左右独立赛道独立车独立 HUD；11-challenge-start.png 挑战模式菜单，与单屏菜单共用同一布局；12-challenge-game.png 挑战倒计时，"1" 倒数、操作提示"Shift 漂移"；13-challenge-playing.png 挑战中（车未加速），剩余 27.5s、得分 0；14-challenge-drift.png 漂移，漂移得分 53、剩余 8.4s 变红；15-challenge-active.png 挑战高速，速度 320、剩余 39.4s、得分 0；16-challenge-turning.png 弯道偏航，车已驶出路面，HUD LAP 2/3 红色倒计时；17-challenge-finish.png 挑战结算，"挑战结束/漂移榜第 1 名/53 分未达标/NEW DRIFT RECORD"；18-menu-with-records.png 有存档的菜单，漂移榜 "1. P1 · 53 分 · 经典赛道" 写入正确；19-hotseat-menu-mobile.png 移动竖屏，"请旋转设备" 强制横屏提示；20-hotseat-landscape.png 移动横屏，标题"像素狂飙"叠影、底部按钮截断；21-hotseat-p1.png 热座 P1 回合，"P1 驾驶中" 标签显示正确；22-hotseat-p1-finish.png 热座 P1 完赛，红色光晕遮挡结算面板、显示"按回车，P2 开始"；23-hotseat-p2-bug.png 热座 P2 回合 bug，HUD 仍显示"P1 驾驶中"、LAP 3/3、时间 1:40.348（冻结）。

## 三、严重 Bug：天空密集黑色条纹伪影（全局、持续、可量化复现）

### 3.1 现象

在所有游戏内场景（菜单预览、单屏比赛、分屏双世界、挑战、热座）的天空区域都观察到密集的"瀑布流"样式黑色细竖线条纹。在 05-high-speed.png、06-coast.png、16-challenge-turning.png 三张截图里尤为严重，几乎遮蔽了地平线以上的整个天空。

### 3.2 根因（已实测确认）

经浏览器内复现验证，问题出在 `src/engine/scenery.ts` 第 16-38 行 `generateMountainProfile` 的频率参数：

```
const freq = ((Math.PI * 2) / width) * (i + 1) * (1 + random() * 0.5)
```

其中 `random() * 0.5` 区间为 [0, 0.5]，使 freq 最高可达基频的 1.5 倍。在 width=1280 默认值下，3 层叠加的 sin 在某些 seed 下会进入高频震荡。

实测：将该公式搬到浏览器内运行 1280 个点，相邻像素差 maxDelta = **0.9758**（接近满量程 1.0）。期望的山脊轮廓相邻像素差应 < 0.05。当 maxDelta ≈ 1 时，山脊在 `renderMountainOffscreen`（`src/engine/renderer.ts` 第 106-125 行）的 `ctx.lineTo(x, height - value * height)` 中每像素都从最高跳到最低、再跳回最高，渲染为密集竖线条纹。

`renderer.ts` 第 116-118 行的注释 "P3 天空条纹"已记录该项目曾经修复过类似问题，但当前修复不充分（仅修了双幅平铺接缝，未限制 profile 内部频率）。

### 3.3 修复方向

将 `freq = ((Math.PI * 2) / width) * (i + 1) * (1 + random() * 0.5)` 改为固定基频 `freq = ((Math.PI * 2) / width) * (i + 1)`（去掉随机倍数）；或对 profile 数组加 box filter 移动平均；或在 lineTo 前做最大频率 clamp（如 `(i + 1) <= 8` 限制最高频）。最直接的方案是限制最高 freq 到 Nyquist 极限（每像素至多 π 弧度，保证 sin 单调）。

## 四、核心可玩性 Bug：热座 P2 回合画面与 HUD 完全冻结

### 4.1 现象

热座模式下 P1 完赛后按 Enter 交棒到 P2，debug.hotseatPlayer=2 但：HUD 右上角仍显示 "P1 驾驶中"（应为 "P2 驾驶中"）；HUD LAP 仍显示 "LAP 3/3"（P2 应从 LAP 1/3 开始）；HUD 时间仍显示 "1:40.348"（P2 应从 0:00.000 开始）；画面中玩家车位置、车流、路面滚动**完全冻结在 P1 完赛瞬间**。持续 30 秒以上状态不变（23-hotseat-p2-bug.png 取证后查询仍为同样状态）。

### 4.2 根因（代码层定位）

两处遗漏，构成 M15 模式策略重构不完整的核心证据：

**第一处**：`src/game/frame-render.ts` 第 103-110 行，单屏（非分屏非菜单）渲染分支：

```
} else {
  renderer.setCameraX(race.player1.carState.position)
  renderer.render(race.player1.cameraZ, race.player1.driftState.smoke, race.player1.raceTime, viewFor(race.tracks[0], ...))
}
```

单屏分支永远读取 race.player1，未根据 hotseatMode+hotseatPlayer 切换到 player2。热座 P2 回合时画面永远显示 player1 的状态。

**第二处**：`src/ui/hud.ts` 第 88-90 行：

```
elements.hudSpeed.textContent = formatSpeed(race.player1.carState.speed, ...)
elements.hudLap.textContent = formatLap(lapFromZ(race.player1.cameraZ, tracks[0].lapLength), ...)
elements.hudTime.textContent = formatTime(race.player1.raceTime)
```

HUD 也永远读取 race.player1。`hudPlayerTag` 的 hotseatPlayer 参数需要 `this.mode.hotseatMode` 为 true 才会被传入 frame-render 的 ctx，所以是 hotseatMode 链路还是数据源切换链路断裂都需进一步排查（建议在 frame-render.ts:135 添加 console.log 一次性确认）。

**第三处（mode-strategy 的设计假设）**：`src/game/mode-strategy.ts` 第 110-115 行 `updateCurrentHotseatPlayer` 只更新当前回合玩家，另一玩家不更新。这本意是节省物理开销（避免 P1 车辆在 P2 回合被无意义推进），但与 frame-render 单屏分支硬编码渲染 player1 矛盾——结果是 P2 物理输入被处理（player2 被更新），但画面显示 player1 的冻结状态。

### 4.3 修复方向

在 `frame-render.ts` 的单屏 else 分支与 `hud.ts` 的 HUD 更新前增加 activePlayer 代理：

```
const activePlayer = hotseatMode && hotseatPlayer === 2 ? race.player2 : race.player1
const activeTrack = hotseatMode && hotseatPlayer === 2 ? tracks[1] : tracks[0]
```

随后所有 player1 引用改为 activePlayer、tracks[0] 改为 activeTrack。`updateHud` 的 hotseatPlayer 参数也需要确保能从 ctx 透传（验证 `frame-render.ts:135` 实际拿到的值）。

### 4.4 严重程度

这是热座模式的可玩性核心 bug——热座 P2 回合实际上无法被游玩（P2 输入的 W/A/S/D 不会反映到画面上、不会推进物理、不会触发完赛判定）。意味着热座模式从功能上是半残的。

## 五、视觉一致性问题：菜单红色光晕遮挡核心交互区

### 5.1 现象

菜单与结算页面的中央都存在一个**橙红色径向光晕**（约 260×260 px 圆形），位置 `bottom: 32%`，覆盖：菜单页面：覆盖赛道 5/6/8 三张赛道选择卡片的核心内容（峡谷疾驰被红光完全吞没）；结算页面：覆盖整个结算面板内容，导致 "挑战漂移得分 X · 未达标" 等关键文字**脱出面板下方**显示。

### 5.2 根因

`src/style.css` 第 436-447 行 `.menu-sun` 元素：

```
.menu-sun {
  position: absolute;
  left: 50%; bottom: 32%;
  width: min(40vw, 260px); height: min(40vw, 260px);
  border-radius: 50%;
  background: radial-gradient(circle, #ffeb3b 0%, #ff3864 50%, rgba(255, 56, 100, 0) 70%);
  box-shadow: 0 0 80px 20px rgba(255, 56, 100, 0.4);
  animation: sun-pulse 4s ease-in-out infinite alternate;
}
```

`box-shadow` 80px+20px 模糊半径与 `radial-gradient` 三段色 + `animation: sun-pulse` 4s 缩放叠加，造成一个脉动呼吸的红黄色光球，落在屏幕中央偏下——刚好覆盖赛道选择 3×3 网格的中下区域。

注释显示这是 M15 菜单动画升级时添加的（`.menu-bg` 多层背景、`.title-main/.title-stroke/.title-glow` 同批引入）。设计意图应该是营造"霓虹日落"远景氛围，但位置选择不当——日出/日落应在视觉水平线附近（屏幕下沿），而非中央偏下。

### 5.3 修复方向

将 `.menu-sun` 的 `bottom: 32%` 改为 `bottom: 5%`（贴近地平线），同时减小 `width/height` 至 `min(20vw, 140px)` 与 `box-shadow` 模糊半径至 `0 0 40px 10px`，避免与赛道卡片视觉冲突。或在赛道选择卡片背景层加一层 `backdrop-filter: blur(8px)` 隔离光晕透出。

## 六、移动端适配问题

### 6.1 竖屏强制横屏（设计取舍，但体验欠佳）

移动端竖屏（375×667）时显示"请旋转设备，横屏才能获得最佳驾驶体验"的全屏遮罩——这是合理的设计。但背景仍能透出菜单赛道选择卡片（半透明遮罩），给用户"既看到又不能操作"的认知冲突。建议给遮罩背景加 `backdrop-filter: blur(20px)` 强化"暂停锁定"语义。

### 6.2 横屏下严重视觉问题（812×375）

20-hotseat-landscape.png 显示三处严重问题：

**标题叠影**："像素狂飙"金色标题与下方的 "经典街机竞速·伪3D 复刻" 副标题**字体重叠**，肉眼可见两行文字交错错位——字号按桌面端硬编码，移动端高度下排版失败。

**底部按钮截断**："开始游戏"按钮完全在视口外，需滚动才能看到。但 viewport meta 已设置 `user-scalable=no`，移动用户无法缩放查看。

**赛道卡片过挤**：3×3 网格在 812×375 下，每个卡片宽度仅 260px 左右，"X 弯挑战"等 5 字以上名称显示为截断或换行。

### 6.3 修复方向

标题使用 `clamp(min, fluid, max)` 流式字号（如 `font-size: clamp(2rem, 8vw, 5rem)`）；按钮与底部状态使用 `position: sticky; bottom: 0`；菜单在横屏高度 < 500px 时自动切换为 2 列布局或折叠赛道选择为轮播。

## 七、UX 文案不一致：操作提示与实际机制不符

### 7.1 现象

挑战模式启动倒计时画面（12-challenge-game.png）显示操作提示：WASD / 方向键 驾驶；空格 氮气加速；**Shift 漂移**。

### 7.2 实际机制

`src/physics/drift.ts` 的 `updateDrift` 是**自动蓄力**进入漂移状态——`high speed + sharp turn` 触发，**没有任何专用按键**。`src/physics/input.ts` 的 `PlayerMapping` 中 WASD/方向键只映射到 steer/throttle/brake，不含 drift 键。README.md 也未列出 Shift 为漂移键。

### 7.3 影响

玩家按 Shift 不会有任何响应，会以为游戏坏了。提示文字与代码行为脱节，是明显的文档/UX 一致性问题。

### 7.4 修复方向

将 "Shift 漂移" 改为 "高速急转自动漂移" 或 "WASD 急转自动触发漂移"——README 也需相应修订为"高速急转自动进入漂移状态"。

## 八、边缘数值与一致性问题

### 8.1 LAP 2/3 圈速异常短

多次完赛结算显示 LAP 2/3 圈速几乎恒定在 15.3 秒，与 LAP 1 的 1:09-1:31 严重不成比例（02-game-racing 完赛时 LAP 1: 1:31.673, LAP 2: 0:15.333, LAP 3: 0:15.333；22-hotseat-p1-finish LAP 1: 1:09.690, LAP 2: 0:15.333, LAP 3: 0:15.335）。

可能原因：车流碰撞导致减速堆积 → 圈速变短；或 lapTimes 累计算法在高速碰撞时未正确累加；或 round-trip 经过起点线时 z 差计算异常。重现条件：玩家持续撞 NPC 不转弯。属于弱问题，但反映了边界情况下的计数器鲁棒性。建议在 `tests/unit/` 中新增"高速碰撞 + 偏航"场景的 lapTimes 断言。

### 8.2 高速时 HUD 时间数字淡灰

在 320 km/h 高速截图（05-high-speed.png、15-challenge-active.png）中，HUD 的 km/h 单位文字与数字对比度较低（浅灰色 #aaa 左右），长时间观看对眼睛略吃力。整体可读性可优化。建议数字色值提升到 `#fff` 或 `#e0e0e0`。

### 8.3 雨滴效果与天空伪影视觉混淆

雨天时雨滴的白色斜线 + 天空密集黑色条纹叠加，在高速画面里视觉信息过载。建议雨滴颜色饱和度降低或线条变细，避免与天空 bug 叠加产生"双层噪声"。

## 九、按优先级排序的修复建议

P0 严重度（必须立即修复）：天空密集黑色条纹（scenery.ts），修复成本低（限制 freq 随机倍数）；热座 P2 回合渲染冻结（frame-render.ts + hud.ts），修复成本中（activePlayer 代理重构）。

P1 中等（影响一致性/可用性）：菜单红色光晕遮挡结算/赛道卡片（修复成本低，CSS 位置调整）；移动端横屏标题叠影 + 按钮截断（修复成本中，响应式布局）。

P2 较低（细节打磨）：操作提示"Shift 漂移"与机制不符（修复成本极低，改 1 行文案）；LAP 2/3 圈速异常短（修复成本中，lapTimes 累加逻辑）。

P3 边缘优化：高速 HUD 颜色对比度（修复成本极低，CSS）；雨滴 + 天空 bug 视觉叠加（修复成本低，待 P0 修复后观察）。

## 十、代码与测试建议

1. **针对热座 P2 bug**：在 `tests/unit/mode-strategy.test.ts` 与 `tests/integration/` 中新增"热座 P2 回合数据源"用例——断言 frame-render 调用时 activePlayer 在 hotseatPlayer=2 时为 player2。这是 M15 重构遗漏的回归锚点缺失。
2. **针对天空条纹**：在 `tests/unit/scenery.test.ts` 中新增 maxDelta 断言（相邻像素差 < 0.05），防止高频 profile 回归。
3. **针对菜单光晕**：将 `.menu-sun` 位置参数化为 CSS 变量，添加 Playwright 截图回归对比。
4. **针对移动端**：在 CI 中加入 viewport=812×375 截图测试。
5. **针对 UX 文案**：把操作提示文本抽到 `src/ui/screens.ts` 常量，与 README.md 操作说明建立映射测试。

## 十一、结论与下一步

AI-Racing-Games 在桌面端四种游玩模式的核心机制均可工作（菜单、单屏比赛、暂停/结算、分屏双世界、挑战计时、热座 P1 回合），存档读写与榜单持久化正确（`#drift-top` 写入 53 分漂移记录），工程化基础设施（CSS 动画、HUD、音频）完整度高。但存在两处必须修复的严重 bug：**scenery.ts 频率震荡导致全局天空条纹**与**M15 模式策略重构遗漏导致热座 P2 回合不可玩**。前者是单个函数的频率参数回归（`renderer.ts` 中"P3 天空条纹"注释表明曾经修复），后者是 mode-strategy 工厂未完全隔离单屏热座模式的数据源切换（与 frame-render 单屏 else 分支硬编码 player1 矛盾）。这两处 bug 的修复可分别在 < 50 行代码内完成，且建议同步补全单测断言（scenery maxDelta + mode-strategy activePlayer），防止 M15/M16 后续重构再次回归。

视觉一致性方面，菜单红色光晕与移动端横屏适配属于已记录（M15 菜单动画升级）的设计取舍瑕疵，需小幅调整参数即可。UX 文案漂移（"Shift 漂移"）属于文档与代码脱节，建议把提示文本与 README 操作说明建立共同来源（如 `src/ui/screens.ts` 常量 + 单元测试）。整体而言，本次实测确认了"测试门禁完整 + 运行时仍有可发现 bug"的典型现状——593 用例与 bot 9 赛道矩阵保证了核心玩法正确，但 UI 渲染、模式策略边界、视觉一致性、响应式适配这些"非功能需求"领域仍是手工与视觉验证的盲区，建议下一个里程碑（M16）增加 Playwright 视觉回归 + 移动端视口截图测试。

## 十二、局限性

本报告基于单次浏览器自动化会话的截图取证，未进行：性能指标采样（FPS、CPU、内存）；多分辨率系统性对比（仅测 1280×720/812×375/375×667 三个尺寸）；多次重现验证（部分 bug 如 LAP 2/3 圈速异常仅在碰撞偏航特定路径下出现）；音频实际播放（WebAudio 在 headless 环境有降级路径）；PWA 离线实际功能；移动端真实触屏（headless 无 PointerEvent 模拟）。

## 十三、参考资料

[.codebuddy/screenshots/01-menu.png](.codebuddy/screenshots/01-menu.png)（菜单视觉基线）
[.codebuddy/screenshots/05-high-speed.png](.codebuddy/screenshots/05-high-speed.png)（天空伪影典型样本）
[.codebuddy/screenshots/16-challenge-turning.png](.codebuddy/screenshots/16-challenge-turning.png)（天空伪影最严重一帧）
[.codebuddy/screenshots/20-hotseat-landscape.png](.codebuddy/screenshots/20-hotseat-landscape.png)（移动端横屏问题集合）
[.codebuddy/screenshots/22-hotseat-p1-finish.png](.codebuddy/screenshots/22-hotseat-p1-finish.png)（结算光晕遮挡）
[.codebuddy/screenshots/23-hotseat-p2-bug.png](.codebuddy/screenshots/23-hotseat-p2-bug.png)（热座 P2 回合冻结 bug）

[src/engine/scenery.ts](src/engine/scenery.ts) 第 16-38 行 `generateMountainProfile`（天空条纹 bug 源）
[src/engine/renderer.ts](src/engine/renderer.ts) 第 103-125 行 `renderMountainOffscreen` + 第 116 行 P3 注释
[src/game/frame-render.ts](src/game/frame-render.ts) 第 103-110 行单屏 else 分支（热座 P2 bug 源）
[src/ui/hud.ts](src/ui/hud.ts) 第 88-90 行单屏 HUD 读取（热座 P2 bug 源）
[src/game/mode-strategy.ts](src/game/mode-strategy.ts) 第 110-115 行 `updateCurrentHotseatPlayer`（热座物理更新策略）
[src/game/game-loop.ts](src/game/game-loop.ts) 第 700-710 行热座交棒逻辑
[src/style.css](src/style.css) 第 436-447 行 `.menu-sun` 元素（菜单红色光晕）
[src/physics/drift.ts](src/physics/drift.ts) `updateDrift` 自动蓄力机制（无 Shift 键）
[src/physics/input.ts](src/physics/input.ts) `PlayerMapping`（无 Shift → drift 映射）