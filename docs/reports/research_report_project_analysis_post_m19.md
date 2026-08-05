# AI-Racing-Games 深入分析与总结报告（M19 后现状 · 2026-08-05 实测）

> **状态更新（2026-08-05 当日）**：本报告发现的 P0/P1 红灯（format:check 失败、集成长程用例 flaky、文档数据漂移）已在同批修复中全部清零，实施与复测证据见 `research_report_fixes_post_m19_2026-08-05.md`；R3（game-loop 拆分）经评估移交 M20。
>
> 本报告基于 2026-08-05 18:30–19:00 对仓库的**全量实测**：typecheck / lint / format:check / npm test（707 用例）/ bot 9 赛道矩阵 / build（PWA）/ 安全扫描 / 性能基准 / 依赖方向 grep 审计 / git 历史分析。与既有 `research_report_project_analysis_deep.md`（覆盖至 M17+shared 解环期）互补，本篇聚焦 M19 之后（性能审计、运行时审计、竖屏兼容、微信分享、PWA 分发策略等批次）的最新现状。

## 一、执行摘要（结论先行）

**总体判断：项目处于"功能完备、工程化程度极高、但存在两处可立即修复的红灯"的状态。**

四天内（2026-08-02 02:41 → 2026-08-05 18:28）以 206 次提交从零演进到功能完整的 PWA 赛车游戏，M1–M19 全部里程碑完成，并在 M19 之后追加了四个批次的收尾工作（渲染/物理热路径性能优化、生命周期与输入路由健壮性、PWA 更新/缓存策略、竖屏兼容与微信分享卡）。核心质量门禁的实测结果：

| 验证项                 | 结果        | 备注                                                                       |
| ---------------------- | ----------- | -------------------------------------------------------------------------- |
| `npm run typecheck`    | ✅ 通过     | 0 错误                                                                     |
| `npm run lint`         | ✅ 通过     | 0 警告                                                                     |
| `npm run format:check` | ❌ **失败** | 5 个 codemap.md 未过 Prettier，CI 该步骤会红                               |
| `npm test`             | ⚠️ 705/707  | 2 个长程集成用例超时；隔离重跑该文件失败集变化（6/49），属负载敏感型 flaky |
| `npm run bot`          | ✅ 通过     | 9 赛道全部完赛，0 违规                                                     |
| `npm run build`        | ✅ 通过     | JS gzip 29.9KB，PWA 产物完整                                               |
| `npm run scan`（安全） | ✅ 无高危   | 3 处 innerHTML 均为静态内容；0 个 `as any`/`@ts-ignore`                    |
| `npm run test:e2e`     | ✅ 通过     | 14 用例 × 桌面/移动横屏双 project，0 失败（18:46–18:48 实测）              |

架构健康度经 grep 实测确认：`ui→game` 已 **0 处导入**（连类型导入都已提升至 `shared/types.ts`），`engine/physics→ui/game` 0 处导入，依赖严格单向；测试代码量（10093 行）超过业务代码量（9065 行）。

**最紧急的两件事**：① 对 5 个 codemap.md 跑 `prettier --write` 消除 format:check 红灯（一分钟可修）；② 处理 `game-loop-integration.test.ts` 的超时 flaky（本机全量跑失败 2 例、隔离跑失败 6 例且集合不同，说明超时阈值贴着机器性能边缘）。

## 二、项目定位

项目具有双重定位（AGENTS.md 明文）：

1. **游戏本体**：OutRun 风格伪 3D 街机赛车，Canvas 2D 实现（禁用 WebGL/Three.js）。四种模式（单屏 / `?split=1` 分屏 / `?hotseat=1` 热座 / `?challenge=1` 60 秒挑战刷分），9 条差异化环境赛道（含 2 条夜晚赛道），漂移计分 + 连击倍率、BOOST 氮气、车流碰撞与避让 AI、天气三态循环、雨天物理、PWA 离线安装、移动端触控/竖屏兼容、微信分享卡。
2. **实验载体**：压力测试 AI IDE（OpenCode Win11 Desktop v1.18.11，主力模型 DeepSeek V4 Flash）长程无人值守编程能力的极限。这个定位直接解释了项目的形态——TDD、确定性种子（mulberry32）、bot 黑盒门禁、codemap 文档体系、每日 50+ 提交的高强度演进节奏。

## 三、演进时间线与开发节奏

git 历史实测（206 commits，远端 github.com/mike652638/AI-Racing-Games）：

| 日期  | 提交数 | 主要内容                                                                        |
| ----- | ------ | ------------------------------------------------------------------------------- |
| 08-02 | 35     | 项目脚手架 → M1–M5 渲染骨架/物理/赛道/bot/HUD + 两轮扩展（漂移/分屏/车流/触控） |
| 08-03 | 77     | M8–M13：双人 HUD、9 赛道榜单、车流 AI、夜晚赛道、挑战模式、BOOST、雨天          |
| 08-04 | 40     | M14–M16：性能缓存、小地图、架构重构、PWA、视觉回归、碰撞反馈                    |
| 08-05 | 54     | M17–M19：环境差异化、UI/UX 深度打磨、debug 剥离/输入去重/解环，以及 M19 后批次  |

**M19 之后的批次**（今日提交，git log 实测）：

- 渲染/物理热路径性能优化（P1/P2/P5）：投影 `out` 参数复用（1260 → 0.1 对象/帧）、drift 复制保守化、魔法数字收敛至 shared/constants；
- 生命周期健壮性（S1–S4）：PWA autoUpdate→prompt（不打断对局）、输入路由去重、`GameLoop.destroy` 全监听清理、倒计时可取消、trackId 篡改降级；
- 菜单与榜单专项视觉审计（M-1~~M-10、LB-Z1~~Z3）+ 运行时审计修复（F-1/F-2/U-1/V-2 等），配套测试与 130+ 张证据截图归档 `docs/screenshots`；
- 竖屏兼容（C+E）：旋转遮罩可选、竖屏菜单/HUD 适配、会话记忆；
- 微信分享卡 v2（og/twitter/itemprop 指向 CloudBase 永久链接）；
- PWA 缓存策略修正：index.html 剔除 SW 预缓存 + 缓存控制 meta + app-version 标记；
- 新增 `bench`/`bench:reuse`/`scan` 工具脚本（性能基准与安全静态扫描）。

## 四、代码规模与结构（实测）

源码（src，TypeScript）：

| 模块     | 文件数 | 行数     | 职责                                                                      |
| -------- | ------ | -------- | ------------------------------------------------------------------------- |
| engine   | 19     | 3177     | 伪 3D 投影、路面/地形、景物、车流、环境配置、光照、Renderer 门面          |
| game     | 25     | 3373     | GameLoop 编排、模式策略、帧更新/渲染纯函数、结算、FSM、音轨装配、PWA 更新 |
| ui       | 7      | 1250     | HUD、画面、存档、文案、摇杆、小地图、格式化                               |
| audio    | 2      | 544      | WebAudio 程序化合成（引擎/漂移/胎噪/碰撞/BOOST/chiptune）                 |
| physics  | 3      | 311      | 运动学、漂移、输入规范化                                                  |
| ai       | 2      | 192      | bot 决策器、无头模拟器                                                    |
| shared   | 5      | 189      | 常量/阶段/圈数/类型唯一真源（零运行时依赖）                               |
| **合计** | **65** | **9065** | 另有 style.css 2729 行                                                    |

测试与验证（tests）：**56 文件 / 10093 行**——测试代码量超过业务代码量（比值 ≈ 1.11），这是项目最显著的工程特征之一。

> 口径说明：行数为 `wc -l`（含空行）。初版统计曾误用 PowerShell `Measure-Object -Line`（跳过空行，低估约 13%），本节已全部校准。

最大文件 TOP5：`game/game-loop.ts`（1200）、`engine/renderer.ts`（631）、`engine/road-surface.ts`（404）、`audio/engine.ts`（384）、`ui/screens.ts`（356）。注意 game-loop.ts 的行数轨迹为 938（M14 前）→ 719（M15 重构后）→ 927（M16–M18 期间）→ **1200（当前）**：竖屏遮罩、PWA 更新接线、菜单预览等新增逻辑又让它重新膨胀（详见风险 R3）。

产物体积（build 实测）：`index-*.js` 95.83KB（gzip 29.88KB）、`index-*.css` 41.60KB（gzip 8.31KB）——对一个含 9 赛道、四种模式、全套音效合成的游戏而言极其精简；PWA 预缓存 14 项（1574KiB，大头是 PNG 图标）。

## 五、架构深入分析

**分层与依赖方向（本次 grep 实测验证）**：

```
shared（常量/阶段/圈数/类型，零依赖）
  ↑           ↑
engine     physics        ← 纯函数领域层，不依赖 DOM/UI/game（实测 0 导入）
  ↑           ↑
  ui ←────────┘（ui→engine 仅 minimap 取 SEGMENT_LENGTH；ui→physics 仅 import type）
  ↑
game（编排层，运行时消费 engine/physics/ui，实测 15 处 ui 导入，符合设计）
```

关键事实：`src/ui` 中 `from '../game'` 的导入为 **0 处**——比 AGENTS.md 描述的"仅剩 import type"更进一步，RaceState/TrackContext 类型已提升至 `shared/types.ts`，运行时与类型层依赖环**全部消除**，game↔ui 解耦 100% 达成。game 层保留 `constants.ts`/`phase.ts` 等纯 re-export 兼容层，注释明确标注"新代码请直接导入 shared"，演进路径清晰。

**纯函数领域层**：frame-update / frame-render / frame-pure / finish-accounting 为无副作用纯函数，game-loop.ts 仅做编排；mode-strategy 以策略对象封装四种模式差异。音乐调度器甚至把 `stepEvents`/`nextStep` 导出为纯函数以便单测。调试钩子经 `import.meta.env.DEV` 门控（debug-hook.ts 与 game-loop.ts 各一处），生产构建死码消除。

**确定性生成**：mulberry32 种子驱动赛道、车流、远山、景物，保证 bot 跑圈可复现——这是"bot 矩阵作为黑盒质量门禁"能成立的前提。刻意保留的双车流默认值（游戏 14 / bot 基线 8）在 codemap 中有明确注释，防止后人"好心统一"。

**性能工程**（M14 + 08-05 P 批次）：road-strip 曲率段离屏缓存、雨滴预渲染双幅平铺、远山按环境懒重建缓存、精灵空间索引、lapRef 复用消除每帧分配、投影 `out` 参数复用（bench 实测 alloc 路径 1260 对象/帧 → 修复后约 0.1）。`npm run bench` 已工具化，`--reuse` 可对比修复前后。

**安全姿态**（`npm run scan` 实测）：事件监听 addEventListener/removeEventListener 19:19 完全对称（S2–S4 生命周期修复的成果）；`as any`/`@ts-ignore`/`eval` 全为 0；仅 3 处 innerHTML 且均为内部静态内容（倒计时提示、难度星级、赛道预览 SVG），无用户可控输入注入面；定时器 set/clear 7:3 不对称属一次性定时器常态，但值得抽查确认无泄漏。

## 六、质量保障体系与本次实测

六层门禁链（CI：typecheck → lint → format:check → test → bot → build → e2e 独立 job）。本次实测详情：

**单测**：49 文件 707 用例（AGENTS.md 记载的"47 文件 685 用例"已过期）。全量跑 705 通过、2 失败，均为 `game-loop-integration.test.ts` 的长程模拟用例超时；**将该文件隔离重跑，失败变为 6 个且失败集合不同**（全量跑失败的"完赛后回菜单重启帧循环"隔离跑反而 1019ms 通过）。这说明失败并非确定性逻辑缺陷，而是"整场比赛逐帧驱动"的用例耗时贴着超时阈值（默认 5s / 显式 15s），对机器负载高度敏感。vite.config 已为 worker 抬高 8GB 堆（canvas mock 全量录制曾 OOM），但**未配置全局 testTimeout**，部分长用例没有显式 timeout 参数。M19 笔记已将此定性为"刻意保留的防御性折衷"，但实测表明折衷的余量在本机已不足。

**bot 矩阵**：9 赛道全部完赛、0 违规、圈速稳定（如 classic 76.017s、island 52.167s、forest 34.767s），与 README 记载的基准圈速一致，确定性保持完好。

**安全扫描与基准**：见第五节。

**E2E**：14 个 Playwright 用例 × 双 project（桌面 1280×720 / 移动横屏 812×375）= 28 次执行，本次实测**全部通过**（`.last-run.json` status=passed、failedTests 为空，18:46–18:48 约 2 分钟完成，复用了本机已在运行的 5173 dev server）。覆盖菜单光晕、标题叠影、天空条纹像素级断言、热座 HUD、移动端视口，以及 M18 起新增的 BOOST 蓄能与碰撞反馈玩法链路断言。

## 七、风险清单与改进建议

按优先级排序（P0 = 应立即修复）：

**R1（P0）format:check 红灯**：`src/game/codemap.md`、`src/shared/codemap.md`、`src/ui/codemap.md`、`tests/codemap.md`、`tests/unit/codemap.md` 未过 Prettier。CI 第三步即失败，意味着最近几次推送的 CI 大概率为红。修复只需 `npx prettier --write` 这 5 个文件；根因是 husky 的 lint-staged 只覆盖 `*.{ts,js,tsx,jsx}`，**不含 .md**，建议在 lint-staged 增加 md 规则。

**R2（P1）集成测试超时 flaky**：建议三步——① 给所有"整场模拟"用例显式传 30–45s timeout（消除默认 5s 踩线）；② 中期把帧驱动改为可注入的虚拟时间步进，使耗时与机器性能脱钩；③ CI runner 性能与本机差异应记录为基线。此项直接影响"每里程碑全绿"的验收可信度。

**R3（P2）game-loop.ts 重新膨胀至 1046 行**：M15 曾重构到 719 行，之后竖屏遮罩、PWA 更新、菜单预览、调试钩子等陆续回流。建议 M20 做第三轮拆分（portrait-overlay.ts / menu-preview.ts 下沉），目标回到 700 行内；否则"编排壳"的定位名存实亡。

**R4（P1）文档数据漂移**：README 里程碑表止于 M17、记载"44 文件 639 用例"（实际 49/707）；AGENTS.md 记载 685 用例；根 codemap 记载 game-loop 927 行（实际 1046）。codemap 体系是 agent 协作的"地基"，数据过期会误导后续会话。建议：同步三份文档，并考虑加一个 docs 数据一致性检查脚本（统计用例数/行数与文档断言比对）。

**R5（P3）style.css 2397 行单文件**：M18 已完成颜色令牌化，可按屏幕（menu/racing/finish/portrait）进一步拆分，降低并发修改冲突面。

**R6（P3）扫描次级发现**：定时器 7:3 不对称建议抽查；3 处 innerHTML 可在未来重构时统一改为 textContent/DOM API，保持"零 HTML 注入面"的干净纪录。

## 八、建议的下一步（M20 候选，供决策）

1. **红灯清零批（强烈建议先行）**：R1 格式化 + lint-staged 补 md；R2 超时显式化；R4 文档同步。预计一个小里程碑即可全部收掉，恢复"全绿可发布"状态。
2. **game-loop 第三轮拆分**（R3），可与红灯批合并。
3. **功能方向候选**（判断项，按与项目定位的契合度排序）：
   - **计时赛幽灵回放**：录制确定性输入序列并回放——与项目的确定性生成基因天然契合，技术风险低，演示价值高；
   - 手柄（Gamepad API）支持、云排行榜（微信分享已接 CloudBase，后端基建现成）、赛道编辑器；
   - 若仍以压力测试 AI IDE 为主要目的，继续选"跨多文件、需长程一致性"的特性（如幽灵回放 + 排行榜联动）比选孤立小功能更能达到测试目的。

## 九、附录：实测原始数据摘要

- bot：classic 76.017s / highway 100.233s / s-curve 44.883s / island 52.167s / canyon 56.467s / desert 71.967s / forest 34.767s / coast 54.983s / alpine 43.867s，全部 finished=true、violations=0。
- build：68 模块转换，131ms；`index-BSdpXhK4.js` 95.83KB（gzip 29.88KB）；`dist/sw.js` + workbox 产物生成。
- scan：innerHTML 3（countdown.ts:17、game-loop.ts:359/560，均静态）；addEventListener 19 / removeEventListener 19；定时器 set 7 / clear 3；`@ts-ignore` 0、`@ts-expect-error` 0、`as any` 0、`:any` 0。
- bench（alloc 基线）：roadProjectionAlloc 1260 对象/帧（0.1087ms）、drift 2.18 对象/帧、input 4 对象/帧；修复后 reuse 路径见 `npm run bench:reuse`（commit 9f7a8c9 记载投影降至 0.1 对象/帧）。
- 依赖审计：`src/ui` 中 `from '../game'` 0 处；`src/engine`、`src/physics` 中 `from '../ui'|'../game'` 0 处；`src/game` 中 `from '../ui'` 15 处（编排层消费表现层，符合设计）。
- e2e：`test-results/.last-run.json` = `{"status":"passed","failedTests":[]}`；14 用例 × 2 project（desktop 1280×720 / mobile-landscape 812×375）共 28 次执行全过，复用本机 5173 dev server（reuseExistingServer 本地策略）。
- git：206 commits，首次 2026-08-02 02:41，最新 2026-08-05 18:28（PWA 缓存策略）。
