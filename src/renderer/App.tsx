import { useEffect } from 'react'
import { TitleBar } from './components/Layout/TitleBar'
import { StatusBar } from './components/Layout/StatusBar'
import { FileTree } from './components/FileTree/FileTree'
import { EditorPane } from './components/Editor/EditorPane'
import { ChatPanel } from './components/Chat/ChatPanel'
import { TerminalPanel } from './components/Terminal/TerminalPanel'
import { CatalogModal } from './components/Catalog/CatalogModal'
import { SettingsModal } from './components/Settings/SettingsModal'
import { Welcome } from './components/Welcome/Welcome'
import { CanvasView } from './components/Canvas/CanvasView'
import { useAppStore } from './stores/appStore'

export default function App() {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const showAi = useAppStore((s) => s.showAi)
  const showCanvas = useAppStore((s) => s.showCanvas)
  const error = useAppStore((s) => s.error)
  const setShow = useAppStore((s) => s.setShow)
  const openProject = useAppStore((s) => s.openProject)
  const saveActive = useAppStore((s) => s.saveActive)
  const setError = useAppStore((s) => s.setError)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const offs = [
      window.forge.onMenu('open-project', () => void openProject()),
      window.forge.onMenu('save', () => void saveActive()),
      window.forge.onMenu('toggle-ai', () => setShow('showAi', !useAppStore.getState().showAi)),
      window.forge.onMenu('toggle-terminal', () =>
        setShow('showTerminal', !useAppStore.getState().showTerminal)
      ),
      window.forge.onMenu('catalog', () => setShow('showCatalog', true)),
      window.forge.onMenu('lm-help', () => setShow('showSettings', true))
    ]
    return () => offs.forEach((off) => off())
  }, [openProject, saveActive, setShow])

  return (
    <div className="app-shell">
      <TitleBar />
      {!workspaceRoot ? (
        <Welcome />
      ) : (
        <div className={`main-grid ${showAi ? '' : 'no-ai'}`}>
          <aside className="panel" aria-label="File tree">
            <div className="panel-header">
              <span>Files</span>
            </div>
            <div className="panel-body">
              <FileTree />
            </div>
          </aside>
          <section className="center-column" aria-label="Editor">
            {showCanvas ? <CanvasView /> : <EditorPane />}
            <TerminalPanel />
          </section>
          {showAi && <ChatPanel />}
        </div>
      )}
      <StatusBar />
      <CatalogModal />
      <SettingsModal />
      {error && (
        <div
          className="modal-backdrop"
          style={{ background: 'transparent', placeItems: 'end', padding: 16 }}
          onClick={() => setError(null)}
        >
          <div
            className="error-state"
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--danger)',
              borderRadius: 8
            }}
          >
            {error}
          </div>
        </div>
      )}
    </div>
  )
}
