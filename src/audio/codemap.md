# src/audio/

## Responsibility

程序化音频合成模块（无外部音频资源）：为游戏提供引擎音效（`engine.ts`）与背景音乐（`music.ts`）两路 WebAudio 输出。引擎音效将车辆速度比映射为引擎声的音高/音量/滤波参数；背景音乐以 16 步循环序列调度 chiptune 风格的合成音色。两个子模块相互独立、互不依赖，仅共享由外部注入的同一个 `AudioContext` 实例。纯参数计算与音符换算逻辑被抽取为可单测的纯函数，合成器类只负责 WebAudio 副作用。

## Design

- **依赖注入**：`AudioContext` 由 `main.ts` 创建后作为构造参数注入 `EngineSound` 与 `MusicPlayer`，两者共享同一上下文，避免多 context 的资源开销，也便于外部统一管理用户手势后的 `resume()`。
- **纯函数与副作用分离**：`computeEngineParams(speedRatio)`（速度比 → 频率/增益）、`noteToFreq(name)`（音符名 → 频率）、`tickMsForBpm(bpm)`（BPM → 8 分音符时长）均为纯函数，无 WebAudio 依赖，可直接单测；类仅封装振荡器/增益/滤波等副作用。
- **合成音色**：引擎声采用双锯齿波（detune 0/7）+ 低通滤波（800Hz）叠加模拟引擎轰鸣；音乐采用方波低音 + 锯齿波旋律 + 白噪声踩镲（Am-F-C-G 和声进行，120 BPM）。
- **平滑过渡**：引擎声参数更新用 `setTargetAtTime` 指数逼近（时间常数 0.05s），避免参数跳变产生爆音。
- **RAF 驱动调度**：`MusicPlayer` 用 `requestAnimationFrame` 以 30Hz 固定步长驱动，替代 `setInterval`（更抗节流）；`dt` 上限 0.1s，防止页面后台恢复时突发调度。
- **前瞻调度（lookahead scheduling）**：每次调度把音频时钟未来 0.2s 内的音符一次性排入 `ctx.currentTime` 时间轴，保证节奏精度，不受 RAF 抖动影响。
- **延迟初始化**：音频在用户首次按键交互时才创建（满足浏览器自动播放策略），由 `main.ts` 惰性构建。

## Flow

1. `main.ts` 捕获首次键盘事件 → 创建 `AudioContext` → `new EngineSound(ctx)` + `start()`，`new MusicPlayer(ctx)` + `start()`（两路共享同一 ctx）。
2. 主循环每帧调用 `engineSound.setSpeedRatio(race.carState.speed / carConfig.maxSpeed)`：速度比经 `computeEngineParams` 纯函数换算为频率/增益，再用 `setTargetAtTime` 平滑更新双振荡器频率、滤波截止频率与主增益。
3. `MusicPlayer.start()` 记录起始时间并启动 RAF 循环；`tick` 回调按 30Hz 固定步长累积时间，累积满一个步长即调用 `schedule()`。
4. `schedule()` 执行前瞻调度：持续把 `nextTime`（BPM 推导的 8 分音符时长递增）之前 0.2s 内的步进交给 `playStep(step, when)`，步进索引 0-15 循环。
5. `playStep` 按步进相位触发低音（每 4 步）、旋律（每 2 步）、踩镲（每 4 步），每个音色通过独立 osc/gain 节点在指定时间 `when` 起止并指数衰减，避免残留。
6. 调试钩子 `window.__gameDebug.audioState / musicState` 暴露运行时状态，供 bot 自动化验证读取。

## Integration

- Consumed by:
  - `src/main.ts`：创建 `AudioContext`，实例化 `EngineSound`/`MusicPlayer` 并注入；每帧以 `speed / maxSpeed` 驱动 `setSpeedRatio`；`window.__gameDebug` 暴露 `audioState`/`musicState` 供自动化验证
  - `tests/unit/engine-audio.test.ts`：单测 `computeEngineParams`、`MIN_FREQUENCY`、`MAX_FREQUENCY`
  - `tests/unit/music.test.ts`：单测 `noteToFreq`、`tickMsForBpm`、`BASS_LINE`、`MELODY_LINE`
- Depends on:
  - `Web Audio API`（`AudioContext`/`OscillatorNode`/`GainNode`/`BiquadFilterNode`/`AudioBufferSourceNode`），运行时浏览器环境提供
  - `requestAnimationFrame` / `performance.now()`（页面全局计时）
  - 外部注入 `AudioContext`（不自行创建，无对其他 src 模块的编译期依赖）

## Files

| File | Responsibility |
|------|----------------|
| engine.ts | 引擎音效：`EngineParams` 接口、纯函数 `computeEngineParams`（速度比 → 频率/增益）、`EngineSound` 合成器类（双锯齿波 + 低通滤波，`setSpeedRatio`/`start`/`stop`） |
| music.ts | 背景音乐：纯函数 `noteToFreq`/`tickMsForBpm`、音阶与和弦常量（`BASS_LINE`/`MELODY_LINE`）、`MusicPlayer` 类（RAF 30Hz 固定步长 + 0.2s 前瞻调度的 16 步 chiptune 循环） |
