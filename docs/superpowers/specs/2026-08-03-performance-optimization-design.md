# 性能优化设计文档

> **日期：** 2026-08-03
> **状态：** 已批准
> **目标：** 提高帧率、降低 CPU/GPU 占用、减少内存分配

## 一、背景与目标

### 1.1 当前性能状况

项目已完成的性能优化集中在"预计算 + 缓存"模式：

| 优化项 | 实现位置 | 效果 |
|--------|----------|------|
| 远山离屏预渲染缓存 | renderer.ts:67-95 | 两层各 1258 点路径改为 drawImage 平移复用 |
| 夜晚模式深色远山独立缓存 | renderer.ts:121,143 | 避免每帧重建 |
| 雨丝离屏缓存 | renderer.ts:128-129,184-202 | 80 条雨丝预绘制，帧内双幅 drawImage 平铺 |
| 曲率前缀和 Float64Array | renderer.ts:123-125 | O(1) 曲率查询 |
| 景物段索引 spriteIndex | sprites.ts:74-89 | O(候选段数) 查询替代全量线性扫描 |
| DRAW_DISTANCE=120 | renderer.ts:316 | 限制可视分段数 |
| TrackContext 预计算 | track-context.ts:38-52 | 创建时一次完成全部预计算，运行时零重建 |
| RAF 30Hz 调度 | music.ts:59,67,85 | 替代 setInterval |
| dt 上限 0.05s | game-loop.ts:778 | 防后台跳帧 |

### 1.2 待解决性能瓶颈

| 优先级 | 问题 | 当前开销 | 影响 |
|--------|------|----------|------|
| 高 | 道路分段每帧重建路径 | renderWithOpts 每帧对 DRAW_DISTANCE=120 段做 ~360 次 drawQuad | 唯一未走离屏缓存的大头开销 |
| 中 | 每帧对象分配 | spritesInRangeIndexed 每帧创建新数组+{...sprite,z}副本；viewFor 每帧新建对象；drawSmoke/drawBoostParticles 每帧用模板字符串重建 fillStyle | GC 压力 |
| 中 | 分屏渲染成本翻倍 | renderRegion 两次完整渲染，无降级策略 | 分屏模式帧率下降 |

### 1.3 优化目标

1. **提高帧率**：目标 60fps 稳定（当前可能在复杂场景下掉帧）
2. **降低 CPU/GPU 占用**：减少每帧绘制调用次数和对象分配
3. **减少内存分配**：消除每帧临时对象创建，降低 GC 压力

## 二、设计方案

### Task A：道路分段离屏缓存（高收益中风险）

#### A.1 问题分析

当前 `renderWithOpts`（renderer.ts:316-352）每帧对 DRAW_DISTANCE=120 段做 ~360 次 `drawQuad`（beginPath+4×lineTo+fill）。道路是唯一未走离屏缓存的大头开销（山形/雨丝都缓存了，路面没有）。

#### A.2 设计方案

**核心思路：** 为赛道预计算道路条带离屏 Canvas（按弯道曲率分段），帧内 drawImage 平移复用，弯道变化时动态重建受影响段。

**具体实现：**

1. **道路条带预计算**
   - 在 `TrackContext` 创建时，根据赛道曲率变化将道路分为若干"曲率段"
   - 每个曲率段预渲染到独立的离屏 Canvas（包含路面、车道线、路肩）
   - 存储为 `Map<number, { canvas: OffscreenCanvas; width: number; height: number }>`

2. **曲率段划分规则**
   - 相邻段曲率差 < 阈值（如 0.001）合并为同一段
   - 每段长度限制在 20-50 个 SEGMENT_LENGTH 之间
   - 直道段（曲率 ≈ 0）可合并为较长段

3. **帧内渲染流程**
   - 计算相机前方可见范围对应的曲率段
   - 对每个可见段，使用 `drawImage` 平移复用预渲染的离屏 Canvas
   - 仅在段边界处做必要的裁剪和拼接

4. **动态重建机制**
   - 赛道切换时重建所有曲率段
   - 分屏模式下双世界各持一份独立缓存

#### A.3 接口设计

```typescript
// 新增类型
interface RoadStrip {
  canvas: OffscreenCanvas;
  startZ: number;
  endZ: number;
  curveAvg: number;
}

// TrackContext 新增字段
interface TrackContext {
  // ... 现有字段
  roadStrips: RoadStrip[];
}

// Renderer 新增方法
class Renderer {
  // ... 现有方法
  private renderRoadStrips(
    ctx: CanvasRenderingContext2D,
    strips: RoadStrip[],
    cameraZ: number,
    view: RenderView
  ): void;
}
```

#### A.4 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 内存占用增加 | 限制离屏 Canvas 总大小（如 16MB），超过时合并小段 |
| 曲率段边界接缝 | 预渲染时预留 1px 重叠区域 |
| 首次加载延迟 | 异步预渲染，加载画面期间完成 |

#### A.5 预期收益

- 绘制调用次数减少 ~70%（从 ~360 次 drawQuad 降至 ~10 次 drawImage）
- CPU 占用降低 ~30-40%
- 帧率提升 ~20-30%

---

### Task B：对象池 + 内存复用（中收益低风险）

#### B.1 问题分析

当前每帧存在多处临时对象分配：

1. `spritesInRangeIndexed` 每帧创建新数组 + `{...sprite, z}` 副本
2. `viewFor` 每帧新建 `RenderView` 对象
3. `drawSmoke`/`drawBoostParticles` 每帧用模板字符串重建 `fillStyle`

#### B.2 设计方案

**核心思路：** 引入对象池 + 预分配策略，消除每帧临时对象创建。

**具体实现：**

1. **spritesInRangeIndexed 复用数组**
   ```typescript
   // 新增复用数组
   private _visibleSprites: SpriteWithZ[] = [];
   
   function spritesInRangeIndexed(
     spriteIndex: Map<number, SpriteEntry[]>,
     cameraZ: number,
     lapLength: number,
     out: SpriteWithZ[] // 传入复用数组
   ): number {
     out.length = 0; // 清空但保留内存
     // ... 填充逻辑
     return out.length;
   }
   ```

2. **viewFor 返回缓存对象**
   ```typescript
   // GameLoop 新增缓存
   private _viewCache: RenderView = {
     track: null!,
     curvePrefixSum: null!,
     spriteIndex: null!,
     traffic: null!,
     night: false,
     boostParticles: undefined
   };
   
   function viewFor(ctx: TrackContext, boostParticles?: BoostParticle[]): RenderView {
     // 复用缓存对象，避免每帧新建
     _viewCache.track = ctx;
     _viewCache.curvePrefixSum = ctx.curvePrefixSum;
     _viewCache.spriteIndex = ctx.spriteIndex;
     _viewCache.traffic = ctx.traffic;
     _viewCache.night = ctx.def.timeOfDay === 'night';
     _viewCache.boostParticles = boostParticles;
     return _viewCache;
   }
   ```

3. **预分配 fillStyle 字符串**
   ```typescript
   // Renderer 新增缓存
   private _fillStyleCache = new Map<string, string>();
   
   private getFillStyle(r: number, g: number, b: number, a: number): string {
     const key = `${r},${g},${b},${a}`;
     let style = this._fillStyleCache.get(key);
     if (!style) {
       style = `rgba(${r},${g},${b},${a})`;
       this._fillStyleCache.set(key, style);
     }
     return style;
   }
   ```

#### B.3 接口设计

无新增接口，仅修改现有函数签名和内部实现。

#### B.4 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 复用数组被意外修改 | 函数内仅读取，不修改内容 |
| 缓存对象被外部持有 | 返回类型声明为 `Readonly<RenderView>` |
| fillStyle 缓存内存泄漏 | 限制缓存大小（如 1024 条），超过时清空重建 |

#### B.5 预期收益

- 每帧对象分配减少 ~80%
- GC 暂停频率降低 ~50%
- 内存占用稳定，无持续增长

---

### Task C：分屏降级策略（中收益中风险）

#### C.1 问题分析

当前 `renderRegion` 两次完整渲染（含两遍道路路径重建），无降级策略。分屏模式下帧率可能下降 40-50%。

#### C.2 设计方案

**核心思路：** 分屏时降低渲染质量以维持帧率，提供 `?perf=1` 查询参数用于性能测试。

**具体实现：**

1. **分屏模式自动降级**
   ```typescript
   // GameLoop 新增配置
   private _perfMode = new URLSearchParams(window.location.search).has('perf');
   private _splitMode = false;
   
   // 渲染时根据模式调整参数
   private getDrawDistance(): number {
     if (this._splitMode) return 80; // 分屏降至 80
     if (this._perfMode) return 60;  // 性能模式降至 60
     return 120; // 默认
   }
   ```

2. **可选跳过非关键渲染层**
   ```typescript
   // Renderer 新增选项
   interface RenderOptions {
     skipSmoke?: boolean;
     skipBoostParticles?: boolean;
     skipRain?: boolean;
   }
   
   // 分屏时跳过非关键层
   const opts: RenderOptions = this._splitMode ? {
     skipSmoke: true,
     skipBoostParticles: true,
     skipRain: true
   } : {};
   ```

3. **性能模式查询参数**
   - `?perf=1`：启用性能模式，进一步降低 DRAW_DISTANCE
   - `?split=1&perf=1`：分屏 + 性能模式，最大化帧率

#### C.3 接口设计

```typescript
// GameLoop 配置
interface PerformanceConfig {
  drawDistance: number;
  skipSmoke: boolean;
  skipBoostParticles: boolean;
  skipRain: boolean;
}

// 新增方法
class GameLoop {
  private getPerformanceConfig(): PerformanceConfig;
}
```

#### C.4 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 降级后视觉效果差 | 仅在分屏/性能模式下启用，单屏默认不降级 |
| 配置复杂度增加 | 提供合理的默认值，用户无需手动配置 |
| 测试覆盖不足 | 新增 renderer-state 测试用例验证降级逻辑 |

#### C.5 预期收益

- 分屏模式帧率提升 ~30-40%
- 性能模式下帧率可达 60fps 稳定
- 用户可根据硬件选择合适模式

## 三、实施计划

### 3.1 依赖关系

```
Task A (道路离屏缓存)
    ↓
Task B (对象池复用) ← 可并行
    ↓
Task C (分屏降级) ← 依赖 Task A 完成
```

### 3.2 实施顺序

1. **Phase 1：Task A（道路离屏缓存）**
   - 预计工作量：3-4 小时
   - 验证：typecheck + test + browser 冒烟

2. **Phase 2：Task B（对象池复用）**
   - 预计工作量：2-3 小时
   - 验证：typecheck + test + browser 冒烟

3. **Phase 3：Task C（分屏降级）**
   - 预计工作量：1-2 小时
   - 验证：typecheck + test + browser 冒烟 + 分屏模式测试

### 3.3 验证标准

每个 Task 完成后必须满足：

1. `npm run typecheck` 通过
2. `npm run lint` 通过
3. `npm test` 全绿（416 个用例）
4. `npm run bot` 全赛道矩阵回归通过（9 赛道 × 3 圈）
5. `npm run build` 成功
6. 浏览器冒烟测试通过（单屏 + 分屏 + 性能模式）

### 3.4 回滚策略

如果优化导致回归：

1. 立即回滚到上一个稳定版本
2. 分析问题原因
3. 修复后重新实施

## 四、性能验证

### 4.1 基准测试

在优化前后分别测量：

1. **帧率**：使用 `requestAnimationFrame` 时间戳计算
2. **CPU 占用**：浏览器 DevTools Performance 面板
3. **内存占用**：浏览器 DevTools Memory 面板
4. **绘制调用次数**：Canvas mock 计数（现有 renderer-state.test.ts）

### 4.2 测试场景

1. **单屏默认模式**：9 条赛道各跑 3 圈
2. **分屏模式**：`?split=1`，双人各跑 3 圈
3. **性能模式**：`?perf=1`，跑 3 圈
4. **极端场景**：雨天 + 夜晚 + 挑战模式

### 4.3 预期结果

| 指标 | 优化前 | 优化后（预期） |
|------|--------|----------------|
| 单屏帧率 | 45-60 fps | 60 fps 稳定 |
| 分屏帧率 | 25-35 fps | 45-55 fps |
| CPU 占用 | 60-80% | 30-50% |
| 每帧对象分配 | ~20 个 | ~5 个 |

## 五、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 离屏缓存内存溢出 | 中 | 高 | 限制总大小，提供降级策略 |
| 曲率段边界接缝 | 低 | 中 | 预渲染时预留重叠区域 |
| 对象池并发问题 | 低 | 中 | 单线程执行，无并发风险 |
| 降级模式视觉效果差 | 中 | 低 | 仅在特定模式下启用，文档说明 |

## 六、总结

本设计通过三个互补的优化策略，系统性解决当前性能瓶颈：

1. **Task A** 解决最大开销（道路渲染），预期收益最高
2. **Task B** 减少 GC 压力，提升稳定性
3. **Task C** 提供灵活的降级选项，适应不同硬件

三个 Task 可并行实施，总工作量约 6-9 小时。完成后预期帧率提升 30-50%，CPU 占用降低 30-40%，为后续功能扩展奠定坚实基础。
