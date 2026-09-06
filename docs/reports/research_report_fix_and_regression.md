# AI-Racing-Games 修复、优化与回归复测报告

执行日期：2026-09-04
依据：`research_report_ai_racing_games.md`（项目深入分析与总结）中确定的处理顺序
报告性质：每一步均记录操作内容、涉及范围、预期结果与实际验证结果

## 摘要

按先前建议的顺序完成了三批工作：三个 P0 缺陷修复、M38 模式设置面板的五处集成收口、以及质量门禁与代码结构的针对性优化。全部改动通过完整验证链：typecheck、lint、format:check、1097 个单测、9 赛道 × 双模式 bot 矩阵、生产构建与 46 项 Playwright 视觉回归，零失败。其中「多圈车流失效」的修复使 bot 在多圈场景下的车流碰撞总数从 25 次升至 47 次，证明该缺陷此前确实让车流在第二圈起整体失效；新增的测试可达性门禁则立即查出 `src/game/pwa-update.ts` 长期零覆盖，已补测并达到 78/78 模块可达。

## 一、第一批：三个 P0 缺陷修复

### P0-1 多圈车流失效（碰撞与投影未做环形处理）

操作内容：在 `src/engine/traffic.ts` 新增 `ringForwardDistance(from, to, lapLength)`（环形前向距离，结果恒在 [0, lapLength) 区间）与 `ringDelta(from, to, lapLength)`（环形最短带符号距离），作为跨圈语义的单一真源。`collideWithPlayer` 与 `projectTraffic` 各增加可选尾参 `lapLength`，传入时启用环形语义，不传时与旧行为逐位一致。`projectTraffic` 的返回结构新增 `z` 字段（绝对化坐标 = cameraZ + 环形前向距离），渲染层景深归并改用该字段。同时把 `updateTraffic` 的避让判定与 `near-miss.ts` 的旧表达式 `(car.z - playerZ + lapLength) % lapLength` 一并换成 `ringForwardDistance`。

涉及范围：`src/engine/traffic.ts`、`src/engine/traffic-render.ts`、`src/engine/traffic-draw.ts`、`src/engine/renderer.ts`、`src/game/collision.ts`、`src/game/near-miss.ts`、`src/ai/simulate.ts`。

预期结果：第二圈及以后车流正常渲染、碰撞、避让与 near-miss 检测；第一圈行为不变（bot 确定性基线不受影响）。

实际验证：新增 20 个环形语义用例全部通过，其中两个用例直接锁定了缺陷原貌（旧表达式在第三圈返回 -400 与 -59900 这样的负值）。为量化效果做了一次修复前后对照实验（临时脚本，已删除）：9 条赛道在无车流基线下圈速完全不变，而车流模式碰撞总数从修复前的 25 次升至修复后的 47 次，且 3 圈赛道差异最显著（classic 2→5、island 4→7、desert 4→7、coast 4→7），2 圈赛道差异较小（alpine 1→3），与「只有首圈生效」的推断完全吻合。

### P0-2 near-miss 飘字永不隐藏

操作内容：`FrameUpdateContext` 与 `FrameUpdateResult` 新增 `nearMissHideIn`（剩余显示秒数）。触发时置为新增常量 `NEAR_MISS_POPUP_SEC = 0.8`（与 CSS 的 `near-miss-pop` 动画 0.8s 同源），每帧按 dt 递减，归零即调用 `hideNearMiss` 复位元素。非比赛阶段与起步倒计时两个提前返回分支同样复位该状态并清零倒计时。整个 near-miss 处理块（递减、P1/P2 双世界检测、得分与蓄能、HUD 弹出、音效）抽为独立函数 `advanceNearMiss(ctx, dt)`。

涉及范围：`src/shared/constants.ts`、`src/game/frame-update.ts`、`src/game/game-loop.ts`（字段声明、传参、写回）。

预期结果：飘字显示约 0.8 秒后自动消失；暂停、结算、回菜单、起步倒计时均不留残留。

实际验证：新增 4 个用例全部通过——触发后倒计时等于 0.8 秒、逐帧递减归零后元素 `hidden` 复位为 true、非比赛阶段与倒计时窗口各自复位。既有的 near-miss 触发用例不受影响。

### P0-3 远山离屏缓存在 resize 后环境配色退化

操作内容：在 `Renderer` 中新增私有方法 `rebuildMountains(width)`，把构造、`setViewport`、环境切换懒重建三处的配色取值统一到 `getEnvironmentProfile(currentEnv)`。为 `mountains` / `mountainsNight` 字段补初始值以满足 `strictPropertyInitialization`。

涉及范围：`src/engine/renderer.ts`、`tests/unit/renderer-mountain-env.test.ts`（新增）。

预期结果：非 plains 环境下改变窗口尺寸后远山保持环境配色；plains 环境零视觉回归。

实际验证：新增 6 个用例全部通过，包括前置条件（canyon 与 plains 配色确实不同）、构造后 plains 配色仍为 #27425e（与历史硬编码逐位一致）、canyon 下 setViewport 后不退化为 plains、以及「切换环境 → resize → 再切换」的连续场景。

## 二、第二批：M38 模式设置面板集成收口

五处问题逐项处理。构造器重复的 `refreshMenuBoard` + `ensureLoop`（连注释出现两次）删除前一处，保留全局事件绑定之后的那一次；`style.base.css` 中类名写错的 `.mode-card-selected`（单横线，与 JS 写入的 `mode-card--selected` 不匹配而从未生效）修正为双横线，并把 `border` 改为 `inset box-shadow`——因为 `.mode-card` 使用了 `all: unset`，`box-sizing` 被重置为 content-box，加 2px 边框会撑大卡片并导致选中时 flex 换行抖动；`bindModeSelector` 改为返回 `ModeSelectorHandle | null`（含 `render`），GameLoop 保存该句柄并在 `applyPhase(PHASE_MENU)` 删除 `?challenge` 之后调用 `render()`，消除 URL 与卡片显示的双真源；新增可选 `isMenuPhase` 守卫（置于写 URL 之前，非菜单阶段直接忽略点击）；`cycleRouteValue` 的循环上界由硬编码的 1/2/3 改为 `ROUTE_DEFS.length`，与 `routeLabel` 统一口径。

涉及范围：`src/game/mode-settings.ts`、`src/game/game-loop.ts`、`src/style.base.css`、`tests/unit/mode-settings.test.ts`、`tests/unit/game-loop-integration.test.ts`。

预期结果：卡片显示态始终与 URL 一致；非菜单阶段无法热切；路线增至 4 条时循环不断裂。

实际验证：`mode-settings.test.ts` 新增 6 个用例（句柄重渲染、守卫双向、上界由路线总数驱动）全部通过，共 29 个用例。`game-loop-integration.test.ts` 新增 5 个用例覆盖此前零覆盖的 `applyRuntimeParams`，验证点击天气卡后 URL 写入、卡片文案更新与 `weatherMode` 热应用三者同步，点击挑战卡后模式策略同步重建，六卡热切字段全部生效，非菜单阶段点击被守卫忽略，以及回菜单清理 `?challenge` 后卡片从「挑战·开」变为「挑战·关」。

## 三、第三批：针对性优化

bot 矩阵扩展。原先 `run-bot.ts` 调用 `simulateLaps` 时未传 `withTraffic`，因此九赛道矩阵从未覆盖车流场景，这也解释了 P0-1 缺陷为何长期无人察觉。现改为每条赛道跑两遍：无车流基线（保留原有输出与判定）与有车流模式（新增完赛、违规与碰撞数统计）。同时新增基线总时长门禁——`simulateLaps` 是固定步长的确定性模拟，与机器性能无关，故圈速可逐位比较；超出基线 5% 告警、10% 判定失败。

测试可达性门禁。原计划安装 `@vitest/coverage-v8` 接入行覆盖率，但本仓库的 npm 在新增该 devDependency 时稳定报 `Cannot read properties of null (reading 'children')`，遂改为零依赖方案：新增 `scripts/check-test-coverage.mjs`，静态解析 `src` 的模块依赖图与 `tests` 的导入关系，沿依赖图做可达性扩散，未被任何测试触达的模块按阈值判定。已接入 `package.json` 的 `test:coverage` 与 CI 的独立步骤。该门禁立即查出 `src/game/pwa-update.ts` 零覆盖，补测后达到 78/78、100% 可达。补测过程中把 `pwa-update.ts` 的提示条交互逻辑抽为 `handleNeedRefresh` 与 `handleOfflineReady` 两个可注入的纯函数——因为 `vi.mock` 无法拦截 `virtual:pwa-register` 这类虚拟模块，动态 import 会抛错并被 `.catch` 静默吞掉，靠 mock 是测不到真实逻辑的。

代码结构优化。`frame-update.ts` 的三个提前返回分支补齐了此前漏掉的 `boostBar2` 字段（此前靠 GameLoop 下一帧惰性重取兜底）。near-miss 整块抽为 `advanceNearMiss`，使 `updateFrame` 主干缩短约 70 行。

## 四、回归复测汇总

| 验证项     | 命令                    | 结果                                                               |
| ---------- | ----------------------- | ------------------------------------------------------------------ |
| 类型检查   | `npm run typecheck`     | 通过，无错误                                                       |
| 规范检查   | `npm run lint`          | 通过，无告警                                                       |
| 格式检查   | `npm run format:check`  | 通过（首次检查报 13 个文件需格式化，已执行 `npm run format` 修正） |
| 单元测试   | `npm test`              | 69 个文件 1097 个用例全部通过（改动前 1049，新增 48）              |
| 测试可达性 | `npm run test:coverage` | 78 个 src 模块全部可达（100%），阈值 0                             |
| bot 矩阵   | `npm run bot`           | 9 条赛道 × 无车流/有车流两种模式全部完赛，0 违规，圈速 0% 退化     |
| 生产构建   | `npm run build`         | 通过，PWA 产物正常（sw.js + 14 项 precache）                       |
| 视觉回归   | `npm run test:e2e`      | 46 项通过，8 项按视口条件跳过，0 失败                              |

新增测试分布：环形语义 20 例、远山环境缓存 6 例、PWA 更新提示 7 例、near-miss 飘字生命周期 4 例、M38 单元 6 例、M38 集成 5 例。

## 五、第二轮：frame-update 全量拆分（同日续作）

首轮报告把「全量拆分 `frame-update.ts`」列为遗留项，本轮完成。

操作内容：把 `updateFrame` 从 421 行拆为九个步骤函数加一段编排，主体降至约 147 行。步骤依次为 `stepEnvironment`（天气三态、雨声、雨天物理系数、挑战计分加成）→ `stepChallengeHud`（检查站奖励推进、倒计时与实时得分、非比赛阶段兜底隐藏）→ `stepDailyBadge`（每日挑战徽章）→ `stepTraffic`（双世界车流推进、橡皮筋难度、避让 AI）→ `stepInputs`（输入路由、最近活跃玩家、渲染复用转向）→ `stepBoost`（蓄力与消耗、BOOST 条、音效边沿、尾焰粒子、对局成就统计）→ 物理（`mode.updatePlayers` 仅一次调用，保持内联）→ `stepCollision`（碰撞检测、红闪分级、冲击音）→ `stepGameFeel`（尾焰粒子推进、特效衰减、漂移飘字寿命）→ `stepDriveAudio`（漂移摩擦胎声与常驻胎噪）。

涉及范围：仅 `src/game/frame-update.ts` 一个文件，对外 API（`updateFrame` 签名与 `FrameUpdateResult` 结构）零变化。

预期结果：单函数复杂度大幅下降，每步职责可用一句话描述；行为逐字节等价。

实际验证：typecheck 与 lint 通过，51 个既有 `frame-update` 用例与 9 个音频用例全部通过，全量 1097 用例通过。过程中遇到的唯一问题是 `stepInputs` 的 `lastActivePlayer` 返回类型需精确写 `1 | 2`（写 `number` 会触发 TS2322，因为 `FrameUpdateResult` 该字段是字面量联合类型）。副作用是全量单测耗时由 59 秒降至 27 秒。

关于测试：九个步骤函数为模块私有，未新增测试文件——它们的核心逻辑（`resolveWeatherPhase`、`updateBoostCharge`、`updateCollisions`、`updateCollisionFlash`、`updateDriftPopup`）本就各自有独立单测，步骤函数本身经 `updateFrame` 被 51 个用例间接覆盖。这与原报告「每步配一个单测文件」的建议有所出入，原因是导出内部步骤会扩大模块公开面，而收益仅是重复覆盖已有测试的逻辑。

## 六、第二轮：codemap 同步

原报告指出 codemap 滞后于代码（行数字数过期、`routes.ts` 未登记等）。本轮同步了四处：根 `codemap.md` 更新测试统计（69 文件 1097 用例）、补登此前完全缺失的 `scripts/` 目录行、追加完整的「2026-09-04 分析驱动修复批次」段落、并在 `src/game` 行补上 M38 的 `mode-settings`；`src/engine/codemap.md` 在车流系统条目补写环形语义单一真源说明，并把避让 AI 条目里的旧表达式 `(car.z - player.z + lapLength) % lapLength` 更正为 `ringForwardDistance`（注明旧式取模在第三圈返回负值的失效原因）；`src/game/codemap.md` 在拆分件清单补 M38 新增件与九步拆分说明；`tests/codemap.md` 更新用例数并写明 bot 的双模式与圈速基线门禁。

## 七、遗留问题与后续建议

行覆盖率仍未度量。可达性门禁能发现「整个模块没人测」，但无法发现已测模块内的未覆盖分支。待 npm 环境修复后可再尝试安装 `@vitest/coverage-v8`，把本脚本作为补充保留。

`frame-update.ts` 的全量拆分尚未完成。本次只抽取了 near-miss 整块，该文件仍有约 490 行、上下文 30 余字段。建议后续按「环境 → 车流 → 输入 → BOOST → 物理 → 碰撞 → 特效 → HUD」切 8 个 step 函数，每步配一个单测文件，与 M34 的六模块下沉保持同一范式。

集成测试的内存余量偏紧。`game-loop-integration.test.ts` 在 8GB 堆上限下已接近临界，本次为 `#mode-selector` 挂载卡片替身后即触发 worker OOM，最终以「按需启用 + 单实例共享」规避。后续新增集成用例时应复用实例并在 `afterAll` 中 `destroy()`，必要时拆分该文件或上调 `max-old-space-size`。

bot 车流模式的碰撞数目前只做观察（超过 30 次告警，不失败）。建议在积累若干次运行数据后收紧为硬门禁，以捕获车流密度或避让 AI 的退化。

## 参考来源

1. [项目深入分析与总结报告](d:\AI\AI-Racing-Games\research_report_ai_racing_games.md)
2. [src/engine/traffic.ts 车流与环形语义](d:\AI\AI-Racing-Games\src\engine\traffic.ts)
3. [src/engine/traffic-render.ts 车流投影](d:\AI\AI-Racing-Games\src\engine\traffic-render.ts)
4. [src/game/frame-update.ts 每帧更新编排](d:\AI\AI-Racing-Games\src\game\frame-update.ts)
5. [src/game/mode-settings.ts M38 模式设置面板](d:\AI\AI-Racing-Games\src\game\mode-settings.ts)
6. [tests/bot/run-bot.ts 九赛道矩阵](d:\AI\AI-Racing-Games\tests\bot\run-bot.ts)
7. [scripts/check-test-coverage.mjs 测试可达性门禁](d:\AI\AI-Racing-Games\scripts\check-test-coverage.mjs)
8. [.github/workflows/ci.yml 持续集成](d:\AI\AI-Racing-Games.github\workflows\ci.yml)
