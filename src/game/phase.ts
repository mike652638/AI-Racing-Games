/** 游戏阶段常量与类型：下沉到 game 层，供状态容器、阶段转移逻辑与 UI 消费 */
export const PHASE_MENU = 'menu'
export const PHASE_RACING = 'racing'
export const PHASE_FINISHED = 'finished'
export const PHASE_PAUSED = 'paused'
export type Phase = typeof PHASE_MENU | typeof PHASE_RACING | typeof PHASE_FINISHED | typeof PHASE_PAUSED
