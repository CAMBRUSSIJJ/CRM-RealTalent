export type RovingNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

export function nextRovingIndex(key: string, currentIndex: number, length: number) {
  if (length <= 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % length
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + length) % length
  return null
}

export function isKeyboardActivationKey(key: string) {
  return key === 'Enter' || key === ' '
}
