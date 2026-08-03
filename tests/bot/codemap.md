# tests/bot/

## Responsibility

黑盒集成验收脚本目录。提供 `npm run bot` 命令执行的无头跑圈脚本，通过 `ai/simulate.ts` 驱动 bot 在默认赛道上完成 3 圈，输出 JSON 报告与通过/失败判定，作为里程碑门禁的验收层。

## Design

- **极简入口**：单一 `run-bot.ts` 脚本，不依赖 Vitest，直接由 `tsx` 在 Node.js 环境执行。
- **复用核心模块**：调用 `src/engine/track`、`src/physics/car`、`src/ai/bot`、`src/ai/simulate` 的公开 API，与游戏生产逻辑共享同一物理与决策实现。
- **确定性默认配置**：使用 `createDefaultTrack()`、`createCarConfig()`、`createBotConfig()` 的默认参数，确保跑圈结果可复现。
- **退出码契约**：`finished && violations <= MAX_VIOLATIONS` 时退出码为 0，否则为 1，便于 CI/脚本集成。

## Flow

1. `npm run bot` 调用 `tsx tests/bot/run-bot.ts`。
2. 脚本构造默认赛道、车辆配置与 bot 配置。
3. 调用 `simulateLaps(track, carConfig, botConfig, { laps: 3 })`。
4. 将结果转换为 JSON 报告（圈速、总时间、平均速度、违规数、出界时间）。
5. 打印报告并输出 `✅ bot 跑圈通过` 或 `❌ bot 跑圈失败`，以退出码 0/1 结束。

## Integration

- **Depends on**：
  - `src/engine/track`：`createDefaultTrack`
  - `src/physics/car`：`createCarConfig`
  - `src/ai/bot`：`createBotConfig`
  - `src/ai/simulate`：`simulateLaps`
- **被调用方**：
  - `package.json` 的 `bot` 脚本
  - `AGENTS.md` 与 `docs/superpowers/plans/` 中的验证流程定义

## Files

| File | Responsibility |
|------|----------------|
| `run-bot.ts` | bot 跑圈验收脚本：构造默认配置、调用 `simulateLaps`、输出 JSON 报告与进程退出码 |
| `codemap.md` | 本目录索引（本文件） |
