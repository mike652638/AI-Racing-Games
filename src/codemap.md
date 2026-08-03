# src/

## Responsibility

`src/` 是游戏的全部源代码根目录。按关注点分层为：渲染引擎（`engine/`）、车辆物理（`physics/`）、游戏逻辑编排（`game/`）、AI 决策与模拟（`ai/`）、用户界面（`ui/`）、程序化音频（`audio/`），以及运行时唯一入口 `main.ts` 与全局样式 `style.css`。各子目录均为纯函数优先的领域层或副作用受限的表现层，通过 `main.ts` 在 `requestAnimationFrame` 主循环中串联。

## Design

- **纯函数领域层**：`engine/` 与 `physics/` 的核心逻辑全部为纯函数/无副作用类型，不依赖 DOM、浏览器事件或全局状态；`main.ts` 负责创建与注入可变状态容器。
- **状态集中管理**：`game/state.ts` 的 `RaceState` 是运行时的唯一可变状态容器，主循环每帧读改写同一对象；所有渲染与 UI 函数均为 `state → output` 的纯函数/渲染函数。
- **门面封装**：`engine/renderer.ts` 的 `Renderer` 类作为渲染门面，组合所有底层渲染子模块，对外只暴露 `render` / `renderRegion` / `setViewport` / `setTrack` / `setTraffic` 等粗粒度 API。
- **依赖方向单向**：`engine/` 与 `physics/` 处于底层，不依赖 `game/` / `ui/` / `audio/` / `ai/`；`game/` 依赖 `engine/` + `physics/`；`ui/` 依赖 `game/` + `physics/`；`audio/` 仅依赖外部注入的 `AudioContext`；`ai/` 依赖 `engine/` + `physics/`。
- **可测试与可复现**：领域层纯函数、确定性生成器（`mulberry32`）、无头模拟器（`ai/simulate.ts`）共同支撑 Vitest 单测与 `npm run bot` 跑圈验证。

## Flow

1. **启动**：`index.html` 加载 `src/main.ts`；`main.ts` 读取 `TRACK_DEFS` 构建赛道，初始化 `RaceState`、`Renderer`、`InputManager`、`JoystickUI`、存档最佳时间。
2. **主循环**：`requestAnimationFrame` 驱动 `frame(now)`，计算 `dt` 后分阶段执行：
   - `PHASE_MENU`：仅渲染背景并等待输入。
   - `PHASE_RACING`：推进车流 → 采集输入 → 漂移/运动学 → 过圈检测 → 碰撞裁决 → 渲染 → HUD 刷新。
   - `PHASE_PAUSED`：暂停输入与物理，显示暂停画面。
   - `PHASE_FINISHED`：触发结算面板填充与存档写入。
3. **阶段切换**：`window.addEventListener('keydown')` 触发 `nextPhase` / `togglePause`，`main.ts` 的 `applyPhase()` 调用 `ui/screens.ts` 更新屏幕显隐。
4. **音频启动**：首次按键时创建 `AudioContext` 并启动 `EngineSound` 与 `MusicPlayer`，主循环每帧以速度比驱动引擎音效。
5. **分屏支持**：`?split=1` 参数启用双人模式，主循环维护两套 `CarState`/`DriftState`/`cameraZ`，渲染器调用 `renderRegion` 分左右视口绘制。

## Integration

- `src/main.ts` 是 `src/` 内唯一运行时入口，依赖并调度所有子目录。
- 子目录间依赖关系：
  - `engine/` ← 被 `main.ts`、`game/state.ts`、`ai/bot.ts`、`ai/simulate.ts` 消费
  - `physics/` ← 被 `main.ts`、`game/input.ts`、`game/collision.ts`、`ai/bot.ts`、`ai/simulate.ts`、`ui/hud.ts` 消费
  - `game/` ← 被 `main.ts` 消费
  - `ui/` ← 被 `main.ts` 消费
  - `audio/` ← 被 `main.ts` 消费
  - `ai/` ← 被 `tests/` 消费（headless，生产循环不直接依赖）

## 子目录详细地图

| 目录 | 详细地图 |
|------|----------|
| `src/engine/` | [src/engine/codemap.md](src/engine/codemap.md) |
| `src/physics/` | [src/physics/codemap.md](src/physics/codemap.md) |
| `src/ai/` | [src/ai/codemap.md](src/ai/codemap.md) |
| `src/game/` | [src/game/codemap.md](src/game/codemap.md) |
| `src/ui/` | [src/ui/codemap.md](src/ui/codemap.md) |
| `src/audio/` | [src/audio/codemap.md](src/audio/codemap.md) |

## 根级文件

| 文件 | 职责 |
|------|------|
| `src/main.ts` | 运行时入口：初始化所有模块、事件监听、`requestAnimationFrame` 主循环、阶段切换、分屏渲染 |
| `src/style.css` | 全屏 Canvas、HUD 定位、启动/结算/暂停画面样式、赛道选单高亮、移动端适配 |
| `src/vite-env.d.ts` | Vite 客户端类型声明 |
