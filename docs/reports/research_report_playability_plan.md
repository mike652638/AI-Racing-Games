# 研究报告：AI-Racing-Games 可玩性提升方案与实施规划

日期：2026-08-07
范围：OutRun 伪 3D 复刻（TypeScript + Vite + Canvas 2D，PWA）
方法：项目代码分析 + 联网研究（经典街机机制、现代/手游竞速趋势、氮气/漂移系统设计深度拆解）

---

## 执行摘要

当前项目已完成 M1-M21，核心玩法系统（漂移得分+连击、BOOST 氮气、车流避让、雨天物理、挑战模式、分屏/热座、9 赛道、TOP10 排行榜）已相当完整，但存在三个可玩性短板：**数值单一**（BOOST 只靠漂移蓄能、得分只靠漂移）、**目标感浅**（除挑战模式外缺少"再来一局"的渐进目标）、**操作天花板有限**（没有 QQ 飞车式的技巧体系与 near-miss 反馈）。研究报告以"速度感、车技、目标感"三大核心体验为框架，输出 14 项可玩性方案并给出实施路线图：P0 快赢 3 项（near-miss 贴身超车、完美氮气窗口、漂移小喷加速），P1 系统级 5 项（擦墙充能、氮气罐收集、解锁/成就、S/A/B 奖牌、检查点挑战扩展），P2 远期 6 项。全部方案均遵守项目"纯函数领域层 + 常量唯一真源 + 确定性种子 + bot 矩阵回归"的架构约束。

---

## 一、项目现状：已有玩法系统盘点

从代码确认的现有系统（src/shared/constants.ts、src/physics/drift.ts、src/physics/car.ts、src/game/mode-strategy.ts）：

1. **BOOST 氮气**：漂移激活期间蓄能 charge（0-1，速率 0.3/s，衰减 2/s）→ 空格/Enter 激活 → 加速度 ×0.6、速度上限突破 1.15×maxSpeed、消耗 0.5/s。有尾焰粒子、未蓄能红闪、HUD BOOST 条。
2. **漂移系统**：转向 >0.7 且速度 >0.5×maxSpeed 蓄能 → 得分（速率 ∝ 速度），连击每 0.5s +1 级、倍率 +0.25/级、上限 10 级（3.5×），烟雾粒子。
3. **模式**：单屏 / 分屏(?split=1) / 热座(?hotseat=1) / 挑战 60s 刷分(?challenge=1)，mode-strategy 策略对象封装。
4. **车流**：9 赛道 14 条/圈车流 + bot 车流感知避让。
5. **雨天物理**：制动 ×0.7、转向 ×0.85。
6. **环境差异化**：9 种环境（天空/草地/远山/景物色板、夜晚车灯）。
7. **排行榜**：漂移得分/胜场/分屏 TOP10；挑战目标分 5000。
8. **碰撞反馈**：红闪 vignette、HUD 计数、双层碰撞音、横向弹开。

**可玩性短板诊断**：

- **蓄能来源单一**：charge 只来自漂移激活，BOOST 与漂移强绑定，缺少"近距超车""擦墙""完美过弯"等 Burnout 式危险驾驶蓄能路径——BOOST 的爽感只有一种触发方式。
- **得分来源单一**：挑战模式得分只看漂移，near-miss、超车、擦墙、时间奖励均不计分，浪费了车流系统的博弈空间。
- **目标感浅**：除了 BEST 时间与 TOP10，没有渐进目标（奖牌/解锁/成就），重复游玩缺乏"下一步干什么"的牵引。
- **操作天花板**：漂移连击与 BOOST 是仅有的深度，缺少"漂移→释放→加速"（Mini-Turbo 式）的技巧链与时机博弈（完美氮气窗口）。

---

## 二、研究结论：竞速游戏可玩性的三大支柱

联网研究（GameRes/网易游戏学院《浅谈赛车游戏的体验设计》）表明，抛开社交与养成，竞速游戏的核心体验可归纳为三类，设计必须做取舍：**真实视听**（汽车爱好者）、**爽快飙车/速度感**（泛用户）、**磨炼车技/技术感**（竞技用户）。经典案例的定位：CSR 赛车=真实、狂野飙车=速度感、QQ 飞车=车技。本项目作为 OutRun 伪 3D 复刻，天然定位是"爽快飙车 + 磨炼车技"的混合体（伪 3D 不追求真实感），因此可玩性提升应围绕**速度感放大**（氮气、near-miss、反馈 juice）与**车技深度**（技巧体系、完美时机、蓄能博弈）双线展开，辅以**目标感**（解锁/奖牌/成就）形成长线留存。

经典与标杆机制的横向结论：

- **OutRun 系**：检查站延长时间（时间压力）、分支路线（5 of 15）、Heart Attack 贴车博弈、跑分取分（漂移+贴身超车+检查站）——本项目可低成本借鉴"检查站"与"贴身超车"。
- **Burnout 系**：BOOST 蓄能来自"危险驾驶"（近距超车、漂移、擦墙、撞毁对手），蓄能路径即玩法规训——本项目 BOOST 蓄能路径可从 1 种扩到 4 种。
- **Mario Kart 系**：Mini-Turbo 漂移加速（火花等级蓝/橙/紫 → 松键释放，时长 0.6s/1.7s/2.6s，转向越死蓄力越快 5:2），等级博弈制造操作深度；Snaking 连续漂移形成技巧流派。
- **Traffic Rider / 公路骑手**：near-miss 近身超车加分/加时间——本项目车流系统可直接扩展，与既有碰撞检测共用几何判定。
- **手游 live-ops**：每日签到 streaks、成就（首日解锁成就留存 +64%）、金币→升级/解锁循环，轻量实现依赖 localStorage（本项目已有 save.ts 存档层）。
- **Game Feel juice**：震屏、数字弹跳、速度线、FOV 变化、卡肉感——本项目已有碰撞红闪/速度线基础，可继续强化。

---

## 三、可玩性提升方案清单（按优先级分档）

### P0 快赢（低成本、高回报，1-2 个里程碑内可落地）

**方案 1：near-miss 贴身超车系统（强烈推荐）**
设计动机：车流是本项目最有博弈空间的系统，但超车没有任何奖励反馈，"躲车"与"超车"无差异。机制：与车流横向间距小于容差（约 0.35×半宽）、纵向安全时，判定近身超车 → 屏幕边缘闪光 + 音效 + "NEAR MISS" 弹出 + 得分/蓄能。可复用既有碰撞检测的几何判定（traffic.ts 的 offset 距离），新增纯函数 near-miss 判定，HUD 复用 score-pop 动画模式。
数值草案：near-miss 得分 = 100 ×（当前连击倍率）；每次 near-miss 额外 +0.1 charge（打通"超车→蓄能→氮气"循环）。
涉及模块：physics（新增 near-miss 纯函数）、frame-update、hud.ts、audio、copy.ts。复杂度：低。
风险：需 bot 回归确认（bot 车流感知已有减速逻辑，判定 near-miss 需与 bot 行为兼容）。

**方案 2：完美氮气窗口（Perfect Boost）**
设计动机：现 BOOST 是"有能量就按"，无时机博弈，爽感天花板低。机制：激活 BOOST 时进入 0.35s 判定窗口，窗口内二次按键（或蓄力 80%-100% 时激活）触发"完美氮气"——额外加速度 +20%、HUD 金色闪光 + 高音效；非完美则普通加速。参考 Asphalt perfect nitro 与 Burnout 完美释放。
数值草案：普通加速度 ×0.6，完美 ×0.72（BOOST_ACCEL_MULT 0.6 → perfect 0.72）；完美氮气尾焰颜色升级（蓝→橙）。
涉及模块：physics/car.ts（BOOST 分支）、hud.ts、renderer（粒子颜色）、audio。复杂度：低。
风险：低，纯增量。

**方案 3：漂移小喷加速（Mini-Turbo 式漂移→释放喷发）**
设计动机：现有漂移是"持续得分的状态"，缺少"漂移结束瞬间的回报"，出弯无爽点。机制：漂移 release 边沿（active→inactive）时，若蓄力超过阈值，触发一次短时加速（加速度 ×1.0、持续 0.4s），火花等级化（charge>0.4 蓝火短喷、charge>0.7 橙火长喷 0.8s）——参考 Mario Kart 蓝/橙火花两级。
数值草案：小喷加速倍数 1.0（高于 BOOST 的 0.6 但仅 0.4-0.8s），不消耗 BOOST 能量、不突破 maxSpeed（保持 BOOST 的独特价值）。
涉及模块：physics/drift.ts（release 边沿检测 + 喷发状态）、car.ts（短时加速度注入）、renderer（火花粒子）。复杂度：中。
风险：中——需与 BOOST 的漂移蓄能共用 drift state，注意纯函数签名扩展；bot 矩阵需确认 bot 不因小喷失控。

### P1 系统级（中等成本，扩展既有系统的深度）

**方案 4：危险驾驶蓄能矩阵（Burnout 式蓄能扩展）**
设计动机：BOOST 蓄能目前只来自漂移（蓄能 0.3/s），路径单一。扩展为 4 路径：漂移蓄能（现状）、near-miss 蓄能（+0.1/次）、擦墙蓄能（贴边行驶持续 +0.15/s，代价是轻微掉速）、完美过弯蓄能（弯道保持中心线 +0.05/s）。多条路径叠加制造"怎么玩都攒气"的开放感，同时用擦墙掉速做风险-收益权衡。
数值草案：各路径速率独立叠加，charge 上限仍 1.0；擦墙蓄能需检测"距路边 <0.2×半宽"且未出界。
涉及模块：physics/car.ts、frame-update、新增 wall-ride 检测。复杂度：中。
风险：中——擦墙判定需与 OFF_ROAD_PUSHBACK 交互测试，防止刷气。

**方案 5：赛道氮气罐收集**
设计动机：经典街机（QQ 飞车氮气罐、Asphalt 氮气道具）的赛道收集物是最直观的"目标点"，填补赛道中段的目标空白。机制：确定性随机种子在赛道生成 6-10 个氮气罐（路面漂浮），触碰到 +0.5 charge（或直接满罐触发短氮气），有收集音效与粒子。
涉及模块：engine/tracks.ts（罐位置生成）、frame-update（碰撞检测）、renderer（罐体绘制，可复用 sprite 系统）、HUD。复杂度：中。
风险：中——需保证确定性生成（bot 矩阵可复现）与 e2e 视觉无破坏。

**方案 6：解锁 / 成就 / 收集系统**
设计动机：当前排行榜是唯一长线目标，缺少"下一步解锁什么"的牵引（手游留存研究：首日成就解锁留存 +64%）。机制：基于 localStorage（save.ts 已有存档版本化）实现——车辆涂装解锁（累计胜场 ≥5 解锁第 2 色、≥15 解锁第 3 色）、成就徽章（首次 BOOST、10 连击、near-miss 10 次、雨天赛道完赛等 8-10 个）、结算屏展示新解锁。
涉及模块：ui/save.ts（存档 schema 扩展 + 版本迁移）、ui/screens.ts（结算展示）、copy.ts（成就文案）。复杂度：中。
风险：低——纯增量，存档需加版本号迁移函数（项目已有存档版本化先例）。

**方案 7：赛道 S/A/B 奖牌评价**
设计动机：时间挑战的最经典目标感（铜/银/金），强化"刷 BEST"动机。机制：每赛道按 BEST 时间设定金/银/铜门槛（相对 bot 基准时间的百分比），结算屏显示奖牌 + 菜单赛道卡显示已得奖牌。与现有 BEST 存档（save.ts）与赛道卡 UI 天然集成。
数值草案：金牌 < 1.00×bot 基准、银牌 < 1.15×、铜牌 < 1.30×（bot 基准由 run-bot 输出校准）。
涉及模块：ui/save.ts、ui/screens.ts、engine/tracks.ts（门槛配置）、copy.ts。复杂度：低-中。
风险：低。

**方案 8：挑战模式扩展（检查站 + 连击计时奖励）**
设计动机：挑战模式 60s 刷分目前"只刷漂移分"，策略单一。机制：加入 OutRun 式检查站（每圈设 2 个检查点，提前通过 + 剩余时间奖励）、超车/擦墙/near-miss 均计分（打通方案 1/4 的得分路径）、时间奖励叠加连击倍率。60s → 检查站制（未通过检查站时间耗尽则结束）。
涉及模块：game/finish-accounting.ts、frame-update、hud（挑战 HUD）、copy.ts。复杂度：中。
风险：中——需重算 CHALLENGE_TARGET_SCORE（5000 → 新数值体系），涉及既有测试断言（constants.test.ts）。

### P2 远期（高成本或高架构影响，需单独里程碑）

**方案 9：分支路线选择（OutRun 5 of 15 式）**
现赛道是环形 + 圈数，改为"分段递进 + 每段岔路"需重做 TrackDef 结构与完赛判定，影响 bot 矩阵与 e2e。可作为独立大版本。轻量中间态：菜单增加"路线主题"（同一赛道不同环境/车流组合的选择），已验证环境系统（M17）可复用。

**方案 10：导航辅助线（降低门槛）**
复用 bot 决策器（steerGain 中心线纠偏）生成"理想走线"投影提示，新手可开启。成本低但需评估对老玩家公平性的影响（辅助开启不计入 TOP10 榜单）。

**方案 11：随机天气 / 夜间变体对局**
基于环境系统（M17）与雨天物理（M12），菜单增加"随机天气"开关，对局开始时骰子决定雨天/夜晚/晴天，影响物理与渲染。成本中，风险中（bot 矩阵需覆盖天气变体）。

**方案 12：游戏 Feedback 强化（Game Feel juice）**
持续打磨：加速 FOV 动态变化、漂移得分数字弹跳（已有 score-pop 基础）、near-miss 屏幕边缘速度线、碰撞卡肉感（已有 vignette）、BOOST 激活时镜头轻微后拉。每项成本低，但涉及渲染层多处，宜作为"打磨里程碑"集中做。

**方案 13：车流 AI 橡皮筋 / 动态难度**
当前 bot 固定 steerGain。为竞速感加"动态难度"（根据玩家圈速调整 bot 目标速度系数 ±10%），制造始终有竞争。风险中（破坏确定性回归），需在 bot 模式与玩家模式分路。

**方案 14：每日挑战 / 签到 streaks**
PWA 离线环境下用 localStorage 记录每日挑战（如"今日 3 分钟跑完 X 赛道 + 漂移 2000 分"），次日重置。轻量 live-ops，成本低，但单机下价值有限，建议最后考虑。

---

## 四、氮气系统专题深挖（用户点名方向）

现有 BOOST 的架构定位（src/physics/car.ts 注释 "G4"）：加速度 ×0.6、上限 1.15×maxSpeed、charge 只由漂移蓄能。建议的扩展路径（按推荐度排序）：

1. **蓄能来源矩阵**（方案 4，推荐度最高）：漂移 / near-miss / 擦墙 / 完美过弯四路蓄能，把"玩得浪"（危险驾驶）与"攒得气"绑定，这是 Burnout 系的核心设计哲学——**蓄能路径即玩法规训**。落地后 BOOST 从"漂移副产品"变为"驾驶风格的奖励"。
2. **完美氮气窗口**（方案 2）：二次按键时机判定 + 金色反馈，1 行判定 + HUD 样式，成本最低的"手感放大器"。
3. **漂移小喷**（方案 3）：与 BOOST 形成"短喷（技巧性）/ 长冲（战略性）"双层加速体系，参考 Mario Kart Mini-Turbo 火花等级制造操作深度。
4. **氮气罐收集**（方案 5）：提供赛道内主动目标，与 near-miss 并列为"路上有什么可吃"的两大驱动力。
5. **BOOST 撞车惩罚强化**：激活中碰撞掉充能（如 -0.3）而非仅掉速，强化"氮气是高风险高回报"的街机博弈。
6. **连喷三连（远期）**：参考 Asphalt 多重氮气，BOOST 可分段（3 小段逐段激活），工程量大（需改 charge 语义为分段槽），列为 P2。

设计原则：所有氮气扩展必须保持**纯函数**（frame-update 内新增纯函数返回新状态）、数值进 **src/shared/constants.ts**（并同步 tests/unit/constants.test.ts 注册表断言）、**确定性**（收集物生成用确定性种子，保证 bot 矩阵复现）。

---

## 五、实施路线图

建议将可玩性提升作为 **M22（可玩性 v1：技巧与反馈）** 与 **M23（可玩性 v2：目标与长线）** 两个里程碑：

**M22 可玩性 v1**（对应 P0 + P1 部分）：

1. near-miss 贴身超车系统（方案 1）
2. 完美氮气窗口（方案 2）
3. 漂移小喷加速（方案 3）
4. 危险驾驶蓄能矩阵（方案 4）
5. 赛道氮气罐收集（方案 5）
   验收：typecheck + lint + vitest 新增 near-miss/完美氮气/小喷用例 + bot 9 赛道矩阵 0 违规 + build PWA + e2e。

**M23 可玩性 v2**（对应 P1 剩余 + P2 精选）：

1. 解锁/成就/涂装系统（方案 6）
2. 赛道 S/A/B 奖牌（方案 7）
3. 挑战模式检查站扩展（方案 8）
4. Game Feel 强化批次（方案 12，含 FOV/数字弹跳/near-miss 速度线）5.（可选）导航辅助线（方案 10）
   验收同上 + 存档版本迁移测试 + e2e 视觉回归。

**远期单列**：分支路线（方案 9，独立大版本评估）、随机天气对局（方案 11）、车流动态难度（方案 13）。

**风险清单**：

- bot 矩阵回归是硬约束——所有新机制必须有"bot 不滥用"的防护（如 bot 不发 BOOST/小喷，或 bot 逻辑同步升级），需在 tests/bot/run-bot.ts 增加断言。
- constants.test.ts 注册表断言——新数值必须同步注册，否则 CI 红。
- 存档 schema 变更需版本迁移（save.ts），防止旧存档读取崩溃。
- 挑战模式目标分 5000 若因新得分路径膨胀需重定，涉及既有文案（copy.ts）与测试。
- e2e 视觉回归对新 HUD 元素（NEAR MISS 弹出、完美氮气闪光）需新增断言或豁免。

---

## 六、结论

项目可玩性提升的核心矛盾不是"缺机制"而是"机制间缺乏联动"：BOOST 与漂移强绑定、得分只看漂移、超车无奖励、长线无目标。按三大核心体验（速度感/车技/目标感）审视，最高性价比的三步是：**near-miss 贴身超车**（打通车流博弈与得分/蓄能的联动）、**完美氮气 + 漂移小喷**（把 BOOST 从"按钮"变成"技巧"）、**解锁/奖牌成就**（建立"再来一局"的渐进牵引）。氮气系统本身已有良好基础（纯函数 + 常量真源 + 反馈齐全），扩展方向应是"蓄能来源矩阵 + 释放时机博弈"而非推翻重做。所有方案均可在不破坏架构约束（纯函数领域层、确定性种子、bot 回归）的前提下以 2 个里程碑渐进落地。

---

## 参考资料

1. [OutRun 1986 - 百度百科](https://baike.baidu.com/item/OUTRUN/8241011)
2. [OutRun 2 - StrategyWiki](https://strategywiki.org/wiki/OutRun_2)
3. [OutRun 2 - Gamicus Fandom](https://gamicus.fandom.com/wiki/OutRun_2)
4. [Mini-Turbo - Super Mario Wiki](https://www.mariowiki.com/Mini-Turbo)
5. [Boost - Burnout Wiki (Fandom)](https://burnout.fandom.com/wiki/Boost)
6. [Boost - Burnout Wiki](https://burnout.wiki/wiki/Boost)
7. [OutRun 2 跑分模式取分技巧 - 百度贴吧](https://tieba.baidu.com/p/6750846530)
8. [浅谈赛车游戏的体验设计 - GameRes/网易游戏学院](http://baijiahao.baidu.com/s?id=1692446381213173198&wfr=spider&for=pc)
9. [QQ飞车手游 赛车属性特性解析 - 官方攻略](https://speedm.qq.com/web201712/strategy-detail.shtml?newsid=9388344)
10. [QQ飞车手游 基本操作教学 - 官方攻略](https://speedm.qq.com/web201712/strategy-detail.shtml?newsid=6426523)
11. [游戏论文分享：GameFeel 设计纵览 - 机核 GCORES](https://www.gcores.com/articles/137125)
12. [如何提升游戏感？- 知乎](https://zhuanlan.zhihu.com/p/146403967)
13. [Making Gameplay Irresistibly Satisfying Using Game Juice - The Design Lab](https://thedesignlab.blog/2025/01/06/making-gameplay-irresistibly-satisfying-using-game-juice/)
14. [How to build a racing game (伪3D 竞速系列) - codeincomplete.com](https://codeincomplete.com/posts/2012/6/23/javascript_racer_v1_straight/)
15. [App Achievements Gamification - trophy.so](https://trophy.so/blog/achievements-feature-gamification-examples)
16. [Daily Rewards and Incentives in Mobile Gaming - datacalculus.com](https://datacalculus.com/en/blog/mobile-gaming-apps/product-manager/daily-rewards-and-incentives-in-mobile-gaming-apps)
17. [Traffic Rider 近距超车机制 - 游戏介绍](https://www.chazidian.com/game/189145.html)
