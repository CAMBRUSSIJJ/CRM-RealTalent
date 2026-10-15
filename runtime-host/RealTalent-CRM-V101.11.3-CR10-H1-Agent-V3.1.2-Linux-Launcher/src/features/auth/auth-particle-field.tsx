import { useEffect, useRef, useState, type CSSProperties } from 'react'

type Burst = { id: number; x: number; y: number }

type ParticleStyle = CSSProperties & Record<'--x' | '--y' | '--delay' | '--duration' | '--size', string>

type BurstStyle = CSSProperties & Record<'--burst-x' | '--burst-y', string>
type RayStyle = CSSProperties & Record<'--angle', string>

const DOTS = [
  [8,16,0,8.2,4],[14,61,1.1,10.5,3],[20,35,.4,9.4,5],[27,82,1.8,11.2,3],[34,12,.8,12.4,4],[39,68,2.4,9.8,3],
  [47,42,1.4,10.9,4],[53,88,.2,12.8,3],[58,20,2.8,9.6,5],[64,60,1.2,11.7,3],[69,35,3.1,13.2,4],[73,77,.9,10.4,3],
  [79,15,2.1,12.1,4],[83,51,.6,9.9,5],[88,71,2.7,11.3,3],[92,29,1.6,12.6,4],[95,87,.3,10.8,3],[5,88,2.2,13.1,4],
] as const

export function AuthParticleField({ reduced = false }: { reduced?: boolean }) {
  const [bursts, setBursts] = useState<Burst[]>([])
  const nextId = useRef(1)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  const burst = (x: number, y: number) => {
    const id = nextId.current++
    setBursts((current) => [...current.slice(-2), { id, x, y }])
    timers.current.push(window.setTimeout(() => setBursts((current) => current.filter((item) => item.id !== id)), 900))
  }

  const visibleDots = reduced ? DOTS.slice(0, 10) : DOTS

  return <div className={`auth-particle-field ${reduced ? 'is-reduced' : ''}`} aria-hidden="true">
    {visibleDots.map(([x,y,delay,duration,size], index) => {
      const style = { '--x': `${x}%`, '--y': `${y}%`, '--delay': `${delay}s`, '--duration': `${duration}s`, '--size': `${size}px` } as ParticleStyle
      return <button key={index} type="button" className="auth-particle-field__dot" style={style} tabIndex={-1} onPointerDown={(event) => { event.preventDefault(); burst(x,y) }} />
    })}
    {bursts.map((item) => <span key={item.id} className="auth-particle-field__burst" style={{ '--burst-x': `${item.x}%`, '--burst-y': `${item.y}%` } as BurstStyle}>
      <i className="auth-particle-field__ring" />
      {Array.from({ length: 8 }, (_, ray) => <i key={ray} className="auth-particle-field__ray" style={{ '--angle': `${ray * 45}deg` } as RayStyle} />)}
    </span>)}
  </div>
}
