import Editor, { loader, type BeforeMount } from '@monaco-editor/react'
import * as monacoEditor from 'monaco-editor'
import { useAppStore } from '../../stores/appStore'
import { RadialMenu } from '../Canvas/RadialMenu'

// Bundle Monaco locally — never fetch the CDN (required for offline Electron).
loader.config({ monaco: monacoEditor })

const beforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('forgelocal-ember', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '756c62', fontStyle: 'italic' },
      { token: 'string', foreground: '7fafa3' },
      { token: 'keyword', foreground: 'e0a06a' },
      { token: 'number', foreground: 'd4b06a' },
      { token: 'type', foreground: 'c9b8a4' }
    ],
    colors: {
      'editor.background': '#0a0908',
      'editor.foreground': '#f3eee6',
      'editorLineNumber.foreground': '#756c62',
      'editorLineNumber.activeForeground': '#a89f93',
      'editorCursor.foreground': '#e0a06a',
      'editor.selectionBackground': '#e0a06a33',
      'editor.inactiveSelectionBackground': '#e0a06a1a',
      'editor.lineHighlightBackground': '#1a171480',
      'editorIndentGuide.background': '#2a251f',
      'editorIndentGuide.activeBackground': '#3a332c',
      'editorWidget.background': '#12100e',
      'editorWidget.border': '#3a332c',
      'input.background': '#0a0908',
      focusBorder: '#e0a06a'
    }
  })
}

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
      <div className="editor-empty">
        <div className="editor-empty-inner">
          <h2>Open a file</h2>
          <p>
            Choose something from the tree, or mark files as AI context when you are ready to ask.
          </p>
        </div>
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
          theme="forgelocal-ember"
          language={active.language}
          value={active.content}
          beforeMount={beforeMount}
          onChange={(value) => updateFileContent(active.path, value ?? '')}
          options={{
            fontSize,
            fontFamily: 'JetBrains Mono, Cascadia Code, Fira Code, ui-monospace, monospace',
            fontLigatures: true,
            minimap: { enabled: false },
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            padding: { top: 12 },
            renderLineHighlight: 'line',
            smoothScrolling: true
          }}
        />
        <RadialMenu />
      </div>
    </div>
  )
}
