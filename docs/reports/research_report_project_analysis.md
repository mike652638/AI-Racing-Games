# AI-Racing-Games 项目深度分析报告

## 执行摘要

AI-Racing-Games 是一个基于 TypeScript + Vite 构建的 OutRun 风格伪 3D 赛车游戏复刻项目。项目体量约 75 个 TypeScript 源文件、711 个测试用例、9 条赛道、涵盖 22 个里程碑（M1-M32），自 2026 年初起持续迭代至 2026 年 8 月。核心设计哲学是"纯函数领域层 + 编排层"的严格分层架构：渲染引擎（engine）和物理系统（physics）作为纯计算层不依赖 DOM，游戏循环（game）作为薄编排层串联各模块，UI 表现层对 game 层已实现 100% 解耦（零运行时依赖）。项目拥有四层自动化质量门禁（typecheck → lint → unit test → bot 矩阵回归 → E2E 视觉回归 → build），并通过 bot 跑圈 9 赛道矩阵 0 违规作为确定性回归锚点。

---

## 一、项目定位与技术背景

### 1.1 项目性质

该项目是 OutRun 经典街机赛车的 Canvas 2D 伪 3D 复刻，同时也是对 OpenCode Win11 Desktop IDE v1.18.11 长程编程能力极限的测试项目（主力模型为 DeepSeek V4 Flash）。项目以"纯函数领域层 + 编排层"为核心架构思想，确保核心逻辑可独立于运行时环境进行单元测试与 bot 自动化验证。

### 1.2 技术选型

技术栈已稳定且不建议随意更换：

- 语言：TypeScript（ES2022 target，strict mode，noUnusedLocals / noUnusedParameters 开启）
- 构建：Vite 8.x（开发服务器 + 生产构建），base 配置为相对路径 `./` 以兼容 CloudBase 子目录静态托管
- 渲染：Canvas 2D API（纯软件渲染，不使用 WebGL / Three.js）
- 测试：Vitest 4.x（711 用例，单 worker execArgv 8GB 堆）、Playwright（E2E 视觉回归，3 个 project）
- 脚本执行：tsx 4.x（用于 bot 跑圈、性能基准、安全扫描等 Node.js 脚本）
- 代码质量：ESLint（typescript-eslint）+ Prettier + husky + lint-staged（提交前自动检查）
- PWA 离线：vite-plugin-pwa 1.3.0（registerType: 'prompt'，手动控制注册时机）

### 1.3 部署方式

项目部署于腾讯云 CloudBase 静态托管（环境 `joyful-d6glfqzna80c9f036`，ap-shanghai 地域），线上地址为子路径 `/ai-racing-games/`。通过 `base: './'` 的相对路径策略确保任意子路径部署均正常加载资源。PWA 的 start_url 和 scope 也使用相对路径 `./` 与子目录部署兼容。微信分享通过 `share-card-v2.png` 与 og:image 完整 URL 实现。

---

## 二、架构设计与模块划分

### 2.1 分层架构概览

项目采用严格的分层架构，依赖方向自上而下单向。层次从底层（零依赖）到顶层（编排层）依次为：

第一层（共享层）：src/shared/ — 常量、类型、阶段、圈数、奖牌判定。零运行时依赖，是依赖图的根节点。

第二层（领域层）：src/engine/ + src/physics/ + src/ui/ + src/audio/ — 纯函数领域逻辑与表现层。engine 和 physics 不依赖 DOM，可脱离浏览器运行；ui 和 audio 依赖 DOM / Web Audio API，但不依赖 game 层。

第三层（编排层）：src/game/ — GameLoop 主循环将 engine、physics、ui、audio 串联为完整游戏。29 个文件，核心文件 game-loop.ts 约 973 行。

第四层（入口层）：src/main.ts — 7 行引导代码，仅调用 initGame() 和 setupPwaUpdate()。

### 2.2 关键解环决策（2026-08-05）

原 game 和 ui 之间存在受限双向依赖环。2026-08-05 完成彻底解环：

- 运行时常量（DRIFT_SCORE_MAX、CHALLENGE_TARGET_SCORE 等）从 game/constants 提升至 shared/constants
- 阶段定义与转移逻辑提升至 shared/phase.ts 和 shared/phase-logic.ts
- 圈数计算提升至 shared/lap.ts
- RaceState 和 TrackContext 接口类型从 game 提升至 shared/types.ts（import type，编译期擦除）
- ui/gamestate.ts 纯 re-export 兼容层在确认零消费方后直接删除

解环后 ui 对 game 已 100% 解耦（运行时零依赖），engine 和 physics 也直接依赖 shared/constants 而非 game 层的 re-export。

### 2.3 各模块详细职责

**src/shared/（独立共享层，7 个文件）**

- constants.ts：20 个以上游戏参数唯一真源，包括漂移得分上限（DRIFT_SCORE_MAX=999999）、挑战限时（CHALLENGE_SECONDS=60）、BOOST 倍率（BOOST_ACCEL_MULT=0.65）、碰撞参数（COLLISION_COOLDOWN=1s）、渲染参数（DRAW_DISTANCE=300）
- phase.ts / phase-logic.ts：四态 FSM（MENU/RACING/PAUSED/FINISHED），含 nextPhase 和 togglePause 纯函数
- lap.ts：圈数计算 lapFromZ(cameraZ, lapLength)
- types.ts：RaceState、TrackContext、PlayerState 等核心接口定义
- medal.ts：S/A/B 奖牌判定（基于 bot 基准总用时的金/银/铜门槛）

**src/engine/（伪 3D 渲染引擎层，21 个文件）**

- projection.ts：世界坐标 → 屏幕坐标的透视投影（scale = depth / (z - camera.z)），返回 null 处理相机后方剔除。
- track.ts / tracks.ts：赛道分段数据结构（Segment/CurveGroup/CurveControlPoint）；9 条设定赛道注册表（TRACK_DEFS），含难度星级（1-3）、车流密度、日夜标记（timeOfDay）、环境类型（plains/highway/s-curve/island/canyon/desert/forest/coast/alpine）。
- environment.ts：9 种环境配置唯一真源——天空色相、草地色相、远山配色、景物类型与密度、地形装饰类型（沙丘/海面/岩壁）、车灯配色。
- scenery.ts：确定性 PRNG（mulberry32）、远山轮廓生成（3 层正弦叠加）、视差偏移。
- sprites.ts：路边景物系统（树/路灯/仙人掌/棕榈/雪堆），曲率前缀和 O(1) 偏移查询，环形可见窗口索引。
- road-geometry.ts：路面分段四边形投影、奇偶配色、中心线判定。
- road-surface.ts：9 带横向渐变 + 颗粒噪点 + shadeColor 亮度调节、路缘立体感（M18 新增分隔线+高光条）。
- road-strip.ts：曲率段合并与离屏缓存（直道段预渲染到 OffscreenCanvas，切片 drawImage 加速）。
- lighting.ts：120s 周期四段 HSL 插值 + 晴/阴/雨三态各 45s + 夜晚深暗色板 + 环境色相差异化。
- player-car.ts：玩家车精灵在屏幕底部固定绘制（不参与世界投影），含夜间车灯光晕、BOOST 尾焰粒子、碰撞闪白反馈。
- renderer.ts：Renderer 门面类。单屏 render() 与分屏 renderRegion() + drawDivider() 分隔线。支持 RenderView 参数化（分屏双世界零重建）。
- sprite-draw.ts / terrain-draw.ts / traffic-draw.ts / screen-effects.ts / smoke-render.ts / guide-line.ts：2026-08-05 从 renderer.ts 拆分的渲染关注点模块。

**src/physics/（车辆物理层，3 个文件）**

- car.ts：速度/加速度/转向模型。含路缘出界判定（侧面 pushBack 0.05 防钉死边缘）、雨天物理（wet 制动 ×0.7、转向 ×0.85）、BOOST 氮气加速（突破 1.15×maxSpeed）。分屏独立世界不互碰。
- drift.ts：漂移状态机纯函数。charge 积累（急转蓄力）→ 激活（阈值触发）→ 连击系统（0.5s 窗口，combo 每 2s 递增）→ 倍率得分（×(1+combo×0.25)）→ DRIFT_SCORE_MAX 封顶 → 挑战模式加成 ×1.5（雨天 +50%、难度 ★×25%）。
- input.ts：双人按键映射（P1 = WASD / P2 = 方向键，互不干扰），含 Space/Enter BOOST 按键、左/右转向抵消逻辑。

**src/ai/（AI 决策层，2 个文件）**

- bot.ts：bot 自动驾驶决策器。前向窗口检测弯道（|Σcurve| 阈值），弯道降速 + 横向回中转向。纯函数，输出 {throttle, steer}。
- simulate.ts：无头跑圈模拟器 simulateLaps()。串联 bot 决策 → 车辆物理 → 赛道分段 → 违规检测，用于 bot 矩阵回归与性能基准。

**src/game/（游戏编排层，29 个文件）**

- game-loop.ts：主循环编排壳（973 行）。构造时解析四种游玩模式（split 优先互斥）。每帧流程：车流推进 → 输入采集 → BOOST 蓄力/消耗 → updatePlayerFrame（漂移→速度→运动学→相机→计时→圈速）→ 碰撞裁决 → 环境音效 → 限时判定 → 渲染 → updateHUD。阶段切换、赛道选择、热座交棒、挑战计时、结算记账均在此编排。
- mode-strategy.ts：策略对象封装单屏/分屏/热座/挑战四种模式的差异（getInputs 路由、updateActivePlayer、afterSelectP1Track、shouldFinish 判定等），避免 if-else 分支。
- frame-update.ts / frame-render.ts / frame-pure.ts：无副作用纯函数（状态进、渲染指令出），game-loop 仅做薄编排壳。
- finish-accounting.ts：结算记账纯函数。完赛 → 写入最佳圈速/漂移分 → 胜场统计（recordWin，分屏热座独立 key）→ 漂移 TOP10 排行榜（带 combo 连击字段）→ 分屏对局最近 10 局（addMatchResult）。
- collision.ts / collision-feedback.ts：车流碰撞判定（分屏独立世界，横向容差 0.55，1s 冷却）+ 碰撞红闪状态机（速度比映射 flashSeed、指数衰减 + EPSILON 归零）。
- track-context.ts / track-manager.ts：TrackContext（单玩家赛道世界：分段/圈长/圈数/曲率前缀和/景物索引/车流预计算）与 TrackManager（双玩家独立赛道管理，selected/selected-p2 双类高亮）。
- state.ts / player-state.ts：RaceState（运行时唯一可变状态容器，含双玩家 PlayerState + 双 TrackContext）与 createPlayerState/resetPlayerState 工厂。
- daily.ts：每日挑战轻量 live-ops 模块。基于日期确定性哈希选今日赛道，createDailyState/rollDailyToToday/markDailyFinished 状态机，连续签到 streaks。
- dom-setup.ts / track-preview.ts / audio-rig.ts / debug-hook.ts / top-refresh.ts / countdown.ts / gameFeelFor.ts / routeFork.ts：支持性模块。

**src/ui/（UI 表现层，7 个文件）**

- hud.ts：双人 HUD（双人速度/计时/圈数、分屏 P2 BEST、热座玩家标签、漂移连击/倍率/MAX 标记、挑战倒计时、碰撞计数、BOOST 条、near-miss 计数）、HUD 脏值比对优化。
- screens.ts：启动/暂停/结算画面状态管理（双人填充、挑战模式分支、热座胜负横幅、分屏漂移竞速横幅、结算动画、榜单展开/收起独立控制、整体切换按钮）。
- save.ts：localStorage 多 key 版本化持久化。最佳圈速（分赛道 + 分玩家 -p2 后缀）、胜场统计（分屏/热座独立 key + 连胜）、漂移 TOP10 排行榜（10 条降序，含 combo 连击字段）、分屏对局最近 10 局、总/音乐/音效音量持久化、每日挑战存档。
- format.ts：格式化工具（速度 km/h、计时 MM:SS.mmm、圈数推导、金额千分位）。
- copy.ts：文案常量唯一真源（12+ 条，与 README 同源防漂移）。
- joystick.ts：触屏虚拟摇杆（touchToCarInput 四分区映射 + 多点触控并集 + PAUSED 时 reset 清残留输入）。
- minimap.ts：小地图/赛道进度指示器（构造预计算轨迹折线归一化，每帧按 cameraZ % lapLength 重绘位置点）。

**src/audio/（程序化音频层，2 个文件）**

- engine.ts：引擎音效（computeEngineParams 频率/增益映射 + EngineSound 类 OscillatorNode 调制）、漂移摩擦声 DriftSound（bandpass 噪声 + 强度调制）、胎噪 TireSound（lowpass 噪声，上限 0.02）、雨声 RainSound（白噪声循环）、碰撞音 CollisionSound（冲击音 80ms 防刷屏 + 速度强度缩放）、BOOST 音效 BoostSound（200→600Hz 扫频振荡器）、near-miss 音效 NearMissSound。
- music.ts：chiptune 背景音乐调度器。stepEvents/nextStep 纯函数（可单测），bass 恒播/melody 隔拍/hat 每 4 拍。MusicPlayer 类管理 OscillatorNode 生命周期。

---

## 三、主循环数据流

一个完整的帧周期按以下顺序执行：

1. 双世界车流独立推进（updateTraffic，传玩家位置触发避让 AI，支持橡皮筋动态难度 speedFactor 0.85-1.15）
2. 采集双输入（mode.getInputs 路由，合并键盘/摇杆，含 BOOST 键 Space/Enter）
3. BOOST 蓄力/消耗（漂移蓄能 updateBoostCharge + 按键激活突破 1.15×maxSpeed + BoostSound + 尾焰粒子 + boost-pop 飘字）
4. 漂移小喷判定（漂移结束时按蓄力档位自动触发短时加速：蓝火短喷 / 橙火长喷 + 闪光特效）
5. updatePlayerFrame（漂移 → 连击倍率 → 速度 → 运动学 → 相机 → 计时 → 圈数 → 雨天 wet 抓地力衰减 → 挑战加成；热座仅更新当前回合玩家）
6. 碰撞裁决（updateCollisions，分屏独立世界无 P1-P2 互碰，命中返回 impact 速度比 → updateCollisionFlash 写回红闪状态）
7. 环境音效驱动（雨段 rainSound start/stop、碰撞 collisionSound.play(impact)、漂移摩擦 DriftSound.setIntensity）
8. 挑战限时判定（raceTime ≥ 60 → finished）与各自完赛判定（lastLap 单行赋值）
9. 渲染（单屏 render / 分屏 renderRegion×2 + drawDivider + 引导线 + 分叉带；天气三态 + 夜晚 + M17 环境色板；雨滴离屏 overlay；车灯光晕随避让转向；BOOST 速度线 + 碰撞红闪 vignette + 漂移得分飘字 + near-miss 脉冲线）
10. updateHud（双人刷新：速度/计时/圈数/漂移得分/连击倍率/MAX 标记/BOOST 条/碰撞与 near-miss 合并计数/挑战倒计时/热座标签）

---

## 四、游玩功能矩阵

项目已实现丰富的游戏功能，按引入批次整理如下：

### 4.1 核心竞速（M1-M5）

Canvas 2D 伪 3D 路面分段投影（scale = depth / (z - camera.z)）、60fps 循环、车辆速度/加速度/转向模型、路缘限制与出界减速、弯道分段路点与视差远山、bot 沿路点自动驾驶跑圈计时、HUD 速度与计时显示、WebAudio 引擎音效合成、启动画面与胜利结算。

### 4.2 双人玩法（扩展 - M9）

双人分屏（?split=1，P1=WASD / P2=方向键，两个独立赛道世界 + 左右视口渲染 + 分隔线）、热座模式（?hotseat=1，同赛道回合制轮流，P1 完赛回车交棒 P2，胜负横幅）、9 条赛道选单（数字键 1-9 选赛道，分屏 P2 用 Shift+1-9，修饰键单独按下不触发开始）、难度星级显示、车流密度赛道级调参（缺省 14 辆，highway 16 辆，s-curve 8 辆）。

### 4.3 进阶机制（M10-M13）

车流避让 AI（逼近同车道变道远离，shiftDir 记录，车灯随变道转向）、漂移连击倍率系统（combo 0.5s 窗口 + 得分 ×(1+combo×0.25) + MAX 标记）、挑战模式（?challenge=1，60s 限时刷分，目标 5000 分，检查站每圈 +2s 时间奖励，结算联动漂移 TOP10）、雨天物理（wet 制动 ×0.7、转向 ×0.85）与三态天气循环（晴/阴/雨各 45s）、BOOST 氮气系统（漂移蓄能 + Space/Enter 激活 + 突破 1.15×maxSpeed + 扫频音效 + 尾焰粒子）、夜晚赛道（canyon 与 alpine，深暗色板 + 车头灯双弧光晕 + 车流红色尾灯 + 环境车灯配色，headlightColor：canyon 红棕 #ff8a5c / alpine 冷白 #dff1ff）。

### 4.4 排行榜与长线目标（M9-M11, M28）

漂移得分 TOP10 排行榜（含最高连击 combo 字段展示 "连击 x倍率" 后缀）、分屏对局最近 10 局榜、各赛道 BEST 汇总、胜场统计（热座/分屏独立 key + 连胜）、赛道 S/A/B 奖牌（bot 基准门槛，只升不降存档）、成就系统（首次氮气/完美爆发/连击/贴身超车/雨天/夜晚完赛等 8 项，结算新解锁展示 + 菜单进度）、每日挑战（基于日期的确定性赛道，连续签到 streaks，结算追加 "今日挑战完成" 提示）。

### 4.5 分支路线模式（M28）

OutRun 式分段递进（?route=1|2|3 入口）：3 条预设路线（经典之旅 / 高手之旅 / 极限之旅），每段跑 1 圈触发岔路选择，左/右切换下一段赛道，终点段跑完完赛，累计总用时与漂移得分。岔路选择时画面渲染左/右分叉引导带（OutRun 式视觉分叉带 + 0.3s 淡入动画），覆盖层展示左右下一段赛道名称与难度星级。导航辅助线（?guide=1，半透明青色引导线沿道路中心线，远端渐隐）。

### 4.6 可玩性优化（M22-M26, M30-M32）

near-miss 贴身超车（独立计分 + 蓄能 + HUD 弹出 "NEAR MISS!" + 屏幕边缘脉冲线 + NearMissSound）、完美氮气（蓄力 ≥80% 释放加速度 ×0.72 + 金色闪光）、漂移小喷（蓝火短喷 / 橙火长喷按蓄力档位 + 蓝色闪光）、漂移得分浮动飘字（+N 上浮渐隐，高连击 ≥5 放大橙色高亮）、碰撞白色闪帧（flash²×0.18 全屏 fillRect 叠加红闪 vignette）、BOOST 速度线强化（基础层 ×1.6 + 金色叠加）、随机天气变体（?weather=random/sunny/rain/night，天气徽章）、车流橡皮筋动态难度（?traffic=static 关闭 / 缺省 dynamic，speedFactor 0.85-1.15）。

---

## 五、质量保障体系

### 5.1 六层自动化验证门禁

项目强制执行按顺序的六层门禁，任何一层失败即阻断：

1. typecheck（tsc --noEmit）：全量 TypeScript 类型检查，开启 strict mode + noUnusedLocals + noUnusedParameters
2. lint（eslint .）：typescript-eslint 推荐规则，prettier 格式化一致性
3. format:check（prettier --check）：代码格式回归
4. test（vitest run）：711 个测试用例（49 个测试文件），含纯函数单元测试、集成冒烟测试（真实 GameLoop + 模拟 DOM/rAF/键盘事件）、渲染输出稳定性测试（canvas mock 调用记录）
5. bot（tsx tests/bot/run-bot.ts）：9 赛道矩阵回归（遍历 TRACK_DEFS 全部 9 条赛道，每条按自身 laps 圈数调用 simulateLaps），全赛道 finished=true 且 violations≤3 时通过，退出码 0
6. build（tsc --noEmit && vite build）：生产构建验证，含 PWA SW 清单生成
7. e2e（playwright test）：Playwright 视觉回归（桌面 1280×720 + 移动横屏 812×375 + 大屏 1920×1080 三 project），含天空像素级条纹检测（maxDelta < 60）、菜单光晕遮挡检测、标题叠影检测、BOOST 蓄能与碰撞反馈的玩法链路断言

### 5.2 确定性回归锚点

项目通过 mulberry32 确定性 PRNG 保证同输入下所有生成结果（赛道、车流、远山、景物）一致。bot 9 赛道矩阵 0 违规跑圈作为核心回归锚点，确保物理、渲染、碰撞等核心回路不受非确定性影响。Playwright E2E 通过 canvas 像素级断言（天空条纹 maxDelta < 60）锚定渲染稳定性。

### 5.3 测试架构亮点

- 中文行为规格：所有测试用例以中文命名，具备行为文档作用（如 "弯道前超速时刹车"、"分屏模式下 P2 与车流碰撞"）
- Canvas mock 调用记录：**mocks**/canvas.ts 记录全部 ctx 方法调用次数与实参，支撑 "渲染输出稳定"、"像素对齐"、"雨滴离屏双幅 drawImage"、"夜晚车灯 arc 增量" 等精确定量断言
- 集成冒烟：game-loop-integration.test.ts 以 stub 全局 DOM/rAF/AudioContext 驱动真实 GameLoop 完整帧循环，验证阶段流转、双人选赛道、热座交棒、分屏渲染、暂停菜单、挑战模式等端到端场景（长程用例 heap 可达 5GB+，worker execArgv 设 8GB）
- E2E 玩法链路：不等 1.2s 等菜单入场动画避免 translateY 偏移误判，桌面 project 跳过移动端断言，失败上传 test-results 产物

---

## 六、关键设计模式与工程实践

### 6.1 纯函数领域层

frame-update、frame-render、frame-pure、finish-accounting 均为无副作用纯函数（状态进、渲染指令出）。game-loop 仅做编排壳，不包含业务逻辑。mode-strategy 以策略对象封装四种游玩模式的差异，消除大 if-else 分支。

### 6.2 确定性生成

赛道（track.ts 分段生成器）、车流（createTraffic 随机载具）、远山（generateMountainProfile 3 层正弦叠加）、景物（createRoadsideSprites 路边树/路灯/仙人掌）全部通过 mulberry32 确定性 PRNG 生成。同 seed 输入下输出严格一致。

### 6.3 常量唯一真源

src/shared/constants.ts 是全部游戏参数的唯一定义点，engine/physics/ui 均直接导入。2026-08-05 将原本在 game/constants.ts 的常量提升至 shared/，消除 game↔ui 依赖环。

### 6.4 双世界架构

分屏模式维护两个独立的 TrackContext 赛道世界（双实例 + RenderView 参数化），渲染/碰撞/圈速/存档完全按玩家维度隔离。热座模式同赛道回合制，输入路由到当前回合玩家。分屏时 car.ts 的 collidePlayers 已删除（双世界独立无 P1-P2 互碰，死代码清理于 M14）。

### 6.5 样式三文件拆分（M20）

原 style.css（2729 行）按屏幕维度拆分为：style.base.css（设计令牌 + 全局 + HUD）、style.screens.css（菜单/结算/暂停）、style.interaction.css（暂停玻璃风格/摇杆/响应式/主题/PWA 提示）。加载顺序与原 style.css 一致。

### 6.6 文案同源防漂移

ui/copy.ts 作为文案常量唯一真源（12+ 条），与 README.md "操作说明" 保持同源。copy.test.ts 验证全部提示关键词都在 README 中出现（防文案漂移——改提示必须同步 README）。

---

## 七、里程碑演进总结

项目自 M1 到 M32 共经历 22 个里程碑（M21 不存在，M27/M28-b/M30/M31/M32 为后期追加），按阶段分为：

初期打基础（M1-M5）：Canvas 渲染骨架、车辆物理、赛道系统、bot 跑圈、HUD + 音效 + 结算 + 构建。约 5 个里程碑。

中期扩展（扩展 - M14）：双人分屏/热座、车流与碰撞、漂移得分、关卡选单、chiptune 音乐、移动端触控、GameLoop 重构、阶段 FSM 下沉、双人 HUD、9 赛道选单、车流避让 AI、夜晚赛道、挑战模式、BOOST 氮气、H 系列打磨、曲率段离屏缓存 + 死代码清理。约 16 个里程碑。

深度打磨（M15 - M32）：架构重构（纯函数下沉 + mode-strategy 策略对象）、PWA 离线、运行时实测修复（天空条纹/热座渲染/移动适配）、碰撞反馈增强（红闪+HUD 计数+双层音效+弹开）、环境差异化（9 种环境配置+景物形状+地形装饰）、UI/UX 打磨（可访问性/颜色令牌/屏幕过渡/反馈增强/触屏引导）、debug 生产剥离、E2E 扩展、大屏布局修复、榜单菜单优化、near-miss 超车、完美氮气、漂移小喷、Game Feel 飘字/速度线/闪光、随机天气、车流橡皮筋、OutRun 式分支路线、导航辅助线、每日挑战。约 12 个里程碑。

验证数据演进：测试用例从 M15 的 593 增长到当前的 711（+118），E2E 用例从 M16 的 13 通过增长到 M20 的 40 通过（48 执行含 8 视口条件跳过），bot 始终 9 赛道矩阵 0 违规。

---

## 八、当前项目状态评估

### 8.1 完成度

截至 2026 年 8 月 8 日，M1-M32 全部标记为 ✅ 完成。项目的核心竞速、双人对战、排行榜、成就系统、昼夜/天气/环境差异化、分支路线、每日挑战等全部实现。游戏性覆盖了从基础竞速到深度可玩性的完整层次。

### 8.2 代码规模

- 源文件：75 个 TypeScript 文件（src/ 下）+ 3 个 CSS 文件
- 测试文件：49 个 Vitest 测试文件 + 1 个 Playwright E2E spec + 1 个 bot 脚本
- 测试用例：711 个单元/集成用例 + 约 48 个 E2E 断言
- 游戏循环编排文件（game-loop.ts）：973 行（2026-08-06 实测）
- 样式文件：3 个文件共约 2729 行（拆分前原 style.css 行数）

### 8.3 架构健康度

- 依赖环：game↔ui 已于 2026-08-05 完全解环（运行时 + 类型层），engine↔shared 与 physics↔shared 单向
- 死代码：collidePlayers（分屏独立世界后无调用方）、ui/gamestate.ts（纯 re-export 零消费方）已清理
- 仅测试使用的导出：已迁移至 tests/helpers/（createDefaultTrack、spritesInRange 线性版）
- 防御性折衷：bot violations ≤ 3 容差与集成长用例 testTimeout 保留——收紧会降低 CI 鲁棒性

### 8.4 当前弱点与优化空间

1. game-loop.ts 973 行：虽然已通过 mode-strategy / frame-update / frame-render / finish-accounting / collision-feedback 等纯函数大幅瘦身（原 938 行 → 现 973 行因新功能增加），编排层仍有继续拆分的空间。
2. 部分渲染分支的 conditions 较多：renderer.ts 仍维护大量渲染分支（天气、时间、环境、特效层、引导线、分叉带），可考虑进一步组件化。
3. 移动端适配仍有局限：虽然 M16/M20 大幅改善移动端体验（viewport-fit、portrait-mode 守卫、触屏引导浮层），但复杂操作（漂移 + BOOST + 转向联用）在触屏上难以精确执行。
4. Canvas 2D 的性能天花板：随着特效层增多（BOOST 粒子、漂移飘字、near-miss 脉冲线、碰撞白闪、速度线、引导线、分叉带），每帧的 2D 绘制调用量持续增长，大屏高分辨率下帧率可能成为瓶颈。
5. PWA 离线壳不完整：index.html 已从预缓存排除（避免 SW 缓存旧版 HTML），代价是失去离线壳能力。
6. 文档以 codemap.md 为主，缺少面向新开发者的入门指南。

---

## 九、结论

AI-Racing-Games 是一个架构设计优秀、质量保障严密、功能覆盖全面的伪 3D 赛车游戏项目。其在 22 个里程碑的持续迭代中始终坚守 "纯函数领域层 + 编排层" 的核心设计哲学，通过严格的六层自动化验证门禁（typecheck → lint → format → unit test → bot 集成 → build → E2E 视觉回归）确保每次变更的质量。依赖方向通过 2026-08-05 的 shared/ 独立共享层解环已实现完全单向，消除游戏引擎和 UI 之间的循环耦合。项目的 711 个单元测试（以中文行为规格命名）和 9 赛道 0 违规 bot 矩阵回归构成了坚实的回归防线。当前 M32 完成后的功能矩阵已覆盖从基础竞速、双人对战、天气昼夜、环境差异化、成就系统、每日挑战到 Game Feel 精细反馈的完整竞速游戏体验。
