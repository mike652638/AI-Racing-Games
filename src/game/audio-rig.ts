import { BoostSound, CollisionSound, DriftSound, EngineSound, RainSound, TireSound } from '../audio/engine'
import { MusicPlayer } from '../audio/music'

/**
 * 音频装备束（2026-08-05 自 game-loop.startGame 下沉）：
 * masterGain 总控 + musicGain/sfxGain 分轨 + 全部音效实例的一次性装配。
 * GameLoop 首次开始游戏时惰性调用（AudioContext 惰性创建满足浏览器自动播放策略）。
 */
export interface AudioRig {
  /** 主音量节点（总控，暂停菜单 slider 调节） */
  masterGain: GainNode
  /** 音乐分轨增益（MusicPlayer 注入，独立于音效调节） */
  musicGain: GainNode
  /** 音效分轨增益（引擎/雨声/碰撞/BOOST/漂移/胎噪注入） */
  sfxGain: GainNode
  engineSound: EngineSound
  music: MusicPlayer
  rainSound: RainSound
  collisionSound: CollisionSound
  boostSound: BoostSound
  driftSound: DriftSound
  tireSound: TireSound
}

/** 按持久化音量装配完整音频装备（引擎声与音乐立即 start，其余音效待帧驱动触发） */
export function createAudioRig(ctx: AudioContext, volume: number, musicVolume: number, sfxVolume: number): AudioRig {
  // 主音量节点——总控；G7 起分轨：musicGain/sfxGain 各连 masterGain，独立调节
  const masterGain = ctx.createGain()
  masterGain.gain.value = volume
  masterGain.connect(ctx.destination)
  // 音乐/音效分轨——MusicPlayer 走 musicGain、引擎/雨声/碰撞音走 sfxGain
  const musicGain = ctx.createGain()
  musicGain.gain.value = musicVolume
  musicGain.connect(masterGain)
  const sfxGain = ctx.createGain()
  sfxGain.gain.value = sfxVolume
  sfxGain.connect(masterGain)
  const engineSound = new EngineSound(ctx, sfxGain)
  engineSound.start()
  const music = new MusicPlayer(ctx, musicGain)
  music.start()
  return {
    masterGain,
    musicGain,
    sfxGain,
    engineSound,
    music,
    // F4：雨声环境音与碰撞冲击音走音效分轨；H2：BOOST 氮气音效；M15：漂移摩擦/胎噪
    rainSound: new RainSound(ctx, sfxGain),
    collisionSound: new CollisionSound(ctx, sfxGain),
    boostSound: new BoostSound(ctx, sfxGain),
    driftSound: new DriftSound(ctx, sfxGain),
    tireSound: new TireSound(ctx, sfxGain),
  }
}

/** R8：释放持续音节点（GameLoop.destroy 调用，防页面销毁后音频上下文/振荡器占用）。
 *  引擎声与胎噪为构造即 start 的持续源，需显式 destroy；雨声/漂移声 stop 即停源；
 *  音乐 stop 停 RAF；一次调用后实例不再复用（惰性创建，下次 startGame 重建新 rig）。 */
export function destroyAudioRig(rig: AudioRig): void {
  rig.engineSound.destroy()
  rig.tireSound.destroy()
  rig.rainSound.stop()
  rig.driftSound.stop()
  rig.music.stop()
}
