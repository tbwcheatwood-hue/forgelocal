import { useEffect, useRef } from 'react'
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useAppStore } from '../../stores/appStore'
import { ensureForgeMonacoTheme, monaco as monacoEditor } from '../../lib/monacoSetup'
import { RadialMenu } from '../Canvas/RadialMenu'
import { GhostLayer } from '../DiffReview/GhostLayer'

const beforeMount: BeforeMount = (monaco) => {
  ensureForgeMonacoTheme(monaco)
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
  const setSelectionText = useAppStore((s) => s.setSelectionText)
  const fontSize = useAppStore((s) => s.settings.fontSize)
  const session = useAppStore((s) => s.session)

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const decoRef = useRef<string[]>([])
  const holdTimer = useRef<number | null>(null)

  const active = openFiles.find((f) => f.path === activePath)
  const hasPendingGhost = Boolean(
    session?.messages.some((m) => m.proposedEdits?.some((e) => e.status === 'pending'))
  )

  const applyDimming = (ed: MonacoEditor.IStandaloneCodeEditor) => {
    const model = ed.getModel()
    if (!model) return
    if (!syntaxDimming) {
      decoRef.current = ed.deltaDecorations(decoRef.current, [])
      return
    }
    const sel = ed.getSelection()
    if (!sel || sel.isEmpty()) {
      decoRef.current = ed.deltaDecorations(decoRef.current, [])
      return
    }
    const start = Math.min(sel.startLineNumber, sel.endLineNumber)
    const end = Math.max(sel.startLineNumber, sel.endLineNumber)
    const lineCount = model.getLineCount()
    const ranges: MonacoEditor.IModelDeltaDecoration[] = []
    if (start > 1) {
      ranges.push({
        range: new monacoEditor.Range(1, 1, start - 1, 1),
        options: { isWholeLine: true, className: 'forge-dim-line' }
      })
    }
    if (end < lineCount) {
      ranges.push({
        range: new monacoEditor.Range(end + 1, 1, lineCount, model.getLineMaxColumn(lineCount)),
        options: { isWholeLine: true, className: 'forge-dim-line' }
      })
    }
    ranges.push({
      range: new monacoEditor.Range(start, 1, end, model.getLineMaxColumn(end)),
      options: { isWholeLine: true, className: 'forge-focus-line' }
    })
    decoRef.current = ed.deltaDecorations(decoRef.current, ranges)
  }

  const onMount: OnMount = (ed) => {
    editorRef.current = ed
    ed.onDidChangeCursorSelection(() => {
      const model = ed.getModel()
      const sel = ed.getSelection()
      if (model && sel) {
        setSelectionText(model.getValueInRange(sel))
      }
      applyDimming(ed)
    })
  }

  useEffect(() => {
    if (editorRef.current) applyDimming(editorRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syntaxDimming, activePath])

  if (showCanvas) {
    return null
  }

  if (!active) {
    return (
      <div className="editor-empty">
        <div className="editor-empty-inner">
          <h2>Open a file</h2>
          <p>
            Choose something from the tree, mark context for the assistant, or open the canvas map.
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
        className={`editor-host ${syntaxDimming ? 'syntax-dim' : ''} ${hasPendingGhost ? 'has-ghost' : ''}`}
        onContextMenu={(e) => {
          e.preventDefault()
          setRadialOpen(true, { x: e.clientX - 90, y: e.clientY - 90 })
        }}
        onMouseDown={() => {
          if (holdTimer.current) window.clearTimeout(holdTimer.current)
          holdTimer.current = window.setTimeout(() => {
            const ed = editorRef.current
            if (!ed) return
            const dom = ed.getDomNode()?.getBoundingClientRect()
            setRadialOpen(true, {
              x: (dom?.left ?? 120) + 80,
              y: (dom?.top ?? 120) + 80
            })
          }, 450)
        }}
        onMouseUp={() => {
          if (holdTimer.current) window.clearTimeout(holdTimer.current)
        }}
        onMouseLeave={() => {
          if (holdTimer.current) window.clearTimeout(holdTimer.current)
        }}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
            e.preventDefault()
            setRadialOpen(true, { x: 120, y: 160 })
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
          onMount={onMount}
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
        {hasPendingGhost && <GhostLayer />}
        <RadialMenu />
      </div>
    </div>
  )
}
