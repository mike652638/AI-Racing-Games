import { defineConfig } from '@playwright/test'

/**
 * Playwright 视觉回归配置（M16）：
 * - 由 CI（.github/workflows/ci.yml）与本地 `npm run test:e2e` 使用
 * - 自动启动 vite dev server（webServer），端口复用 5173
 * - 桌面 1280×720 + 移动端横屏 812×375 双项目
 * - 截图失败时自动归档（默认 outputDir test-results/）
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  // vitest 与 playwright 均默认忽略 node_modules；e2e 目录与 vitest include（tests/**/*.test.ts）不重叠
  timeout: 60_000,
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
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
