import type { ReactNode } from 'react'

export interface MindMapItem {
  id: string
  eyebrow?: string
  title: string
  description?: string
  active?: boolean
  visited?: boolean
  onClick?: () => void
}

export interface MindMapBranch {
  id: string
  title: string
  description?: string
  items: MindMapItem[]
}

interface MindMapCanvasProps {
  ariaLabel: string
  rootEyebrow?: string
  rootTitle: string
  rootDescription?: string
  rootIcon?: ReactNode
  branches: MindMapBranch[]
  compact?: boolean
}

export function MindMapCanvas({
  ariaLabel,
  rootEyebrow,
  rootTitle,
  rootDescription,
  rootIcon,
  branches,
  compact = false,
}: MindMapCanvasProps) {
  return <section className={`rt-mindmap ${compact ? 'rt-mindmap--compact' : ''}`} aria-label={ariaLabel}>
    <div className="rt-mindmap__root">
      {rootIcon ? <span className="rt-mindmap__root-icon">{rootIcon}</span> : null}
      <div>
        {rootEyebrow ? <small>{rootEyebrow}</small> : null}
        <strong>{rootTitle}</strong>
        {rootDescription ? <span>{rootDescription}</span> : null}
      </div>
    </div>
    <div className="rt-mindmap__branches">
      {branches.map((branch) => {
        const activeBranch = branch.items.some((item) => item.active)
        return <article className={`rt-mindmap__branch ${activeBranch ? 'is-active' : ''}`} key={branch.id}>
          <div className="rt-mindmap__branch-head">
            <strong>{branch.title}</strong>
            {branch.description ? <span>{branch.description}</span> : null}
          </div>
          <div className="rt-mindmap__leaves">
            {branch.items.map((item) => {
              const className = `rt-mindmap__leaf ${item.active ? 'is-active' : ''} ${item.visited ? 'is-visited' : ''}`
              const content = <>
                {item.eyebrow ? <small>{item.eyebrow}</small> : null}
                <strong>{item.title}</strong>
                {item.description ? <span>{item.description}</span> : null}
              </>
              return item.onClick
                ? <button type="button" className={className} key={item.id} onClick={item.onClick}>{content}</button>
                : <div className={className} key={item.id}>{content}</div>
            })}
          </div>
        </article>
      })}
    </div>
  </section>
}
