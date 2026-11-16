import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'

export function PreviewPanel() {
  const settings = useAppStore((s) => s.settings)
  const previewUrl = useAppStore((s) => s.previewUrl)
  const previewRoot = useAppStore((s) => s.previewRoot)
  const startPreview = useAppStore((s) => s.startPreview)
  const stopPreview = useAppStore((s) => s.stopPreview)
  const setShow = useAppStore((s) => s.setShow)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [dir, setDir] = useState(settings.previewDir || '.')
  const [busy, setBusy] = useState(false)

  const featureOn = settings.enabledTools['optional-workspace-preview'] !== false

  const onStart = async () => {
    setBusy(true)
    try {
      await updateSettings({ previewDir: dir.trim() || '.' })
      await startPreview(dir.trim() || '.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lf-preview" role="region" aria-label="Workspace preview">
      <div className="lf-preview-bar">
        <strong>Preview</strong>
        <input
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          aria-label="Preview directory"
          placeholder="."
          disabled={!featureOn}
        />
        <button
          className="btn primary"
          type="button"
          disabled={busy || !featureOn}
          onClick={() => void onStart()}
        >
          {busy ? 'Starting…' : previewUrl ? 'Restart' : 'Start'}
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={!previewUrl}
          onClick={() => void stopPreview()}
        >
          Stop
        </button>
        <button className="btn ghost" type="button" onClick={() => setShow('showPreview', false)}>
          Close
        </button>
      </div>
      {!featureOn && (
        <div className="error-state" style={{ margin: 8 }}>
          Workspace preview is disabled in the Tools catalog.
        </div>
      )}
      {previewUrl ? (
        <>
          <div className="lf-preview-meta">
            Serving {previewRoot || dir} · <a href={previewUrl}>{previewUrl}</a>
          </div>
          <iframe title="Workspace preview" src={previewUrl} className="lf-preview-frame" />
        </>
      ) : (
        <div className="lf-preview-empty">
          Start a loopback static preview of a folder inside the project (e.g. <code>.</code> or{' '}
          <code>dist</code>). Companion-style path jail — no LAN bind.
        </div>
      )}
    </div>
  )
}
