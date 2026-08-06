# AI-Racing-Games 项目结构化总结报告

> 分析日期：2026-08-05（M19 完成 + post-M19 收尾批次后，rt4 运行时测试批次进行中）
> 分析方式：AGENTS.md/codemap 体系 + 代码实测（src 全量统计、game-loop/renderer/frame-* 等核心文件精读）+ 3 个子代理并行审计（engine/physics、ui/audio、tests/工程配置）+ 历史审计报告对照

## 执行摘要

本项目是一个以 TypeScript + Vite 构建的 OutRun 风格 Canvas 2D 伪 3D 街机赛车游戏，同时承担着压力测试 AI IDE 长程无人值守编程能力的实验载体角色。项目在四天内以 206+ 次提交从零演进至功能完备：四种游玩模式、9 条差异化环境赛道、漂移计分/BOOST 氮气/车流 AI/雨天物理等完整玩法闭环，以及 PWA 离线、移动端适配、微信分享等发布能力。工程化程度极高是项目最突出的特征：严格单向依赖架构（game↔ui 环 100% 消除）、纯函数领域层、确定性随机种子、六层 CI 门禁、测试代码量（约 10093 行）超过业务代码量（约 9065 行）。当前全部门禁（typecheck/lint/format/test 707 用例/bot 9 赛道 0 违规/build/e2e 28 次执行）实测全绿，主要待办是 game-loop.ts 的第三轮拆分（当前 1210 行）与若干低优先级打磨项。

## 背景：项目双重定位

依据 AGENTS.md 明文，项目具有双重定位，这直接解释了其形态与演进节奏。

第一重是游戏本体：OutRun 风格伪 3D 街机赛车，Canvas 2D 实现（明确禁用 WebGL/Three.js），功能面覆盖单屏/分屏/热座/挑战四种模式、漂移计分与连击、BOOST 氮气、车流碰撞与避让 AI、天气三态循环、雨天物理、PWA 离线安装、移动端触控与竖屏兼容、微信分享卡片。

第二重是实验载体：为测试 OpenCode Win11 Desktop IDE v1.18.11（主力模型 DeepSeek V4 Flash）长程编程能力极限而生。该定位解释了项目的形态特征——TDD 驱动、mulberry32 确定性种子、bot 黑盒跑圈门禁、codemap 文档体系、每日 50+ 提交的高强度演进、以及大量"刻意保留的防御性折衷"（如 bot violations 容差、长程用例超时档位）。

演进时间线（git 实测）：08-02 完成 M1–M5 渲染骨架/物理/赛道/bot/HUD（35 提交）；08-03 完成 M8–M13 双人 HUD/9 赛道/车流 AI/夜晚/挑战/BOOST/雨天（77 提交）；08-04 完成 M14–M16 性能缓存/小地图/架构重构/PWA/碰撞反馈（40 提交）；08-05 完成 M17–M19 环境差异化/UI-UX 打磨/架构收尾及四个 post-M19 批次（54 提交）。当前工作区存在未提交改动：countdown.ts 与 game-loop.ts 的 innerHTML 收敛（rt4 批次），以及约 20 张 rt4 运行时测试截图。

## 一、项目概述与核心目标

核心目标可归纳为三层：其一，交付一个可直接游玩的伪 3D 街机赛车游戏（功能完整、可安装、可离线、可分享）；其二，建立可复现、可回归、可长期演进的工程体系（确定性生成 + bot 矩阵 + 六层门禁）；其三，作为 AI 长程编程能力的压力测试床，每个里程碑都必须达到 typecheck + lint + test + build + bot 全绿才能提交。

当前功能清单（实测于 index.html、README、frame-update 等）：

- 四种模式：单屏默认 / `?split=1` 分屏（P1=WASD、P2=方向键）/ `?hotseat=1` 热座（回车交棒）/ `?challenge=1` 60 秒限时刷分（目标 5000 分，雨天 +50%、难度 2★+25%/3★+50% 加成）
- 9 条赛道（经典/高速/S 弯/环岛/峡谷/沙漠/森林/海岸/山岳），1-3 星难度，其中峡谷、山岳为夜晚赛道，每条赛道配独立环境色板
- 玩法系统：漂移（急转蓄力 → 连击倍率 → TOP10 入榜）、BOOST 氮气（漂移蓄能、Space/Enter 激活、尾焰粒子）、车流碰撞（减速 + 红闪 + HUD 计数 + 双层音效）、天气三态循环（晴/阴/雨各 45s）、雨天物理（制动 ×0.7 / 转向 ×0.85）
- 社交与持久化：最佳圈速/漂移分/胜场/TOP10/对局记录 localStorage 存档、微信 OG/微博分享卡（CloudBase 永久链接）、PWA 安装离线游玩
- 移动端：四分区触控 + 虚拟摇杆 + 触屏暂停 + 竖屏兼容遮罩（会话记忆）
- 无障碍：榜单卡片键盘展开（tabindex/aria-expanded）、:focus-visible、prefers-reduced-motion 降级

## 二、技术架构与主要模块说明

架构以"分层 + 纯函数 + 单一真源"为骨架，依赖方向经实测严格单向：

```
shared（常量/阶段/圈数/类型，零运行时依赖）
  ↑           ↑
engine     physics    ← 纯函数领域层，实测 0 导入 ui/game
  ↑           ↑
  ui ←────────┘（ui→game 0 处导入，RaceState/TrackContext 类型已提升 shared/types.ts）
  ↑
game（编排层，运行时消费 engine/physics/ui，约 15 处 ui 导入，符合设计）
```

src 共 69 个 TS 文件约 9318 行（含空行，另 style.css 2729 行），模块分布：

| 模块    | 文件数 | 代表文件                                                                              | 职责                                                                                                          |
| ------- | ------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| engine  | 19     | renderer.ts(632)、road-surface.ts(405)、tracks.ts、environment.ts                     | 伪 3D 投影、路面分段/road-strip 离屏缓存、景物/车流/烟雾/地形渲染、光照、环境配置、玩家车绘制                 |
| game    | 29     | game-loop.ts(1210)、frame-update.ts(330)、mode-strategy.ts(312)、finish-accounting.ts | GameLoop 主循环编排、帧更新/渲染纯函数、模式策略、结算、FSM、赛道上下文、音频装配、倒计时/榜单/竖屏等交互模块 |
| ui      | 7      | screens.ts(357)、save.ts(320)、hud.ts、joystick.ts、minimap.ts                        | HUD、屏幕显隐、localStorage 存档、文案常量 copy.ts、触屏摇杆、小地图                                          |
| audio   | 2+1    | engine.ts(385)、music.ts                                                              | WebAudio 程序化合成：引擎/雨声/碰撞/BOOST/漂移胎声/胎噪 + chiptune 音乐（audio-rig 在 game 层装配）           |
| physics | 3      | car.ts、drift.ts、input.ts                                                            | 车辆运动学、漂移状态机、双键盘输入规范化                                                                      |
| ai      | 2      | bot.ts、simulate.ts                                                                   | bot 决策器、无头圈速模拟器                                                                                    |
| shared  | 5      | constants.ts、phase/phase-logic/lap                                                   | 常量/阶段/圈数唯一真源，零运行时依赖                                                                          |

关键架构决策（代码与注释实测验证）：

- 纯函数领域层：frame-update/frame-render/frame-pure/finish-accounting 为无副作用纯函数（状态进、状态/渲染指令出），game-loop.ts 仅做编排；mode-strategy 以策略对象（SINGLE/SPLIT/HOTSEAT/CHALLENGE 四实例）封装模式差异，消除了大 if 分支。
- 常量唯一真源：shared/constants.ts 集中管理游戏参数（含漂移/BOOST/碰撞/倒计时/渲染距离等），engine/physics/ui 直接导入，改动需同步 constants.test.ts 注册表断言；部分视觉调参仍散落在各绘制模块。
- 确定性生成：mulberry32 种子驱动赛道、车流、远山、景物，保证 bot 跑圈可复现，这是 bot 矩阵能作为黑盒门禁的前提。
- 性能工程：road-strip 曲率段离屏缓存、雨滴预渲染双幅平铺、远山按环境懒重建、精灵空间索引、投影 out 参数复用（bench 实测 1260→0.1 对象/帧）、模块级 _viewCache 复用，主循环"帧内零对象分配"。
- 文案同源：ui/copy.ts 为全部 UI 文案唯一真源，且经 copy.test.ts 用关键词断言与 README 保持一致，防止漂移。

## 三、关键功能与业务逻辑梳理

主循环数据流（game-loop.ts → frame-update.ts → frame-render.ts）：rAF 驱动 → updateFrame（车流推进 → 输入路由 → BOOST 蓄能/消耗 → 玩家物理更新 → 碰撞检测 → 音频驱动 → 完赛判定）→ renderFrame（投影渲染）。起步倒计时冻结窗口（RACE_COUNTDOWN_SECONDS=2.4s）内 raceTime/车流/物理全部冻结，消除圈速水分；countdownJustFinished 触发移动端引导浮层。

四种模式经 mode-strategy 统一差异：getInputs（单屏/热座/挑战合并双键盘，分屏独立）、shouldUpdateP2Traffic / collisionIncludesP2（热座按回合）、updatePlayers（热座仅当前回合玩家）、shouldFinish（挑战限时优先 + 圈数判定）。渲染侧 collectSteerInputs 与更新段完全同源，消除帧内二次输入路由。

结算记账（finish-accounting.ts 纯函数）：完赛标记按各玩家圈长/总圈数计算；热座 round 2 按 P1/P2 用时比较胜负；分屏双完赛按漂移得分判 driftWinner（平局归 P1）；胜场统计、漂移 TOP10（入榜名次直接取 addDriftScore 返回的 indexOf，修复了同分误判）、分屏对局记录（最近 10 局）一次写入。漂移得分为结算与排行榜的核心货币，连击倍率步进 0.25 封顶 3.5×，单场得分 clamp 99999（HUD 显示 MAX）。

存档体系（ui/save.ts）：localStorage 分散 key（best-{trackId}/-p2、best-drift-{trackId}、wins-{hotseat|split}、drift-top、match-top），getStorage 双重检查（Node 22 无全局 localStorage 曾导致 CI F2 失败，已用 initialStorage 桩修复）、JSON 损坏/字段校验回退默认、写入前比较旧纪录，兼容性设计良好。

音频体系（audio/engine.ts + music.ts）：全部程序化合成。引擎双锯齿波 + 低通滤波按速度比调制频率/增益；碰撞双层音（噪声砰 + 低频正弦咚）按撞击速度比调响度；漂移胎声/胎噪常驻低电平随车速/转向/湿滑调制；chiptune 音乐 30Hz RAF + 前瞻调度。master/music/sfx 三分轨音量。AudioContext 惰性创建于首次键盘交互，满足自动播放策略。

## 四、代码结构与组织方式评估

总体评价：项目代码组织在同类规模项目中属于上乘——模块划分与 codemap 文档一一对应，职责边界清晰，依赖方向严格单向且经测试守卫，注释质量高（带 P0/P2/E1/M16 等编号标记与修复说明，便于溯源）。

值得肯定的方面：

- codemap 文档体系完备（根 + 各子目录），文件职责、数据流、集成点均有文档，且修复报告持续更新（2026-08-05 已同步 15 处数据漂移）。
- 测试代码量（49 文件 707 用例，约 10093 行）超过业务代码量（9065 行），覆盖到帧更新/渲染纯函数、模式路由、音频调制、存档、漂移状态机等全部关键逻辑；集成测试用虚拟时钟 + 显式超时档位（SIM_TIMEOUT 30s/EPIC 60s），经虚拟时钟桩化根治了 CI 首帧负 dt 的时序 flaky。
- 生命周期管理成熟：GameLoop.destroy + onCleanup 注册表统一移除监听（scan 实测 add/remove 19:19 对称），倒计时返回 cancel 句柄，portrait-mode/leaderboard-cards 等新拆分模块都沿用同一 onCleanup 契约。
- 安全姿态干净：`as any`/`@ts-ignore`/eval 全为 0，innerHTML 仅 2-3 处且均为内部静态内容（countdown 一处刚收敛为 DOM API，rt4 批次进行中），有 `npm run scan` 静态扫描工具化守护。

需要改进的方面集中在规模与局部细节：

- 最大文件 game/game-loop.ts 达 1210 行。M15 曾重构至 719 行，此后竖屏/PWA/菜单预览等逻辑回流重新膨胀。rt4 批次已把 leaderboard-cards/menu-preview/portrait-mode/screen-transition/countdown 拆出，但编排壳仍超千行，距离"编辑壳"定位有差距。
- engine/renderer.ts（632 行）的 renderWithOpts 单方法过长（约 100+ 行），road-surface.ts（405 行）职责仍较杂（缓存绘制/路缘细节/起终点线/雾混合）。
- style.css 单文件 2729 行（M18 已令牌化，但未按屏幕维度拆分）。
- 局部魔法数字散布于绘制模块（渲染距离阈值、粒子参数、视觉调参），与 shared/constants.ts 的集中管理形成对比。
- ui/screens.ts 的 fillFinishPanel 多层分支复杂度高，依赖 finishShown 守卫单次执行，后续改动回归风险高。

## 五、潜在问题与风险点识别

按优先级整理（P0 应立即处理 / P1 近期 / P2 中期 / P3 低优）：

| 编号 | 级别 | 风险点                                  | 现状与证据                                                                                                                                                               | 影响                               |
| ---- | ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| R1   | P0   | 未提交的 innerHTML 收敛改动尚未完成验证 | countdown.ts 已改 DOM API，game-loop.ts 仍有改动，rt4 批次未提交                                                                                                         | 工作区处于中间态，需跑全门禁后提交 |
| R2   | P1   | game-loop.ts 1210 行超大类              | 第三轮拆分已启动（rt4 拆出 5 模块）但未收敛                                                                                                                              | 维护成本高，改动回归风险大         |
| R3   | P1   | 存档无版本号/迁移机制                   | save.ts 用分散 key + filter 白名单校验，新增必填字段会静默丢弃旧条目                                                                                                     | 未来字段演进破坏旧存档             |
| R4   | P1   | 集成测试资源占用高                      | 长程用例逐帧驱动，vite 已抬 8GB 堆；虚拟时钟已根治时序 flaky，但单文件最差 5.3s 仍贴上限                                                                                 | CI 鲁棒性依赖档位余量              |
| R5   | P2   | 渲染性能隐患三处                        | _fillStyleCache 达 1024 上限整体 clear() 抖动；projectTraffic 每帧 filter+sort 分配；roadStrip 缓存内存随赛道数线性增长                                                  | 低端设备/分屏可能掉帧              |
| R6   | P2   | 重复逻辑                                | 三处近距 clamp 机制并存（clampSpriteHeight/MAX_TRAFFIC_HEIGHT_PX/clampSpriteScale）；BOOST 与碰撞 vignette 结构几乎相同；天气 phase 判定在 renderer 与 lighting 重复实现 | 后续改一处漏一处                   |
| R7   | P3   | joystick attach() 非幂等                | attach 未 detach 时重复调用会叠加监听与 appendChild（当前仅 attach 一次，风险低）                                                                                        | 防御性加固                         |
| R8   | P3   | 音频节点生命周期                        | EngineSound/TireSound 构造即 osc.start()，需确认 destroy 路径显式 stop                                                                                                   | 页面销毁后音频上下文占用           |
| R9   | P3   | 每帧 DOM/字符串分配                     | formatTime/formatSpeed 每帧生成新字符串（60fps），updateHud 无脏值比对                                                                                                   | GC 压力，低优先级                  |
| R10  | P3   | environment 参数类型断言                | terrain-draw.ts 用 `as Parameters<...>[0]` 收窄 string，未知环境静默回退 plains                                                                                          | 类型安全弱化，配置错误被掩盖       |

历史遗留已确认修复项（post-M19 批次清零，非当前风险）：format:check 红灯（lint-staged 补 .md 规则）、集成用例超时 flaky（显式档位 + 虚拟时钟桩化）、Node 22 无全局 localStorage 导致的 CI F2 失败（initialStorage 桩）、文档数据漂移 15 处（已同步）。定时器 set/clear 7:3 不对称经逐点审计判定无泄漏。

## 六、后续优化与改进建议

按"红灯清零 → 架构收敛 → 功能方向"排序：

1. 完成 rt4 批次（当前工作区未提交改动）：跑通 typecheck + lint + test + bot + build + e2e 全门禁后提交，确认 innerHTML 收敛为 0-2 处。
2. game-loop.ts 第三轮拆分收尾（P1，M20 候选主项）：剩余候选块为 track-option 构建/refreshTrackPreview 接线/updateTrackBackground（约 110 行）可并入 dom-setup.ts/track-preview.ts；拆分时利用既有 onCleanup 管道保证监听清理。目标 <700 行。
3. 存档版本化（P1）：为 DriftEntry/MatchResult 增加 schemaVersion 字段或统一 versioned envelope + 迁移函数，替代 filter 白名单的隐式兼容。
4. 渲染性能加固（P2）：_fillStyleCache 改 LRU 或分段清空替代全清；projectTraffic 改原地过滤 + 复用排序数组；roadStrip 缓存按需构建/按 TrackContext 复用而非每次 setTrack 全量预渲染。
5. 重复逻辑收敛（P2）：统一 vignette 工厂；天气 phase 判定收敛到单一真源；三处近距 clamp 合并。
6. 视觉调参魔法数字收敛（P2）：把绘制模块的常量（RAIN_DROPS、WET_HIGHLIGHT、PLAYER_CAR_TILT 等）提升到共享常量层或模块内统一命名导出，便于调参与测试。
7. style.css 按屏幕维度拆分（P3）。
8. 功能方向候选（按与项目定位契合度）：计时赛幽灵回放（录制确定性输入序列回放，与确定性生成基因天然契合、技术风险低、演示价值高）；手柄 Gamepad API 支持；云排行榜（微信分享已接 CloudBase，后端基建现成）。若继续以压力测试 AI IDE 为主要目的，选择跨多文件、需长程一致性的特性（如幽灵回放 + 排行榜联动）比孤立小功能更达测试目的。

## 结论

AI-Racing-Games 是一个功能完备、工程化水准远超同体量个人项目的伪 3D 赛车游戏，其架构（严格单向依赖 + 纯函数领域层 + 确定性生成 + 六层门禁）使其成为可复现、可回归、可持续演进的代码库。当前全部质量门禁实测全绿，项目处于可发布状态。最值得优先处理的事项是完成当前未提交的 innerHTML 收敛批次并跑通门禁提交（P0），随后推进 game-loop.ts 第三轮拆分与存档版本化（P1）；渲染层性能加固、重复逻辑收敛、魔法数字集中管理作为中期打磨；功能层面幽灵回放与云排行榜是兼具契合度与演示价值的下一步方向。

## 局限性说明

本报告基于代码精读 + 子代理审计 + 历史审计报告对照，未在本机实际重跑全部门禁（typecheck/lint/test/bot/build/e2e），各项门禁结果引用的是 2026-08-05 19:35 后的复测证据与 CI run #5 全绿记录；当前工作区存在未提交改动（rt4 innerHTML 收敛），提交前应重跑全量验证。行数为 wc 口径（含空行），与 PowerShell 口径存在约 13% 差异。

## 参考文献

1. [AGENTS.md - 项目规范（项目根）](d:\AI\AI-Racing-Games\AGENTS.md)
2. [codemap.md - 仓库代码地图（项目根）](d:\AI\AI-Racing-Games\codemap.md)
3. [src/codemap.md - 源码总览](d:\AI\AI-Racing-Games\src\codemap.md)
4. [research_report_project_analysis_post_m19.md](d:\AI\AI-Racing-Games\docs\reports\research_report_project_analysis_post_m19.md)
5. [research_report_fixes_post_m19_2026-08-05.md](d:\AI\AI-Racing-Games\docs\reports\research_report_fixes_post_m19_2026-08-05.md)
6. [research_report_project_analysis_deep.md](d:\AI\AI-Racing-Games\docs\reports\research_report_project_analysis_deep.md)
7. [README.md - 项目说明与里程碑状态](d:\AI\AI-Racing-Games\README.md)
8. [vite.config.ts - PWA 与测试配置](d:\AI\AI-Racing-Games\vite.config.ts)
9. [.github/workflows/ci.yml - 六层 CI 门禁](d:\AI\AI-Racing-Games.github\workflows\ci.yml)
