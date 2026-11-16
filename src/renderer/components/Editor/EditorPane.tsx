import Editor from '@monaco-editor/react'
import { useAppStore } from '../../stores/appStore'
import { RadialMenu } from '../Canvas/RadialMenu'

export function EditorPane() {
  const openFiles = useAppStore((s) => s.openFiles)
  const activePath = useAppStore((s) => s.activePath)
  const setActive = useAppStore((s) => s.setActive)
  const closeFile = useAppStore((s) => s.closeFile)
  const updateFileContent = useAppStore((s) => s.updateFileContent)
  const syntaxDimming = useAppStore((s) => s.syntaxDimming)
  const showCanvas = useAppStore((s) => s.showCanvas)
  const setRadialOpen = useAppStore((s) => s.setRadialOpen)
  const fontSize = useAppStore((s) => s.settings.fontSize)

  const active = openFiles.find((f) => f.path === activePath)

  if (showCanvas) {
    return null
  }

  if (!active) {
    return (
      <div className="empty-state">
        <p>No file open.</p>
        <p>Select a file from the tree or add context for the AI assistant.</p>
      </div>
    )
  }

  return (
    <div className="editor-area">
      <div className="tabs" role="tablist" aria-label="Open files">
        {openFiles.map((file) => (
          <div
            key={file.path}
            className={`tab ${file.path === activePath ? 'active' : ''}`}
            role="tab"
            aria-selected={file.path === activePath}
            onClick={() => setActive(file.path)}
          >
            <span className={file.dirty ? 'dirty' : undefined}>
              {file.dirty ? '● ' : ''}
              {file.relativePath.split('/').pop()}
            </span>
            <button
              className="close"
              aria-label={`Close ${file.relativePath}`}
              onClick={(e) => {
                e.stopPropagation()
                closeFile(file.path)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div
        className={`editor-host ${syntaxDimming ? 'syntax-dim' : ''}`}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
            e.preventDefault()
            setRadialOpen(true)
          }
        }}
      >
        <Editor
          key={active.path}
          height="100%"
          theme="vs-dark"
          language={active.language}
          value={active.content}
          onChange={(value) => updateFileContent(active.path, value ?? '')}
          options={{
            fontSize,
            fontFamily: 'IBM Plex Mono, Cascadia Code, Fira Code, ui-monospace, monospace',
            fontLigatures: true,
            minimap: { enabled: false },
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2
          }}
        />
        <RadialMenu />
      </div>
    </div>
  )
}
