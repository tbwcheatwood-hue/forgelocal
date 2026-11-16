import { useMemo, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { buildMcpDockSnapshot, parseMcpArgsInput } from '@shared/mcp'
import type { CatalogItem } from '@shared/types'
import { isRemoteMode } from '@shared/providerTools'

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
  const setError = useAppStore((s) => s.setError)
  const selectCatalog = useAppStore((s) => s.selectCatalog)

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

  const presets = useMemo(
    () =>
      catalog.filter(
        (item): item is CatalogItem & { mcpSuggested: NonNullable<CatalogItem['mcpSuggested']> } =>
          Boolean(item.mcpSuggested)
      ),
    [catalog]
  )

  const featureOn = settings.enabledTools['thirdparty-mcp-dock'] !== false
  const remote = isRemoteMode(settings.provider)

  const applySuggested = async (item: CatalogItem) => {
    const suggested = item.mcpSuggested
    if (!suggested) return
    const ok = await window.forge.confirm(
      `Add MCP server “${suggested.name}”?`,
      [
        `command: ${suggested.command}`,
        `args: ${suggested.args.join(' ')}`,
        suggested.note ??
          'First-time npx/uvx may download packages. Edit absolute paths before probing.'
      ].join('\n')
    )
    if (!ok) return
    setName(suggested.name)
    setCommand(suggested.command)
    setArgsText(suggested.args.join(' '))
    await upsertMcpServer({
      name: suggested.name,
      command: suggested.command,
      args: suggested.args,
      enabled: true
    })
  }

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
      <p className="mcp-tool-reason">
        MCP works with {remote ? 'your remote model' : 'local LM Studio'} — stdio servers stay on
        this machine. Online marketplace sync is optional and separate.
      </p>

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
                      <button
                        className="btn ghost"
                        onClick={() => {
                          selectCatalog(row.id)
                          setCatalogFilters(row.name, 'ai-tools')
                          setShow('showCatalog', true)
                        }}
                      >
                        Details
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mcp-section-title">Suggested stdio starters</h4>
          {presets.length === 0 ? (
            <div className="empty-state">No presets in the offline catalog.</div>
          ) : (
            <ul className="mcp-tool-list">
              {presets.map((item) => (
                <li key={item.id} className="available">
                  <div className="mcp-tool-name">{item.mcpSuggested.name}</div>
                  <div className="mcp-tool-reason">
                    <code>
                      {item.mcpSuggested.command} {item.mcpSuggested.args.join(' ')}
                    </code>
                  </div>
                  {item.mcpSuggested.note && (
                    <div className="mcp-tool-reason">{item.mcpSuggested.note}</div>
                  )}
                  <div className="diff-actions" style={{ marginTop: 8 }}>
                    <button
                      className="btn primary"
                      onClick={() =>
                        void applySuggested(item).catch((err: unknown) =>
                          setError(err instanceof Error ? err.message : String(err))
                        )
                      }
                    >
                      Add suggested config
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => {
                        const s = item.mcpSuggested!
                        setName(s.name)
                        setCommand(s.command)
                        setArgsText(s.args.join(' '))
                      }}
                    >
                      Fill form
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

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
