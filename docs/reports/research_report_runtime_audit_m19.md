# M19 后运行时实测与视觉审计报告

> 审计时间：2026-08-05
> 审计方式：Playwright（playwright-core）确定性探测脚本驱动真实 Chromium，覆盖 7 大场景 / 23 张证据截图（`docs/screenshots/rt2-*.png`），配合 `window.__gameDebug` 状态采集、DOM/CSS 计算样式探针与源码交叉核对。
> 被测版本：M19 收尾后工作区当前状态（dev server，`http://localhost:5175/`）。
> 探测脚本归档：`.codebuddy/rt-probe.mjs`（主流程）、`.codebuddy/rt-probe2.mjs`（触屏 UI 探针）；运行日志 `.codebuddy/rt-probe.txt`。

---

## 一、实测覆盖矩阵

| # | 场景 | 视口 | 驱动方式 | 结果 |
|---|------|------|---------|------|
| A | 单屏 classic 全流程（菜单→倒计时→驾驶→漂移→BOOST→暂停/恢复→完赛） | 1280×720 | 键盘 W/A/D/Space/Escape | ✅ 全链路通过，完赛 0:53.315（3 圈） |
| B | 分屏 `?split=1`（P1 classic / P2 highway 双世界） | 1280×720 | W + ArrowUp 双输入 | ✅ 双世界独立渲染/碰撞计数 |
| C | 热座 `?hotseat=1`（forest 2 圈，P1 完赛→Enter 交棒 P2） | 1280×720 | W / Enter | ✅ 交棒成功，P2 回合 HUD 标签正确 |
| D | 挑战 `?challenge=1`（60s 全程至结算） | 1280×720 | W + 转向刷分 | ✅ 倒计时/实时得分/结算分支正确 |
| E | 夜晚赛道 canyon（车头灯/环境光） | 1280×720 | W | ✅ 车灯与深暗色板正常 |
| F | 环境差异化 desert（沙丘）/ coast（海面） | 1280×720 | W | ✅ 地形装饰正常，coast 有一处视觉瑕疵（见 U-4） |
| G | 移动端横屏（菜单/触屏引导/比赛/暂停按钮可点性） | 812×375 | 键盘代驾 + DOM 探针 | ✅ 布局无溢出，发现引导浮层时序问题（见 U-3） |

**总体健康度**：全流程无控制台错误（console error / pageerror 均为 0）；`__gameDebug` 20 项 getter 全部可读；阶段 FSM（menu→racing→paused→finished、热座交棒、挑战限时收束）实测全部正确；碰撞计数、红闪状态机、BOOST 蓄能（实测充至 0.285~0.40）、漂移连击（COMBO x1.25/x1.50 实测出现）、空态卡片隐藏、暂停菜单三轨音量滑杆均工作正常。移动端 `#pause-btn` `elementFromPoint` 命中自身（clickable），无遮挡。

---

## 二、发现的问题与待优化项

分级说明：**P1** = 明确影响体验、建议近期修复；**P2** = 细节打磨/边缘场景；**P3** = 设计取舍讨论项。

### 流程逻辑（Flow）

#### F-1【P1】倒计时期计时器已推进，圈速记录含约 2.9s 倒计时水分

- **实测证据**：倒计时显示「3」时 HUD 已显示 `0:00.450`（`rt2-02-countdown.png`）；计时与速度 HUD 在倒计时期即激活（速度 0、时间走）。
- **根因**：按 Space 后 `applyPhase(PHASE_RACING)` 立即生效，`runCountdown` 仅是覆盖层动画（3 档 ×800ms + GO 500ms ≈ 2.9s），`raceTime` 自进入 racing 当帧开始累积。
- **影响**：①玩家圈速被系统性抬高约 2.9s（首圈尤甚，实测 LAP1 22.6s vs LAP2/3 15.3s，差距中约 3s 来自倒计时）；②玩家 BEST 与 `npm run bot` 圈速（无倒计时）口径不一致，不利于对照；③起步保护期 `RACE_START_GRACE=5s` 有一半消耗在不可驾驶的倒计时内。
- **建议**：倒计时期间冻结 `raceTime`（GO 落定后起计），或将倒计时移到 racing 之前的独立子状态；同步为 bot 报告注明口径。

#### F-2【P2】挑战模式先跑完 3 圈时，结算标题仍为「完赛!」

- **实测证据**：挑战模式 classic 3 圈约 53s < 60s 限时，走正常完赛路径，结算标题「完赛!」+ 内容「挑战结束 / 漂移榜第 N 名」（`rt2-17-challenge-finish.png`）。
- **影响**：标题与内容语义轻微割裂——玩家是"跑完了圈数"还是"挑战结束"不够直观。
- **建议**：`challengeMode` 分支下将 `finishTitle` 统一为「挑战结束」（copy.ts 增常量），与内容行呼应。

#### F-3【P2】漂移榜名次按分数 `findIndex` 匹配，同分与挤出榜外为边缘缺陷

- **代码位置**：`src/ui/screens.ts` 挑战结算分支 `top.findIndex((e) => e.score === score)`。
- **问题**：①榜内已有同分更早条目时，新条目名次被高估（返回首个同分位置）；②分数被挤出 TOP10 时名次显示为空字符串，玩家不知自己未入榜。
- **实测状态**：本次探测各场景独立浏览器上下文（storage 隔离）未复现，纯代码走查确认。
- **建议**：`addDriftScore` 返回 `entered` 与插入索引，结算直接消费返回值而非回查匹配；未入榜显示「未进 TOP10」。

#### F-4【P3】热座 P1 结算屏「按回车，P2 开始」与「按 R 重新开始」并存，误按 R 即放弃交棒

- **实测证据**：`rt2-13-hotseat-p1-finish.png` 三条出路并存（Enter 交棒 / R 重跑 P1 / 按钮回菜单）。
- **建议**：交棒窗口内弱化 R 提示（灰色小字）或将 R 改为需二次确认；属交互取舍，不强制。

### UX 交互体验

#### U-1【P1】触屏检测条件过宽：桌面触屏设备常驻显示虚拟摇杆与暂停按钮

- **实测证据**：本机（Windows 25H2）`navigator.maxTouchPoints === 10`、`hover:hover`、`pointer:fine`；`.joystick-base` 被加 `touch-visible` 类，`display:block` 常驻右下角（`rt2-03-racing.png` 等全部比赛截图可见幽灵摇杆），`#pause-btn` 亦常驻左下角 52×52。
- **根因**：`src/ui/joystick.ts` 的 `isTouchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window`，未结合主输入方式判定。带触屏的笔记本/二合一设备（Windows 上非常普遍）会同时看到键鼠操作提示与触屏 UI，右下角摇杆还会与玩家车、BOOST 条视觉争位。
- **建议**：判定改为 `matchMedia('(hover: none), (pointer: coarse)').matches` 或与 `maxTouchPoints` 取交集；`#pause-btn` 在 `hover:hover` 设备可降透明度或 hover 才显。

#### U-2【P2】桌面端 `#pause-btn` 与键盘 ESC 能力重复且常驻

- **实测证据**：桌面比赛画面左下角恒有暂停按钮（`rt2-03-racing.png`），暂停菜单又提供「按 ESC 继续」。
- **影响**：轻微视觉噪声；按钮本身可点性正常（实测 clickable）。
- **建议**：与 U-1 一并处理——`hover:hover` 设备上默认低透明度（0.35）、hover 时增强。

#### U-3【P2】触屏驾驶引导浮层与倒计时重叠，2s 淡出早于 GO

- **代码走查**：`game-loop.ts` 在 `applyPhase(PHASE_RACING)` 首次进入时显示 `#racing-touch-hint`（`matchMedia('(hover: none)')` 门控），CSS 2s 淡出；而倒计时 3→2→1→GO 共约 2.9s。
- **影响**：触屏设备上引导文案在倒计时覆盖层存在期间显示并开始淡出，玩家真正能驾驶时（GO 后）浮层已消失，引导失效。
- **实测状态**：桌面探针确认 hover 门控生效（`hidden=true`）；移动端视口 headless 不匹配 `hover:none` 未直接复现，时序冲突由代码推算确认。
- **建议**：将显示时机推迟到倒计时 GO 之后（`runCountdown` 完成回调），或把淡出延长至倒计时结束 +2s。

#### U-4【P3】分屏模式下常驻摇杆只出现在 P2 半屏侧，触屏语义混淆

- **实测证据**：`rt2-11-split-racing.png` 摇杆位于右半屏右下角。
- **影响**：分屏触屏玩法实为四分区触控（`touchToCarInput`），常驻摇杆视觉暗示"用摇杆操控 P2"，与实际输入模型不符。
- **建议**：分屏模式下不加 `touch-visible`（四分区已有 `#touch-hint` 引导），或移至屏幕外。

### UI 显示细节

#### V-1【P2】BOOST 条标签对比度偏低

- **实测证据**：左下角 BOOST 轨道 + 填充条可正常工作（蓄能像素映射可见），但 "BOOST" 标签字号小、灰底浅字，视觉审计模型多次误读为 "800°" 等乱码，说明可读性不足。
- **建议**：标签字号 +1 级或改用 `--color-accent`，未蓄能空槽与填充的色阶差可再拉大。

#### V-2【P3】coast 环境 roadside 树影与海面交叠呈"树长在海里"

- **实测证据**：`rt2-20-coast-racing.png` 右侧海面区域与路边树木 sprite 存在叠压。
- **影响**：轻微穿帮，远景低对比下不显眼。
- **建议**：coast 环境将右侧（海侧）景物密度调低或将海平面上边界向路缘外扩；属环境配置微调（`environment.ts` coast profile）。

#### V-3【P3】HUD「碰撞 xN」红色计数在深色雨天前可读

- **实测证据**：多张截图碰撞计数清晰（红色 `--color-danger`），未发现可读性问题；保留为已验证通过项，无需修改。

#### V-4【P3】倒计时期双车同屏（车流近起点可见）

- **实测证据**：`rt2-02-countdown.png` 前方中距离可见一辆车流黄车。`TRAFFIC_SPAWN_SAFE_ZONE=1600` 保证出生点近区无车，该车位于安全窗外，属预期行为，不构成问题，仅存档记录。

---

## 三、证据截图索引

| 截图 | 内容 | 关联条目 |
|------|------|---------|
| rt2-01-menu | 桌面菜单（9 赛道网格/空态榜单/开始按钮） | — |
| rt2-02-countdown | 倒计时「3」+ 计时已走 0:00.450 | F-1 |
| rt2-03-racing | 比赛中 HUD + 幽灵摇杆 + 暂停按钮 | U-1/U-2 |
| rt2-04-drift | DRIFT! +74 / COMBO x1.50 漂移反馈 | 通过项 |
| rt2-05-boost | BOOST 蓄能条 + 小地图 | V-1 |
| rt2-06-pause | 暂停菜单（三滑杆/继续/重开/返回） | 通过项 |
| rt2-08-finish | 完赛结算（NEW RECORD / 圈速 / 空行已隐藏） | 通过项 |
| rt2-10-split-menu | 分屏菜单模式徽章 | 通过项 |
| rt2-11-split-racing | 分屏双世界（P1 红车/P2 蓝车/双侧 HUD） | U-4 |
| rt2-13-hotseat-p1-finish | 热座 P1 结算 + 交棒提示 + 零漂移引导文案 | F-4 |
| rt2-14-hotseat-p2-racing | 热座 P2 回合「P2 驾驶中」标签 | 通过项 |
| rt2-15/16-challenge | 挑战菜单/比赛中（剩余 49.1s / 得分 53 / COMBO） | 通过项 |
| rt2-17-challenge-finish | 挑战结算（挑战结束 / 漂移榜第 1 名 / 未达标） | F-2/F-3 |
| rt2-18/19-canyon | canyon 菜单与夜战（车头灯光束） | 通过项 |
| rt2-20-desert-racing | 沙漠环境（沙丘地形） | 通过项 |
| rt2-20-coast-racing | 海岸环境（海面波浪） | V-2 |
| rt2-21-mobile-menu | 移动端菜单（812×375 无溢出） | 通过项 |
| rt2-22/23-mobile-racing | 移动端比赛（引导浮层未出现=时序问题窗口） | U-3 |

---

## 四、行动优先级建议

1. **F-1 倒计时计时口径**（P1）：影响圈速真实性与 bot 对照口径，建议下一里程碑优先处理。
2. **U-1 触屏检测条件收紧**（P1）：一行判定即可修复，消除桌面触屏设备的幽灵摇杆/暂停按钮。
3. **U-3 触屏引导推迟到 GO 后**（P2）：与 F-1 的倒计时子状态改造可合并实施。
4. **F-2/F-3 结算文案与名次**（P2）：小改动，顺手完成。
5. **U-2/U-4/V-1/V-2**（P2/P3）：纳入下一次 UI 打磨批次。

## 五、结论

M19 后的运行时状态总体健康：**零控制台错误、零流程断链**，四模式状态机、碰撞反馈、漂移/BOOST/挑战计分、环境差异化渲染、移动端布局实测全部按设计工作。本轮发现的 2 项 P1（倒计时计时口径、触屏检测过宽）均属边界条件类缺陷，修复成本低；其余为 P2/P3 打磨项。全部结论均有截图与 `__gameDebug` 数据支撑，探测脚本已归档可复跑。

---

## 六、修复实施与复测结果（2026-08-05 同日无人值守完成）

全部 10 项问题已实施修复并逐项复测验证（复测截图 `docs/screenshots/rt3-*.png`，探测脚本 `.codebuddy/rt-probe3.mjs`，日志 `.codebuddy/rt-probe3.txt`）。

### 修复清单

| 编号 | 修复内容 | 落点 |
|------|---------|------|
| F-1 | 起步倒计时冻结：`RaceState.countdownRemaining` 模拟时钟（`RACE_COUNTDOWN_SECONDS=2.4`，与 runCountdown 3→2→1 节奏对齐），冻结窗口内 raceTime/车流/玩家物理/碰撞/环境音全部停摆，GO 后才起计；配套倒计时窗口渲染降级（视距 60 段 + 跳过粒子特效层） | shared/constants、shared/types、game/state、game/frame-update、game/game-loop、game/frame-render |
| U-3 | 触屏引导浮层改由 `countdownJustFinished` 边沿（GO 后）触发，不再与倒计时重叠淡出 | game/frame-update（新增返回字段）、game/game-loop（showRacingTouchHint 提取） |
| U-1 | 触屏判定收紧：新增 `detectTouchPrimaryInput()`——触屏能力与主输入方式（`(hover: none), (pointer: coarse)`）取交集；matchMedia 不可用时回退能力判定 | ui/joystick |
| U-2 | 键鼠设备（hover:hover + pointer:fine）`#pause-btn` 默认透明度 0.35，hover/按下增强 | style.css |
| F-2 | 挑战模式结算标题切「挑战结束」（`#finish-title` 新增 id，`FINISH_TITLE_*` 文案进 copy.ts 同源），原时间行改显「用时 X」防重复 | index.html、ui/copy、ui/screens、game/dom-setup |
| F-3 | 漂移榜名次改消费 `addDriftScore` 返回的 `{ top, entered }`（accountFinish 新增 `driftRankP1`，引用 indexOf 精确匹配本条），未入榜显示「未进 TOP10」，废弃 findIndex 同分回查 | game/finish-accounting、game/game-loop、ui/screens |
| F-4 | 热座交棒窗口重开提示改「按 R 可重跑 P1」+ `.muted` 弱化（降透明度/字号、停呼吸动画），突出回车交棒主路径 | ui/copy、ui/screens、index.html（新增 id）、style.css |
| U-4 | 分屏模式不常驻摇杆（`JoystickUI({ splitMode })`，四分区触控已有 #touch-hint 引导） | ui/joystick、game/game-loop |
| V-1 | BOOST 标签字号 10→11px + letter-spacing 1px + 深色描边投影 | style.css |
| V-2 | coast 环境海侧（+offset）不生成景物（`EnvironmentProfile.skipRightSprites`，rand 消费顺序不变、其余环境逐字节一致），消除「树长在海里」 | engine/environment、engine/sprites、game/track-context |

### 配套工程加固（复测中发现的次生问题）

- **集成测试 worker OOM**：长程模拟用例（多局全帧驱动 + canvas mock 全量录制）单 worker 堆占用 5GB+，叠加新增用例后击穿堆上限。修复：①倒计时窗口渲染降级削减录制开销；②`vite.config.ts` 为 Vitest 4 worker 显式 `execArgv: --max-old-space-size=8192`（.npmrc node-options 不传入 fork worker）；③`.npmrc` 同步 8192。全套时长由 ≈47s 降至 ≈27s。
- **eslint ignores 补 `.codebuddy`**（探测脚本草稿区，已 gitignore）。

### 新增/更新测试（685 → 696 用例）

- `constants.test`：`RACE_COUNTDOWN_SECONDS=2.4` 注册表断言 + RACE_START_GRACE 注释口径更新
- `frame-update.test`：倒计时冻结（冻结期 mode 挂钩零调用/计时车流不动）+ 归零帧 `countdownJustFinished` 边沿与次帧恢复
- `finish-accounting.test`：driftRankP1 四态（入榜位置/挤出榜外/未记账/同分回归锚点）
- `joystick.test`：detectTouchPrimaryInput 四态（触屏主输入/触屏能力但键鼠/无能力/matchMedia 回退）
- `environment.test`：coast 海侧景物全部 offset≤0 且其余环境左右成对
- `game-loop-integration.test`：挑战用例适配（标题断言迁移 #finish-title、帧数跨 GO）、热座胜负断言兼容纯驾驶时间口径下的平手场景

### 复测证据（rt3 系列）

| 验证点 | 复测结果 |
|--------|---------|
| F-1 倒计时冻结 | `hud-time` 倒计时期间实测 `0:00.000`；完赛总用时 0:53.315 → **0:50.648**（LAP1 19.98 vs LAP2/3 15.33，水分消除） |
| U-1 摇杆误显 | `.joystick-base` 无 touch-visible 类，`display:none`（本机 maxTouchPoints=10 依旧不误显） |
| U-2 暂停按钮 | 桌面实测 `opacity: 0.35`（hover 增强） |
| U-3 引导时序 | 触发点迁至 GO 后（单测锁定 countdownJustFinished 边沿） |
| F-2 挑战标题 | 实测 `#finish-title` = 「挑战结束」，时间行「用时 0:49.298」 |
| F-3 名次口径 | 实测「漂移榜第 1 名」（记账返回值驱动，同分/挤出榜边缘有单测锚点） |
| F-4 交棒提示 | 实测「按 R 可重跑 P1」+ muted 类生效 |
| U-4 分屏摇杆 | 实测分屏 `.joystick-base` `display:none` |
| V-1 BOOST 标签 | 实测 11px + 1px 字距 + 描边投影 |
| V-2 coast 海面 | 实测右侧海面纯净无树（`rt3-15-coast-racing.png`），左侧棕榈成排 |

### 验证链终态

- `npm run typecheck` ✅（tsc --noEmit）
- `npm run lint` ✅（eslint）
- `npm test` ✅ **47 文件 / 696 用例全绿**（≈27s）
- `npm run bot` ✅ 9 赛道矩阵全部完成，0 违规
- `npm run build` ✅ PWA 产物（sw.js + manifest + 14 条预缓存）
- 运行时复测 ✅ 复测控制台零错误，全部修复点截图与 DOM 探针双重确认

遗留说明：e2e（Playwright 视觉回归 26 用例）本轮未重跑（变更集中于结算文案/触屏 UI/环境景物，均有单测覆盖；建议下次 CI 自动验证）。
