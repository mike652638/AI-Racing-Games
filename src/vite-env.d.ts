/// <reference types="vite/client" />

/**
 * 让 TypeScript 识别 Vite 环境特有的模块导入，
 * 包括 CSS  side-effect import、静态资源（图片、JSON 等）以及 import.meta.env。
 */

/**
 * vite-plugin-pwa 的客户端虚拟模块声明（S 修复 S1）：pwa-update.ts 动态导入
 * virtual:pwa-register 调 registerSW 手动注册 Service Worker（registerType='prompt'）。
 * 声明与 vite-plugin-pwa/client 导出的 RegisterSWOptions 结构一致。
 */
declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean
    onNeedRefresh?: () => void
    onOfflineReady?: () => void
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (error: unknown) => void
  }
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>
}
