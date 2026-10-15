import { describe, expect, it } from 'vitest'
import { isKeyboardActivationKey, nextRovingIndex } from './keyboard-navigation'

describe('keyboard navigation', () => {
  it('moves and wraps through a roving tab set', () => {
    expect(nextRovingIndex('ArrowRight', 2, 3)).toBe(0)
    expect(nextRovingIndex('ArrowLeft', 0, 3)).toBe(2)
    expect(nextRovingIndex('Home', 2, 3)).toBe(0)
    expect(nextRovingIndex('End', 0, 3)).toBe(2)
  })

  it('recognizes native activation keys', () => {
    expect(isKeyboardActivationKey('Enter')).toBe(true)
    expect(isKeyboardActivationKey(' ')).toBe(true)
    expect(isKeyboardActivationKey('Escape')).toBe(false)
  })
})
