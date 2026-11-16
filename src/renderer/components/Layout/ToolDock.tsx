import { useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { buildMcpDockSnapshot, canUseOnlineTools, isRemoteMode } from '@shared/providerTools'

/** Bottom dock: provider / MCP / online tools / pop-out / context budget. */
export function ToolDock() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const settings = useAppStore((s) => s.settings)
  const session = useAppStore((s) => s.session)
  const streaming = useAppStore((s) => s.streaming)
  const catalog = useAppStore((s) => s.catalog)
  const showMcpPanel = useAppStore((s) => s.showMcpPanel)
  const setShow = useAppStore((s) => s.setShow)
  const refreshLm = useAppStore((s) => s.refreshLm)
  const popoutIde = useAppStore((s) => s.popoutIde)
  const setCatalogFilters = useAppStore((s) => s.setCatalogFilters)

  const mcp = useMemo(() => buildMcpDockSnapshot(catalog), [catalog])
  const onlineOk = canUseOnlineTools(settings)
  const remote = isRemoteMode(settings.provider)
  const onlineEnabled = Boolean(settings.enabledTools['optional-online-extensions'])

  if (!workspaceRoot) return null

  const chars = session?.messages.reduce((n, m) => n + (m.content?.length ?? 0), 0) ?? 0
  const approxTokens = Math.round(chars / 4)

  const mcpDot =
    mcp.status === 'ready'
      ? 'connected'
      : mcp.status === 'stub' || mcp.status === 'empty'
        ? 'unknown'
        : 'error'

  return (
    <div className="tool-dock-wrap">
      <div className="tool-dock" role="region" aria-label="Tool dock">
        <button className="dock-chip" onClick={() => refreshLm()} title={lmStatus?.message}>
          <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
          <span className="dock-label">{remote ? 'Remote' : 'LM Studio'}</span>
          <span className="dock-meta">
            {settings.provider.model || lmStatus?.status || 'offline'}
          </span>
        </button>

        <button
          className={`dock-chip ${showMcpPanel ? 'active' : 'muted'}`}
          onClick={() => setShow('showMcpPanel', !showMcpPanel)}
          title={mcp.message}
          aria-expanded={showMcpPanel}
        >
          <span className={`status-dot ${mcpDot}`} />
          <span className="dock-label">MCP</span>
          <span className="dock-meta">{mcp.status}</span>
        </button>

        {onlineOk ? (
          <button
            className={`dock-chip ${onlineEnabled ? '' : 'muted'}`}
            onClick={() => {
              setCatalogFilters('online', 'ai-tools')
              setShow('showCatalog', true)
            }}
            title={
              onlineEnabled
                ? 'Online tools/extensions allowed while remote model is active'
                : 'Remote model active — open catalog to enable online tools/extensions'
            }
          >
            <span className={`status-dot ${onlineEnabled ? 'connected' : 'unknown'}`} />
            <span className="dock-label">Online</span>
            <span className="dock-meta">{onlineEnabled ? 'on' : 'off'}</span>
          </button>
        ) : (
          <div
            className="dock-chip static muted"
            title="Online tools/extensions are available only when a remote cloud model is active"
          >
            <span className="status-dot unknown" />
            <span className="dock-label">Online</span>
            <span className="dock-meta">local only</span>
          </div>
        )}

        <button
          className="dock-chip"
          onClick={() => void popoutIde()}
          title="Open IDE in a separate window (workspace + open tabs restored when possible)"
        >
          <span className="dock-label">Pop-out</span>
          <span className="dock-meta">IDE</span>
        </button>

        <div
          className="dock-chip static"
          title="Approx. from chat characters ÷ 4 — not a live meter"
        >
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

      {showMcpPanel && (
        <div className="mcp-panel" role="region" aria-label="MCP tools">
          <div className="mcp-panel-header">
            <strong>MCP tools</strong>
            <span className={`mcp-status ${mcp.status}`}>{mcp.status}</span>
            <button className="btn ghost" onClick={() => setShow('showMcpPanel', false)}>
              Close
            </button>
          </div>
          <p className="mcp-panel-msg">{mcp.message}</p>
          {mcp.tools.length === 0 ? (
            <div className="empty-state">No MCP catalog entries.</div>
          ) : (
            <ul className="mcp-tool-list">
              {mcp.tools.map((tool) => (
                <li key={tool.id} className={tool.available ? 'available' : 'unavailable'}>
                  <div className="mcp-tool-name">
                    <span className={`status-dot ${tool.available ? 'connected' : 'unknown'}`} />
                    {tool.name}
                  </div>
                  <div className="mcp-tool-reason">{tool.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
