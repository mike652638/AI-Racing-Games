# tests/helpers/

## Responsibility

测试辅助共享层。存放从 `src/` 迁移的**仅测试使用**导出（死代码清理约定：src 内无生产调用方即迁出，生产路径走各自的正式实现），供 `tests/unit/` 下多个测试文件共享，避免重复实现与测试间复制粘贴。

- `track.ts`：赛道构造工具。`createDefaultTrack`（默认环形赛道，直道+左右弯交替、总曲率回环为 0，460 段约 15 秒/圈）与 `createStraightTrack(count)`（等距直道）。原位于 `src/engine/track.ts`，因 src 内无生产调用方（生产走 `tracks.ts` 的 `TRACK_DEFS` / `createTrackFromDef`）迁移至此；实现与原版逐字节一致。
- `sprites.ts`：景物环形窗口过滤（线性版）。`spritesInRange` 返回 `[cameraZ, cameraZ+viewDistance)` 内绝对 z 化的可见景物。原位于 `src/engine/sprites.ts`，因生产路径已改用 `spritesInRangeIndexed` 空间索引查询而迁移；实现（含私有 `windowedSprite`）与原版逐字节一致，作为 `sprites.test.ts` 验证索引查询版的线性基准对照。

## Design

- **迁移约定**：仅当 `src/` 内无生产调用方时才迁出（`createDefaultTrack`/`createStraightTrack` → 生产用 `TRACK_DEFS`/`createTrackFromDef`；`spritesInRange` → 生产用 `spritesInRangeIndexed`）；实现保留原版逐字节一致，仅移动文件不改变行为。
- **共享而非复制**：多个测试文件（`track.test.ts`、`tracks.test.ts`、`player-car.test.ts`、`sprites.test.ts` 等）统一从 `../helpers/*` 导入，保证「测试用的默认赛道/线性基准」只有一份定义。
- **零运行时依赖**：不参与生产构建（`src/` 之外），仅被 vitest 单测引用；依赖方向单向 `tests/helpers → src/engine`（复用 `createTrack`/`createSmoothTrack`/`DEFAULT_CONTROL_POINTS`/`SEGMENT_LENGTH` 与 `Sprite` 类型），不反向。
- **语义契约**：`createDefaultTrack` 控制点化后仍闭环可跑（`track.test.ts` 断言），`spritesInRange` 与 `spritesInRangeIndexed` 输出一致（`sprites.test.ts` 断言），维持与生产实现的等价性。

## Flow

1. 测试文件从 `../helpers/track`、`../helpers/sprites` 具名导入所需辅助函数。
2. `track.ts` 的 `createStraightTrack` 用于构造可控直线赛道（如 `player-car.test.ts` 的 Renderer 集成）；`createDefaultTrack` 用于默认环形赛道基线（`track.test.ts`、`tracks.test.ts`）。
3. `sprites.ts` 的 `spritesInRange` 作为线性基准版，与 `spritesInRangeIndexed` 对同一随机景物序列查询结果逐一比对（`sprites.test.ts`）。
4. 迁移源模块的测试（`track.test.ts`、`sprites.test.ts`）在 src 层 codemap 中标注「自 tests/helpers 导入」，保证模块契约可追溯。

## Integration

- **Depends on**：
  - `src/engine/track`：`createTrack`（`createStraightTrack` 基底）、`createSmoothTrack` 与 `DEFAULT_CONTROL_POINTS`（`createDefaultTrack` 基底）、`SEGMENT_LENGTH`（`spritesInRange` 总长计算）
  - `src/engine/sprites`：`Sprite` 类型（仅类型引用）
- **被调用方**：`tests/unit/track.test.ts`、`tests/unit/tracks.test.ts`、`tests/unit/player-car.test.ts`、`tests/unit/sprites.test.ts` 等单测文件。
- **与 `tests/__mocks__/` 的区别**：`helpers/` 提供真实实现的测试友好版本（行为与 src 一致），`__mocks__/` 提供替身（记录调用、不渲染）。

## Files

| File         | Responsibility                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `track.ts`   | 赛道构造工具：`createDefaultTrack`（默认环形赛道）+ `createStraightTrack(count)`（直线赛道），自 src/engine/track 迁移的仅测试使用导出 |
| `sprites.ts` | 景物环形窗口过滤线性基准版：`spritesInRange`（含私有 `windowedSprite`），自 src/engine/sprites 迁移，供索引查询版一致性对照            |
| `codemap.md` | 本目录索引（本文件）                                                                                                                   |
