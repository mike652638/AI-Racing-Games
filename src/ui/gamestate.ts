/**
 * 阶段定义与转移逻辑已下沉到 game 层（game/phase.ts、game/phase-logic.ts），
 * 本文件 re-export 保持旧消费方（screens/hud/main 等）导入路径兼容。
 */
export { PHASE_MENU, PHASE_RACING, PHASE_FINISHED, PHASE_PAUSED, type Phase } from '../game/phase'
export { nextPhase, togglePause } from '../game/phase-logic'
