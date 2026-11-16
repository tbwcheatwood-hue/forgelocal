import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { DEFAULT_PROVIDER, DEFAULT_REMOTE_PROVIDER } from '@shared/types'
import type { ProviderMode } from '@shared/types'
import { isRemoteMode } from '@shared/providerTools'

export function SettingsModal() {
  const show = useAppStore((s) => s.showSettings)
  const setShow = useAppStore((s) => s.setShow)
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const refreshLm = useAppStore((s) => s.refreshLm)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const [mode, setMode] = useState<ProviderMode>(settings.provider.mode ?? 'local')
  const [baseUrl, setBaseUrl] = useState(settings.provider.baseUrl)
  const [apiKey, setApiKey] = useState(settings.provider.apiKey)
  const [timeoutMs, setTimeoutMs] = useState(String(settings.provider.timeoutMs))
  const [stream, setStream] = useState(settings.provider.stream)
  const [fontSize, setFontSize] = useState(String(settings.fontSize))
  const [allowOutside, setAllowOutside] = useState(settings.allowPathsOutsideWorkspace)

  if (!show) return null

  const remote = mode === 'remote'

  const switchMode = (next: ProviderMode) => {
    setMode(next)
    if (next === 'remote' && !isRemoteMode(settings.provider)) {
      setBaseUrl(DEFAULT_REMOTE_PROVIDER.baseUrl)
      setApiKey('')
    } else if (next === 'local' && isRemoteMode(settings.provider)) {
      setBaseUrl(DEFAULT_PROVIDER.baseUrl)
      setApiKey(DEFAULT_PROVIDER.apiKey)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setShow('showSettings', false)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 92vw)' }}
      >
        <div className="modal-header">
          <strong>Settings</strong>
          <button className="btn" onClick={() => setShow('showSettings', false)}>
            Close
          </button>
        </div>
        <div className="modal-body settings-grid">
          <fieldset className="provider-mode">
            <legend>Provider mode</legend>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="provider-mode"
                checked={mode === 'local'}
                onChange={() => switchMode('local')}
              />
              Local (LM Studio)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="provider-mode"
                checked={mode === 'remote'}
                onChange={() => switchMode('remote')}
              />
              Remote (OpenAI-compatible)
            </label>
          </fieldset>
          <label>
            {remote ? 'Remote API base URL' : 'LM Studio base URL'}
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </label>
          <label>
            {remote
              ? 'API key (stored locally; never logged)'
              : 'API key (local placeholder; not a cloud secret)'}
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type={remote ? 'password' : 'text'}
              autoComplete="off"
            />
          </label>
          <label>
            Timeout (ms)
            <input value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} />
            Stream responses when available
          </label>
          <label>
            Editor font size
            <input value={fontSize} onChange={(e) => setFontSize(e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={allowOutside}
              onChange={(e) => setAllowOutside(e.target.checked)}
            />
            Allow filesystem paths outside workspace (requires care)
          </label>
          <div className="status-pill" title={lmStatus?.message}>
            <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
            {lmStatus?.message ?? 'Not tested'}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.45 }}>
            {remote ? (
              <>
                Remote mode uses your base URL + API key against an OpenAI-compatible{' '}
                <code>/models</code> and <code>/chat/completions</code> API. ForgeLocal does not
                invent credentials. Online tools/extensions unlock only after a remote model is
                selected. Switching back to Local disables those tools automatically.
              </>
            ) : (
              <>
                Troubleshooting: ensure LM Studio is running, a model is loaded, and Local Server is
                started on the configured port. Local mode never silently falls back to a remote
                provider.
              </>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={() => refreshLm()}>
            Test connection
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await updateSettings({
                fontSize: Number(fontSize) || 14,
                allowPathsOutsideWorkspace: allowOutside,
                provider: {
                  ...settings.provider,
                  mode,
                  baseUrl:
                    baseUrl.trim() ||
                    (mode === 'remote'
                      ? DEFAULT_REMOTE_PROVIDER.baseUrl
                      : DEFAULT_PROVIDER.baseUrl),
                  apiKey,
                  timeoutMs: Number(timeoutMs) || 120000,
                  stream,
                  // Clear model when switching mode so the user picks from the new endpoint
                  model: mode === settings.provider.mode ? settings.provider.model : ''
                }
              })
              setShow('showSettings', false)
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
