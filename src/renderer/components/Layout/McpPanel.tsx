import { useMemo, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { buildMcpDockSnapshot, parseMcpArgsInput } from '@shared/mcp'

export function McpPanel() {
  const catalog = useAppStore((s) => s.catalog)
  const settings = useAppStore((s) => s.settings)
  const mcpQuery = useAppStore((s) => s.mcpQuery)
  const mcpLoading = useAppStore((s) => s.mcpLoading)
  const mcpProbes = useAppStore((s) => s.mcpProbes)
  const setMcpQuery = useAppStore((s) => s.setMcpQuery)
  const setShow = useAppStore((s) => s.setShow)
  const setToolEnabled = useAppStore((s) => s.setToolEnabled)
  const upsertMcpServer = useAppStore((s) => s.upsertMcpServer)
  const removeMcpServer = useAppStore((s) => s.removeMcpServer)
  const refreshMcpTools = useAppStore((s) => s.refreshMcpTools)
  const setCatalogFilters = useAppStore((s) => s.setCatalogFilters)

  const [name, setName] = useState('Local MCP')
  const [command, setCommand] = useState('node')
  const [argsText, setArgsText] = useState('tests/fixtures/fake-mcp-server.mjs')

  const snap = useMemo(
    () =>
      buildMcpDockSnapshot({
        catalog,
        enabledTools: settings.enabledTools,
        servers: settings.mcpServers ?? [],
        probes: mcpProbes,
        query: mcpQuery
      }),
    [catalog, settings.enabledTools, settings.mcpServers, mcpProbes, mcpQuery]
  )

  const featureOn = settings.enabledTools['thirdparty-mcp-dock'] !== false

  return (
    <div className="mcp-panel" role="region" aria-label="MCP tools catalog">
      <div className="mcp-panel-header">
        <strong>MCP catalog</strong>
        <span className={`mcp-status ${snap.status}`}>{mcpLoading ? 'loading' : snap.status}</span>
        <button
          className="btn"
          disabled={mcpLoading || !(settings.mcpServers ?? []).length}
          onClick={() => void refreshMcpTools()}
        >
          {mcpLoading ? 'Probing…' : 'Refresh tools'}
        </button>
        <button className="btn ghost" onClick={() => setShow('showMcpPanel', false)}>
          Close
        </button>
      </div>

      <p className="mcp-panel-msg">{snap.message}</p>

      {!featureOn && (
        <div className="error-state" style={{ marginBottom: 10 }}>
          MCP dock is disabled.{' '}
          <button
            className="btn primary"
            onClick={() => void setToolEnabled('thirdparty-mcp-dock', true)}
          >
            Enable MCP Tool Dock
          </button>
        </div>
      )}

      <div className="mcp-search-row">
        <input
          value={mcpQuery}
          onChange={(e) => setMcpQuery(e.target.value)}
          placeholder="Search MCP catalog…"
          aria-label="Search MCP catalog"
        />
        <button
          className="btn"
          onClick={() => {
            setCatalogFilters('mcp', 'ai-tools')
            setShow('showCatalog', true)
          }}
        >
          Open full catalog
        </button>
      </div>

      <div className="mcp-columns">
        <section>
          <h4 className="mcp-section-title">Catalog entries</h4>
          {snap.catalogRows.length === 0 ? (
            <div className="empty-state">No MCP catalog matches.</div>
          ) : (
            <ul className="mcp-tool-list">
              {snap.catalogRows.map((row) => (
                <li key={row.id} className={row.available ? 'available' : 'unavailable'}>
                  <div className="mcp-tool-name">
                    <span className={`status-dot ${row.available ? 'connected' : 'unknown'}`} />
                    {row.name}
                    {!row.available && <span className="mcp-pill">unavailable</span>}
                    {row.enabled && <span className="mcp-pill on">enabled</span>}
                  </div>
                  <div className="mcp-tool-reason">{row.description}</div>
                  <div className="mcp-tool-reason">{row.reason}</div>
                  {row.available && (
                    <div className="diff-actions" style={{ marginTop: 8 }}>
                      <button
                        className="btn primary"
                        disabled={row.enabled}
                        onClick={() => void setToolEnabled(row.id, true)}
                      >
                        Enable
                      </button>
                      <button className="btn" onClick={() => void setToolEnabled(row.id, false)}>
                        Disable
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mcp-section-title">Local stdio servers</h4>
          {snap.servers.length === 0 ? (
            <div className="empty-state">
              No servers configured yet. Add a local command below (no remote API keys required).
            </div>
          ) : (
            <ul className="mcp-tool-list">
              {snap.servers.map((server) => (
                <li
                  key={server.id}
                  className={server.status === 'connected' ? 'available' : 'unavailable'}
                >
                  <div className="mcp-tool-name">
                    <span
                      className={`status-dot ${
                        server.status === 'connected'
                          ? 'connected'
                          : server.status === 'error'
                            ? 'error'
                            : 'unknown'
                      }`}
                    />
                    {server.name}
                    <span className="mcp-pill">{server.status}</span>
                  </div>
                  <div className="mcp-tool-reason">
                    <code>{server.command}</code>
                  </div>
                  <div className="mcp-tool-reason">{server.message}</div>
                  {server.tools.length > 0 && (
                    <ul className="mcp-live-tools">
                      {server.tools.map((tool) => (
                        <li key={tool.name}>
                          <strong>{tool.name}</strong>
                          {tool.description ? ` — ${tool.description}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="diff-actions" style={{ marginTop: 8 }}>
                    <button
                      className="btn"
                      disabled={mcpLoading}
                      onClick={() => void refreshMcpTools(server.id)}
                    >
                      Probe
                    </button>
                    <button
                      className="btn"
                      onClick={() =>
                        void upsertMcpServer({
                          id: server.id,
                          name: server.name,
                          command: (settings.mcpServers ?? []).find((s) => s.id === server.id)
                            ?.command,
                          args:
                            (settings.mcpServers ?? []).find((s) => s.id === server.id)?.args ?? [],
                          enabled: !server.enabled
                        })
                      }
                    >
                      {server.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn danger" onClick={() => void removeMcpServer(server.id)}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form
            className="mcp-add-form"
            onSubmit={(e) => {
              e.preventDefault()
              void upsertMcpServer({
                name,
                command,
                args: parseMcpArgsInput(argsText),
                enabled: true
              }).then(() => {
                setName('Local MCP')
                setCommand('node')
                setArgsText('tests/fixtures/fake-mcp-server.mjs')
              })
            }}
          >
            <h4 className="mcp-section-title">Add local MCP server</h4>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Command
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="node | npx | /path/to/server"
                required
              />
            </label>
            <label>
              Args
              <input
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder="-y @modelcontextprotocol/server-filesystem /abs/path"
              />
            </label>
            <p className="mcp-tool-reason">
              Stdio only. Example fixture: <code>node tests/fixtures/fake-mcp-server.mjs</code> from
              the ForgeLocal repo root.
            </p>
            <button className="btn primary" type="submit">
              Add server
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
