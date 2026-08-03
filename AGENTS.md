# AI-Racing-Games 项目规范

OutRun 伪 3D 复刻项目 —— 用于测试 OpenCode Win11 Desktop IDE v1.18.11 长程编程能力极限（主力模型：DeepSeek V4 Flash）。

## 技术栈（已定，不要随意更换）

- TypeScript + Vite（构建与开发服务器）
- Canvas 2D 伪 3D 渲染（不使用 Three.js / WebGL）
- Vitest 单测 + bot 自动跑圈校验（模拟输入、断言圈速与碰撞）

## 验证优先级（必须按此顺序）

1. `npm run typecheck`（tsc --noEmit）
2. `npm run lint`（eslint）
3. `npm test`（vitest run）
4. `npm run build`（vite build）

> 约定：每完成一个里程碑，至少跑通 typecheck + test 再提交。

## 项目结构约定

```
src/
  engine/       # 游戏核心（伪3D投影、路面分段、精灵缩放）
  physics/      # 车辆运动学（速度、加速度、转向、漂移）
  track/        # 赛道数据（分段路点、曲线、障碍物）
  ai/           # bot 控制器（跑圈、避障）
  ui/           # HUD、菜单
  audio/        # 音效（可选，无资源时用 WebAudio 合成）
tests/
  unit/         # Vitest 单测
  bot/          # bot 自动跑圈校验脚本
```

## 里程碑（分阶段推进，每阶段可运行可验证）

1. **M1 渲染骨架**：Canvas 初始化、伪 3D 路面投影（分段条带）、简单直道滚动、60fps 循环
2. **M2 车辆物理**：速度/加速度/转向模型、路缘限制、简单碰撞（出界即减速）
3. **M3 赛道系统**：弯道生成（分段路点）、视差远山/天空、赛道数据可配置
4. **M4 bot 跑圈**：bot 沿路点自动行驶，自动跑圈计时；`npm run bot` 输出圈速与违规报告
5. **M5 打磨**：HUD（速度/计时）、音效合成、启动画面、胜利结算、发布构建

每个里程碑结束验收标准：typecheck + test 全绿 + `npm run bot` 有稳定输出。

## Skills 使用规则（长程测试约束）

- **superpowers（已安装，已裁剪）**：允许 `test-driven-development`、`systematic-debugging`、`verification-before-completion`、`writing-plans`、`executing-plans`；已禁用 `brainstorming`、`subagent-driven-development`、`using-git-worktrees`、`writing-skills`（见 `.opencode/opencode.json` 的 permission.skill）。开发时按需调用，不要一次性全量加载。
- **grill-me**：仅在**计划阶段**（M1 开工前 / 新里程碑设计时）使用一次，用来锁定需求与取舍；执行阶段不要用。
- **oh-my-opencode-slim（已安装全局）**：提供 orchestrator/oracle/explorer/fixer 等编排 agents；已知 issue #894 会在启动日志打印 `disabledTools.filter is not a function` 错误，但功能正常（默认 agent 会变成 orchestrator）。若不需要编排，可在全局配置移除该插件。
- 其余 Skills（antfu 全家桶、stop-slop 等）按任务需要调用。

## 测试命令（对应 opencode 的 /test /lint /typecheck）

- `/test`：`npm test`（vitest run），失败即修复
- `/lint`：`npm run lint`（eslint）
- `/typecheck`：`npm run typecheck`（tsc --noEmit）

## 输出与语言

- 所有回复、注释、文档使用中文（代码、命令、标识符保留英文）。
- 每完成一个里程碑，用 2-4 句总结：做了什么、验证结果、下一步。

## Repository Map

完整仓库代码地图见根目录 `codemap.md`，各子目录地图见对应 `codemap.md`。

开工前应先阅读：
- `codemap.md`：项目整体架构、技术栈、入口点、主循环数据流、验证优先级
- `src/codemap.md`：源代码目录总览与分层依赖
- 各子目录 `codemap.md`：模块职责、设计模式、数据流、集成点与文件清单
