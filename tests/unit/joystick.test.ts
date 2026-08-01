import { describe, it, expect } from 'vitest'
import { offsetToInput } from '../../src/ui/joystick'

describe('offsetToInput', () => {
  const R = 60

  it('returns zero when below deadzone', () => {
    const r = offsetToInput(5, 3, R)
    expect(r.steer).toBe(0)
    expect(r.throttle).toBe(0)
    expect(r.brake).toBe(false)
  })

  it('maps positive dx to right steer', () => {
    const r = offsetToInput(R * 0.8, 0, R)
    expect(r.steer).toBeGreaterThan(0.5)
    expect(r.throttle).toBe(0)
  })

  it('maps negative dx to left steer', () => {
    const r = offsetToInput(-R * 0.8, 0, R)
    expect(r.steer).toBeLessThan(-0.5)
  })

  it('maps upward drag to throttle', () => {
    const r = offsetToInput(0, -R * 0.8, R)
    expect(r.throttle).toBeGreaterThan(0.5)
    expect(r.brake).toBe(false)
  })

  it('maps downward drag to brake', () => {
    const r = offsetToInput(0, R * 0.8, R)
    expect(r.brake).toBe(true)
    expect(r.throttle).toBe(0)
  })

  it('clamps magnitude to 1 at full extension', () => {
    const r = offsetToInput(R * 2, 0, R)
    expect(Math.abs(r.steer)).toBeLessThanOrEqual(1)
  })

  it('combines steer and throttle for diagonal', () => {
    const r = offsetToInput(R * 0.7, -R * 0.7, R)
    expect(r.steer).toBeGreaterThan(0.3)
    expect(r.throttle).toBeGreaterThan(0.3)
  })
})
