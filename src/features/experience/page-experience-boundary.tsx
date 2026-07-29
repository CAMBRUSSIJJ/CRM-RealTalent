import { useLayoutEffect, useRef, type PropsWithChildren } from 'react'
import type { AppRoute } from '../../domain/types'
import { useExperience } from './experience-context'
import { pageSectionRegistry } from './experience-registry'

export function PageExperienceBoundary({ route, children }: PropsWithChildren<{ route: AppRoute }>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const { preferences } = useExperience()
  const page = preferences.pages[route]

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !page) return
    const apply = () => {
      const definitions = pageSectionRegistry[route]
      definitions.forEach((definition) => {
        const hidden = page.hiddenSections.includes(definition.id) && !definition.required
        const order = page.sectionOrder.indexOf(definition.id)
        root.querySelectorAll<HTMLElement>(definition.selector).forEach((element) => {
          element.dataset.experienceSection = definition.id
          element.hidden = hidden
          element.style.setProperty('--experience-order', String(order < 0 ? definitions.length : order))
        })
      })
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [page, route])

  return <div ref={rootRef} className="route-transition" key={route} data-route={route} data-experience-density={page?.density ?? 'comfortable'} data-experience-emphasis={page?.emphasis ?? 'balanced'}>{children}</div>
}
