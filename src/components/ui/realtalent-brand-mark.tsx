interface RealTalentBrandMarkProps {
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
  loading?: boolean
  sharedTransition?: boolean
  className?: string
}

export function RealTalentBrandMark({
  size = 'md',
  animated = true,
  loading = false,
  sharedTransition = false,
  className = '',
}: RealTalentBrandMarkProps) {
  const classes = [
    'rt-brand-mark',
    `rt-brand-mark--${size}`,
    animated ? 'rt-brand-mark--animated' : '',
    loading ? 'rt-brand-mark--loading' : '',
    sharedTransition ? 'rt-brand-mark--shared' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} aria-hidden="true">
      <span className="rt-brand-mark__halo" />
      <span className="rt-brand-mark__orbit" />
      <span className="rt-brand-mark__orbit rt-brand-mark__orbit--secondary" />
      <span className="rt-brand-mark__frame">
        <img className="rt-brand-mark__glyph" src="/realtalent-logo-r.png" alt="" draggable={false} />
        <span className="rt-brand-mark__bars" aria-hidden="true">
          <img className="rt-brand-mark__bar rt-brand-mark__bar--one" src="/realtalent-logo-bars.png" alt="" draggable={false} />
          <img className="rt-brand-mark__bar rt-brand-mark__bar--two" src="/realtalent-logo-bars.png" alt="" draggable={false} />
          <img className="rt-brand-mark__bar rt-brand-mark__bar--three" src="/realtalent-logo-bars.png" alt="" draggable={false} />
        </span>
        <img className="rt-brand-mark__full" src="/realtalent-logo-transparent.png" alt="" draggable={false} />
        <span className="rt-brand-mark__scan" />
        <span className="rt-brand-mark__shine" />
      </span>
      <span className="rt-brand-mark__pulse" />
    </span>
  )
}
