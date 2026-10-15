import { RealTalentBrandMark } from '../../components/ui/realtalent-brand-mark'
import { APP_VERSION_LABEL } from '../../lib/app-version'

interface BrandSplashProps {
  message?: string
}

export function BrandSplash({ message = 'Preparando seu CRM...' }: BrandSplashProps) {
  return (
    <main className="rt-splash" role="status" aria-live="polite">
      <div className="rt-page-orbit-field" aria-hidden="true">
        <span className="rt-page-orbit rt-page-orbit--frame" />
        <span className="rt-page-orbit rt-page-orbit--wide" />
        <span className="rt-page-orbit rt-page-orbit--corner" />
      </div>
      <div className="rt-splash__mesh" aria-hidden="true" />
      <div className="rt-splash__ambient rt-splash__ambient--one" />
      <div className="rt-splash__ambient rt-splash__ambient--two" />
      <div className="rt-splash__wave rt-splash__wave--one" aria-hidden="true" />
      <div className="rt-splash__wave rt-splash__wave--two" aria-hidden="true" />
      <div className="rt-splash__content">
        <RealTalentBrandMark size="lg" loading sharedTransition />
        <div className="rt-splash__wordmark">
          <strong>RealTalent</strong>
          <span>CRM</span>
        </div>
        <p>{message}</p>
        <div className="rt-splash__brand-progress" aria-hidden="true">
          <i /><i /><i />
        </div>
        <small>{APP_VERSION_LABEL}</small>
      </div>
    </main>
  )
}
