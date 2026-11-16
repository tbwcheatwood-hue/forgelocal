import { useAppStore } from '../../stores/appStore'

/** Bottom dock: LM Studio / MCP stub / honest token budget placeholder. */
export function ToolDock() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const settings = useAppStore((s) => s.settings)
  const session = useAppStore((s) => s.session)
  const streaming = useAppStore((s) => s.streaming)
  const catalog = useAppStore((s) => s.catalog)
  const setShow = useAppStore((s) => s.setShow)
  const refreshLm = useAppStore((s) => s.refreshLm)

  if (!workspaceRoot) return null

  const chars = session?.messages.reduce((n, m) => n + (m.content?.length ?? 0), 0) ?? 0
  const approxTokens = Math.round(chars / 4)

  const mcpImplemented = Boolean(catalog.find((c) => c.id === 'thirdparty-mcp-dock')?.implemented)

  return (
    <div className="tool-dock" role="region" aria-label="Tool dock">
      <button className="dock-chip" onClick={() => refreshLm()} title={lmStatus?.message}>
        <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
        <span className="dock-label">LM Studio</span>
        <span className="dock-meta">
          {settings.provider.model || lmStatus?.status || 'offline'}
        </span>
      </button>

      <button
        className="dock-chip muted"
        onClick={() => setShow('showCatalog', true)}
        title={
          mcpImplemented
            ? 'Open MCP tools'
            : 'MCP dock is a catalog stub in this build — not executable yet'
        }
      >
        <span className="status-dot unknown" />
        <span className="dock-label">MCP</span>
        <span className="dock-meta">{mcpImplemented ? 'ready' : 'stub'}</span>
      </button>

      <div className="dock-chip static" title="Approx. from chat characters ÷ 4 — not a live meter">
        <span className="dock-label">Context</span>
        <span className="dock-meta">
          ~{approxTokens.toLocaleString()} tok{streaming ? ' · streaming' : ''}
        </span>
      </div>

      <div
        className="dock-chip static muted"
        title="Live VRAM / GPU meters are not available without LM Studio telemetry hooks"
      >
        <span className="dock-label">VRAM</span>
        <span className="dock-meta">n/a</span>
      </div>
    </div>
  )
}
