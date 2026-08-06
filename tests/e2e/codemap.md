# tests/e2e/

## Responsibility

Playwright 视觉回归目录（M16 引入）。通过 `npm run test:e2e`（`playwright test`）在真实浏览器中对游戏页面做布局/渲染/交互级回归，覆盖运行时实测修复点（见 `docs/reports/research_report_runtime_testing.md`）的防回归：菜单红色光晕不遮挡赛道卡片（P1-1）、标题与副标题不叠影（P1-2）、游戏内天空无高频条纹（P0-1，canvas 像素级 maxDelta < 60）、倒计时提示由 copy.ts 常量填充（与 README 同源）、热座 P1 HUD 标签、移动端横屏开始按钮在视口内、倒计时覆盖层数字合法、暂停按钮 pointer-events 可点性、起步碰撞保护期零碰撞等。配套 `playwright.config.ts`（仓库根目录）：桌面 1280×720 + 移动横屏 812×375 双 project，自动拉起 vite dev server；CI（`.github/workflows/ci.yml`）以独立 `e2e` job 执行（`needs: [ci]`、安装 chromium、失败时上传 `test-results/` 产物）。

## Design

- **双 project 视口矩阵**：`desktop`（1280×720）与 `mobile-landscape`（812×375）两 project 各跑一遍全部用例；跨视口不适用的断言用 `test.skip` 条件守卫（如硬编码 720/375 边界、移动端断言桌面跳过、桌面断言移动端跳过），保证每个用例只在语义正确的视口下生效。
- **DOM 几何断言**：`menuBoxes()` 通过 `page.evaluate` 读取 `.track-option`/`.title-main`/`.title-sub`/`#start-btn` 的 `getBoundingClientRect()`，以「矩形重叠检测」断言标题不叠影、按钮在视口内——直接锚定 P1-1/P1-2 修复，比截图比对更稳定（2026-08-06：`.menu-sun` 光晕元素已移除，原「光晕不遮挡卡片」用例改为「`.menu-sun` 不存在」回归断言）。
- **canvas 像素级断言**：天空条纹用例用 `getImageData` 逐行扫描天空区域（画布上 35% 高度内）相邻像素 RGB 分量差的最大值，断言 `< 60`（修复前接近满量程 255），从渲染输出层面锚定 P0-1。
- **文案同源断言**：倒计时提示用例读取 `#countdown-overlay .countdown-hints p` 全部文本，断言与 `src/ui/copy.ts` 常量逐字一致（`['WASD / 方向键 驾驶', '空格 氮气加速', '高速急转 自动漂移']`），防 README/运行时文案漂移。
- **真实指针命中**：暂停按钮用例通过 Playwright `click`（真实指针命中）验证 `#pause-btn` 的 `pointer-events: auto` 覆写有效（防 #hud 的 `pointer-events:none` 被继承导致按钮点不动），并端到端走「点击 → 暂停屏 → 继续 → 恢复」流程。
- **debug 钩子断言**：起步碰撞用例读取 `window.__gameDebug.collisions`（installDebugHook 注入的运行时状态），断言开赛 3.5s 内零碰撞——锚定 `TRAFFIC_SPAWN_SAFE_ZONE` 出生窗口排除 + `RACE_START_GRACE` 起步保护期修复。
- **动画时序处理**：等待倒计时（3×800ms + 500ms 隐藏延迟）后再断言 RACING 阶段元素；移动端菜单断言前 `waitForTimeout(1_200)` 等待入场动画（content-fade-in 0.9s translateY）结束，避免布局偏移误判。
- **测试隔离与产物**：每个用例独立 `page.goto('/')`（webServer 复用 dev server）；失败时自动截图 + trace（`trace: 'retain-on-failure'`），CI 归档 `test-results/`（retention 7 天）。

## Flow

1. `npm run test:e2e` → Playwright 读取根目录 `playwright.config.ts`。
2. `webServer` 自动启动 `npm run dev`（vite，端口 5173，CI 外 `reuseExistingServer` 复用已运行实例），就绪后开始跑用例。
3. `desktop` 与 `mobile-landscape` 两 project 依次执行 `tests/e2e/visual.spec.ts` 的全部 describe（桌面菜单 / 倒计时覆盖层 / 暂停按钮可点性 / 起步碰撞回归 / 移动端横屏菜单 / 游戏内渲染 / 热座模式 HUD）。
4. `list` reporter 输出结果；本地失败可查 `test-results/`，CI 的 `e2e` job 失败时上传 `playwright-artifacts`。
5. 与 `npm test`（vitest）互不重叠：vitest include `tests/**/*.test.ts`，Playwright testMatch `**/*.spec.ts`，二者可并行独立执行。

## Integration

- **Depends on**：
  - `@playwright/test`（vite dev server 由 `playwright.config.ts` 的 `webServer` 自动管理）
  - `src/ui/copy.ts`：倒计时提示文案常量（断言同源）
  - `src/game/game-loop` 的 installDebugHook：`window.__gameDebug` 运行时状态（碰撞计数断言）
  - 游戏 DOM：`.menu-sun`/`.track-option`/`.title-main`/`.title-sub`/`#start-btn`/`#countdown-overlay`/`#hud-time`/`#pause-btn`/`#pause-screen`/`#pause-resume`/`#hud-player-tag`/`#game` canvas
- **被调用方**：`package.json` 的 `test:e2e` 脚本；`.github/workflows/ci.yml` 的 `e2e` job（needs ci，`npx playwright install --with-deps chromium` 后执行，失败上传 `test-results/`）。
- **与单元测试的分工**：`tests/unit/` 白盒验证模块纯函数与状态机（jsdom/node 环境、canvas mock），`tests/e2e/` 黑盒验证真实浏览器中的布局/渲染/交互，二者互补覆盖「逻辑正确」与「视觉/可交互正确」。
- **备注**：`tests/visual/`（仓库根下另有目录）为一次性 agent-browser Python 截图对比脚本与 `screenshots/` 产物，供人工视觉检查使用，**不参与**自动化 e2e 回归。

## Files

| File             | Responsibility                                                                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visual.spec.ts` | 视觉回归用例（M16/M17 演进）：桌面菜单光晕/标题叠影/开始按钮/9 卡片布局边界、倒计时覆盖层数字与隐藏、暂停按钮 pointer-events 与真实指针点击、起步 3.5s 零碰撞（debug 钩子）、移动端横屏菜单、游戏内天空像素条纹与 copy.ts 文案同源、热座 P1 HUD 标签 |
| `codemap.md`     | 本目录索引（本文件）                                                                                                                                                                                                                                 |

> 注：`playwright.config.ts` 位于仓库根目录（与 `package.json` 同层），非 `tests/e2e/` 内；详细配置见 `.github/workflows/ci.yml` 的 `e2e` job 与 AGENTS.md 的 M16 记录。
