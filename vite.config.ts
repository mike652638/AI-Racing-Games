/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    // PWA 支持：插件内部已按作用域拆分（generateSW/workbox 构建在 apply:'build'，
    // dev 模式仅注入 HTML 的 serve 插件），因此 vitest node 环境加载配置时
    // 不会执行 workbox 相关逻辑，测试不受影响。
    VitePWA({
      // S 修复（S1）：autoUpdate → prompt——新版本不再自动刷新页面（会对局中途被打断），
      // 改由 pwa-update.ts 提供「新版本就绪」提示 + 用户确认刷新（菜单外静默，不打断对局）。
      registerType: 'prompt',
      // 手动控制 SW 注册（pwa-update.ts setupPwaUpdate 调 registerSW）：禁用插件自动注入，
      // 避免双重注册（插件注入脚本 + 手动 registerSW）导致回调重复触发。
      injectRegister: null,
      // manifest 由插件在构建时生成 manifest.webmanifest，并自动注入 HTML
      manifest: {
        name: 'OutRun 伪 3D 复刻',
        short_name: 'OutRun',
        description: 'OutRun 风格伪 3D 赛车游戏',
        lang: 'zh-CN',
        theme_color: '#ffd75e', // 取现有深色主题 accent 主色
        background_color: '#0a0e1a', // 取现有深色背景（style.css 渐变底色）
        display: 'standalone',
        orientation: 'landscape', // 横屏赛车游戏
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable', // 适配 Android 自适应图标裁剪
          },
          // SVG 图标：现代浏览器（Chrome/Firefox/Safari 15.4+）支持 manifest SVG 图标，
          // 同时用于 favicon；安装关键路径仍依赖上方 PNG。
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // 默认预缓存策略即可；Canvas 即时绘制 + WebAudio 合成音频均无外部请求，
        // 无需额外 runtimeCaching 路由
        // 修复（2026-08-05）：剔除 html——index.html 不预缓存，每次导航从 CDN 实时拉取，
        // 避免 SW 缓存旧版 HTML 导致普通刷新仍见旧页（Ctrl+F5 强制刷新绕过 SW 才能拿到新版）。
        // 代价：失去离线壳；本应用需联网，可接受。
        globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
        navigateFallback: 'index.html', // 单页应用回退（HTML 不在预缓存，由 network/runtime cache 提供）
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // game-loop-integration 长程模拟用例（多局全帧驱动 + canvas mock 全量录制）单 worker
    // 堆占用可达 5GB+，为 fork worker 显式抬高堆上限（Vitest 4 顶层 execArgv；.npmrc
    // node-options 仅作用于 npm 主进程，不会传入 worker；2026-08-05 审计复测 OOM 修复）
    execArgv: ['--max-old-space-size=8192'],
  },
})
