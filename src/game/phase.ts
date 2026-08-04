/** 游戏阶段常量与类型：唯一真源已提升到 src/shared/phase（解环 game↔ui），此处 re-export 保持 game 内部消费方兼容 */
export { PHASE_MENU, PHASE_RACING, PHASE_FINISHED, PHASE_PAUSED, type Phase } from '../shared/phase'
