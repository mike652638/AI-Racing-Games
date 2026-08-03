# 已识别问题与待改进项实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 无人值守实施全部 10 项已识别改进：渲染缓存激活、车流避让恢复、模拟器增强、GameLoop 拆分、死代码清理、文档同步、工程化（ESLint/Prettier/husky/CI/.gitignore）。

**Architecture:** 按文件边界划分为 6 个并行工作流（A-F），互不冲突的 lane 并行执行；高风险 lane（A 渲染缓存、D GameLoop 拆分）先由 oracle 设计方案再实施；收尾统一全量验证（typecheck → lint → test → bot → build）并按 lane 分提交。

**Tech Stack:** TypeScript 6.0 strict / Vite 8.2 / Vitest 4.1 / ESLint 10 + typescript-eslint / tsx（bot）

## Global Constraints

- 语言：所有回复、注释、文档使用中文；代码、命令、标识符保留英文
- 验证门禁顺序（AGENTS.md）：`npm run typecheck` → `npm run lint` → `npm test` → `npm run build`；bot 验收 `npm run bot`（退出码 0/1 契约）
- 技术栈不更换：Canvas 2D 伪 3D、无 Three.js/WebGL、无运行时依赖（新增 devDependency 允许）
- 不破坏既有导出 API：`updateBoostCharge`、`resolvePerformanceConfig`、`PREVIEW_CAMERA_SPEED`、`advancePreviewCameraZ`、`updatePlayerFrame` 等被测试引用的导出必须保留签名
- **所有 lane 只改文件，不执行 git commit**（收尾统一提交，避免并行提交冲突与 hooks 阻塞）
- 现有测试全绿是硬性验收：`npm test` 34 文件约 416 用例 + `npm run bot` 9 赛道矩阵

---

### Task A: 激活 roadStrip 离屏缓存消费（renderer.ts）

**Files:**
- Modify: `src/engine/renderer.ts:504-518`（renderCachedRoadStrips no-op → 真正实现）
- Modify: `src/engine/road-strip.ts`（如方案需要：strip 细分/渲染参数）
- Modify: `src/game/track-context.ts`（roadStrips 数据源，如需扩展）
- Test: `tests/unit/renderer-state.test.ts`、`tests/unit/road-strip*.test.ts`、`tests/unit/game-loop-integration.test.ts`

**方案来源：** oracle 先行设计（渲染缓存激活方案），fixer 按方案实施。

**约束：**
- 渲染行为零回归：`renderer-state.test.ts` 像素/调用断言全绿、`npm run bot` 全赛道通过
- 弯道段（curveAvg 非零）必须保留逐段 drawQuad（Canvas 2D drawImage 无透视变换，直道 strip 才能用切片 drawImage 加速）
- 帧内零新建数组（遵循项目对象复用惯例）
- 若实测收益不可行（基准无提升），回退方案：保持 no-op 但移除 setTrack 时无用预渲染开销，并更新注释说明结论——由实施者给出基准数据判断

- [ ] oracle 输出实现方案（算法、数据流、测试策略）
- [ ] 实施缓存消费路径（直道切片 / 弯道回退）
- [ ] 更新/新增单测 + 集成测试
- [ ] 跑 `npm run typecheck && npm test && npm run bot` 验证零回归

---

### Task B: 车流避让恢复逻辑（traffic.ts）

**Files:**
- Modify: `src/engine/traffic.ts:52-88`（updateTraffic 永久变道 → 带恢复）
- Modify: `src/engine/traffic.ts:3-14`（TrafficCar 增加巡航目标字段，如 `cruiseOffset`）
- Test: `tests/unit/traffic.test.ts`、`tests/unit/game-loop-integration.test.ts`

**Interfaces:**
- 保留 `createTraffic` / `updateTraffic` / `collideWithPlayer` 签名不变（createTraffic 生成时初始化新字段；旧调用零改动）
- `updateTraffic(traffic, dt, lapLength, player?)` 语义：不传 player 时行为与旧版完全一致

**设计要点（TDD）：**
- TrafficCar 增加巡航偏移字段（初始 = 出生 offset）
- 触发避让时：向远离玩家侧渐变（现有逻辑）
- 未触发避让时（远离/横向不接近）：以 AVOID_STEP 速率渐变**恢复**到巡航偏移，恢复后 `shiftDir = 0`
- 更新文件头注释（"变道是永久性的（无恢复逻辑）" → 恢复语义）
- 现有"永久变道"断言用例改为恢复语义断言

- [ ] 先写失败测试（避让后恢复巡航偏移）
- [ ] 实施恢复逻辑
- [ ] 全量 `npm test` 通过

---

### Task C: simulateLaps 增强（可选车流模式）

**Files:**
- Modify: `src/ai/simulate.ts`（LapOptions 增加可选车流参数）
- Modify: `src/ai/bot.ts`（如需车流感知：前瞻范围内有碰撞风险车时减速/避让）
- Modify: `tests/bot/run-bot.ts`（保持默认验收基线不变；新增可选带车流校验模式或输出字段）
- Test: `tests/unit/simulate.test.ts`

**设计要点（TDD）：**
- `LapOptions` 增加 `withTraffic?: boolean`（默认 false，保持既有验收基线 76.017s/0 违规不变）
- 车流模式：确定性 seed 生成车流 + `updateTraffic` 避让 + `collideWithPlayer` 碰撞判定（碰撞计数进 result，新增 `collisions` 字段）
- bot 车流感知：探测前方车流，碰撞风险时减速或小幅变道（决策输入扩展，向后兼容）
- `LapResult` 新增可选字段（如 `collisions`、`trafficEnabled`），旧字段不破坏
- `run-bot.ts` 默认仍跑核心运动学模式；车流模式以单测覆盖 + 可选 CLI 参数

- [ ] 先写失败测试（车流模式跑圈、碰撞计数）
- [ ] 实施增强
- [ ] `npm run bot` 默认基线不变（classic 3 圈 ≈ 76s / 0 违规）

---

### Task D: game-loop.ts 拆分 + pauseTitle 实现

**Files:**
- Modify: `src/game/game-loop.ts`（1192 行 → 拆分后 ≤ ~700 行）
- Create: `src/game/volume.ts`（音量管理：VOLUME_KEY、loadVolume/loadMusicVolume/loadSfxVolume、setMusicVolume/setSfxVolume/setVolume）
- Create: `src/game/top-refresh.ts`（refreshDriftTop/refreshBestSummary/refreshMatchTop 排行榜刷新）
- Modify: `src/game/game-loop.ts:660` 附近（pauseTitle 按暂停玩家动态标注：P1/P2）
- Test: `tests/unit/game-loop.test.ts`、`tests/unit/game-loop-integration.test.ts`

**方案来源：** oracle 先行设计（拆分边界、导出保持清单、this 绑定风险点）。

**约束：**
- 公共导出签名不变（测试引用：updateBoostCharge/resolvePerformanceConfig/PREVIEW_CAMERA_SPEED/advancePreviewCameraZ/GameLoop 类 API）
- `game-loop-integration.test.ts` 全绿（stub DOM/rAF/AudioContext 驱动真实主循环，含分屏/热座/挑战/暂停菜单）
- pauseTitle：分屏暂停时标题显示实际暂停的玩家（如 "P1 已暂停"），保持视觉结构

- [ ] oracle 输出拆分方案
- [ ] 提取音量管理模块
- [ ] 提取排行榜刷新模块
- [ ] 实现 pauseTitle 动态标注
- [ ] `npm run typecheck && npm test` 全绿

---

### Task E: 死代码清理 + 文档同步

**Files:**
- Modify: `src/physics/car.ts:83`（删除 `collidePlayers`，src 无调用方）
- Modify: `tests/unit/car.test.ts:123-131`（删除 collidePlayers 用例）
- Modify: `src/engine/track.ts` / `src/engine/sprites.ts`（删除仅测试使用的导出：`createDefaultTrack`、`createStraightTrack`、`spritesInRange`；若测试仍需要，将实现移至 `tests/helpers/`）
- Modify: `src/game/constants.ts:13`（DRIFT_SCORE_MAX 过时注释 → 与 drift.ts clamp 实现同步）
- Modify: `docs/codemap.md`、`src/**/codemap.md`、`tests/**/codemap.md`、`README.md`（M14 性能优化、road-strip.ts、minimap.ts、34 个测试文件、collidePlayers 移除）
- Test: 全量 `npm test`

**注意：** 删除导出前用 grep 确认 src/ 内无调用方；测试辅助函数的迁移需同步改所有引用测试；codemap 更新要覆盖 M6-M14 已有记录差异（若工作量大，至少补齐 M14 与本次改动）。

- [ ] 删除 collidePlayers + 用例
- [ ] 删除/迁移仅测试使用的导出
- [ ] 同步 constants.ts 注释
- [ ] 更新 codemap×N + README
- [ ] `npm run typecheck && npm test` 全绿

---

### Task F: 工程化配置（ESLint/Prettier/husky/CI/.gitignore）

**Files:**
- Modify: `eslint.config.js`（recommended → 增加安全规则：eqeqeq、curly、no-debugger 等；type-aware 规则谨慎评估）
- Modify: `package.json`（devDependencies + scripts：format、format:check、prepare；lint-staged 配置）
- Create: `.prettierrc.json`（singleQuote、semi: false、trailingComma: all——与现有代码风格对齐）
- Create: `.prettierignore`（dist、node_modules、*.log）
- Create: `.husky/pre-commit`（lint-staged: eslint --fix + prettier --write 仅暂存文件）
- Create: `.github/workflows/ci.yml`（npm ci → typecheck → lint → test → bot → build；node 22）
- Modify: `.gitignore`（/debug-*.py、/test-m*.py、/test-final.py、/test-manual.py、/night-bot-check.ts、/screenshots/、dev-out.log 等临时产物）
- Run: `npm install`（prettier、husky、lint-staged）

**约束：**
- **不物理删除任何文件**（临时脚本仅 gitignore；删除属用户决策）
- ESLint 新规则若现有代码违反 → **调整规则而非改 src 代码**（避免与 A-E 冲突），lint 必须全绿
- Prettier **不批量格式化现有文件**（避免巨 diff 与并行冲突）；提供 format 脚本供收尾使用，CI 中 format:check 仅检查
- husky 配置后本地 commit 会触发 lint-staged（收尾统一提交时验证可用）
- CI 无法本地完全验证（无 push），用命令序列本地模拟（npm ci 等价 npm install + 同命令）

- [ ] 更新 eslint.config.js + lint 全绿
- [ ] Prettier/husky/lint-staged 配置 + npm install 成功
- [ ] CI workflow 文件
- [ ] .gitignore 更新
- [ ] 本地模拟 CI 命令序列全绿

---

## 执行顺序

1. 并行派发：oracle×2（方案 A/D）+ fixer-B + fixer-C + fixer-E + fixer-F
2. oracle 返回后：fixer-A、fixer-D 按方案实施
3. 全部完成后收尾（编排者）：prettier 格式化本次改动文件 → 全量验证门禁 → 按 lane 分提交（各 commit 触发 lint-staged 验证）
