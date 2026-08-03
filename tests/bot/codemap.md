# tests/bot/

## Responsibility

黑盒集成验收脚本目录。提供 `npm run bot` 命令执行的无头跑圈脚本，通过 `src/ai/simulate.ts` 驱动 bot 在全部内置赛道（`TRACK_DEFS` 9 条，含 canyon/alpine 夜间赛道）上完成全赛道矩阵跑圈，输出逐赛道 JSON 报告与整体通过/失败判定，作为里程碑门禁的验收层。

## Design

- **极简入口**：单一 `run-bot.ts` 脚本，不依赖 Vitest，直接由 `tsx` 在 Node.js 环境执行。
- **复用核心模块**：调用 `src/engine/tracks`（`TRACK_DEFS` / `createTrackFromDef`）、`src/physics/car`（`createCarConfig`）、`src/ai/bot`（`createBotConfig`）、`src/ai/simulate`（`simulateLaps`）的公开 API，与游戏生产逻辑共享同一物理与决策实现。
- **全赛道矩阵回归**：遍历 `TRACK_DEFS`（9 条），每条赛道按自身 `def.laps`（2 或 3 圈）跑圈，覆盖经典/高速/S 弯/环岛/峡谷/沙漠/森林/海岸/山岳全部赛道；经典赛道（classic，第一条）作为基线对照（3 圈 ≈ 76.017s / 0 违规）。
- **逐赛道 JSON 输出**：每条赛道一行 `JSON.stringify`（`TrackReport`），字段含 `trackId`、`name`、`laps`、`finished`、`lapTimesSec`、`totalTimeSec`、`avgSpeed`、`violations`、`offRoadTimeSec`（时间统一 `toFixed(3)`、平均速度 `toFixed(1)`）。
- **退出码契约**：所有赛道均满足 `finished === true && violations <= MAX_VIOLATIONS`（`MAX_VIOLATIONS = 3`）时退出码为 0，否则为 1，便于 CI/脚本集成。

## Flow

1. `npm run bot` 调用 `tsx tests/bot/run-bot.ts`（package.json 的 `bot` 脚本）。
2. 脚本遍历 `TRACK_DEFS`，对每条赛道定义构造默认车辆配置与 bot 配置。
3. 逐条调用 `simulateLaps(createTrackFromDef(def), createCarConfig(), createBotConfig(), { laps: def.laps })`。
4. 将每条结果转换为 `TrackReport`（圈速、总时间、平均速度、违规数、出界时间），逐行打印 JSON。
5. 全部赛道通过时打印 `✅ bot 跑圈通过（N 条赛道全部完成，0 违规超标）` 并以退出码 0 结束；任一赛道未完成或违规超标则打印 `❌ bot 跑圈失败` 以退出码 1 结束。

## Integration

- **Depends on**：
  - `src/engine/tracks`：`TRACK_DEFS`、`createTrackFromDef`
  - `src/physics/car`：`createCarConfig`
  - `src/ai/bot`：`createBotConfig`
  - `src/ai/simulate`：`simulateLaps`
- **被调用方**：
  - `package.json` 的 `bot` 脚本
  - `AGENTS.md` 与 `docs/superpowers/plans/` 中的验证流程定义

## Files

| File         | Responsibility                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| `run-bot.ts` | bot 全赛道跑圈验收脚本：遍历 `TRACK_DEFS` 逐条调用 `simulateLaps`、逐行输出 JSON 报告、按退出码 0/1 判定整体通过/失败 |
| `codemap.md` | 本目录索引（本文件）                                                                                                  |
