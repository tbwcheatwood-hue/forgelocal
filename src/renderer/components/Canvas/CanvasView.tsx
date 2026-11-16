import { useMemo, useRef, useState } from 'react'
import Editor, { type BeforeMount } from '@monaco-editor/react'
import { useAppStore } from '../../stores/appStore'
import { detectLanguage } from '../../lib/language'
import { flattenFiles, layoutCanvasCards, relatedCards } from '../../lib/canvasLayout'
import { ensureForgeMonacoTheme } from '../../lib/monacoSetup'

const beforeMount: BeforeMount = (monaco) => {
  ensureForgeMonacoTheme(monaco)
}

export function CanvasView() {
  const showCanvas = useAppStore((s) => s.showCanvas)
  const tree = useAppStore((s) => s.tree)
  const openFile = useAppStore((s) => s.openFile)
  const openFiles = useAppStore((s) => s.openFiles)
  const activePath = useAppStore((s) => s.activePath)
  const canvasFocusPath = useAppStore((s) => s.canvasFocusPath)
  const setCanvasFocusPath = useAppStore((s) => s.setCanvasFocusPath)
  const setShow = useAppStore((s) => s.setShow)
  const toggleContext = useAppStore((s) => s.toggleContext)
  const selectedContext = useAppStore((s) => s.selectedContext)

  const [scale, setScale] = useState(0.85)
  const [offset, setOffset] = useState({ x: 24, y: 24 })
  const panning = useRef(false)

  const files = useMemo(() => flattenFiles(tree), [tree])
  const cards = useMemo(() => layoutCanvasCards(files), [files])
  const focusPath = canvasFocusPath ?? activePath
  const focusCard = cards.find((c) => c.path === focusPath) ?? null
  const satellites = focusPath ? relatedCards(cards, focusPath, 5) : []
  const focusOpen = openFiles.find((f) => f.path === focusPath)

  if (!showCanvas) return null

  const openFocusLens = async (path: string) => {
    setCanvasFocusPath(path)
    await openFile(path)
  }

  return (
    <div
      className="canvas-view"
      role="region"
      aria-label="Infinite canvas"
      onWheel={(e) => {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.08 : 0.08
        setScale((s) => Math.min(1.8, Math.max(0.35, s + delta)))
      }}
    >
      <div className="canvas-toolbar">
        <button className="btn ghost" onClick={() => setScale((s) => Math.min(1.8, s + 0.1))}>
          Zoom +
        </button>
        <button className="btn ghost" onClick={() => setScale((s) => Math.max(0.35, s - 0.1))}>
          Zoom −
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            setOffset({ x: 24, y: 24 })
            setScale(0.85)
          }}
        >
          Reset
        </button>
        <span className="canvas-meta">{cards.length} files · scroll to zoom · drag to pan</span>
        {focusCard && (
          <button
            className="btn primary"
            onClick={() => {
              void openFile(focusCard.path)
              setShow('showCanvas', false)
            }}
          >
            Open in editor
          </button>
        )}
      </div>

      <div
        className="canvas-surface"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('.sat-card, .focus-lens, .canvas-toolbar')) return
          panning.current = true
          const startX = e.clientX
          const startY = e.clientY
          const origin = { ...offset }
          const move = (ev: MouseEvent) => {
            if (!panning.current) return
            setOffset({
              x: origin.x + (ev.clientX - startX),
              y: origin.y + (ev.clientY - startY)
            })
          }
          const up = () => {
            panning.current = false
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      >
        {[...new Set(cards.map((c) => c.dir))].map((dir) => {
          const group = cards.filter((c) => c.dir === dir)
          const minX = Math.min(...group.map((c) => c.x))
          const minY = Math.min(...group.map((c) => c.y))
          return (
            <div
              key={dir}
              className="cluster-label"
              style={{ left: minX, top: Math.max(8, minY - 28) }}
            >
              {dir}
            </div>
          )
        })}

        {cards.map((file) => (
          <button
            key={file.path}
            className={`sat-card living ${focusPath === file.path ? 'focused' : ''} ${
              selectedContext.includes(file.path) ? 'in-context' : ''
            }`}
            style={{ left: file.x, top: file.y }}
            onClick={() => void openFocusLens(file.path)}
            onDoubleClick={() => {
              void openFile(file.path)
              setShow('showCanvas', false)
            }}
          >
            <div className="sat-ext">{file.ext || 'file'}</div>
            <div className="name">{file.name}</div>
            <div className="sat-path">{file.relativePath}</div>
          </button>
        ))}
        {!cards.length && <div className="empty-state">Open a project to populate the canvas.</div>}
      </div>

      {focusCard && (
        <div className="focus-lens" role="dialog" aria-label="Focus lens">
          <div className="focus-lens-header">
            <div>
              <div className="focus-title">{focusCard.name}</div>
              <div className="focus-sub">{focusCard.relativePath}</div>
            </div>
            <div className="focus-actions">
              <button
                className="btn ghost"
                onClick={() => toggleContext(focusCard.path)}
                title="Toggle AI context"
              >
                {selectedContext.includes(focusCard.path) ? 'Context ✓' : '+ Context'}
              </button>
              <button className="btn" onClick={() => setCanvasFocusPath(null)}>
                Close lens
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  void openFile(focusCard.path)
                  setShow('showCanvas', false)
                }}
              >
                Edit
              </button>
            </div>
          </div>
          <div className="focus-lens-body">
            <div className="focus-editor">
              {focusOpen ? (
                <Editor
                  height="100%"
                  theme="forgelocal-ember"
                  language={detectLanguage(focusOpen.path)}
                  value={focusOpen.content}
                  beforeMount={beforeMount}
                  options={{
                    readOnly: true,
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                    fontLigatures: true,
                    minimap: { enabled: false },
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    wordWrap: 'on'
                  }}
                />
              ) : (
                <div className="empty-state">Loading focus preview…</div>
              )}
            </div>
            <div className="satellite-rail" aria-label="Related files">
              <div className="rail-label">Satellites</div>
              {satellites.map((s) => (
                <button
                  key={s.path}
                  className="sat-card glass"
                  onClick={() => void openFocusLens(s.path)}
                >
                  <div className="name">{s.name}</div>
                  <div className="sat-path">{s.relativePath}</div>
                </button>
              ))}
              {!satellites.length && (
                <div className="composer-hint">No sibling files in this folder.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
