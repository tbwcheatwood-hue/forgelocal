import { useAppStore } from '../../stores/appStore'

export function TitleBar() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const openProject = useAppStore((s) => s.openProject)
  const saveActive = useAppStore((s) => s.saveActive)
  const setShow = useAppStore((s) => s.setShow)
  const showAi = useAppStore((s) => s.showAi)
  const showTerminal = useAppStore((s) => s.showTerminal)
  const showCanvas = useAppStore((s) => s.showCanvas)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const refreshLm = useAppStore((s) => s.refreshLm)

  return (
    <header className="titlebar" role="banner">
      <div className="brand" aria-label="ForgeLocal">
        <span className="brand-mark" />
        <span>ForgeLocal</span>
      </div>
      <div className="workspace-path" title={workspaceRoot ?? undefined}>
        {workspaceRoot ?? 'No project open'}
      </div>
      <div className="titlebar-actions">
        <span className="status-pill" title={lmStatus?.message}>
          <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
          LM Studio
        </span>
        <button className="btn" onClick={() => openProject()}>
          Open
        </button>
        <button className="btn" onClick={() => saveActive()}>
          Save
        </button>
        <button className="btn" onClick={() => setShow('showAi', !showAi)}>
          AI
        </button>
        <button className="btn" onClick={() => setShow('showTerminal', !showTerminal)}>
          Terminal
        </button>
        <button className="btn" onClick={() => setShow('showCanvas', !showCanvas)}>
          Canvas
        </button>
        <button className="btn" onClick={() => setShow('showCatalog', true)}>
          Tools
        </button>
        <button className="btn" onClick={() => setShow('showSettings', true)}>
          Settings
        </button>
        <button className="btn ghost" onClick={() => refreshLm()}>
          Reconnect
        </button>
      </div>
    </header>
  )
}
