import { useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'

const CATEGORIES = [
  'all',
  'editors',
  'languages',
  'ai-tools',
  'terminals',
  'vcs',
  'security',
  'productivity'
]

export function CatalogModal() {
  const show = useAppStore((s) => s.showCatalog)
  const setShow = useAppStore((s) => s.setShow)
  const catalog = useAppStore((s) => s.catalog)
  const catalogQuery = useAppStore((s) => s.catalogQuery)
  const catalogCategory = useAppStore((s) => s.catalogCategory)
  const setCatalogFilters = useAppStore((s) => s.setCatalogFilters)
  const selectedCatalogId = useAppStore((s) => s.selectedCatalogId)
  const selectCatalog = useAppStore((s) => s.selectCatalog)
  const settings = useAppStore((s) => s.settings)
  const setToolEnabled = useAppStore((s) => s.setToolEnabled)

  const filtered = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase()
    return catalog.filter((item) => {
      if (catalogCategory !== 'all' && item.category !== catalogCategory) return false
      if (!q) return true
      return [item.name, item.description, item.source, ...item.tags]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [catalog, catalogQuery, catalogCategory])

  const selected = catalog.find((c) => c.id === selectedCatalogId) ?? filtered[0]

  if (!show) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => setShow('showCatalog', false)}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Tools and extensions catalog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <strong>Tools & Extensions</strong>
            <div style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 4 }}>
              Offline catalog · enable only what this build implements
            </div>
          </div>
          <button className="btn ghost" onClick={() => setShow('showCatalog', false)}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <div className="filters">
            <input
              style={{ flex: 1 }}
              placeholder="Search tools…"
              value={catalogQuery}
              onChange={(e) => setCatalogFilters(e.target.value, catalogCategory)}
              aria-label="Search catalog"
            />
            <select
              value={catalogCategory}
              onChange={(e) => setCatalogFilters(catalogQuery, e.target.value)}
              aria-label="Filter by category"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              className="btn"
              onClick={async () => {
                await window.forge.refreshCatalog()
                await useAppStore.getState().loadCatalog()
              }}
            >
              Reload offline catalog
            </button>
          </div>
          <div className="catalog-grid">
            <div style={{ display: 'grid', gap: 8, maxHeight: '50vh', overflow: 'auto' }}>
              {filtered.map((item) => (
                <button
                  key={item.id}
                  className={`catalog-item ${selected?.id === item.id ? 'active' : ''}`}
                  onClick={() => selectCatalog(item.id)}
                >
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <span className={`trust ${item.trust}`}>{item.trust}</span>
                  {!item.implemented && (
                    <span className="trust third-party" style={{ marginLeft: 6 }}>
                      not implemented
                    </span>
                  )}
                </button>
              ))}
              {filtered.length === 0 && <div className="empty-state">No catalog items match.</div>}
            </div>
            <div>
              {selected ? (
                <div className="catalog-item" style={{ cursor: 'default' }}>
                  <h3>{selected.name}</h3>
                  <p>{selected.description}</p>
                  <p style={{ marginTop: 10 }}>
                    <strong>Source:</strong> {selected.source}
                  </p>
                  <p>
                    <strong>Tags:</strong> {selected.tags.join(', ')}
                  </p>
                  <p>
                    <strong>Install / config:</strong> {selected.installGuidance}
                  </p>
                  <div className="diff-actions">
                    <button
                      className="btn primary"
                      disabled={!selected.implemented}
                      onClick={() => setToolEnabled(selected.id, true)}
                    >
                      Enable
                    </button>
                    <button className="btn" onClick={() => setToolEnabled(selected.id, false)}>
                      Disable
                    </button>
                  </div>
                  <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 12 }}>
                    Current:{' '}
                    {selected.implemented
                      ? settings.enabledTools[selected.id]
                        ? 'enabled'
                        : 'disabled'
                      : 'unavailable (not implemented)'}
                  </div>
                </div>
              ) : (
                <div className="empty-state">Select an item</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
