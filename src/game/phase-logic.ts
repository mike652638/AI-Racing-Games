/** 阶段转移逻辑：唯一真源已提升到 src/shared/phase-logic（解环 game↔ui），此处 re-export 保持 game 内部消费方兼容 */
export { nextPhase, togglePause } from '../shared/phase-logic'
