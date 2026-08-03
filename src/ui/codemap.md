# src/ui/

## Responsibility

游戏 UI 表现层的全部职责：HUD（速度/圈数/计时/最佳时间/漂移指示）的逐帧刷新、启动/暂停/结算屏幕的显隐切换与结算数据填充、显示格式化（速度、时间、圈速）、按赛道维度持久化最佳成绩（localStorage）、游戏阶段有限状态机（menu/racing/finished/paused）、以及触屏设备的虚拟摇杆输入。UI 层不持有游戏逻辑：它接收 `RaceState`/`CarConfig` 作为输入并产生 DOM 副作用（render-as-function-of-state）。

## Design

- **纯函数与副作用分离**：`format.ts`（格式化）与 `gamestate.ts`（状态转移）为无副作用的纯函数；`hud.ts`、`screens.ts`、`joystick.ts` 为 DOM 副作用模块；`save.ts` 的副作用通过可注入的 `storage` 参数隔离（默认为 `getStorage()`，便于单测注入 mock 并支持 localStorage 不可用时安全降级）。
- **状态驱动渲染**：UI 模块均不缓存游戏状态，每次由调用方（`main.ts`）传入最新 `RaceState`/`CarConfig`，`updateHud` 每帧调用，`applyPhaseToScreens` 在阶段切换时调用。
- **DOM 引用集中管理**：`HudElements` / `ScreenElements` 两个接口聚合全部相关 DOM 元素，由 `main.ts` 一次性查询填充，UI 函数仅依赖接口而非具体 id，降低与 DOM 结构（index.html）的耦合。
- **有限状态机（FSM）**：`gamestate.ts` 以字符串字面量联合类型 `Phase`（`menu`/`racing`/`finished`/`paused`）建模对局阶段，`nextPhase` / `togglePause` 为显式状态转移函数，禁止非法迁移（如 `paused` 态下 `nextPhase` 返回自身）。
- **防御性编程**：`save.ts` 对 `Number.isFinite` 校验存档数据，`screens.ts` 以 `finishShown` 标志保证结算面板每局只填充一次，`joystick.ts` 设 `DEADZONE` 死区并仅处理 `pointerType === 'touch'`，不影响键盘/鼠标操作。
- **抽象层级**：`save.ts`（持久化）与 `format.ts`（展示格式）为独立工具层，被 `hud.ts` / `screens.ts` 复用；`joystick.ts` 自封装输入归一化逻辑（`offsetToInput`），对外暴露 `getInput()` 与 `isActive()` 接口。

## Flow

1. **启动**：`main.ts` 通过 `$()` 查询 DOM 组装 `HudElements`/`ScreenElements`；实例化 `JoystickUI` 并 `attach(canvas)`；从 `save.ts` 的 `loadBestTime(trackDef.id)` 读取最佳时间；初始阶段为 `PHASE_MENU`。
2. **主循环（每帧）**：`main.ts` 的 `frame()` 在 `PHASE_RACING` 下推进物理模拟（`updateCar`/`updateDrift`/`updateCollisions`）与 `race.raceTime`；随后渲染画面并调用 `updateHud(...)` 刷新 HUD 文本——速度经 `formatSpeed` 换算为 km/h、圈数经 `lapFromZ` + `formatLap` 显示、计时经 `formatTime` 显示。
3. **阶段切换**：键盘事件（Escape → `togglePause`；其他键 → `nextPhase(phase, lapFromZ(...), totalLaps)`）驱动 FSM，`main.ts` 的 `applyPhase()` 调用 `applyPhaseToScreens(...)` 切换屏幕显隐：进入 `PHASE_FINISHED` 时触发 `fillFinishPanel` 写入存档并展示结算（总用时/平均速度/纪录判定/漂移得分/各圈用时）；进入 `PHASE_MENU` 时 `resetRace()` 重建对局。
4. **触屏输入**：`JoystickUI` 在 `pointerdown`（仅 touch）时显示摇杆底盘并捕获指针，`pointermove` 经 `offsetToInput` 将位移归一化为 `{ steer, throttle, brake }`；`main.ts` 每帧读取 `joystick.getInput()` 作为 P1 输入（优先级高于键盘）。
5. **存档**：`PHASE_FINISHED` 时 `saveBestTime` / `saveBestDriftScore` 仅在刷新纪录时写入并返回 `true`，`screens.ts` 据此显示 `NEW RECORD!` / `NEW DRIFT RECORD!`；`main.ts` 在阶段切换与 `resetRace()` 时重新 `loadBestTime` 刷新 HUD 的 `BEST` 显示。

## Integration

- Consumed by:
  - `src/main.ts`：主循环与流程控制——使用 `JoystickUI`、`updateHud`/`HudElements`、`applyPhaseToScreens`/`ScreenElements`、`lapFromZ`、`loadBestTime`、`PHASE_*`/`nextPhase`/`togglePause`/`Phase`
  - `src/game/state.ts`：引用 `gamestate` 的 `PHASE_MENU` 与 `Phase` 类型作为初始对局阶段
  - `src/ui/hud.ts` → 内部消费 `format.ts`（`formatLap`/`formatSpeed`/`formatTime`/`lapFromZ`）
  - `src/ui/screens.ts` → 内部消费 `format.ts` 与 `save.ts`、`gamestate.ts`
- Depends on:
  - `src/physics/car.ts`：`CarConfig` 类型（最大速度，供 km/h 换算）
  - `src/game/state.ts`：`RaceState` 类型（车速、位置、计时、圈速、漂移状态、双人模式数据）
  - `src/main.ts` 的 index.html 对应 DOM 结构（`hud-*`、`start-screen`、`finish-*`、`pause-screen` 等 id 与 `joystick-base`/`joystick-knob` 样式类）
  - 浏览器 Web API：`localStorage`（`save.ts`，不可用时降级为 `null`）、`PointerEvent`/`setPointerCapture`（`joystick.ts`，仅 touch 生效）

## Files

| File | Responsibility |
|------|----------------|
| `hud.ts` | 定义 `HudElements`（HUD DOM 引用集合）与 `updateHud`——每帧刷新 P1/P2 速度、圈数、计时、最佳时间与漂移指示 |
| `screens.ts` | 定义 `ScreenElements` 与 `applyPhaseToScreens`（阶段→屏幕显隐）、`fillFinishPanel`（结算面板单次填充：纪录判定、平均速度、漂移得分、各圈用时） |
| `format.ts` | 纯格式化函数：`formatSpeed`（速度→km/h）、`formatTime`（秒→M:SS.mmm）、`formatLap`（圈数显示）、`lapFromZ`（行进距离→圈数）、`formatLapTimes`（累计时间→单圈用时） |
| `save.ts` | localStorage 持久化：`loadBestTime`/`saveBestTime`、`loadBestDriftScore`/`saveBestDriftScore`，按赛道 ID 分 key，`storage` 参数可注入、不可用时安全降级 |
| `gamestate.ts` | 对局阶段 FSM：`Phase` 联合类型、`PHASE_MENU`/`PHASE_RACING`/`PHASE_FINISHED`/`PHASE_PAUSED` 常量、`nextPhase`/`togglePause` 状态转移纯函数 |
| `joystick.ts` | 触屏虚拟摇杆：`JoystickUI` 类（DOM 底盘+圆钮、pointer 事件捕获）、`JoystickInput` 接口、`offsetToInput`（位移→steer/throttle/brake 归一化，含死区） |
