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
import { PreviewPanel } from './components/Preview/PreviewPanel'
import { ProjectWizard } from './components/Project/ProjectWizard'
import { ProjectPanel } from './components/Project/ProjectPanel'
import { useAppStore } from './stores/appStore'

export default function App() {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const showAi = useAppStore((s) => s.showAi)
  const showCanvas = useAppStore((s) => s.showCanvas)
  const showPreview = useAppStore((s) => s.showPreview)
  const error = useAppStore((s) => s.error)
  const setShow = useAppStore((s) => s.setShow)
  const openProject = useAppStore((s) => s.openProject)
  const openProjectWizard = useAppStore((s) => s.openProjectWizard)
  const saveActive = useAppStore((s) => s.saveActive)
  const setError = useAppStore((s) => s.setError)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    // Demo/automation bridge — used for screenshots and local smoke scripts
    const bridge = window as unknown as {
      __forgeOpenProject?: (path?: string) => Promise<void>
      __forgeOpenFile?: (path: string) => Promise<void>
      __forgeShowCanvas?: (show: boolean) => void
      __forgeInjectGhost?: () => void
    }
    bridge.__forgeOpenProject = (path?: string) => useAppStore.getState().openProject(path)
    bridge.__forgeOpenFile = (path: string) => useAppStore.getState().openFile(path)
    bridge.__forgeShowCanvas = (show: boolean) => useAppStore.getState().setShow('showCanvas', show)
    bridge.__forgeInjectGhost = () => {
      const state = useAppStore.getState()
      const active = state.openFiles.find((f) => f.path === state.activePath)
      if (!active || !state.session) return
      const edit = {
        id: crypto.randomUUID(),
        path: active.path,
        relativePath: active.relativePath,
        originalContent: active.content,
        proposedContent:
          active.content +
          (active.content.endsWith('\n') ? '' : '\n') +
          '// forge: ghost-layer preview checkpoint\n',
        summary: 'Demo ghost proposal (+1 line)',
        status: 'pending' as const
      }
      const messages = [...state.session.messages]
      if (!messages.length) {
        messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Ghost-layer proposal ready for review.',
          createdAt: Date.now(),
          proposedEdits: [edit]
        })
      } else {
        const last = messages[messages.length - 1]
        messages[messages.length - 1] = {
          ...last,
          proposedEdits: [...(last.proposedEdits ?? []), edit]
        }
      }
      useAppStore.setState({
        session: { ...state.session, messages, updatedAt: Date.now() },
        ghostIndex: 0,
        showCanvas: false
      })
    }
  }, [])

  useEffect(() => {
    const offs = [
      window.forge.onMenu('open-project', () => void openProject()),
      window.forge.onMenu('new-ai-project', () => openProjectWizard()),
      window.forge.onMenu('save', () => void saveActive()),
      window.forge.onMenu('toggle-ai', () => setShow('showAi', !useAppStore.getState().showAi)),
      window.forge.onMenu('toggle-terminal', () =>
        setShow('showTerminal', !useAppStore.getState().showTerminal)
      ),
      window.forge.onMenu('catalog', () => setShow('showCatalog', true)),
      window.forge.onMenu('lm-help', () => setShow('showSettings', true))
    ]
    return () => offs.forEach((off) => off())
  }, [openProject, openProjectWizard, saveActive, setShow])

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
          <section
            className={`center-column ${showCanvas ? 'canvas-mode' : ''}`}
            aria-label="Editor"
          >
            {showCanvas ? <CanvasView /> : showPreview ? <PreviewPanel /> : <EditorPane />}
            <TerminalPanel />
          </section>
          {showAi && <ChatPanel />}
        </div>
      )}
      <StatusBar />
      <CatalogModal />
      <SettingsModal />
      <ProjectWizard />
      <ProjectPanel />
      {error && (
        <div
          className="modal-backdrop"
          style={{ background: 'transparent', placeItems: 'end', padding: 16 }}
          onClick={() => setError(null)}
        >
          <div className="toast-error">{error}</div>
        </div>
      )}
    </div>
  )
}
