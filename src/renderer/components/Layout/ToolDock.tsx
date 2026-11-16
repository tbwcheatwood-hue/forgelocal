import { useMemo } from 'react'
import { enabledAgents, normalizeAgentTeam } from '@shared/agents'
import { useAppStore } from '../../stores/appStore'
import { buildMcpDockSnapshot } from '@shared/mcp'
import { canUseOnlineTools, isRemoteMode } from '@shared/providerTools'
import { AgentsPanel } from '../Agents/AgentsPanel'
import { CompanionPanel } from '../Companion/CompanionPanel'
import { McpPanel } from './McpPanel'

/** Bottom dock: provider / MCP / online tools / context budget. */
export function ToolDock() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const settings = useAppStore((s) => s.settings)
  const session = useAppStore((s) => s.session)
  const streaming = useAppStore((s) => s.streaming)
  const catalog = useAppStore((s) => s.catalog)
  const showMcpPanel = useAppStore((s) => s.showMcpPanel)
  const showAgentsPanel = useAppStore((s) => s.showAgentsPanel)
  const showCompanionPanel = useAppStore((s) => s.showCompanionPanel)
  const companionHealth = useAppStore((s) => s.companionHealth)
  const gitSnapshot = useAppStore((s) => s.gitSnapshot)
  const mcpProbes = useAppStore((s) => s.mcpProbes)
  const mcpLoading = useAppStore((s) => s.mcpLoading)
  const setShow = useAppStore((s) => s.setShow)
  const refreshLm = useAppStore((s) => s.refreshLm)
  const setCatalogFilters = useAppStore((s) => s.setCatalogFilters)
  const team = useMemo(() => normalizeAgentTeam(settings.agentTeam), [settings.agentTeam])
  const featureAgents = settings.enabledTools['optional-multi-agent'] !== false
  const agentMeta = team.enabled
    ? `${enabledAgents(team).length} roles`
    : featureAgents
      ? 'off'
      : 'disabled'
  const companionMeta = companionHealth?.reachable
    ? companionHealth.version
      ? `v${companionHealth.version}`
      : 'up'
    : settings.companion?.enabled
      ? 'down'
      : 'off'
  const companionDot = companionHealth?.reachable
    ? 'connected'
    : settings.companion?.token
      ? 'error'
      : 'unknown'

  const mcp = useMemo(
    () =>
      buildMcpDockSnapshot({
        catalog,
        enabledTools: settings.enabledTools,
        servers: settings.mcpServers ?? [],
        probes: mcpProbes
      }),
    [catalog, settings.enabledTools, settings.mcpServers, mcpProbes]
  )
  const onlineOk = canUseOnlineTools(settings)
  const remote = isRemoteMode(settings.provider)
  const onlineEnabled = Boolean(settings.enabledTools['optional-online-extensions'])

  if (!workspaceRoot) return null

  const chars = session?.messages.reduce((n, m) => n + (m.content?.length ?? 0), 0) ?? 0
  const approxTokens = Math.round(chars / 4)

  const mcpDot =
    mcpLoading || mcp.status === 'loading'
      ? 'unknown'
      : mcp.status === 'ready'
        ? 'connected'
        : mcp.status === 'configured'
          ? 'no-model'
          : mcp.status === 'error'
            ? 'error'
            : mcp.status === 'stub' || mcp.status === 'empty' || mcp.status === 'unavailable'
              ? 'unknown'
              : 'unknown'

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
          className={`dock-chip ${showMcpPanel ? 'active' : ''}`}
          onClick={() => {
            setShow('showMcpPanel', !showMcpPanel)
            if (!showMcpPanel) {
              setShow('showAgentsPanel', false)
              setShow('showCompanionPanel', false)
            }
          }}
          title={mcp.message}
          aria-expanded={showMcpPanel}
        >
          <span className={`status-dot ${mcpDot}`} />
          <span className="dock-label">MCP</span>
          <span className="dock-meta">{mcpLoading ? 'loading' : mcp.status}</span>
        </button>

        <button
          className={`dock-chip ${showAgentsPanel ? 'active' : ''} ${team.enabled ? '' : 'muted'}`}
          onClick={() => {
            setShow('showAgentsPanel', !showAgentsPanel)
            if (!showAgentsPanel) {
              setShow('showMcpPanel', false)
              setShow('showCompanionPanel', false)
            }
          }}
          title="LocalAGI-inspired multi-agent team (explicit opt-in)"
          aria-expanded={showAgentsPanel}
        >
          <span className={`status-dot ${team.enabled ? 'connected' : 'unknown'}`} />
          <span className="dock-label">Agents</span>
          <span className="dock-meta">{agentMeta}</span>
        </button>

        <button
          className={`dock-chip ${showCompanionPanel ? 'active' : ''}`}
          onClick={() => {
            setShow('showCompanionPanel', !showCompanionPanel)
            if (!showCompanionPanel) {
              setShow('showMcpPanel', false)
              setShow('showAgentsPanel', false)
            }
          }}
          title="LocalForge Companion bridge · discovery · hardware"
          aria-expanded={showCompanionPanel}
        >
          <span className={`status-dot ${companionDot}`} />
          <span className="dock-label">Companion</span>
          <span className="dock-meta">{companionMeta}</span>
        </button>

        <button
          className="dock-chip"
          onClick={() => setShow('showPreview', true)}
          title="Workspace static preview (loopback)"
        >
          <span className="dock-label">Preview</span>
          <span className="dock-meta">
            {gitSnapshot?.hasRepo ? gitSnapshot.branch || 'git' : 'static'}
          </span>
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
                ? 'Online tools/extensions allowed while remote model is active (MCP is separate and always local-capable)'
                : 'Remote model active — open catalog to enable online tools/extensions. MCP dock works in local mode too.'
            }
          >
            <span className={`status-dot ${onlineEnabled ? 'connected' : 'unknown'}`} />
            <span className="dock-label">Online</span>
            <span className="dock-meta">{onlineEnabled ? 'on' : 'off'}</span>
          </button>
        ) : (
          <div
            className="dock-chip static muted"
            title="Online marketplace tools need a remote cloud model. MCP stdio catalog/dock works with local LM Studio."
          >
            <span className="status-dot unknown" />
            <span className="dock-label">Online</span>
            <span className="dock-meta">local only</span>
          </div>
        )}

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

      {showMcpPanel && <McpPanel />}
      {showAgentsPanel && <AgentsPanel />}
      {showCompanionPanel && <CompanionPanel />}
    </div>
  )
}
