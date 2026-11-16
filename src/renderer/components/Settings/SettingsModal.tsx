import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'

export function SettingsModal() {
  const show = useAppStore((s) => s.showSettings)
  const setShow = useAppStore((s) => s.setShow)
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const refreshLm = useAppStore((s) => s.refreshLm)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const [baseUrl, setBaseUrl] = useState(settings.provider.baseUrl)
  const [apiKey, setApiKey] = useState(settings.provider.apiKey)
  const [timeoutMs, setTimeoutMs] = useState(String(settings.provider.timeoutMs))
  const [stream, setStream] = useState(settings.provider.stream)
  const [fontSize, setFontSize] = useState(String(settings.fontSize))
  const [allowOutside, setAllowOutside] = useState(settings.allowPathsOutsideWorkspace)

  if (!show) return null

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
          <label>
            LM Studio base URL
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </label>
          <label>
            API key (local placeholder; not a cloud secret)
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
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
            Troubleshooting: ensure LM Studio is running, a model is loaded, and Local Server is
            started on the configured port. ForgeLocal never falls back to remote providers.
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
                  baseUrl: baseUrl.trim() || 'http://localhost:1234/v1',
                  apiKey,
                  timeoutMs: Number(timeoutMs) || 120000,
                  stream
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
