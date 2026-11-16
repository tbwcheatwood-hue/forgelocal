import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores/appStore'

export function ProjectPanel() {
  const show = useAppStore((s) => s.showProjectPanel)
  const setShow = useAppStore((s) => s.setShow)
  const checkpoints = useAppStore((s) => s.checkpoints)
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const refreshCheckpoints = useAppStore((s) => s.refreshCheckpoints)
  const createProjectCheckpoint = useAppStore((s) => s.createProjectCheckpoint)
  const restoreProjectCheckpoint = useAppStore((s) => s.restoreProjectCheckpoint)
  const exportOpenProject = useAppStore((s) => s.exportOpenProject)
  const openProjectWizard = useAppStore((s) => s.openProjectWizard)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (show && workspaceRoot) void refreshCheckpoints()
  }, [show, workspaceRoot, refreshCheckpoints])

  if (!show || !workspaceRoot) return null

  const onCheckpoint = async () => {
    setBusy(true)
    try {
      await createProjectCheckpoint(label || undefined)
      setLabel('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="project-panel" role="region" aria-label="Project checkpoints and export">
      <div className="project-panel-header">
        <strong>Project</strong>
        <button className="btn ghost" onClick={() => setShow('showProjectPanel', false)}>
          Close
        </button>
      </div>
      <div className="project-panel-body">
        <p className="project-panel-lead">
          Snapshot the workspace under <code>.forgelocal/checkpoints</code>, restore a prior
          snapshot, or export a zip. Generate another starter anytime.
        </p>

        <div className="project-panel-actions">
          <button className="btn" disabled={busy} onClick={() => void onCheckpoint()}>
            {busy ? 'Saving…' : 'Checkpoint now'}
          </button>
          <button className="btn" onClick={() => void exportOpenProject()}>
            Export zip
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setShow('showProjectPanel', false)
              openProjectWizard()
            }}
          >
            New AI project
          </button>
        </div>

        <label className="field">
          <span>Checkpoint label (optional)</span>
          <input
            value={label}
            placeholder="Before refactor"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>

        <div className="label">Checkpoints</div>
        {checkpoints.length === 0 ? (
          <p className="muted">No checkpoints yet.</p>
        ) : (
          <ul className="checkpoint-list">
            {checkpoints.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{c.label}</strong>
                  <span>
                    {new Date(c.createdAt).toLocaleString()} · {c.fileCount} files
                  </span>
                </div>
                <button className="btn ghost" onClick={() => void restoreProjectCheckpoint(c.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
