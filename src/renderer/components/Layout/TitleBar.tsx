import { resetWorkspaceLayout } from '@shared/workspaceLayout'
import { useAppStore } from '../../stores/appStore'

export function TitleBar() {
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const openProject = useAppStore((s) => s.openProject)
  const openProjectWizard = useAppStore((s) => s.openProjectWizard)
  const saveActive = useAppStore((s) => s.saveActive)
  const setShow = useAppStore((s) => s.setShow)
  const showAi = useAppStore((s) => s.showAi)
  const showTerminal = useAppStore((s) => s.showTerminal)
  const showCanvas = useAppStore((s) => s.showCanvas)
  const showPreview = useAppStore((s) => s.showPreview)
  const showProjectPanel = useAppStore((s) => s.showProjectPanel)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const refreshLm = useAppStore((s) => s.refreshLm)
  const updateWorkspaceLayout = useAppStore((s) => s.updateWorkspaceLayout)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const resetLayout = () => {
    const next = resetWorkspaceLayout()
    updateWorkspaceLayout(next)
    void updateSettings({ workspaceLayout: next })
  }

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
        <span className="status-line" title={lmStatus?.message}>
          <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
          <span>LM Studio</span>
        </span>
        <button className="btn ghost" onClick={() => openProjectWizard()}>
          New
        </button>
        <button className="btn ghost" onClick={() => openProject()}>
          Open
        </button>
        <button className="btn ghost" onClick={() => saveActive()}>
          Save
        </button>
        {workspaceRoot && (
          <button
            className={`btn ${showProjectPanel ? '' : 'ghost'}`}
            onClick={() => setShow('showProjectPanel', !showProjectPanel)}
          >
            Project
          </button>
        )}
        <button
          className={`btn ${showAi ? '' : 'ghost'}`}
          onClick={() => setShow('showAi', !showAi)}
        >
          AI
        </button>
        <button
          className={`btn ${showPreview ? '' : 'ghost'}`}
          onClick={() => setShow('showPreview', !showPreview)}
          title="Show preview panel"
        >
          Preview
        </button>
        <button
          className={`btn ${showTerminal ? '' : 'ghost'}`}
          onClick={() => setShow('showTerminal', !showTerminal)}
        >
          Term
        </button>
        <button
          className={`btn ${showCanvas ? '' : 'ghost'}`}
          onClick={() => setShow('showCanvas', !showCanvas)}
        >
          Canvas
        </button>
        {workspaceRoot && (
          <button
            className="btn ghost"
            onClick={resetLayout}
            title="Reset dockable layout (Alt+Shift+R)"
          >
            Layout
          </button>
        )}
        <button className="btn ghost" onClick={() => setShow('showCatalog', true)}>
          Tools
        </button>
        <button className="btn ghost" onClick={() => setShow('showSettings', true)}>
          Settings
        </button>
        <button className="btn ghost" onClick={() => refreshLm()} title="Reconnect LM Studio">
          Reconnect
        </button>
      </div>
    </header>
  )
}
