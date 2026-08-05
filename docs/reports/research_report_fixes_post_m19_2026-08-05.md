# 修复批次报告（post-M19 审计红灯清零 · 2026-08-05）

> 与 `research_report_project_analysis_post_m19.md`（同日下午审计）配套：审计发现 1 处 CI 红灯 + 1 类 flaky + 文档漂移等问题，本篇记录**无人值守修复实施与复测证据**。修复范围刻意收敛为"红灯清零 + 低风险加固"，大重构（game-loop 拆分 / CSS 拆分）经评估延期至 M20，理由见第五节。

## 一、修复摘要

| 问题                                                                    | 级别 | 处置                                                                                                                                                                 | 复测结果                                            |
| ----------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| format:check 红灯（5 个 codemap.md 未过 Prettier，CI 第三步即失败）     | P0   | `npm run format` 全量格式化 + lint-staged 补 `"*.md": ["prettier --write"]` 规则（漏网根因）                                                                         | ✅ All matched files use Prettier code style        |
| 集成长程用例负载敏感 flaky（全量跑 2 失败 / 隔离跑 6 失败且集合不同）   | P1   | 新增 `SIM_TIMEOUT=30s` / `SIM_TIMEOUT_EPIC=60s` 两档常量，13 个逐帧模拟用例统一挂档                                                                                  | ✅ 707/707 全绿，33.6s，最差单用例 5.3s（余量 11×） |
| 文档数据漂移（README/AGENTS/各级 codemap 的用例数、行数、里程碑表过期） | P1   | 15 处数字/条目同步（详见第三节）                                                                                                                                     | ✅ grep 复查无残留过期值                            |
| 定时器 set/clear 7:3 不对称                                             | P3   | 逐点审计：7 个定时器均为短时一次性、回调幂等、Node 环境全部 `unref()`、countdown 有完整 cancel 对称路径 → **判定无泄漏，不改代码**                                   | —                                                   |
| game-loop.ts 膨胀至 1200 行                                             | P2   | **评估后延期至 M20**：方法大量持有 `this.*` 状态，拆分需依赖注入管道化，属里程碑级工作；无人值守批次无运行时视觉验证条件，强行拆分回归风险高。拆分方案已列（第五节） | —                                                   |

## 二、R2 超时加固细节（tests/unit/game-loop-integration.test.ts）

新增档位常量（文件头部，含取舍注释）：

```ts
const SIM_TIMEOUT = 30_000 // 单场 700–1075 帧模拟
const SIM_TIMEOUT_EPIC = 60_000 // 热座双 1400 帧全赛季、挑战 1298 帧、雨段 2000+ 帧
```

13 个用例挂档明细：新补显式超时 5 个（全油门完赛 / 完赛回菜单 RAF 重启 / 分屏漂移横幅 / F2 对局榜 / 热座回合输入——后三个原踩默认 5s，其中"漂移横幅"实测最差 12s、"F2"实测最差 16.6s，是隔离跑失败的直接原因）；原 `15000` 升档 7 个（分屏森林 ×2 → 30s、热座交棒 → 60s、热座车流 → 30s、热座胜场 → 60s、0 漂移完赛 → 30s、G1 挑战 → 60s）；F4 雨段对象式 `{ timeout: 15000 }` → 60s（实测最差 35.9s，原档位余量已为负）。同时修正 2 处过期注释（原注释声称"700 帧已回到默认 5000ms 内"——实测证伪）。

设计取舍：不设全局 `testTimeout`（会掩盖真实挂起），只做**显式按用例挂档**；档位取值 = 实测最差值 × 1.6–1.7 的负载余量。

## 三、R4 文档同步明细（15 处）

- **README.md**：game/ 20→25 文件；tests 目录块补 e2e/、bench/ 行且 unit 计数 44/639→48/706；里程碑表补 M18、M19 两行；测试命令节补 `bench`/`scan` 说明。
- **AGENTS.md**：game/ 20→25 文件；unit 47/685→48/706（合计 49/707）；`/test` 命令说明同步。
- **codemap.md（根）**：game-loop.ts 927→1200 行（wc -l 实测）；tests 行 47/685→49/707 并补 bench 工具描述。
- **src/game/codemap.md**：game-loop 行数轨迹补"2026-08-05 竖屏兼容/PWA 更新批次后达 1200 行"。
- **src/engine/codemap.md**：renderer.ts "1143→约 611 行" → "1143→631 行（wc -l 实测）"两处。
- **tests/codemap.md / tests/unit/codemap.md**：47/685→48/706（+bench 冒烟 49/707）；集成冒烟节超时描述改为 SIM_TIMEOUT 档位制。

**口径勘误（审计篇连带修正）**：审计报告初版行数用 PowerShell `Measure-Object -Line`（跳过空行，低估约 13%），已全部校准为 `wc -l`：src 65 文件 **9065** 行（原报 7877）、tests 56 文件 **10093** 行（原报 8862）、style.css **2729** 行、game-loop.ts **1200** 行（原报 1046）。测试/业务代码比 1.11 的结论不变。

## 四、复测证据（全门禁，2026-08-05 19:35–19:45，串行无并发）

| 门禁         | 结果 | 关键数字                                                                                                                  |
| ------------ | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| typecheck    | ✅   | tsc --noEmit 0 错误                                                                                                       |
| lint         | ✅   | 0 警告                                                                                                                    |
| format:check | ✅   | All matched files use Prettier code style（修复前：5 文件失败）                                                           |
| npm test     | ✅   | **49 文件 707/707 全绿，33.56s**；集成文件 49 用例 31.6s，最差 F4 5.3s（修复前：同环境 2–6 个超时失败）                   |
| bot          | ✅   | 9 赛道全部完赛、0 违规；圈速与修复前逐字节一致（确定性无损）                                                              |
| build        | ✅   | 主包 95.83KB（gzip 29.88KB）产物哈希不变（`index-BSdpXhK4.js`）——本批改动零运行时影响                                     |
| scan         | ✅   | 与修复前完全一致：innerHTML 3（静态）、监听器 19:19、`as any` 0                                                           |
| e2e          | ✅   | 14 用例 × 双 project（28 次执行）全过，`.last-run.json` status=passed、failedTests=[]（19:45 实测，复用 5173 dev server） |

改动面：`git diff --stat` 11 文件（+436/−364），其中 648 行变化集中在集成测试文件（超时挂档 + prettier 重排），其余为文档与 package.json（lint-staged 3 行）。**src/ 运行时代码零改动**。

## 五、移交 M20 的事项

1. **game-loop.ts 第三轮拆分（1200→目标 <700 行）**。候选抽取块（按收益排序）：
   - `bindPortraitMode` + 竖屏遮罩逻辑（约 45 行）→ `src/game/portrait-mode.ts`（元素 + 回调注入，会话记忆键逻辑自包含）；
   - `buildTrackOptions` + `refreshTrackPreview` 接线 + `updateTrackBackground`（约 110 行）→ 并入既有 `dom-setup.ts` / `track-preview.ts`；
   - `bindLeaderboardCards`（约 45 行）→ `src/game/leaderboard-cards.ts`；
   - 既有 `onCleanup` 注册表已为监听器清理提供管道，可复用于新模块的生命周期。
     延期理由：方法体深度依赖 `this.*`（race/renderer/audio/DOM 四组状态），无 DI 管道的机械搬移会引入长参数列表或状态回流；且本批无浏览器视觉验证条件，e2e 快照回归风险不可控。
2. **style.css 拆分**（2729 行单文件，M18 已完成令牌化，可按 menu/racing/finish/portrait 屏幕维度拆）。
3. **3 处 innerHTML 可选收敛**（均为内部静态内容，无注入面，低优先级）。

## 六、遗留观察

- 本机两个 vite dev server（5173 自 11:02、5174 自 12:00）常驻，e2e 复用 5173（`reuseExistingServer` 本地策略）；不影响测试有效性，建议空闲时手动关闭。

## 七、补遗：CI run #3 暴露的深层根因与虚拟时钟修复（2026-08-05 晚）

**现象**：提交 `195ec2f` 推送后 CI run #3 在 Unit tests 步骤失败（typecheck / lint / **format check 均已转绿**，验证了 R1 修复在 CI 生效）。失败并非超时，而是 F2（分屏对局榜）断言失败：`expected false to be true`（game-loop-integration.test.ts:645，`match-top` 仍为占位文本）。

**根因定位（第一层，时序）**：集成测试的帧驱动使用虚拟时钟（`now += 50; frame(now)`），但 `GameLoop` 的 `this.last = performance.now()`（构造器与 startGame 内，src/game/game-loop.ts:170/625）读取的是**真实墙钟**。首帧 dt = `min((now − last)/1000, 0.05)`，其中 `now` 为虚拟时间、`last` 为真实时间——当"构造 → 首帧驱动"的实际间隔 δ > 50ms（CI/负载机器常态）时，**首帧 dt 为负**，物理倒退一帧，且整场比赛帧数随 δ 漂移（超时 flaky 的深层根源）。

**修复（测试侧，src/ 仍零改动）**：`stubEnvironment` 中追加 `vi.stubGlobal('performance', { now: () => now })`——`GameLoop` 的 `last` 与帧驱动从此共用同一虚拟时钟，每帧 dt 恒为 0.05，整文件用例的物理推进与耗时均与机器负载**结构性无关**（不依赖阈值放宽）。同步更新 stub 文档注释与 driveFrames 注释。

**注意**：推送后 CI run #4 复现同一 F2 断言失败（行号平移至 654），证明虚拟时钟消除了真实的时序隐患，但**并非 F2 失败的直接原因**——直接原因见第八节。

## 八、补遗二：CI run #4 与 localStorage 环境差异根因（2026-08-05 夜）

**现象**：run #4 中 typecheck / lint / format check 依旧全绿，Unit tests 仍是 F2 同一断言失败；而同文件同流程的"漂移竞速横幅"用例（不写存档）在 CI 通过——失败仅出现在**依赖存档写入**的用例上，且稳定复现、与负载无关。

**根因（第二层，环境差异）**：`save.ts getStorage()` 采用双重检查（`typeof localStorage !== 'undefined'` + `window.localStorage`）才启用存档。**本机 Node v25.2.1 自带全局 localStorage（Node 23+ 默认提供），而 CI 的 Node 22 没有** → CI 上 `addMatchResult` 静默降级为 no-op → 对局榜恒为占位文本 → 断言失败。测试桩 `stubEnvironment` 本就为此设计了 `initialStorage` 尾参（传入时 `vi.stubGlobal('localStorage', fakeStorage)` 挂载全局），但 F2 未传。

**修复**：F2 改为 `stubEnvironment(true, {})`——激活全局存储桩；空存储下构造时占位断言语义不变（`loadMatchTop` 返回 `[]` 仍渲染占位文案）。全文件排查确认其余存档依赖用例（H4、P3、G7 等）均已显式注入存储，仅 F2 遗漏。

**复测与教训**：本地 typecheck/lint/format + 707/707 全绿（34.2s）后推送 `c053494`，**CI run #5 首次全绿**——ci 作业七步（typecheck/lint/format/unit tests/bot/build）与 e2e 作业（28 次执行）均 success。教训沉淀：① 测试基建的"可选 stub"（如 initialStorage）在跨 Node 大版本环境下可能从"可选"变"必需"，环境能力探测类断言应在 CI 同版本 Node 下至少跑一次；② "本地绿 / CI 红"排查顺序：先对齐运行时版本差异（Node 大版本全局 API），再查时序/时钟混用；③ 虚拟时钟修复（第七节）仍然保留——它独立消除了超时 flaky 的时序根源，两层修复互补。
