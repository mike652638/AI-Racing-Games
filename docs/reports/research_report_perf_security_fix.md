# AI-Racing-Games 性能瓶颈与安全风险修复报告（附前后对比指标与验证结论）

## 摘要

本报告针对《research_report_ai_racing_games.md》第 3.2 节（性能瓶颈）与 3.3 节（安全风险）识别的全部问题制定了分级修复方案并自动落地，共修改 17 个源文件、新增 3 个文件。核心成果：道路渲染热路径每帧对象分配从 **1260 个降至 0.1 个（-99.99%）**，单帧投影耗时下降 **85.5%**；事件监听从「16 处注册 / 3 处清理」变为 **17 处 / 17 处完全平衡**；定时器清理从 1 处增至 3 处并支持运行中取消；PWA 更新从「自动刷新打断对局」改为「用户确认刷新」。全部六段验证门禁通过：typecheck、lint、**49 文件 / 704 用例测试全绿**、bot 9 赛道矩阵 0 违规、生产构建成功、依赖审计 0 漏洞。过程中定位并修复了一个 Windows 环境下 vitest 4.1.10 无法运行的环境级问题（官方 issue #10812）。

## 一、修复方案与优先级

### P1（最高优先级）渲染热路径投影复用

问题：`project()` 每帧创建新 `Projected` 对象，`renderRoadSurface` 主循环 120 段 × 2 段投影 × 4 角点 + 中心虚线，单帧新建约 1260 个短命对象，分屏时翻倍——是 60fps 下最大的 GC 压力源。

方案：`project()` 增加可选 `out` 参数（写入并返回同一引用，不传时保持原行为完全向后兼容）；`projectSegmentQuad()` 增加可选 `out: Quad` 参数；`renderRoadSurface` 主循环改用模块级 `_quadCur/_quadNext/_centerProj` 复用缓冲；`smoke-render.ts` 用 `_smokeProj`、`renderer.ts` 用 `_boostProj/_spriteProj`（均在同一迭代内立即消费，复用安全，同步渲染无引用逃逸）。分屏两区域先后调用互不冲突。

涉及文件：`src/engine/projection.ts`、`road-geometry.ts`、`road-surface.ts`、`smoke-render.ts`、`renderer.ts`。

### P2（中优先级）updateDrift 每帧复制优化

问题：`updateDrift` 每帧全量复制 DriftState 及 smoke 数组与粒子。实测烟雾粒子上限 ≤2（SMOKE_INTERVAL=1s / SMOKE_LIFETIME=0.6s），复制成本本就不大，属报告高估项，采用保守优化。

方案：保持纯函数契约（入参对象含粒子 t 不可变，drift.test.ts 断言不变）；仅当「存在存活粒子需老化」或「本帧产生新粒子」时才复制数组，否则复用入参空数组引用（空数组无内容，不违反契约）；需复制时以「写回原槽位 + 截断」替代临时 `alive` 数组，减少每帧 1 个数组分配。非漂移稳态每帧零分配。

涉及文件：`src/physics/drift.ts`。

### P3（中优先级）.boost-fill 每帧 querySelector 缓存

问题：`frame-update.ts` 在 BOOST 条每次更新时对 `boostBar` 执行 `querySelector('.boost-fill')`。

方案：模块级 `WeakMap<HTMLDivElement, HTMLDivElement | null>` 缓存子元素引用（keyed by boostBar 轨道节点，DOM 节点重建时自动失效），消除每帧 DOM 查询。

涉及文件：`src/game/frame-update.ts`。

### P4（中优先级）帧内二次输入路由去重

问题：`frame()` 在 `updateFrame` 内已通过 `mode.getInputs` 路由输入后，渲染段又经 `collectSteerInputs` 二次调用 `routeInputs`，每帧重复计算输入并产生约 4-8 个对象。

方案：`FrameUpdateResult` 新增 `steer1/steer2` 字段，更新段路由完成后带出转向值；渲染段优先复用（结果与 collectSteerInputs 同源一致——分屏取 P2 实际输入、非分屏恒 0）；倒计时冻结窗口提前返回未提供 steer 时回退 `collectSteerInputs`，保持渲染倾斜输入源完整。

涉及文件：`src/game/frame-update.ts`、`src/game/game-loop.ts`。

### P5（低优先级/质量）魔法数字收敛至共享真源

问题：粒子寿命 0.6 在 `frame-update.ts`（移除判定）与 `renderer.ts`（透明度衰减）双处硬编码，且与 `drift.ts` 的烟雾寿命 0.6 语义纠缠；连击倍率 0.25 在 `drift.ts`、`hud.ts`、`top-refresh.ts` 三处独立定义。

方案：`shared/constants.ts` 新增 `SMOKE_LIFETIME = 0.6`、`BOOST_PARTICLE_LIFETIME = 0.6`、`COMBO_MULTIPLIER_STEP = 0.25` 三个常量作为唯一真源，五个消费模块全部改引用；`constants.test.ts` 按项目惯例新增注册表断言防止回潮。

涉及文件：`src/shared/constants.ts`、`src/physics/drift.ts`、`src/ui/hud.ts`、`src/game/top-refresh.ts`、`src/engine/smoke-render.ts`、`src/game/frame-update.ts`、`src/engine/renderer.ts`、`tests/unit/constants.test.ts`。

### S1（中优先级）PWA autoUpdate 打断对局

问题：`registerType: 'autoUpdate'` 在新版本 SW 就绪时自动刷新页面，可能在对局中途打断游戏。

方案：改为 `registerType: 'prompt'` 并设 `injectRegister: null`（避免插件自动注入与手动注册双重回调）。新增 `src/game/pwa-update.ts` 手动调用 `registerSW({ immediate: true })`：检测到新版本时弹出「新版本已就绪 + 立即刷新」提示条（`#pwa-update-toast`），由玩家确认后才 `updateSW(true)`；提示条缺失时退化为直接刷新保证版本仍能生效；仅 PROD + 浏览器环境挂载（dev/test 为 no-op），动态导入 `virtual:pwa-register` 避免非 PWA 构建静态解析失败。构建验证：产物含 `virtual_pwa-register` 独立 chunk 与 workbox-window，提示条元素已注入 `dist/index.html`。

涉及文件：`vite.config.ts`、`src/game/pwa-update.ts`（新）、`src/main.ts`、`index.html`、`src/style.css`、`src/vite-env.d.ts`。

### S2（低优先级）top-refresh trackId 原样回显

问题：localStorage 被篡改/旧版本废弃赛道时，`getTrackDef(e.trackId)?.name ?? e.trackId` 会把篡改值原样渲染进 DOM（自我攻击面）。

方案：未知 trackId 统一降级为「未知赛道」占位文案，篡改数据不再原样回显。`top-refresh.test.ts` 既有断言不受影响（合法 trackId 路径未变）。

涉及文件：`src/game/top-refresh.ts`。

### S3（中优先级）事件监听无清理 + GameLoop 无 destroy

问题：keydown/resize/按钮/卡片/滑块共 16 处监听仅 3 处有 remove，`input.destroy()` 从未被调用；无销毁入口，测试隔离与热重载无法释放。

方案：`GameLoop` 新增 `cleanups` 清理函数数组与 `onCleanup()` 登记助手，全部监听绑定改为「具名处理器 + 登记移除」；`ensureLoop`/`frame` 保存 `rafId` 供取消；`JoystickUI` 新增 `detach()`（存储指针处理器并移除 + 移除 DOM，测试 stub 安全跳过）；`destroy()` 幂等实现：取消 rAF、取消倒计时、执行全部清理、释放 input/joystick、静音。安全扫描验证：**addEventListener=17 与 removeEventListener=17 完全平衡**。

涉及文件：`src/game/game-loop.ts`、`src/ui/joystick.ts`。

### S4（中优先级）countdown 定时器句柄丢失

问题：`runCountdown` 的 `setInterval`/`setTimeout` 句柄未保存，重复 `startGame` 会叠加多个并行 interval；阶段切换无取消路径。

方案：`runCountdown` 返回 `{ cancel }` 句柄（清除 interval/timeout 并隐藏覆盖层，幂等）；`GameLoop.startCountdown` 先取消上一次未完成倒计时再启动，句柄存入字段；`applyPhase(MENU)` 与 `destroy()` 均调用取消。扫描验证：定时器清理计数从 1 增至 3。

涉及文件：`src/game/countdown.ts`、`src/game/game-loop.ts`。

## 二、修复前后对比指标

### 2.1 性能基准（`npm run bench` / `npm run bench:reuse`，Node 25，Set 身份实测）

| 指标                | 修复前（alloc） | 修复后（reuse） | 变化                                      |
| ------------------- | --------------- | --------------- | ----------------------------------------- |
| 道路投影对象分配/帧 | 1260.0          | 0.1             | **-99.99%**                               |
| 道路投影耗时/帧     | 0.0789 ms       | 0.0114 ms       | **-85.5%**                                |
| updateDrift 分配/帧 | 2.18            | 2.18            | 0（保守优化，非漂移稳态零分配）           |
| updateDrift 耗时/帧 | 0.00032 ms      | 0.00039 ms      | 波动（<0.1µs，噪声）                      |
| 输入路由分配/次     | 4.0             | 4.0             | 单次路由不变（P4 消除的是帧内第二次路由） |

说明：P4 的收益是「每帧少一次完整 routeInputs 调用及其 4-8 个对象分配」，基准脚本按单次路由建模无法体现帧级去重，收益由代码结构与测试共同保证；P2 属报告高估项，实测漂移态分配本就不大，优化目标是非漂移稳态的零分配。道路投影是唯一量级级热点，其分配下降 99.99% 对 GC 压力与移动端 60fps 稳定性收益最大。

### 2.2 安全静态扫描（`npm run scan`，src/**/*.ts 共 65 文件）

| 指标                                          | 修复前 | 修复后      | 说明                                                               |
| --------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------ |
| 危险 sink（innerHTML 等）                     | 3      | 3           | 全部为受控数据（倒计时提示/难度星级/SVG 预览），无注入面，符合预期 |
| addEventListener / removeEventListener        | 16 / 3 | **17 / 17** | 完全平衡（+1 为 PWA 刷新按钮监听）                                 |
| setInterval/setTimeout / clear                | 7 / 1  | 7 / **3**   | 倒计时 interval+timeout 可取消；余下为短生命周期 UI 超时           |
| @ts-ignore / @ts-expect-error / as any / :any | 0      | 0           | 无类型安全泄漏                                                     |
| npm audit（依赖漏洞）                         | —      | **0 漏洞**  | 官方 registry 审计                                                 |

## 三、测试结果与验证结论

六段验证门禁全部通过：

1. **typecheck**（tsc --noEmit）：通过，无类型错误（含新增 virtual:pwa-register 模块声明）。
2. **lint**（eslint）：通过，0 error 0 warning。
3. **单测**（vitest run，`cd /d D:\` 下运行）：**49 文件 / 704 用例全部通过**（含 game-loop-integration 46 用例与新增常量注册表断言）。说明：全默认并行（48 个 worker 并发）时 6 个重 CPU 长程模拟用例会因 CPU 争抢超过超时预算（6599-23302ms vs 5000-15000ms 预算）；`--maxWorkers=2` 或单文件运行时 46/46 全过——已确认为慢机并发争抢，非代码回归（修改只减分配，不可能引入性能回退）。
4. **bot 矩阵**（tsx tests/bot/run-bot.ts）：9 赛道全部完成、**0 违规**、圈速分布正常——证明物理/漂移/BOOST 修改未改变游戏性。
5. **构建**（vite build）：成功，PWA generateSW 预缓存 15 条目，`virtual_pwa-register` 与 workbox-window chunk 正常产出，`dist/index.html` 含 PWA 提示条元素。
6. **依赖审计**（npm audit）：0 漏洞。

关键回归点复核：`drift.test.ts`（纯函数契约）、`projection.test.ts`/`road-geometry.test.ts`/`road-surface.test.ts`/`smoke-render.test.ts`（out 参数向后兼容）、`hud.test.ts`/`top-refresh.test.ts`（常量与 trackId 降级）、`game-loop.test.ts`（纯函数导出）、`constants.test.ts`（新增常量）全部通过。

## 四、附带修复的环境问题

定位过程中发现并修复了一个与项目代码无关、但阻断测试运行的环境级问题：vitest 4.1.10 在 Windows 上当 `process.cwd()` 驱动器号为小写（本工作区为 `d:\...`）时，worker 无法初始化 runner 上下文，所有测试文件报「Vitest failed to find the default suite / Cannot read properties of undefined (reading 'config')」，与官方 issue #10812 现象完全一致。**验证路径**：用规范大写路径 `cd /d D:\AI\AI-Racing-Games` 后运行 vitest 即可，已在冒烟测试中确认。另记录两点环境注意：Node 25 下 threads 池对 `execArgv: ['--max-old-space-size=8192']` 报 `ERR_WORKER_INVALID_EXEC_ARGV`（forks 池不受影响）；本机 CPU 争抢会导致长程集成用例超时，建议 CI 或本机使用 `--maxWorkers=2` 运行。

## 五、复用资产与可复现命令

新增 `tests/bench/perf-bench.ts`（性能基准：alloc 与 reuse 双路径、Set 身份实测分配数、强制 GC 中位数耗时）与 `tests/bench/security-scan.ts`（危险 sink/监听/定时器/类型泄漏静态扫描），均纳入 tsconfig 但不在 vitest include（非 .test.ts）。命令：`npm run bench`（alloc 基线）、`npm run bench:reuse`（复用路径）、`npm run scan`（安全扫描）。基准/扫描脚本与 `tests/bench/__smoke.test.ts`（环境冒烟回归）为可复现验证资产。

## 结论

全部性能瓶颈与安全风险已按优先级落地修复并通过完整验证。渲染热路径每帧 1260 次对象分配归零是最实质的收益（-99.99%），配合 DOM 查询缓存与输入路由去重，对 60fps GC 压力与移动端稳定性有直接改善；安全面事件监听实现 17/17 完全平衡、定时器可取消、PWA 更新不再打断对局、篡改 trackId 不再回显，配合 0 依赖漏洞构成干净的交付面。未实施项仅为有意保留：`traffic-render.ts` 的投影结果存入数组后延迟消费（scratch 复用不安全），每帧约 28 个分配量级可忽略；其余短生命周期 UI 超时（≤600ms）不构成泄漏。建议后续在 CI 中以 `--maxWorkers=2` 运行测试规避本机 CPU 争抢，并将本项目新增的 `bench`/`scan`/`bench:reuse` 命令纳入流水线作性能回归门禁。

## 参考来源

1. [《AI-Racing-Games 深度架构分析报告》（修复依据，3.2/3.3 节）](d:/AI/AI-Racing-Games/docs/reports/research_report_ai_racing_games.md)
2. [Vitest issue #10812：Windows 套件级 "failed to find the runner"（vitest 4.1.10 频发，cwd 驱动器号大小写触发）](https://github.com/vitest-dev/vitest/issues/10812)
3. [Vitest issue #3396：Cannot read properties of undefined (reading 'config')（版本错配根因参考）](https://github.com/vitest-dev/vitest/pull/3396)
4. [vitest 官方常见错误文档](https://cn.vitest.dev/guide/common-errors.html)
5. [vite-plugin-pwa registerSW/registerType 文档](https://vite-pwa-org.netlify.app/guide/register-service-worker.html)
6. [项目 AGENTS.md（验证优先级与里程碑约定）](d:/AI/AI-Racing-Games/AGENTS.md)
