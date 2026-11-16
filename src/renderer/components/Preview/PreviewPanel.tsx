import { useState } from 'react'
import { stackSupportsBrowserPreview } from '@shared/workspaceLayout'
import { useAppStore } from '../../stores/appStore'

export function PreviewPanel({ embedded = false }: { embedded?: boolean }) {
  const settings = useAppStore((s) => s.settings)
  const previewUrl = useAppStore((s) => s.previewUrl)
  const previewRoot = useAppStore((s) => s.previewRoot)
  const previewStatus = useAppStore((s) => s.previewStatus)
  const previewMessage = useAppStore((s) => s.previewMessage)
  const projectPlan = useAppStore((s) => s.projectPlan)
  const startPreview = useAppStore((s) => s.startPreview)
  const stopPreview = useAppStore((s) => s.stopPreview)
  const setShow = useAppStore((s) => s.setShow)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [dir, setDir] = useState(settings.previewDir || '.')
  const [busy, setBusy] = useState(false)

  const featureOn = settings.enabledTools['optional-workspace-preview'] !== false
  const stack = projectPlan?.stack
  const browserOk = stackSupportsBrowserPreview(stack)

  const onStart = async () => {
    setBusy(true)
    try {
      await updateSettings({ previewDir: dir.trim() || '.' })
      await startPreview(dir.trim() || '.')
    } finally {
      setBusy(false)
    }
  }

  const status = busy || previewStatus === 'loading' ? 'loading' : previewStatus
  const statusLabel =
    status === 'loading'
      ? 'Starting preview…'
      : status === 'success'
        ? 'Live'
        : status === 'error'
          ? 'Error'
          : status === 'unsupported'
            ? 'Unavailable'
            : 'Idle'

  return (
    <div
      className={`lf-preview${embedded ? ' embedded' : ''}`}
      role="region"
      aria-label="Workspace preview"
      aria-busy={status === 'loading'}
    >
      <div className="lf-preview-bar">
        <strong>Preview</strong>
        <span className={`lf-preview-status status-${status}`} aria-live="polite">
          {statusLabel}
        </span>
        <input
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          aria-label="Preview directory"
          placeholder="."
          disabled={!featureOn || !browserOk}
        />
        <button
          className="btn primary"
          type="button"
          disabled={busy || !featureOn || !browserOk}
          onClick={() => void onStart()}
        >
          {busy || status === 'loading' ? 'Starting…' : previewUrl ? 'Refresh' : 'Start'}
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={!previewUrl}
          onClick={() => void stopPreview()}
        >
          Stop
        </button>
        {!embedded && (
          <button className="btn ghost" type="button" onClick={() => setShow('showPreview', false)}>
            Close
          </button>
        )}
      </div>

      {!featureOn && (
        <div className="error-state" style={{ margin: 8 }} role="status">
          Workspace preview is disabled in the Tools catalog.
        </div>
      )}

      {featureOn && !browserOk && (
        <div className="lf-preview-empty" role="status">
          <strong>No browser preview for this stack</strong>
          <p>
            {previewMessage ||
              (stack === 'node-cli'
                ? 'Node CLI projects run in the Console (npm start / node), not in the iframe preview.'
                : 'This project type cannot be served as a static loopback preview.')}
          </p>
        </div>
      )}

      {featureOn && browserOk && status === 'loading' && (
        <div className="lf-preview-empty" role="status">
          Starting loopback preview…
        </div>
      )}

      {featureOn && browserOk && status === 'error' && (
        <div className="error-state" style={{ margin: 8 }} role="alert">
          {previewMessage || 'Preview failed to start.'}
          <div style={{ marginTop: 8 }}>
            <button className="btn primary" type="button" onClick={() => void onStart()}>
              Retry
            </button>
          </div>
        </div>
      )}

      {featureOn && browserOk && previewUrl && status === 'success' ? (
        <>
          <div className="lf-preview-meta">
            Serving {previewRoot || dir} · <a href={previewUrl}>{previewUrl}</a>
          </div>
          <iframe title="Workspace preview" src={previewUrl} className="lf-preview-frame" />
        </>
      ) : null}

      {featureOn && browserOk && !previewUrl && status === 'idle' && (
        <div className="lf-preview-empty" role="status">
          Start a loopback static preview of a folder inside the project (e.g. <code>.</code> or{' '}
          <code>dist</code>). Path-jailed — no LAN bind. Generated static apps auto-start after
          Create.
        </div>
      )}
    </div>
  )
}
