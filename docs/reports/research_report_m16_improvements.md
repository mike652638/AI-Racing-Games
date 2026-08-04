# AI-Racing-Games M16 工程化改进交付报告

## 概述

按修复交付报告（research_report_fixes_applied.md）的"下一步建议"无人值守实施三项工程化改进：操作提示文案同源、帧循环调度纯函数化、Playwright 视觉回归与 CI 集成。全量验证（typecheck + lint + format:check + 608 单测 + bot 9 赛道 + build + e2e 视觉回归）一次性通过。e2e 测试在实施过程中额外发现并修复了移动端横屏（812×375）真实布局缺陷（开始按钮超出视口、榜单卡片换行挤压）。

## 一、任务 1：倒计时提示文案抽象到常量、与 README 同源

**动机**：修复报告 P2 项指出"操作提示'Shift 漂移'与自动蓄力机制不符"属于文档/代码脱节，建议将提示文本与 README 操作说明建立共同来源，防止文案漂移。

**实施**：
- 新建 `src/ui/copy.ts` 文案常量模块：
  - `COUNTDOWN_HINTS`（3 条起步倒计时操作提示：WASD/空格氮气/高速急转自动漂移）
  - `COUNTDOWN_HINT_README_KEYWORDS`（与 README 操作说明一一对应的关键词数组，如 `['W', '方向键']`、`['氮气', 'Space']`、`['高速急转']`）
  - `MENU_HINT` / `MENU_HINT_TOUCH` 菜单提示
- `src/game/game-loop.ts` 的 `startCountdown()` 改为由 `COUNTDOWN_HINTS` 常量填充 `.countdown-hints` 容器（index.html 改为空容器，文案唯一真源）
- 新增 `tests/unit/copy.test.ts`：读取 README.md 原文，断言每条提示的关键词都出现在"操作说明"章节——此后修改提示文案若不同步 README 测试即失败

**验证**：`copy.test.ts` 5 用例通过；e2e "操作提示由 copy.ts 常量填充" 用例通过（倒计时实际渲染出 3 条文本与常量一致）。

## 二、任务 2：提取 `shouldScheduleNextFrame` 纯函数并补单测

**动机**：修复报告 P0-3（热座交棒后 RAF 链断裂）根因是 `frame()` 第 874 行 `if (!ur.shouldRender) return` 未自续 RAF。建议把"是否调度下一帧"的决策提取为纯函数，便于单测锁定契约，防止未来重构再次引入同类 bug。

**实施**：
- `src/game/frame-pure.ts` 新增 `shouldScheduleNextFrame(shouldRender: boolean): boolean` 纯函数，语义注释明确指向"P0 回归：shouldRender=false 时停止 rAF 自续"
- `src/game/game-loop.ts` frame() 中的裸判断替换为 `shouldScheduleNextFrame(ur.shouldRender)`，并在 re-export 块导出（保持 `'game-loop'` import 路径兼容）
- 新增 3 个单测用例（game-loop.test.ts）：shouldRender=true 继续调度、false 停止、热座 P2 回合依赖 shouldRender=true 持续自续（P0 回归锚点）

## 三、任务 3：CI 加入 Playwright 视觉回归 + 移动端视口截图测试

**动机**：修复报告"下一步建议"指出 UI 渲染、模式策略边界、视觉一致性、响应式适配是手工与视觉验证盲区，建议增加 Playwright 视觉回归 + 移动端视口截图测试。

**实施**：
- 安装 `@playwright/test`（devDependency）+ 下载 chromium（headless shell）
- 新建 `playwright.config.ts`：桌面 1280×720 + 移动横屏 812×375 双 project，自动拉起 vite dev server（webServer），失败时保留 trace/screenshot
- 新建 `tests/e2e/visual.spec.ts`（7 个测试 × 双 project）：
  1. 红色光晕不遮挡任何赛道卡片（P1-1 回归，bounding box 相交断言）
  2. 标题与副标题不叠影（P1-2 回归）
  3. 开始按钮在视口内可见
  4. 移动端横屏：标题不叠影 + 开始按钮在视口内（等 1.2s 入场动画，桌面 project 跳过）
  5. 天空无高频条纹（P0-1 回归，canvas `getImageData` 像素级 maxDelta < 60）
  6. 操作提示由 copy.ts 常量填充（与 README 同源）
  7. 热座 P1 HUD 标签"P1 驾驶中"（P0-2 相关）
- `.github/workflows/ci.yml` 新增独立 `e2e` job（install --with-deps chromium + test:e2e + 失败上传 test-results 产物）
- `package.json` 新增 `test:e2e` 脚本；`.gitignore` 忽略 `test-results/`、`playwright-report/`

**e2e 测试暴露的真实问题（已一并修复）**：
1. **移动端横屏开始按钮超出视口**（mobile-landscape 断言失败：按钮 bottom=582 > 375）——812 宽不触发 `max-width: 640px` 的 2 列网格（812 > 640），但触发 `max-height: 480px` 压缩；菜单内容（标题 46px + 副标题 + 3×3 赛道卡片 153px + 榜单 + 按钮 + 提示）总高远超 375。
   - 修复：`max-height:480px` 下进一步压缩 `--title-fs` 至 `clamp(18px, 5vw, 30px)`、赛道卡片 `min-height: 34→32px`、隐藏中央赛道缩略图预览（`.track-preview-wrap { display: none }`，省 40px）、榜单卡片强制单行（`flex-wrap: nowrap` + `flex: 1 1 0`，此前 812px 下 3 卡换行成 2 行占 137px）、隐藏键盘提示 `#menu-hint`（横屏手机以触屏为主）、光晕进一步贴地（`bottom: 2%`、`min(14vw, 96px)`）。
   - 验证：诊断脚本显示开始按钮 bottom 372 ≤ 375，e2e 通过。
2. **桌面 project 误跑移动端断言**：`test.skip(({ page }) => page.viewportSize()!.width > 900)` 使移动端横屏测试只在 mobile-landscape project 运行，修复硬编码 375 的断言误伤。

## 四、全量验证结果

| 验证项 | 命令 | 结果 |
|---|---|---|
| TypeScript | `npm run typecheck` | 通过 |
| ESLint | `npm run lint` | 通过 |
| Prettier | `npm run format:check` | 通过（3 个 codemap.md 格式化后复验） |
| 单元测试 | `npm test` | 608 用例全绿（42 文件，+8：copy 5 + shouldScheduleNextFrame 3） |
| Bot 矩阵 | `npm run bot` | 9 赛道全部 finished，0 违规 |
| 生产构建 | `npm run build` | PWA 产物生成 |
| E2E 视觉回归 | `npm run test:e2e` | 13 通过 + 1 跳过（桌面 project 跳过移动端断言） |

## 五、修改的文件清单

| 文件 | 变更 |
|---|---|
| `src/ui/copy.ts` | 新增：文案常量唯一真源（COUNTDOWN_HINTS / README 关键词 / 菜单提示） |
| `src/game/game-loop.ts` | startCountdown 用常量填充提示；frame() 用 shouldScheduleNextFrame；re-export |
| `src/game/frame-pure.ts` | 新增 shouldScheduleNextFrame 纯函数 |
| `src/style.css` | max-height:480px 进一步压缩移动端横屏布局（标题/卡片/预览隐藏/榜单单行/光晕贴地/隐藏键盘提示） |
| `index.html` | countdown-hints 改为空容器 |
| `tests/unit/copy.test.ts` | 新增：文案常量 + README 同源断言 |
| `tests/unit/game-loop.test.ts` | 新增 shouldScheduleNextFrame 3 用例 |
| `tests/e2e/visual.spec.ts` | 新增：7 项视觉回归 |
| `playwright.config.ts` | 新增：双 project + webServer + trace |
| `.github/workflows/ci.yml` | 新增 e2e job |
| `package.json` | test:e2e 脚本 + @playwright/test 依赖 |
| `.gitignore` | 忽略 test-results/、playwright-report/ |
| `README.md` | M16 里程碑 + 测试命令章节 |
| `tests/codemap.md` / `src/ui/codemap.md` / `src/game/codemap.md` | 新增 copy.ts / e2e / shouldScheduleNextFrame 说明 |

## 六、风险评估

1. **copy.ts 与 README 同源**：关键词数组与提示一一对应，若未来新增提示必须同时更新数组与 README；copy.test.ts 有 5 个断言兜底。注意 README 操作说明本身是"任意键开始"（实际也是任意键），与 countdown 提示"WASD 驾驶"语义不冲突。
2. **shouldScheduleNextFrame**：纯函数语义与旧行为逐字节一致（`return shouldRender`），game-loop.test.ts 3 用例 + 集成测试 45 用例（含热座交棒）锚定无回归。
3. **CSS 移动端压缩**：仅作用于 `@media (max-height: 480px)` 断点，桌面（1280×720）与竖屏手机不受影响；e2e 双 project 验证桌面与移动横屏两个视口均通过。隐藏 `.track-preview-wrap` 仅低高度生效，桌面保留预览。
4. **Playwright 依赖**：@playwright/test 已入 devDependencies，chromium 需 `npx playwright install chromium`（CI 用 --with-deps 自动装）；测试结果与截图不入库（.gitignore）。

## 七、产出文档

- 本报告：`research_report_m16_improvements.md`
- e2e 测试失败时的取证截图：`test-results/`（已 .gitignore，CI 失败时作为 artifact 上传）

## 八、结论

三项下一步建议全部实施完成并全量验证通过。其中 Playwright 视觉回归不仅固化了 P0/P1 修复的防回归（天空条纹像素级断言、热座 P2 HUD、菜单光晕、标题叠影、移动端按钮），还在实施中暴露并修复了移动端横屏的真实布局缺陷（此前 agent-browser 截图仅定性观察，未做像素/几何级断言）。至此项目拥有完整的四层质量门禁：typecheck/lint（静态）、608 单测（白盒）、bot 9 赛道矩阵（黑盒玩法）、Playwright 视觉回归（UI 表现与响应式），与 M16 里程碑"运行时实测修复 + 工程化补强"目标一致。
