# Task 8 实施报告：分屏降级策略（PerformanceConfig）

## 完成状态：DONE

## 修改的文件

### `src/game/game-loop.ts`
- 新增导出接口 `PerformanceConfig`（drawDistance / skipSmoke / skipBoostParticles / skipRain，含中文文档注释）
- 新增导出纯函数 `resolvePerformanceConfig(splitMode: boolean, perfMode: boolean): PerformanceConfig`，返回三个模块级共享常量档位（PERF_HIGH 120 段全渲染 / PERF_MID 分屏 80 段全跳过 / PERF_LOW 性能 60 段全跳过），仿 `_viewCache` 复用模式零每帧分配
- GameLoop 新增私有字段 `private readonly _perfMode: boolean`，constructor 中复用现有 `params` 变量读取 `?perf` 查询参数
- GameLoop 新增公开方法 `getPerformanceConfig(): PerformanceConfig`，委托 `resolvePerformanceConfig(this.splitMode, this._perfMode)`

### `tests/unit/game-loop.test.ts`
- import 追加 `resolvePerformanceConfig`
- 追加 describe 块「PerformanceConfig（Task 8）」共 4 个用例：默认 120 全渲染、分屏 80 全跳过、性能 60 全跳过、分屏+性能共存时性能档优先（60）

## 测试结果
- `npm run typecheck`：通过
- `npm run lint`：通过
- `npm test`：435 个测试全部通过（game-loop.test.ts 由 20 → 24 个）

## 与计划/任务的偏离说明

1. **测试策略（关键偏离）**：计划 Step 1 设想 `createMockGameLoop({ splitMode })` 直接实例化/模拟 GameLoop 调用 `getPerformanceConfig`；但现有测试从不构造 GameLoop（构造函数依赖真实 DOM `document.getElementById`、`window.location` 且启动 `requestAnimationFrame`，既有 30+ 测试文件均无 mock 模式）。因此按任务规格建议的备选方案，把解析逻辑提取为**导出的纯函数** `resolvePerformanceConfig`，`getPerformanceConfig` 方法委托它；测试直接覆盖纯函数（两个布尔参数即方法全部输入，语义等价），沿用项目「纯函数导出 + 单测」既有模式（同 `updatePlayerFrame` / `viewFor` 等）。

2. **优先级语义**：计划示例代码为 `isSplit ? 80 : isPerf ? 60 : 120`（分屏优先、性能档 skip* 全 false）；任务规格明确要求性能模式 `drawDistance=60` 且 skip* 全 true（与分屏同为全跳过）。按任务规格实现为**性能档优先**（分屏+性能共存时取最激进 60 档），并显式注释与测试覆盖。

3. **`_perfMode` 解析位置**：任务描述同时称其为「私有字段」与「模块级常量、应独立解析」；字段初始化器若直接访问 `window.location` 会随模块 import 求值，破坏现有测试环境（vitest node 环境无 window）。采用 constructor 内复用现有 `params`（`params.has('perf')`）赋值，保持类字段语义且不触碰测试 import 路径。

4. **测试风格**：计划示例用 `it(...)`，按全局约束改用项目风格的 `test(...)`。

## 下一步
Task 9（Renderer 支持降级选项）可直接消费 `PerformanceConfig` 接口与 `getPerformanceConfig()` 方法。
