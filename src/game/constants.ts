/**
 * 游戏参数集中配置（唯一真源）：已提升到 src/shared/constants（2026-08-05 解环 game↔ui）。
 * 本文件 re-export 保持既有消费方（game 内部、tests 等）导入路径兼容；
 * 新代码请直接导入 src/shared/constants。
 */
export * from '../shared/constants'
