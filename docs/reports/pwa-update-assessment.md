# PWA autoUpdate 打断风险评估报告

- 日期：2026-08-22
- 范围：vite-plugin-pwa（generateSW）更新策略对局中断风险评估
- 结论：**风险已消除，维持现状（prompt 模式）**

## 1. 背景与现状

M15 起引入 vite-plugin-pwa（generateSW + registerType 'autoUpdate'）。历史报告提示
"PWA autoUpdate 策略评估避免对局被打断"。

**当前代码已非 autoUpdate**——经核查，S 修复（S1）已将策略切换为 prompt 模式：

- `vite.config.ts`：`registerType: 'prompt'` + `injectRegister: null`（手动注册，防双重注册）
- `src/game/pwa-update.ts`：`setupPwaUpdate()` 经 `virtual:pwa-register` 的 `registerSW` 手动注册，
  仅在 PROD + 浏览器环境挂载（dev/test no-op）
- `index.html`：已内置 `#pwa-update-toast` 提示条 + `#pwa-update-refresh` 按钮
- `src/main.ts`：`setupPwaUpdate()` 在 `initGame()` 前挂载

## 2. autoUpdate 模式的真实风险（历史背景）

registerType 'autoUpdate' 下，新 SW 安装成功后插件自动调用 `skipWaiting()` 并触发
`controllerchange`，随后 `window.location.reload()` 刷新页面。**刷新时机不区分当前是否在对局中**，
对正在进行的比赛构成直接打断：

| 对局资源                      | autoUpdate 刷新影响                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| RAF 循环（GameLoop）          | reload 销毁 JS 上下文，requestAnimationFrame 链立即终止，当前对局状态（内存 RaceState）全部丢失  |
| AudioContext（引擎音效/音乐） | reload 后 AudioContext 重建，正在播放的音频中断                                                  |
| localStorage 存档             | reload 不丢持久化存档，但**对局中途**的未完成进度（raceTime/漂移得分/圈数）为内存态，reload 即丢 |

**结论**：autoUpdate 在玩家处于 RACING 阶段时刷新 = 一局无预警被打断，体验严重受损。
这是历史报告指出的真实风险，S1 修复正是针对此问题。

## 3. precache 更新与旧页面 404 分析

- 新 SW 安装时 precache 新版本带 hash 的 assets（js/css）。旧页面已加载的旧 hash 资源仍在内存运行，
  不会因 SW 更新而 404。
- 若旧页面在 SW 更新后**再次请求**旧 hash 资源（懒加载 chunk），而旧资源已被新 precache 清理
  （cleanupOutdatedCaches），可能 404。本项目为单入口 bundle，Canvas 即时绘制 + WebAudio 合成
  均无外部请求，workbox 亦未配置额外 runtimeCaching 路由，**该风险极低**。
- `globPatterns` 剔除 html + `navigateFallback: 'index.html'`：index.html 每次导航实时拉取，
  配合 index.html 的 `Cache-Control: no-cache` meta，避免 SW 缓存旧版 HTML 导致普通刷新仍见旧页。
  代价是失去离线壳，本应用需联网，可接受。

## 4. 当前 prompt 模式评估

registerType 'prompt' 下，新 SW 安装后**不自动** skipWaiting/reload，触发 `onNeedRefresh` 回调，
由应用决定刷新时机。`pwa-update.ts` 的实现：

- `onNeedRefresh`：弹 `#pwa-update-toast` 提示条，用户点击「立即刷新」才调用 `updateSW(true)` 刷新
  ——**刷新权交给玩家**，对局不被打断。
- 提示条缺失（构建异常/被移除）时退化为直接刷新，保证新版本仍能生效（防御性兜底）。
- `onOfflineReady`：隐藏提示条。

**评估**：prompt 模式 + 玩家确认刷新，已彻底消除"对局中途被自动刷新打断"的风险。提示条带
`role="status"` + `aria-live="polite"`，具备基本可访问性。

## 5. 结论与建议

**结论：维持现状（prompt 模式）。** autoUpdate 打断对局的风险已被 S1 修复消除，无需回退或再改动。

**可选增强（仅文档建议，不实施）**：

1. 提示条出现时若玩家正在 RACING，可在结算/回菜单后再自动刷新（当前实现为弹条等用户点击，
   已足够安全；如需更"无感"可加"非 RACING 自动刷新"分支，但会牺牲玩家对刷新时机的控制）。
2. 提示条可补充"稍后"按钮（当前仅「立即刷新」，玩家不点则一直显示，可接受）。
3. 若未来引入代码分割/懒加载 chunk，需重新评估 precache 清理对旧 chunk 的 404 风险。

**当前实现无需改动**，vite.config.ts 的注释已说明策略选择理由。
