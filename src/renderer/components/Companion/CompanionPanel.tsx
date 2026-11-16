import { useEffect, useState } from 'react'
import { normalizeCompanionBridge, type DiscoveredProvider } from '@shared/companion'
import { useAppStore } from '../../stores/appStore'

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'unknown'
  const gb = n / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GiB`
  const mb = n / (1024 * 1024)
  return `${mb.toFixed(0)} MiB`
}

export function CompanionPanel() {
  const settings = useAppStore((s) => s.settings)
  const companionHealth = useAppStore((s) => s.companionHealth)
  const hardware = useAppStore((s) => s.hardware)
  const discovered = useAppStore((s) => s.discoveredProviders)
  const git = useAppStore((s) => s.gitSnapshot)
  const setShow = useAppStore((s) => s.setShow)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const refreshCompanion = useAppStore((s) => s.refreshCompanion)
  const pairCompanion = useAppStore((s) => s.pairCompanion)
  const disconnectCompanion = useAppStore((s) => s.disconnectCompanion)
  const refreshHardware = useAppStore((s) => s.refreshHardware)
  const discoverLocalProviders = useAppStore((s) => s.discoverLocalProviders)
  const refreshGit = useAppStore((s) => s.refreshGit)
  const applyDiscoveredProvider = useAppStore((s) => s.applyDiscoveredProvider)
  const setToolEnabled = useAppStore((s) => s.setToolEnabled)
  const setError = useAppStore((s) => s.setError)

  const bridge = normalizeCompanionBridge(settings.companion)
  const featureOn = settings.enabledTools['optional-companion-bridge'] !== false
  const [code, setCode] = useState('')
  const [baseUrl, setBaseUrl] = useState(bridge.baseUrl)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setBaseUrl(bridge.baseUrl)
  }, [bridge.baseUrl])

  useEffect(() => {
    if (!featureOn) return
    void refreshCompanion()
    void refreshHardware()
    void refreshGit()
  }, [featureOn, refreshCompanion, refreshHardware, refreshGit])

  const saveUrl = async () => {
    await updateSettings({
      companion: { ...bridge, baseUrl, enabled: true }
    })
    await refreshCompanion()
  }

  const onPair = async () => {
    setBusy(true)
    try {
      await updateSettings({ companion: { ...bridge, baseUrl, enabled: true } })
      const result = await pairCompanion(code)
      if (!result.ok) setError(result.error ?? 'Pairing failed')
      else setCode('')
    } finally {
      setBusy(false)
    }
  }

  const onDiscover = async () => {
    setBusy(true)
    try {
      await discoverLocalProviders()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lf-companion" role="region" aria-label="LocalForge Companion bridge">
      <div className="lf-companion-header">
        <div className="lf-companion-title">
          <span className="lf-mark" aria-hidden>
            ◆
          </span>
          <strong>Companion</strong>
          <span className="lf-badge">
            {bridge.token ? 'paired' : bridge.enabled ? 'ready' : 'off'}
          </span>
        </div>
        <button
          className="btn ghost"
          type="button"
          onClick={() => setShow('showCompanionPanel', false)}
        >
          Close
        </button>
      </div>

      <p className="lf-lead">
        LocalForge Companion–inspired bridge: pair an optional companion service, discover local
        model endpoints, and inspect real hardware. ForgeLocal still owns local files — companion is
        opt-in.
      </p>

      {!featureOn && (
        <div className="error-state" style={{ marginBottom: 10 }}>
          Companion bridge catalog tool is disabled.{' '}
          <button
            className="btn primary"
            type="button"
            onClick={() => void setToolEnabled('optional-companion-bridge', true)}
          >
            Enable in Tools
          </button>
        </div>
      )}

      <div className="lf-section">
        <div className="lf-label">Companion URL</div>
        <div className="lf-row">
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            aria-label="Companion base URL"
            placeholder="http://127.0.0.1:7337"
          />
          <button className="btn" type="button" onClick={() => void saveUrl()}>
            Save
          </button>
          <button className="btn" type="button" onClick={() => void refreshCompanion()}>
            Health
          </button>
        </div>
        <p className="lf-meta">
          {companionHealth
            ? `${companionHealth.reachable ? 'Reachable' : 'Unreachable'} · ${companionHealth.message}${
                companionHealth.version ? ` · v${companionHealth.version}` : ''
              }${companionHealth.latencyMs != null ? ` · ${companionHealth.latencyMs}ms` : ''}`
            : 'Not probed yet'}
        </p>
      </div>

      <div className="lf-section">
        <div className="lf-label">Pairing code</div>
        <div className="lf-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="AB23CD45"
            aria-label="Companion pairing code"
            disabled={busy}
          />
          <button
            className="btn primary lf-glow"
            type="button"
            disabled={!code.trim() || busy}
            onClick={() => void onPair()}
          >
            Pair
          </button>
          <button className="btn ghost" type="button" onClick={() => void disconnectCompanion()}>
            Disconnect
          </button>
        </div>
        <p className="lf-meta">
          {bridge.token
            ? `Token stored locally (${bridge.token.slice(0, 6)}…)`
            : 'Paste the code printed by localforge-companion'}
        </p>
      </div>

      <div className="lf-section">
        <div className="lf-label">Provider discovery</div>
        <div className="lf-row">
          <button
            className="btn primary"
            type="button"
            disabled={busy}
            onClick={() => void onDiscover()}
          >
            Discover local endpoints
          </button>
        </div>
        <ul className="lf-list">
          {discovered.length === 0 && <li className="lf-meta">No discoveries yet.</li>}
          {discovered.map((p: DiscoveredProvider) => (
            <li key={`${p.baseUrl}-${p.name}`} className="lf-card">
              <div className="lf-card-top">
                <strong>{p.name}</strong>
                <span className="lf-meta">{p.baseUrl}</span>
              </div>
              <div className="lf-meta">{p.models.length} model(s)</div>
              <button
                className="btn ghost"
                type="button"
                onClick={() => void applyDiscoveredProvider(p)}
              >
                Use as provider
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="lf-section">
        <div className="lf-row">
          <div className="lf-label">Hardware (this machine)</div>
          <button className="btn ghost" type="button" onClick={() => void refreshHardware()}>
            Refresh
          </button>
        </div>
        {hardware ? (
          <div className="lf-hw">
            <div>
              {hardware.platform}/{hardware.arch} · {hardware.hostname}
            </div>
            <div>
              CPU: {hardware.cpuModel ?? 'unknown'} ({hardware.cpuCores} cores)
            </div>
            <div>
              RAM: {formatBytes(hardware.ramAvailableBytes)} avail /{' '}
              {formatBytes(hardware.ramTotalBytes)} total
            </div>
            <div>
              GPU:{' '}
              {hardware.gpus.length
                ? hardware.gpus
                    .map(
                      (g) =>
                        `${g.name ?? g.kind}${g.vramBytes ? ` (${formatBytes(g.vramBytes)})` : ''}`
                    )
                    .join('; ')
                : 'not detected'}
            </div>
            <div>
              NPU: {hardware.npu.detected ? hardware.npu.detail || 'detected' : 'not detected'}
            </div>
            <div>
              Runtimes:{' '}
              {hardware.inferenceRuntimes.length
                ? hardware.inferenceRuntimes.join(', ')
                : 'none found'}
            </div>
          </div>
        ) : (
          <p className="lf-meta">Click Refresh for real measurements (never invented).</p>
        )}
      </div>

      <div className="lf-section">
        <div className="lf-row">
          <div className="lf-label">Git</div>
          <button className="btn ghost" type="button" onClick={() => void refreshGit()}>
            Refresh
          </button>
        </div>
        {git ? (
          <div className="lf-hw">
            <div>{git.message}</div>
            {git.hasRepo && (
              <>
                <div>
                  Branch: {git.branch ?? '?'}
                  {git.dirty ? ' · dirty' : ' · clean'}
                  {git.ahead || git.behind ? ` · ↑${git.ahead ?? 0} ↓${git.behind ?? 0}` : ''}
                </div>
                <pre className="lf-pre">
                  {(git.statusLines.slice(0, 12) || []).join('\n') || '(no status lines)'}
                </pre>
                <pre className="lf-pre">{git.recentLog.join('\n') || '(no recent commits)'}</pre>
              </>
            )}
          </div>
        ) : (
          <p className="lf-meta">No git snapshot yet.</p>
        )}
      </div>
    </div>
  )
}
