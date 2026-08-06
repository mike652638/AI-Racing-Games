# AI-Racing-Games 项目规范

OutRun 伪 3D 复刻项目 —— 用于测试 OpenCode Win11 Desktop IDE v1.18.11 长程编程能力极限（主力模型：DeepSeek V4 Flash）。

## 技术栈（已定，不要随意更换）

- TypeScript + Vite（构建与开发服务器）
- Canvas 2D 伪 3D 渲染（不使用 Three.js / WebGL）
- Vitest 单测 + tsx（bot 脚本运行）+ bot 自动跑圈校验（模拟输入、断言圈速与碰撞）
- ESLint（typescript-eslint）+ Prettier（格式化）+ husky/lint-staged（提交前检查）
- vite-plugin-pwa@1.3.0（M15 引入：离线 PWA，generateSW + autoUpdate）

## 验证优先级（必须按此顺序）

1. `npm run typecheck`（tsc --noEmit）
2. `npm run lint`（eslint）
3. `npm test`（vitest run）
4. `npm run build`（vite build）

> 约定：每完成一个里程碑，至少跑通 typecheck + test 再提交。

## 项目结构约定

```
src/
  engine/       # 渲染层：伪3D投影、路面分段/几何、赛道数据（tracks.ts）、景物/精灵/车流/烟雾渲染、road-strip 离屏缓存、光照、环境配置（environment.ts）、玩家车渲染；景物形状（sprite-draw）、屏幕特效（screen-effects）、车流绘制（traffic-draw）、地形装饰（terrain-draw）、道路渲染（road-surface）为 2026-08-05 从 renderer.ts 拆分的关注点模块
  physics/      # 车辆运动学（car）、漂移（drift）、双人按键映射（input）
  game/         # 游戏核心（25 文件）：GameLoop 主循环、帧更新/渲染纯函数、模式策略、结算统计、阶段 FSM、赛道上下文、碰撞、碰撞反馈（collision-feedback.ts）、圈数、音量、TOP 刷新（constants/phase/phase-logic/lap 为 src/shared 的 re-export 兼容层）
  shared/       # 独立共享层（2026-08-05 解环 game↔ui）：常量（constants）、阶段（phase/phase-logic）、圈数（lap）唯一真源，engine/physics/ui 直接导入
  ai/           # bot 决策器（bot）、圈速模拟器（simulate）
  ui/           # HUD（含碰撞计数 hudCollision）、画面（screens）、存档（save）、格式化（format）、文案常量（copy.ts）、触屏摇杆（joystick）、小地图（minimap）（阶段常量/类型直接导入 shared/phase；原 gamestate 兼容层 2026-08-05 已删除）
  audio/        # WebAudio 合成：引擎音效（engine，含漂移摩擦 DriftSound / 胎噪 TireSound / 双层碰撞音 CollisionSound）、背景音乐（music）
tests/
  unit/         # Vitest 单测（48 文件 706 用例；连同 tests/bench 冒烟合计 49 文件 707 用例）
  e2e/          # Playwright 视觉回归（visual.spec.ts，桌面 1280×720 + 移动横屏 812×375 双 project）
  bot/          # bot 跑圈校验脚本（run-bot.ts，9 赛道矩阵）
  __mocks__/    # canvas mock
  helpers/      # 测试辅助（仅测试导出）
docs/           # 计划档案、视觉分析、superpowers plans
```

## 架构要点

- **纯函数领域层**：frame-update / frame-render / finish-accounting / frame-pure 为无副作用纯函数（状态进、状态/渲染指令出），game-loop.ts 仅做编排（938→719 行）；mode-strategy 以策略对象封装单屏/分屏/挑战等模式的差异，避免大 if 分支。
- **常量唯一真源**：src/shared/constants 为全局共享常量层（如 DRIFT_SCORE_MAX、CHALLENGE_TARGET_SCORE；2026-08-05 由 game/constants 提升至独立共享层），engine/physics/ui 均直接导入，game 层保留 re-export 兼容层，无循环初始化问题。
- **确定性生成**：赛道、车流等由确定性随机种子生成，9 赛道 bot 矩阵回归（0 违规）可复现。
- **依赖方向（2026-08-05 已解环）**：原 game↔ui 受限双向环已消除——game/ 对 ui/ 为运行级调用（hud/screens/joystick/save/minimap）；ui/ 对 game/ 仅剩 **import type（RaceState/TrackContext，编译期擦除）**，其运行时依赖（常量 DRIFT_SCORE_MAX、CHALLENGE_TARGET_SCORE 与 phase/phase-logic/lap）已全部提升至 src/shared 并由 ui 直接导入；engine/physics 亦改直接依赖 src/shared/constants。依赖方向单向：engine/physics → shared；ui → shared + physics(type) + game(type only)；game → engine/physics/ui/shared。若未来进一步消除 ui 对 game 的类型级依赖（RaceState/TrackContext 类型提升），可 100% 解耦。

## 里程碑（分阶段推进，每阶段可运行可验证）

1. **M1 渲染骨架**：Canvas 初始化、伪 3D 路面投影（分段条带）、简单直道滚动、60fps 循环（✅ typecheck + test）
2. **M2 车辆物理**：速度/加速度/转向模型、路缘限制、简单碰撞（出界即减速）（✅ typecheck + test）
3. **M3 赛道系统**：弯道生成（分段路点）、视差远山/天空、赛道数据可配置（✅ typecheck + test）
4. **M4 bot 跑圈**：bot 沿路点自动行驶、自动跑圈计时；`npm run bot` 输出圈速与违规报告（✅ typecheck + test + bot 稳定输出）
5. **M5 打磨**：HUD（速度/计时）、音效合成、启动画面、胜利结算、发布构建（✅ typecheck + test + build）
6. **扩展**：平滑弯道（控制点插值）、路边景物（树木/路灯）、漂移系统、双人分屏、最佳圈速存档（✅ typecheck + test）
7. **扩展 2**：车流与碰撞、漂移得分、关卡选单（3 赛道）、chiptune 背景音乐、移动端触控（✅ typecheck + test）
8. **M6-M7**：GameLoop 重构（DOM/初始化/流程控制/每帧编排下沉 game 层）、阶段 FSM 下沉（✅ typecheck + test）
9. **M8**：双人 HUD 扩展（单屏 P2 BEST、热座玩家标签）、赛道自定义车流密度（✅ typecheck + test）
10. **M9**：9 条赛道 + 难度星级选单、胜场统计、漂移得分 TOP10 排行榜（✅ typecheck + test）
11. **M10**：车流避让 AI、各赛道 BEST 汇总、主音量调节、漂移连击倍率（✅ typecheck + test）
12. **M11**：夜晚赛道（车灯/尾灯）、分屏对局 TOP10、触屏暂停、雨声/碰撞音、雨滴离屏渲染、得分 MAX 标记（✅ typecheck + test）
13. **M12**：挑战模式（60s 限时刷分）、雨天物理、BOOST 氮气、车灯随变道转向、音乐/音效分轨音量（✅ typecheck + test）
14. **M13**：H 系列打磨（挑战计分加成、BOOST 音效与尾焰粒子、漂移连击入榜、lastLap 直返、碰撞音强度、9 赛道 bot 矩阵回归）（✅ typecheck + test + bot 矩阵）
15. **M14**：性能优化（road-strip 曲率段离屏缓存、小地图/赛道进度指示器、死代码清理）（✅ typecheck + test）
16. **M15**：架构重构（game-loop 938→719 行，抽出 mode-strategy 策略对象 / finish-accounting / frame-update / frame-render 纯函数）、漂移摩擦声 DriftSound / 轻量胎噪 TireSound、PWA 离线发布（generateSW + autoUpdate）、菜单/结算动画升级、UI/UX 分析修复、CI 工程化（eslint/prettier/husky/lint-staged）（✅ typecheck + lint + 593 用例 + bot 9 赛道矩阵 0 违规 + build PWA 产物）
17. **M16**：运行时实测修复（天空条纹、热座 P2 渲染/RAF 链、菜单光晕、移动端适配、操作提示与 README 同源 copy.ts、HUD 对比度）、碰撞反馈增强（屏幕红闪 vignette + HUD 碰撞计数 + 双层碰撞音 + 横向弹开防贴车）、道路视觉优化（路面 9 带渐变 + 颗粒噪点 + shadeColor）、帧循环调度纯函数化 shouldScheduleNextFrame、Playwright 视觉回归（`npm run test:e2e`，桌面/移动横屏双 project + CI e2e job）（✅ typecheck + lint + 600→628 用例 + bot 9 赛道矩阵 0 违规 + build PWA + e2e 13 通过）
18. **M17**：环境差异化——TrackDef.environment 字段 + environment.ts 环境配置（9 种环境天空/草地/远山/景物色板）、差异化景物形状（SpriteKind 扩展 cactus/palm/snowpile + rotation 随机化 + 沙漠小仙人掌）、地形扩展（沙漠沙丘/海岸海面波浪/峡谷岩壁锯齿顶线）、远山缓存按环境懒重建（✅ typecheck + lint + 639 用例 + bot 9 赛道矩阵 0 违规 + build PWA + e2e 13 通过）
19. **M18**：UI/UX 深度打磨——可访问性（榜单卡片键盘展开 tabindex/role/aria-expanded + :focus-visible 全覆盖 + ARIA 补全 + prefers-reduced-motion 降级）、颜色令牌化（--color-p1/--color-p2/--color-danger/--color-accent 语义变量替换硬编码 + 死代码清理 + .score-pop 激活）、屏幕切换过渡（暂停/菜单/结算淡入淡出）、反馈增强（碰撞车身边框闪白 collideFlash + HUD 碰撞计数 + BOOST 未蓄能红闪反馈 + 漂移得分回弹动画）、环境渲染细节（MAX_SPRITE_SCALE 近距缩放上限 + canyon 红棕/alpine 冷白车灯 headlightColor + 路缘立体感分隔线/高光条 + 沙漠沙丘 sin 变形/仙人掌明暗/海面波浪漂移）、文案增强（FINISH_DRIFT_HINT/MATCH_EMPTY_HINT/STATS_EMPTY_HINT/RACING_TOUCH_HINT 进 copy.ts 同源）、移动端 RACING 触屏引导浮层（✅ typecheck + lint + 681 用例 + bot 9 赛道矩阵 0 违规 + build PWA + e2e 22 通过）
20. **M19**：潜在改进点收尾——debug 钩子生产剥离（`installDebugSinks` 入口 DEV 门控，19 个状态 getter 闭包生产构建死码消除，dist 实测无 `__gameDebug`）、输入采集去重（`collectSteerInputs(ctx, splitMode)` 纯函数下沉 mode-strategy，与 updateFrame 内 `mode.getInputs` 路由完全同源）、ui/gamestate 纯 re-export 死层删除（hud/screens 直接导入 `shared/phase`）+ tests 导入统一到 shared 真源、e2e 玩法链路扩展（BOOST 漂移蓄能 charge 增长 + 碰撞反馈 HUD 计数显示，双 project）、bot violations ≤ 3 容差与集成长用例 testTimeout 保留为刻意的防御性折衷（实测 0 违规、收紧会降低 CI 鲁棒性）（✅ typecheck + lint + 685 用例 + bot 9 赛道矩阵 0 违规 + build PWA + e2e 26 通过）
21. **M20**：运行时实测报告 14 项 P1/P2/P3 修复启动输入——大屏布局根因修复（`.menu-content` `width: min(100%, 1280px); margin: 0 auto` + `#track-select` 从 flex-wrap 改 `display: grid; grid-template-columns: repeat(3, 1fr)` 根治 1920 下 9 卡 wrap 成 1+3+4+1 错落偏左 90px）、portrait-mode 真实 bug 修复（旋转方向不同步——`isPortraitViewport()` 守卫 + `resize/orientationchange` 监听，横屏自动移除 class 保留 sessionStorage 记忆）、移动横屏副标题保留（`(max-height: 620px) and (max-width: 599px)` 才隐藏）、夜晚路灯近距缩放上限（`MAX_LAMP_SCALE = 1.4` + renderer lamp 分支专用 clamp）、路面颗粒噪点降密度（`ROAD_NOISE_PER_SEG` 14→10、alpha 0.12-0.22→0.08-0.15）、暂停文案去重（按钮"继续"→"恢复比赛"）、视口缩放放宽 a11y（移除 maximum-scale=1 / user-scalable=no、加 viewport-fit=cover）、挑战模式徽章文案补目标分（`挑战模式 · 60s 刷分 · 目标 5000`）、CI e2e 大屏 1920×1080 project + 大屏内容居中回归测试；**HUD 行驶期修复**：BOOST 条 + 暂停按钮同 `left:16 bottom:16` 重叠 → BOOST 改 `bottom-center`（`left:50%; transform:translateX(-50%)`）+ span `text-align:center` 解决「BOOST 文字左偏被圆形按钮遮住」；速度线 8 根纯白刺眼 → `rgba(190,220,255,...)` 淡蓝白（alpha/len 保持原值避触发天空条纹 P0-1 回归 maxDelta<60）；**榜单菜单优化 v1**：去掉手风琴式关联（三榜单可独立展开）+ 收起态完全折叠（`.lb-card-body` `max-height:0` + `padding-top/bottom:0`） + 宽屏（≥1100px）三列并排（`.leaderboard-cards` `width:100%; max-width:1080px` + `.lb-card` `flex:1 1 0; max-width:360px` 修复 align-items:center 父级下子项按内容收缩的坑）+ 漂移榜单单行不换行（字号 11px + 紧凑格式去掉 `·` 与 `连击` 字 → `1. P1  800分  经典赛道  x1.50`）；**榜单菜单优化 v2**：整体控制——`.leaderboard-toolbar` master 切换按钮（`#lb-toggle-all`）控制三卡片同时展开/收起（默认展开）+ 卡片宽度收紧（base max-width 280→220，宽屏 360→280，`.leaderboard-cards` max-width 1080→900/880→720 减少右侧留白）+ 加大各模块竖向间距（`.menu-content` padding-bottom 20→32、`.title-wrap` margin 10→18、`.title-sub` margin-bottom 20→28、`#track-select` margin 8/6→12/14、`.track-preview-wrap` margin-top 6→18、`#start-btn` margin 10/4→24/12）+ 副标题文案 `经典街机竞速 · 伪 3D 复刻` → `经典街机竞速 OUTRUN · 伪 3D 复刻`；**榜单菜单优化 v3**：`.leaderboard-section` 整体感容器（包住 toolbar + cards，背景模糊 + 圆角 16px + 边框）形成 dashboard widget；隐藏单卡内 `.lb-card-toggle`（整体控制下卡片头部只显示标题）；"我的榜单" label 字号 13→15 + letter-spacing 2→3.5 + 金黄字色；toolbar gap 12→4 让 label 与切换按钮靠近；卡片 border-radius 14→12 嵌套层级清晰（✅ typecheck + lint + 712 用例 + bot 9 赛道矩阵 0 违规 + build PWA + e2e 36 通过 1 移动横屏 flaky + 大屏居中回归 OK + HUD 视觉验证 OK + 榜单整体感容器视觉验证 OK）

每个里程碑结束验收标准：typecheck + test 全绿 + `npm run bot` 有稳定输出。

## Skills 使用规则（长程测试约束）

- **superpowers（已安装，已裁剪）**：允许 `test-driven-development`、`systematic-debugging`、`verification-before-completion`、`writing-plans`、`executing-plans`；已禁用 `brainstorming`、`subagent-driven-development`、`using-git-worktrees`、`writing-skills`（见 `.opencode/opencode.json` 的 permission.skill）。开发时按需调用，不要一次性全量加载。
- **grill-me**：仅在**计划阶段**（M1 开工前 / 新里程碑设计时）使用一次，用来锁定需求与取舍；执行阶段不要用。
- **oh-my-opencode-slim（已安装全局）**：提供 orchestrator/oracle/explorer/fixer 等编排 agents；已知 issue #894 会在启动日志打印 `disabledTools.filter is not a function` 错误，但功能正常（默认 agent 会变成 orchestrator）。若不需要编排，可在全局配置移除该插件。
- 其余 Skills（antfu 全家桶、stop-slop 等）按任务需要调用。

## 测试命令（对应 opencode 的 /test /lint /typecheck）

- `/test`：`npm test`（vitest run，49 文件 707 用例，含 tests/bench 冒烟），失败即修复
- `/test:e2e`：`npm run test:e2e`（Playwright 视觉回归，桌面 1280×720 + 移动横屏 812×375；需先 `npx playwright install chromium`）
- `/lint`：`npm run lint`（eslint）
- `/typecheck`：`npm run typecheck`（tsc --noEmit）
- `npm run bot`：tests/bot/run-bot.ts，9 赛道矩阵回归（0 违规）

## 输出与语言

- 所有回复、注释、文档使用中文（代码、命令、标识符保留英文）。
- 每完成一个里程碑，用 2-4 句总结：做了什么、验证结果、下一步。

## Repository Map

完整仓库代码地图见根目录 `codemap.md`，各子目录地图见对应 `codemap.md`。

开工前应先阅读：

- `codemap.md`：项目整体架构、技术栈、入口点、主循环数据流、验证优先级
- `src/codemap.md`：源代码目录总览与分层依赖
- 各子目录 `codemap.md`：模块职责、设计模式、数据流、集成点与文件清单
