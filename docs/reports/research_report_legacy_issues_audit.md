# 旧运行时报告问题项核查与修复归纳（research_report_runtime_testing.md 审计）

> 审计对象：`docs/reports/research_report_runtime_testing.md`（旧版运行时实测报告）全部问题与待优化项，重点为「九、结论与待优化项优先级」P0-P3 清单。
> 审计方式：逐项代码级核查（源码定位根因）+ 实施修复 + 全量门禁复测 + 浏览器实测取证。日期：2026-08-05。

## 执行摘要

旧报告共列 **2 个核心 bug + 13 个 UX/优化项**。核查结论：**1 项此前已修复（UX-1）、11 项本轮修复/调优落地、1 项已是现状无需处理（UX-11）、2 项为设计决策不改代码（UX-12/UX-13）**。两个 P0 核心 bug（minimap 空白、出界卡死）均以代码级根因确认并完成结构性修复，全部六层门禁实测全绿（typecheck / lint / format / 656 单测 / bot 9 赛道 0 违规 / PWA build / e2e 18 passed），关键修复均经浏览器实测取证。

## 一、逐项核查结论总表

| 编号 | 问题 | 优先级 | 核查结论 | 处理 |
|------|------|--------|----------|------|
| BUG-1 | minimap canvas 渲染为空 | P0 | **依然存在**，根因确认（见二） | ✅ 本轮修复 + 单测 + 实测 |
| BUG-2 | 出界后无法回到路面 | P0 | **依然存在**，根因确认（见二） | ✅ 本轮修复 + 单测 |
| UX-1 | 开局「碰撞 ×1」 | P0 | 已修复（双重根因：出生重叠 + 倒计时期环绕穿越） | ✅ 前轮修复（安全窗口 + 起步保护期），e2e 回归持续通过 |
| UX-2 | HUD 速度大字过大 | P2 | 存在（56px 上限） | ✅ `--speed-fs` 56→44px 上限 |
| UX-3 | 菜单无当前模式提示 | P1 | 存在（仅键位提示文案差异） | ✅ 新增模式徽章（三模式分色） |
| UX-4 | 完赛标题被滚动条遮挡 | P1 | 存在（内部滚动条覆盖标题区） | ✅ scrollbar-gutter + 细半透明滚动条 |
| UX-5 | 三面板无互斥折叠 | P1 | 存在（独立 toggle） | ✅ 互斥展开，浏览器实测验证 |
| UX-6 | 回主菜单按钮被光晕遮挡 | P2 | 存在（finish-sun 60px/0.3 光晕） | ✅ 光晕收敛 + 按钮描边阴影 |
| UX-7 | 菜单激光动效过亮 | P2 | 存在（48px/0.35 + pulse 满透明度） | ✅ 光晕 32px/0.22 + pulse 上限 0.85 |
| UX-8 | 分屏无 P1/P2 标签 | P2 | 存在 | ✅ `.hud-side-tag` 侧标签，浏览器实测验证 |
| UX-9 | 夜晚车灯光晕过大 | P2 | 存在（halo r×1.6 + alpha 0.35） | ✅ r×1.25 + alpha 0.25 |
| UX-10 | 路灯长在路面上 | P2 | 存在（路灯与树共用 ±1.4 偏移） | ✅ 路灯专用 ±1.8 外移，单测锚定 |
| UX-11 | 仙人掌形状抽象 | P3 | **已不存在**：M17 后 `drawCactus` 已是「垂直主干 + 左右双臂」形状 | ⏭️ 无需处理 |
| UX-12 | 漂移得分多次为 0 | P3 | 非缺陷：直线全油门不触发漂移属正确语义（挑战模式实测可得 26 分） | ⏭️ 设计语义，不改代码 |
| UX-13 | 热座不计对局战绩 | P3 | 设计决策：对局榜仅记录分屏对局，热座走胜场统计（recordWin） | ⏭️ 设计决策，不改代码 |
| UX-14 | 选中态激光与预览冲突 | P3 | 存在（selected-pulse 峰值 30px/0.65） | ✅ 脉冲峰值收敛 22px/0.5 |
| UX-15 | km/h 单位字号悬殊 | P3 | 存在（数字:单位 ≈ 4:1） | ✅ 单位字号提升至 ≈2.2:1 |

## 二、P0 核心 bug 根因与修复

### BUG-1：minimap canvas 完全透明

- **报告猜测**：trackContext 引用比较失败 / canvas 被误清（未证实）。
- **实际根因（代码级确认）**：`Minimap` 实例只在 `game-loop.applyPhase(PHASE_FINISHED)` 分支创建，而仅在 `PHASE_RACING` 显示——**首次比赛全程 minimap 为 null，整局空白**；必须先完赛一次、回菜单再开赛才有。报告观测者恰好处于首局。
- **修复**：创建逻辑下沉至 `frame-render.ts`，RACING 首帧惰性创建（分屏跳过；node 测试环境 `typeof document` + `getContext` 特性检测安全跳过）；移除 game-loop FINISHED 分支的创建块。
- **锚定**：frame-render.test.ts 新增 2 用例（单屏首帧创建并绘制 / 分屏不创建）；canvas mock 补 `arcTo`/`clearRect`/`lineJoin`/`lineCap`。
- **实测取证**：浏览器开局 5.8s 后采样 `#hud-minimap` —— `nonTransparentPx: 12040`（修复前为 0），hidden=false，phase=racing。

### BUG-2：出界后无法回到路面

- **报告猜测**：出界无 z 推进导致状态冻结（未证实）。
- **实际根因（代码级确认）**：`updateCar` 出界钳制把 position 钉在**恰好的边缘线**（|position| == roadHalfWidth），而转向率 ∝ speed——出界减速后低速转向极弱，且下帧 |position| == 1 处于判定临界形成震荡，玩家「钉死边缘」难以拐回。cameraZ 仍随残余速度推进（报告「时间停止」系低速下的观感）。
- **修复**：新增 `OFF_ROAD_PUSHBACK = 0.05`（shared/constants），出界钳制后向内侧推回该量——脱离出界判定线，恢复加速/转向权限，玩家可正常拐回；减速语义不变。
- **锚定**：car.test.ts 更新 2 处断言 + 新增「BUG-2 回归：推回后下帧不再出界、可加速拐回」用例；simulate.test.ts 同步钳制断言；constants.test.ts 注册表。
- **影响面**：bot 矩阵基线逐位不变（bot 从不出界，offRoadTimeSec=0）。

## 三、UX 修复实施明细

**HTML/JS（index.html + game-loop.ts）**
- UX-3：`#menu-mode-badge`（副标题下方胶囊徽章）——分屏绿「分屏模式 · 双人同屏」/ 热座青「热座模式 · 回合轮流」/ 挑战橙「挑战模式 · 60 秒刷分」，单屏隐藏（含 `[hidden]` 覆盖 display 的 CSS 补丁与 `hidden=false` 显式解除）。
- UX-5：`bindLeaderboardCards` 互斥展开——展开一个时收起其余（浏览器实测：点卡片1→[true,false,false]，点卡片2→[false,true,false]）。
- UX-8：`#hud`/`#hud2` 内 `.hud-side-tag`（P1/P2），分屏时 body 加 `split-mode` 类启用（浏览器实测：双标签 inline-block 显示，单屏 display:none）。

**CSS（style.css）**
- UX-2：`--speed-fs` clamp(36px,12vw,56px) → clamp(32px,9vw,44px)。
- UX-4：`#finish-screen` scrollbar-gutter: stable + padding 预留 + 8px 金色半透明细滚动条（Firefox/WebKit 双写法）。
- UX-6：`.finish-sun` 光晕 60px/18px/0.3 → 40px/12px/0.2；`#finish-restart-btn` font-weight 700 + text-shadow。
- UX-7：`.menu-sun` 光晕 48px/14px/0.35 → 32px/10px/0.22；sun-pulse 透明度 0.9-1 → 0.75-0.85。
- UX-14：selected-pulse / selected-pulse-p2 峰值 30px/0.65 → 22px/0.5。
- UX-15：`#hud-speed-unit(-2)` 字号 --hint-fs → clamp(16px,3.5vw,20px)。

**渲染参数（engine）**
- UX-9：player-car.ts 车头灯 halo 半径 ×1.6→×1.25、alpha 0.35→0.25。
- UX-10：sprites.ts 新增 `LAMP_SIDE_OFFSET = 1.8`，路灯专用外移（树/仙人掌/棕榈/雪堆保持 1.4）；sprites.test.ts 断言升级为类型分层（树 ±1.4 / 灯 ±1.8）。

## 四、复测校验结果（本次实测）

| 门禁 | 结果 |
|------|------|
| typecheck（tsc --noEmit） | ✅ 零错误 |
| lint（eslint .） | ✅ 零告警 |
| format:check（prettier） | ✅ 全部通过 |
| npm test（vitest） | ✅ 45 文件 **656 用例**全绿（23.65s，较修复前 653 +3 新用例） |
| npm run bot | ✅ 9 赛道全部完赛、0 违规，圈速基线逐位不变 |
| npm run build | ✅ PWA 产物正常（sw.js/manifest） |
| e2e（playwright） | ✅ **18 passed** + 2 skipped（含前轮 3 条回归：倒计时覆盖层/1280×720 布局边界/开局零碰撞） |

**浏览器实测取证**（docs/screenshots/）：
- `auto-11-challenge-badge.png`：挑战模式菜单徽章清晰可见；分屏徽章文本验证通过；单屏徽章 display:none 隐藏。
- minimap 首局采样：12040 个非透明像素（BUG-1 修复证据）。
- 面板互斥：连续点击两卡片，展开态正确互斥。
- 分屏 P1/P2 侧标签：双标签 inline-block 显示。

## 五、遗留与建议

1. **UX-4/UX-6/UX-7/UX-14 为纯 CSS 调整**：逻辑已实现，视觉主观效果建议人工快速过目（秒级确认）。
2. **UX-12 建议（不改代码）**：若希望降低漂移零分挫败感，可在结算面板补一行「漂移尝试提示」（何时触发漂移），属文案增强。
3. **UX-13 建议（不改代码）**：可在菜单「对局战绩」空态文案注明「仅分屏对局计入」，消除理解歧义。
4. 旧报告「七、性能与稳定性观察」中的 PWA 离线/音频听感两项仍属人工验证范畴（本轮 build 产物正常，离线安装流程未实测）。

## 六、局限性说明

本审计基于源码级根因核查 + 全量门禁实测 + 浏览器自动化取证；CSS 视觉调整（光晕/字号/滚动条）的具体观感未做逐像素比对，标注「建议人工复测」；漂移触发与对局记录两项按现行设计语义判定为非缺陷。

## 七、追加修复：渲染景深与景物坐标系（2026-08-05 同日二次核查）

针对「景物出现在道路中央 / 车辆绘制在景物之上」两类不合常理情况的专项核查，发现并修复 2 个渲染层问题：

### 问题 R1：车流整体覆盖全景物（景深 z-order 错误）

- **根因（代码级确认）**：`renderWithOpts` 先绘制全部景物（drawSprites）再绘制全部车流（drawTraffic）——远处车流永远画在近处树/路灯之上，近者遮挡远者的画家算法被破坏。
- **修复**：新增 `Renderer.drawWorldObjects`——景物与车流各自投影后按 z 降序双指针归并交错绘制（零帧内分配）；traffic-draw.ts 拆出 `drawSingleTraffic` 单车绘制函数供交错调用。
- **锚定**：renderer-state.test.ts 新增「近处树绘制在远处车流之后」用例（canvas mock 补全局 `__order` 调用顺序日志，按车身色/树干色定位两类绘制物的全局时序）。

### 问题 R2：弯道景物系统性漂移（坐标系不一致）

- **根因（确定性探测脚本确认）**：路面渲染的曲率累计以相机为起点归零（curveSum=0 起步），而景物用 `curveOffsetAtZ` 返回赛道绝对前缀和——两者相差相机处前缀曲率（s-curve 中段实测 0.345），导致弯道上景物整体横向漂移，最大 0.36 世界单位（道路半宽 1.0，树基最近距路缘仅 0.04，濒临侵入路面）。
- **修复**：`drawSpriteProjected` 景物中心减去 `curveOffsetAtZ(cameraZ)`，与路面渲染同坐标系。
- **锚定**：renderer-state.test.ts 新增「弯道景物中心与路面同坐标系」用例（s-curve 弯道中段渲染，树干实际投影 x 与相机相对候选亚像素吻合、与错误候选相差 >5px）。
- **附注**：核查同时确认——景物 offset（树 ±1.4 / 路灯 ±1.8）均大于道路半宽 1.0，修复后不存在「景物出现在道路中央」；玩家车为屏幕空间精灵恒在最上层，属 OutRun 风格正常语义。

### 复测结果（实测）

| 门禁 | 结果 |
|------|------|
| typecheck / lint / format | ✅ 全部通过 |
| npm test | ✅ 45 文件 **658 用例**全绿（+2 新回归用例） |
| npm run bot | ✅ 9 赛道 0 违规，圈速基线逐位不变（车流/景物渲染不参与 bot 物理） |
| npm run build | ✅ PWA 产物正常 |
| e2e | ✅ 18 passed + 2 skipped |
| 浏览器实测 | ✅ 小地图首局即显示（zfix-01）、树/路灯沿路两侧排列无侵入路面（zfix-02/03） |

## 八、道路渲染平滑化与真实感优化（2026-08-05 专项）

针对「道路渲染显示问题」专项核查，通过浏览器像素部面采样（中线亮度分布）定位到两类缺陷并实施三项优化：

### 发现的缺陷

- **D1 远端密集分段条纹（摩尔纹）**：路面按 200 世界单位/段交替两档灰色（原 #4a4a4a/#3c3c3c 亮度差 14），远端段压缩至 1-2px 高，形成密集交替条纹（像素采样实测 61/74 交替）。
- **D2 远端无大气透视**：远端路面与近处同对比度，无距离衰减，平板感强、缺纵深。

### 优化实施

1. **距离大气透视（drawDistanceFog，road-surface.ts）**：地平线向下 42% 地面高度的垂直渐变雾霾层，雾色取天空地平线色（hsl→hsla 转换），alpha 0.55→0 渐隐；画在世界物体（景物/车流）之上、烟雾/玩家车之下，远端路面/树/车渐融天空雾色，同时消除 D1 远端条纹与 D2 平板感。帧内一次渐变填充，零性能压力。
2. **柔化分段交替对比（road-geometry.ts）**：ROAD_COLORS #4a4a4a/#3c3c3c（亮度差 14）→ #484848/#404040（亮度差 8），保留分段速度节奏但条纹对比减半；同步更新 road-geometry.test 与 road-strip.test 共 6 处颜色断言。
3. **近景缓存条带细分（road-surface.ts drawCachedSegment）**：极高段（>32px）细分 bands 4→8，近景透视渐变更平滑。

### 复测结果（实测）

| 门禁 | 结果 |
|------|------|
| typecheck / lint / format | ✅ 全部通过 |
| npm test | ✅ 45 文件 **660 用例**全绿（+2 雾带回归用例） |
| npm run bot | ✅ 9 赛道 0 违规，圈速基线逐位不变（渲染不参与 bot 物理） |
| npm run build | ✅ PWA 产物正常 |
| e2e | ✅ 18 passed + 2 skipped |
| 浏览器像素采样 | ✅ 远端亮度范围（83）< 近端（131）；地平线路面（55-61）与山体（45）趋近；远端条纹对比减半 |
| 截图视觉 | ✅ road-01/02（优化前）vs roadfix-01~04（优化后）：远端渐融雾色、条纹柔和、纵深增强 |

## 九、音效播放/暂停/切换/音量逻辑核查与完赛蜂鸣修复（2026-08-05 专项）

针对「完赛后持续蜂鸣（噪音）」等已知缺陷，全面核查音频播放/暂停/切换/音量逻辑，定位并修复一组相互关联的缺陷：

### 发现的缺陷

- **A1 完赛后持续蜂鸣/噪声（主缺陷）**：完赛帧 `frame()` 因 shouldRender=false 提前 return，RAF 停摆。此后：
  - `engineSound.setSpeedRatio`（frame 尾部）不再被调用 → 引擎声停留在最后高速帧的频率/增益（~0.2 增益）持续蜂鸣；
  - `updateFrame` 的非 RACING 静音分支（停漂移/胎噪）永不再执行 → 胎噪/漂移胎声/雨声残留。
- **A2 暂停时引擎仍按残留速度轰鸣**：`setSpeedRatio` 未按阶段门控，PAUSED 时车辆速度冻结在暂停瞬间值，引擎仍按该速度持续发声。
- **A3 完赛后 RAF 链断导致画面冻结（连带）**：非热座模式完赛→回菜单→再开赛无 RAF 重启（仅热座交棒有），导致回菜单后预览冻结、再开赛不渲染（游戏假死）。

### 修复实施（game-loop.ts）

1. **`silenceDriveSounds(stopRain)`**：离开 RACING 时静音引擎/漂移胎声/胎噪（雨声暂停保留、完赛/回菜单一并停）；恢复比赛后由 updateFrame/帧块重新驱动。
2. **`applyPhase` 接入静音**：`newPhase !== RACING` 时调用 silenceDriveSounds（暂停保留雨声环境音，完赛/菜单连雨停）；背景音乐 MusicPlayer 不受影响持续播放。
3. **`setSpeedRatio` 门控**：仅 RACING 按车速调制引擎声，菜单/暂停不再以残留速度蜂鸣。
4. **`loopRunning` + `ensureLoop()`**：帧循环调度幂等守护，完赛 return 置 false，回菜单/再开赛/热座交棒经 ensureLoop 重启（防重复调度致双倍速，也防链断致冻结）；构造器/热座交棒/帧自续统一改走 ensureLoop。

### 音量逻辑核查结论（无需改动）

- 播放：音频于首次 startGame 惰性装配（createAudioRig：masterGain 总控 + musicGain/sfxGain 分轨）。
- 暂停：车相关音静音（本修复），音乐持续。
- 切换：赛道切换不携带音频差异（无赛道专属音），无问题。
- 音量：volume.ts 的 load/persist/clampAndSyncGain 逻辑健全（clamp 0-1 + 静默降级 + gain 实时同步），暂停菜单三 slider（总/音乐/音效）分轨调节正确。

### 复测结果（实测）

| 门禁 | 结果 |
|------|------|
| typecheck / lint / format | ✅ 全部通过 |
| npm test | ✅ 45 文件 **661 用例**全绿（+1 RAF 重启回归用例） |
| npm run bot | ✅ 9 赛道 0 违规（音频不参与 bot 物理，基线不变） |
| npm run build | ✅ PWA 产物正常 |
| 浏览器端到端 | ✅ 完赛→回菜单→再开赛不冻结（menu→racing 正常，新赛事速度 320 推进）；RAF 重启生效 |

## 十、暂停按钮可点性检查与修复（2026-08-05 专项）

针对「车辆行驶中左下角暂停按钮有效性」专项检查，发现并修复 1 个 P0 交互缺陷：

### 发现的缺陷

- **B1 暂停按钮真实指针不可点（P0）**：`#pause-btn` 是 `#hud` 的子元素，而 `#hud` 设了 `pointer-events: none`（防 HUD 文字挡住画面），`pointer-events` 可继承且按钮未覆写 → 真实鼠标/触摸点击**穿透按钮落到 canvas**，用户行驶中点不动暂停按钮。
  - 隐蔽性：集成测试用 `fireElementEvent` 直接派发回调、程序化 `.click()` 均绕过命中检测，故既有测试未暴露；仅真实指针（鼠标/触摸）受影响。
  - 实测取证：修复前 `getComputedStyle(#pause-btn).pointerEvents === 'none'`、`elementFromPoint` 命中 canvas；修复后 `pointer-events: auto`、`elementFromPoint` 命中 BUTTON#pause-btn。

### 修复实施

- **style.css**：`#pause-btn` 覆写 `pointer-events: auto` 恢复命中；摇杆（`.joystick-base` 为 pointer-events:none 走 canvas 层指针）与按钮分处左下/右下角互不干扰，无需改动。
- **交互链路核查（无需改动）**：暂停/继续/重开/退出按钮均在 `#pause-screen`（无 pointer-events:none，默认可点）；`bindPhaseButton` 守卫式绑定健全；`type="button"` 无表单提交副作用。

### 复测结果（实测）

| 门禁 | 结果 |
|------|------|
| typecheck / lint / format | ✅ 全部通过 |
| npm test | ✅ 45 文件 661 用例全绿 |
| e2e | ✅ **22 passed**（+4 新增暂停按钮回归：pointer-events=auto 断言 + 真实指针点击暂停→继续端到端，桌面/移动横屏双 project） |
| npm run build | ✅ PWA 产物正常 |
| 浏览器实测 | ✅ 真实 MouseEvent 命中 #pause-btn（racing→paused，暂停面板显示）；点继续恢复（paused→racing） |

## 十一、完赛界面「回主菜单」上方空方框检查与修复（2026-08-05 专项）

针对「完赛界面回主菜单按钮上方两个方框内要显示的内容及显隐逻辑」专项检查，定位并修复空边框卡片缺陷：

### 方框内容与显隐逻辑梳理

回主菜单（#finish-restart-btn）上方带边框的「方框」元素及其预期内容：

| 元素 | 类 | 应显示内容 | 显示条件 |
|------|-----|-----------|---------|
| P2 结算卡片（#finish-card-2） | finish-card p2-card | P2 总用时/均速/最佳/漂移得分 | 仅分屏或热座 round 2 |
| P2 圈速行（#finish-laps-2） | finish-laps | P2 分圈用时 | 仅分屏/热座 round 2 |
| 漂移竞速横幅（#finish-drift-winner） | finish-banner | 「DRIFT 竞速 · P? 获胜！」 | 仅分屏双完赛 |
| 胜场统计（#finish-wins） | finish-stats | 「胜场统计 · P1 a : b P2」 | 热座/分屏分胜负 |
| 圈速行（#finish-laps） | finish-laps | P1 分圈用时 | 有内容时（挑战模式无圈速） |

### 发现的缺陷（两个空方框）

- **C1 P2 结算卡片容器空边框**：`#finish-card-2` 容器本身无 `hidden`、代码只隐藏其子元素不隐藏容器 → 单屏/挑战/热座 round 1 下子元素全隐藏但容器仍以空边框卡片显示（截图 finishbox-01 中「带绿光的空进度条」）。
- **C2 挑战模式圈速行空边框**：挑战分支 `finishLaps.textContent = ''` 但未 `hidden=true`，而 `.finish-laps` 有边框 → 挑战结算显示一个空边框方框。两者叠加即用户所见「两个空方框」。

### 修复实施

- **index.html**：`#finish-card-2` 加 id 并默认 `hidden`。
- **screens.ts ScreenElements**：新增 `finishCard2?: HTMLDivElement`；`fillFinishPanel` 按 `hasP2Panel = splitMode || (hotseat && round 2)` 整体显隐 P2 卡片容器；新增 `hideIfEmpty` 对 finishLaps/finishSpeed/finishBest/finishScore 内容为空时整行隐藏（兼顾挑战模式与 P1 未完赛清空场景）。
- **dom-setup.ts**：`collectScreenElements` 采集 `finish-card-2`。

### 复测结果（实测）

| 门禁 | 结果 |
|------|------|
| typecheck / lint / format | ✅ 全部通过 |
| npm test | ✅ 45 文件 661 用例全绿（单屏完赛 + 挑战分支各新增空方框隐藏断言） |
| e2e | ✅ 22 passed + 2 skipped |
| npm run build | ✅ PWA 产物正常 |
| 浏览器实测 | ✅ 单屏完赛可见方框仅剩 p1-card/finish-laps/回主菜单（均有内容）；finish-card-2 已隐藏（finishbox-02 截图确认空绿光方框消失） |

## 十二、菜单页面深入分析与优化（2026-08-05 专项）

对游戏开始前的菜单页面做截图视觉检查 + 代码级分析，实施聚焦优化：

### 菜单现状分析

菜单结构：标题（像素狂飙）+ 副标题 → 模式徽章（单屏隐藏）→ 3×3 赛道选择网格（序号/名称/星级，含键盘焦点/选中脉动/左侧指示条）→ 赛道缩略图预览（SVG）+ 赛道名 → 触屏提示（桌面隐藏）→ 榜单卡片（赛道最佳/漂移榜单/对局战绩，可展开）→ 开始按钮 + 提示。

已具备良好基础：选中态有脉动光晕（selected-pulse）、键盘可达（tabindex + focus-visible）、触屏/桌面提示分流（hover:none/hover:hover 媒体查询）、榜单卡互斥展开（前次修复）。

### 识别的可优化点

- **M1 赛道缩略图过小、辨识度低**：预览仅 160×48、细 3px 金黄线，作为展示所选赛道的视觉 centerpiece 不够醒目。
- **M2 预览不随环境区分**：所有赛道预览同为金黄，未利用 M17 环境差异化，各赛道预览观感雷同。

### 优化实施

1. **预览放大更醒目**：`#track-preview` 160×48 → 200×60，描边 3 → 3.5，光晕增强。
2. **环境主题预览色**：environment.ts 新增 `previewColor?` 字段（9 环境各配亮色）+ `getEnvironmentPreviewColor()`（未配回退金黄 `PREVIEW_COLOR_DEFAULT`）；`buildTrackPreviewSvg` 加可选 color 参（缺省金黄，向后兼容），内联 stroke/fill/color；`game-loop.refreshTrackPreview` 传入环境色；CSS 改用 currentColor 同色光晕（移除会盖掉内联色的 `stroke: var(--accent)`）。
3. **预览色配置**：plains #ffd75e / highway #7ec8ff / s-curve #8eff9e / island #6ee7d8 / canyon #ff9a6e / desert #ffb347 / forest #6eff8e / coast #6ec6ff / alpine #c8d8ff。

### 复测结果（实测）

| 门禁 | 结果 |
|------|------|
| typecheck / lint / format | ✅ 全部通过 |
| npm test | ✅ 45 文件 **663 用例**全绿（+2 预览色参/环境预览色回归用例） |
| e2e | ✅ 22 passed + 2 skipped |
| npm run build | ✅ PWA 产物正常 |
| 浏览器实测 | ✅ 预览色随赛道切换（classic #ffd75e / desert #ffb347 / coast #6ec6ff / canyon #ff9a6e）；menu-01-desert-preview 截图确认沙漠预览呈琥珀色、放大更醒目 |

## 十三、全量自动化测试 + 视觉审计专项（2026-08-05）

再次执行完整门禁链 + 9 张核心界面截图（桌面菜单/比赛/暂停/完赛 + 移动端横屏菜单/比赛 + 夜晚赛道 + S 弯漂移）+ 确定性探测脚本，汇总问题并修复：

### 审计结论（逐项）

| # | 检查项 | 结论 |
|---|--------|------|
| 1 | 全量门禁 | ✅ typecheck/lint/format/663 单测/bot 9 赛道 0 违规/build PWA/e2e 22 通过，审计前即全绿 |
| 2 | 菜单榜单编号跳号（1/2/3→7） | ✅ 预期设计：编号即赛道序号，无记录赛道隐藏不显示 |
| 3 | HUD 圈数显示 | ✅ DOM 实测 LAP 1/3 正确（截图 OCR 误读排除） |
| 4 | 完赛界面底部红黄圆形 | ✅ 结算画面「落日」装饰元素（sun-pulse），非缺陷 |
| 5 | 移动端横屏赛道预览 0×0 | ✅ 有意设计：`@media (max-height:480px)` 隐藏预览省 40px 垂直空间，防开始按钮被挤出视口 |
| 6 | **碰撞横向容差过大** | ❌ **已修复**（见下） |

### 修复：碰撞横向容差收窄（P1 gameplay 缺陷）

**缺陷**：`TRAFFIC_X_TOL = 0.9`（offset 单位）> 车流最大偏移 `AVOID_LANE_EDGE = 0.85`，玩家居中（x=0）时与**任意** z 重叠车辆均判碰撞——车道躲避几乎失效；避让 AI 把车变道至 ±0.85 后仍落入 0.9 容差内，避让完全无效。实测：全油门直行 16 秒碰撞 7 次。

**根因分析**：车流世界宽 0.5（半宽 0.25，traffic-render.ts `CAR_WORLD_WIDTH`），玩家车约同宽，视觉合理容差 ≈ 0.5 + 少量余量。0.9 约为物理合理值 1.8 倍，视觉上明显分离的车辆也判碰撞。

**修复**：`TRAFFIC_X_TOL` 0.9 → **0.55**（engine/traffic.ts）。修复后：
- 边线车（offset ±0.8）不再误撞居中玩家（间距 0.8 > 0.55）——车道躲避恢复意义；
- 避让 AI 变道至 ±0.85 后真正脱离碰撞容差——避让机制首次实际生效；
- 同车道车（offset ±0.4）仍正常碰撞——躲避车流的核心 gameplay 保留。

**回归**：collision.test.ts 新增「边线车不误撞居中玩家」用例（offset 0.8 不撞 / 0.4 仍撞）；既有 96 个碰撞/车流/集成测试全部兼容（测试用 ±0.5 同车道、±1.0 错开场景，与 0.55 容差无冲突）。

### 复测结果（实测）

| 门禁 | 结果 |
|------|------|
| typecheck / lint / format | ✅ 全部通过 |
| npm test | ✅ 45 文件 **664 用例**全绿（+1 容差收窄回归） |
| npm run bot | ✅ 9 赛道全部完成，0 违规 |
| npm run build | ✅ PWA 产物正常 |
| e2e | ✅ 22 passed + 2 skipped |
| 浏览器实测 | ✅ 同条件直行 16s 碰撞 7 → **4**（前 6 秒 0 碰撞，修复前 2 秒即首撞）；剩余碰撞为中央车道 ±0.4 同车道车辆，属正常 gameplay；audit-10-postfix 截图确认行驶/HUD 正常 |

### 审计过程记录

- 截图产物：audit-01-menu / audit-02-racing / audit-03-finish / audit-04-pause / audit-05-countdown（海岸）/ audit-06-mobile-menu / audit-07-mobile-racing / audit-08-night-driving / audit-09-drift / audit-10-postfix（均存 docs/screenshots/）。
- 探测方法：Playwright headless 脚本注入键盘事件 + `window.__gameDebug` 采样（碰撞计数/速度/阶段），规避 IDE 标签页隐藏导致 RAF 停摆的观测干扰（隐藏标签页 RAF 被浏览器挂起，游戏帧循环冻结属预期行为而非缺陷）。
- 已知设计取舍（未改动）：避让 AI 反应窗（AVOID_Z_DIST=350 / AVOID_STEP=0.8）在高速逼近下避让幅度有限，属难度设计；收窄容差后其有效性已显著提升。
