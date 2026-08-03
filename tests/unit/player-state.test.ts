import { describe, expect, it } from 'vitest'
import { createPlayerState, resetPlayerState } from '../../src/game/player-state'

describe('player state', () => {
  it('creates independent initial state', () => {
    const p1 = createPlayerState()
    const p2 = createPlayerState()
    p1.cameraZ = 100
    p1.raceTime = 5
    p1.carState.position = 0.5
    p1.collisionCooldown = 1
    expect(p2.cameraZ).toBe(0)
    expect(p2.raceTime).toBe(0)
    expect(p2.carState.position).toBe(0)
    expect(p2.collisionCooldown).toBe(0)
  })

  it('drift state is an independent object (smoke included)', () => {
    const p1 = createPlayerState()
    const p2 = createPlayerState()
    p1.driftState.smoke.push({ x: 0.3, z: 100, t: 0 })
    p1.driftState.active = true
    expect(p2.driftState.smoke).toEqual([])
    expect(p2.driftState.active).toBe(false)
  })

  it('reset clears state', () => {
    const p = createPlayerState()
    p.cameraZ = 100
    p.raceTime = 10
    p.carState.speed = 500
    p.collisionCooldown = 0.7
    resetPlayerState(p)
    expect(p.cameraZ).toBe(0)
    expect(p.raceTime).toBe(0)
    expect(p.carState.speed).toBe(0)
    expect(p.collisionCooldown).toBe(0)
    expect(p.driftState.smoke).toEqual([])
  })
})
