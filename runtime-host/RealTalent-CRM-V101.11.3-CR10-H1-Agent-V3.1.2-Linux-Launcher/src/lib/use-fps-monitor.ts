import { useEffect, useRef, useState } from 'react'

export type FpsTier = 'excellent' | 'good' | 'reduced'

export interface FpsSample {
  fps: number
  longFrames: number
  tier: FpsTier
}

const classify = (fps: number): FpsTier => fps >= 55 ? 'excellent' : fps >= 45 ? 'good' : 'reduced'

export function useFpsMonitor(enabled = true): FpsSample {
  const [sample, setSample] = useState<FpsSample>({ fps: 60, longFrames: 0, tier: 'excellent' })
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    let last = performance.now()
    let windowStart = last
    let frames = 0
    let longFrames = 0
    let running = true

    const tick = (now: number) => {
      if (!running) return
      const delta = now - last
      last = now
      frames += 1
      if (delta > 34) longFrames += 1
      const elapsed = now - windowStart
      if (elapsed >= 1000) {
        const fps = Math.max(1, Math.min(120, Math.round((frames * 1000) / elapsed)))
        setSample({ fps, longFrames, tier: classify(fps) })
        frames = 0
        longFrames = 0
        windowStart = now
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      } else if (rafRef.current === null) {
        last = performance.now()
        windowStart = last
        frames = 0
        longFrames = 0
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      running = false
      document.removeEventListener('visibilitychange', onVisibility)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled])

  return sample
}
