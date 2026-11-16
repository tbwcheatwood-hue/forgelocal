import { useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import {
  canUseOnlineTools,
  catalogItemRequiresRemote,
  isMcpAvailableForAllModels
} from '@shared/providerTools'

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
  const upsertMcpServer = useAppStore((s) => s.upsertMcpServer)
  const setError = useAppStore((s) => s.setError)
  const onlineOk = canUseOnlineTools(settings)

  const filtered = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase()
    return catalog.filter((item) => {
      if (catalogCategory !== 'all' && item.category !== catalogCategory) return false
      if (!onlineOk && catalogItemRequiresRemote(item)) return false
      if (!q) return true
      return [item.name, item.description, item.source, ...item.tags]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [catalog, catalogQuery, catalogCategory, onlineOk])

  const selected = catalog.find((c) => c.id === selectedCatalogId) ?? filtered[0]
  const selectedNeedsRemote = selected ? catalogItemRequiresRemote(selected) : false
  const canEnableSelected = Boolean(selected?.implemented) && (!selectedNeedsRemote || onlineOk)

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
              Offline catalog · enable only what this build implements · MCP works with local or
              remote models
              {!onlineOk && ' · online/cloud (non-MCP) tools hidden until a remote model is active'}
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
                  {selected.homepage && (
                    <p style={{ marginTop: 8 }}>
                      <strong>Homepage:</strong>{' '}
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => void window.forge.openExternal(selected.homepage!)}
                      >
                        {selected.homepage}
                      </button>
                    </p>
                  )}
                  {isMcpAvailableForAllModels(selected) && (
                    <p style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 12 }}>
                      MCP entry — available with local LM Studio and remote models (stdio stays
                      local).
                    </p>
                  )}
                  {selected.sampleConfigJson && (
                    <div style={{ marginTop: 10 }}>
                      <strong>Sample mcpServers JSON</strong>
                      <pre
                        style={{
                          marginTop: 6,
                          padding: 10,
                          overflow: 'auto',
                          maxHeight: 180,
                          fontSize: 11,
                          background: 'var(--bg-elevated, #12100e)',
                          borderRadius: 8
                        }}
                      >
                        {selected.sampleConfigJson}
                      </pre>
                    </div>
                  )}
                  {selectedNeedsRemote && !onlineOk && (
                    <div className="error-state" style={{ marginTop: 10 }}>
                      Requires an active remote cloud model. Switch Provider mode to Remote and
                      select a model first.
                    </div>
                  )}
                  <div className="diff-actions">
                    <button
                      className="btn primary"
                      disabled={!canEnableSelected}
                      onClick={() => {
                        void setToolEnabled(selected.id, true).catch((err: unknown) => {
                          setError(err instanceof Error ? err.message : String(err))
                        })
                      }}
                    >
                      Enable
                    </button>
                    <button className="btn" onClick={() => setToolEnabled(selected.id, false)}>
                      Disable
                    </button>
                    {selected.mcpSuggested && (
                      <button
                        className="btn"
                        type="button"
                        title={selected.mcpSuggested.note ?? 'Add suggested stdio server'}
                        onClick={() => {
                          const suggested = selected.mcpSuggested!
                          void (async () => {
                            const ok = await window.forge.confirm(
                              `Add MCP server “${suggested.name}”?`,
                              [
                                `command: ${suggested.command}`,
                                `args: ${suggested.args.join(' ')}`,
                                suggested.note ??
                                  'First-time npx/uvx may download packages. ForgeLocal will not invent API keys.'
                              ].join('\n')
                            )
                            if (!ok) return
                            await upsertMcpServer({
                              name: suggested.name,
                              command: suggested.command,
                              args: suggested.args,
                              enabled: true
                            })
                            setShow('showCatalog', false)
                            setShow('showMcpPanel', true)
                          })().catch((err: unknown) => {
                            setError(err instanceof Error ? err.message : String(err))
                          })
                        }}
                      >
                        Add suggested MCP server
                      </button>
                    )}
                  </div>
                  <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 12 }}>
                    Current:{' '}
                    {!selected.implemented
                      ? 'unavailable (not implemented)'
                      : selectedNeedsRemote && !onlineOk
                        ? 'unavailable (remote model required)'
                        : settings.enabledTools[selected.id]
                          ? 'enabled'
                          : 'disabled'}
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
