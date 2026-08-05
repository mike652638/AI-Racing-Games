# 菜单榜单区域专项审计与打磨实施报告（赛道最佳 / 漂移榜单 / 对局战绩）

> 审计时间：2026-08-05
> 审计方式：Playwright（playwright-core）确定性探针 `.codebuddy/lb-probe.mjs`（修复前 lb-z 系列）与 `.codebuddy/lb-probe-y.mjs`（修复后 lb-y 系列），覆盖 3 种数据态（空 / 稀疏 / 满数据 TOP10）× 4 种视口（1280×720 / 1280×600 / 812×375 移动横屏 / 键盘焦点）× 展开互斥 / 滚轮捕获 / 内滚 / 长文本换行等交互场景，共 22 张证据截图（`docs/screenshots/lb-z*.png` 修复前、`lb-y*.png` 修复后），指标快照 `.codebuddy/lb-summary.json` / `lb-summary-y.json`，配合源码交叉核对（`top-refresh.ts` / `game-loop.ts#bindLeaderboardCards` / `save.ts` / `style.css` 榜单段）。

---

## 一、保持项（现状良好，未改动）

| 维度 | 评估 |
|------|------|
| 交互模型 | 三卡互斥展开（展开 B 自动收起 A）、click + Enter/Space 键盘双通道、`aria-expanded` 同步，实测逐卡轮展互斥正确 |
| 数据层 | `loadDriftTop/loadMatchTop/loadBestTimeFor` 逐条校验 + JSON 损坏回退，TOP10 排序/截断语义正确 |
| 空态文案 | 「暂无 X\n引导语」双行占位（BEST_EMPTY_HINT/DRIFT_EMPTY_HINT/MATCH_EMPTY_HINT 同源 copy.ts），实测三态渲染正常 |
| 触控目标 | 低高度媒体查询卡片头 min-height 44px（M-2 遗留成果），实测 headH=44 ✓ |
| 滚轮主通道 | 悬停卡片滚轮不被卡片捕获（外层 `.menu-content` 正常滚动），展开态 >8 行条目内滚可用（实测 wheel 0→80px） |
| 长文本 | 漂移条目「连击 x1.75」后缀在 215px 卡宽内无横向溢出（overflowX=false） |
| sticky CTA | 低高度 600px 展开卡片后开始按钮 y=520/底 572 ≤ 600，始终可见 |

## 二、发现的问题与修复（LB-Z 系列，全部实施并复测）

### LB-Z1（P1·交互缺陷）：移动端/低高度（≤480px）榜单展开交互完全失效

- **现象**：`@media (max-height: 480px)` 内 `.lb-card-body { display: none }` 恒隐藏内容（原意为省空间防开始按钮被挤出）。但卡片仍可点击，点击后 toggle 文案切「收起 ▾」、`aria-expanded=true`、边框高亮起——**内容却不可见**（探针实测移动端 body scrollH/clientH 恒 0）。交互契约违背，用户会认为功能损坏。
- **修复**（`style.css` 480px 媒体查询）：收起态仍隐藏省空间；展开态恢复可见 `display: block` + `max-height: 88px` + `overflow-y: auto` + 11px 字号；展开态卡片头恢复分隔线。内容推高的开始按钮由既有 sticky 保底。
- **复测**：lb-y10 移动端展开态 body clientH 0→100px，5 条漂移记录可见可滚；卡片高 52→161px；开始按钮底 329→361 ≤ 375 ✓。

### LB-Z2（P2·交互回归）：`.scrollable` 残留使收起态重陷嵌套滚动陷阱

- **现象**：`.lb-card-body.scrollable { overflow-y: auto }` 全局生效。卡片 A 展开（10 行 >8 → 加 `.scrollable`）后被互斥收起时 refresh 不重跑，类残留——收起态（max-height 120px、内容 196px）变成可卡片内滚，M-3 已修掉的嵌套滚动陷阱在 toggle 序列后复现（探针实测 bestExpanded 态下收起的漂移卡 overflow=auto）。
- **修复**：CSS 限定 `.lb-card-clickable.expanded .lb-card-body.scrollable` 才开内滚；收起态恒 `overflow: hidden`。
- **复测**：lb-y05 收起的漂移卡 overflow hidden（类仍 true 但不可滚）✓；展开态内滚 0→80px 保留 ✓。

### LB-Z3（P2·视觉误导）：收起态内容硬裁切无提示，「显示 5 条」实际只见 3 条

- **现象**：满数据收起态内容 5 条×2 行（条目超宽折行）=196px，被 max-height 120px 截断，第 4 条拦腰斩断且无任何「还有更多」提示——用户误以为榜单只有 3 条，与代码「收起取前 5 条」语义不符。
- **修复**：`top-refresh.ts` 新增 `syncClipped()`——`scrollHeight > clientHeight + 2` 时加 `.clipped`；CSS 用 `mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent)` 底部 28px 渐隐提示。测试 stub 无布局属性（scrollHeight=undefined）时安全回退不加类。
- **复测**：真实 DOM 实测 `#drift-top` className 含 `clipped`、computed maskImage 为渐隐梯度 ✓（scrollH 196 / clientH 120）。

### 记录在案但不修（权衡结论）

- **条目折行**：漂移条目带连击后缀约 263px 超卡宽 215px，折为 2 行。加宽容器需 >800px 且 13px 字号仍不足容纳，改动面大收益低；LB-Z3 渐隐后「3 条 + 渐隐」视觉自洽，维持现状。
- **展开卡片拉高兄弟卡**（flex stretch 等高）：三卡一致高度视觉更整齐，保留。
- **Tab 焦点顺序**：榜单卡位于 9 个赛道选项之后（DOM 序），键盘用户需多次 Tab；DOM 序与信息架构一致，不调整。

## 三、验证结果

| 项 | 结果 |
|---|---|
| typecheck / lint | ✅ 全绿 |
| test | ✅ **702/702**（新增 `tests/unit/top-refresh.test.ts` 5 用例：clipped 超高/未超高/无布局回退 + scrollable 行数阈值 + BEST 空态；曾出现集成模拟用例负载超时 flake，单独复跑与常规负载下均全绿，与本轮改动无关——改动仅涉菜单 DOM/CSS 不触帧循环） |
| bot | ✅ 9 赛道 0 违规 |
| build | ✅ PWA 产物（precache 14 entries） |
| 探针复测 | ✅ lb-y01~y11 截图 + DOM 指标逐项核对达标 |

## 四、遗留与建议

1. e2e 视觉回归未在本轮跑（菜单榜单无既有像素断言），建议下次 CI 覆盖。
2. 若未来榜单条目数增多，可考虑把「收起取 5 条」改为按可视行数自适应（当前 120px 实际容纳 ~3 条整行），与 LB-Z3 渐隐配合进一步收敛语义。
