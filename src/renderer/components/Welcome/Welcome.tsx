import { useAppStore } from '../../stores/appStore'

export function Welcome() {
  const openProject = useAppStore((s) => s.openProject)
  const recent = useAppStore((s) => s.settings.recentProjects)
  const refreshLm = useAppStore((s) => s.refreshLm)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const setShow = useAppStore((s) => s.setShow)

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="brand" style={{ marginBottom: 12 }}>
          <span className="brand-mark" />
          <span style={{ fontSize: 18 }}>ForgeLocal</span>
        </div>
        <h1>Local-first coding with LM Studio</h1>
        <p>
          Open a project, connect your local model, attach only the files you choose, and review
          every AI edit before it lands.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => openProject()}>
            Open project
          </button>
          <button className="btn" onClick={() => refreshLm()}>
            Test LM Studio
          </button>
          <button className="btn" onClick={() => setShow('showSettings', true)}>
            Settings
          </button>
        </div>
        <div style={{ marginTop: 16 }} className="status-pill">
          <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
          {lmStatus?.message ?? 'LM Studio not tested yet'}
        </div>
        {recent.length > 0 && (
          <div className="recent-list" aria-label="Recent projects">
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 4 }}>Recent</div>
            {recent.map((p) => (
              <button key={p} onClick={() => openProject(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
