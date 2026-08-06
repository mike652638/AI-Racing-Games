import { defineConfig } from '@playwright/test'

/**
 * Playwright 视觉回归配置（M16 + M20）：
 * - 由 CI（.github/workflows/ci.yml）与本地 `npm run test:e2e` 使用
 * - 自动启动 vite dev server（webServer），端口复用 5173
 * - 三项目：桌面 1280×720 + 移动端横屏 812×375 + 大屏 1920×1080（M20 新增，
 *   P1-1 大屏布局回归 + P2-6 截图超时加固）
 * - 截图失败时自动归档（默认 outputDir test-results/）
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  // vitest 与 playwright 均默认忽略 node_modules；e2e 目录与 vitest include（tests/**/*.test.ts）不重叠
  timeout: 60_000,
  // M20 P2-6：默认 expect 5s 在 1920×1080 高 DPR / 字体加载下偶发超时，放宽至 15s
  // （expect 是顶层 TestConfig 选项，不属 use 的 UseOptions）
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile-landscape',
      use: { viewport: { width: 812, height: 375 } },
    },
    {
      // M20 P1-1：大屏 1080p 布局回归（内容居中 + 开始按钮在视口内）
      name: 'large-screen',
      use: { viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
