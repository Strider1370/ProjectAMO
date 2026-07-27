import { useState } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { CHANGELOG } from './changelog.js'
import { useCloseOnBackButton } from '../../shared/ui/useCloseOnBackButton.js'
import './UpdatesModal.css'

export default function UpdatesModal({ onClose }) {
  useCloseOnBackButton(true, onClose)
  // The latest entry starts expanded; the rest collapse until clicked.
  const [expanded, setExpanded] = useState(() => ({ [CHANGELOG[0].version]: true }))
  const toggle = (version) => setExpanded((prev) => ({ ...prev, [version]: !prev[version] }))

  return (
    <div className="updates-overlay" onClick={onClose}>
      <div
        className="updates-modal"
        role="dialog"
        aria-modal="true"
        aria-label="업데이트 소식"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="updates-modal__header">
          <h2>업데이트 소식</h2>
          <button type="button" className="updates-modal__close" aria-label="닫기" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="updates-modal__body">
          {CHANGELOG.map((entry, index) => {
            const isOpen = !!expanded[entry.version]
            return (
              <section
                className={`updates-entry${index === 0 ? ' is-latest' : ''}${isOpen ? ' is-open' : ''}`}
                key={entry.version}
              >
                <button
                  type="button"
                  className="updates-entry__head"
                  aria-expanded={isOpen}
                  onClick={() => toggle(entry.version)}
                >
                  <ChevronDown size={15} className="updates-entry__chevron" />
                  <span className="updates-entry__version">v{entry.version}</span>
                  <span className="updates-entry__title">{entry.title}</span>
                  {index === 0 && <span className="updates-entry__badge">NEW</span>}
                  <span className="updates-entry__date">{entry.date}</span>
                </button>
                {isOpen && (
                  <ul className="updates-entry__items">
                    {entry.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
