/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    // PWA 支持：插件内部已按作用域拆分（generateSW/workbox 构建在 apply:'build'，
    // dev 模式仅注入 HTML 的 serve 插件），因此 vitest node 环境加载配置时
    // 不会执行 workbox 相关逻辑，测试不受影响。
    VitePWA({
      registerType: 'autoUpdate',
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html', // 单页应用回退
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
