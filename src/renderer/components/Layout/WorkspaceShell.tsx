import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react'
import {
  movePanelToZone,
  panelsInZone,
  resetWorkspaceLayout,
  setBottomHeight,
  setColumnWidth,
  setPanelMinimized,
  toggleMaximize,
  WORKSPACE_PANEL_LABELS,
  type WorkspacePanelId,
  type WorkspaceZone
} from '@shared/workspaceLayout'
import { useAppStore } from '../../stores/appStore'
import { FileTree } from '../FileTree/FileTree'
import { EditorPane } from '../Editor/EditorPane'
import { ChatPanel } from '../Chat/ChatPanel'
import { TerminalPanel } from '../Terminal/TerminalPanel'
import { PreviewPanel } from '../Preview/PreviewPanel'
import { CanvasView } from '../Canvas/CanvasView'
import { ToolDock } from './ToolDock'

const DRAG_MIME = 'application/x-forgelocal-panel'

function PanelChrome({
  id,
  children,
  onDragStart
}: {
  id: WorkspacePanelId
  children: ReactNode
  onDragStart: (id: WorkspacePanelId) => void
}) {
  const layout = useAppStore((s) => s.settings.workspaceLayout)
  const updateLayout = useAppStore((s) => s.updateWorkspaceLayout)
  const panel = layout.panels.find((p) => p.id === id)
  const maximized = layout.maximized === id
  const label = WORKSPACE_PANEL_LABELS[id]

  if (!panel) return null
  if (panel.minimized && !maximized) {
    return (
      <button
        type="button"
        className="ws-panel-chip"
        aria-label={`Restore ${label}`}
        onClick={() => updateLayout(setPanelMinimized(layout, id, false))}
      >
        {label}
      </button>
    )
  }

  return (
    <section
      className={`ws-panel ${maximized ? 'maximized' : ''}`}
      aria-label={label}
      data-panel={id}
    >
      <header
        className="ws-panel-header"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, id)
          e.dataTransfer.effectAllowed = 'move'
          onDragStart(id)
        }}
      >
        <span className="ws-panel-title">{label}</span>
        <div className="ws-panel-actions">
          <button
            type="button"
            className="btn ghost ws-icon-btn"
            aria-label={`Minimize ${label}`}
            title="Minimize"
            onClick={() => updateLayout(setPanelMinimized(layout, id, true))}
          >
            –
          </button>
          <button
            type="button"
            className="btn ghost ws-icon-btn"
            aria-label={maximized ? `Restore ${label}` : `Maximize ${label}`}
            title={maximized ? 'Restore' : 'Maximize'}
            onClick={() => updateLayout(toggleMaximize(layout, id))}
          >
            {maximized ? '❐' : '□'}
          </button>
        </div>
      </header>
      <div className="ws-panel-body">{children}</div>
    </section>
  )
}

function DropZone({
  zone,
  active,
  onDropPanel,
  children,
  style,
  className
}: {
  zone: WorkspaceZone
  active: boolean
  onDropPanel: (zone: WorkspaceZone, panelId: WorkspacePanelId) => void
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <div
      className={`ws-zone ws-zone-${zone} ${active ? 'drop-active' : ''} ${className ?? ''}`}
      style={style}
      data-zone={zone}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes(DRAG_MIME)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData(DRAG_MIME) as WorkspacePanelId
        if (id) onDropPanel(zone, id)
      }}
    >
      {children}
    </div>
  )
}

export function WorkspaceShell() {
  const layout = useAppStore((s) => s.settings.workspaceLayout)
  const updateLayout = useAppStore((s) => s.updateWorkspaceLayout)
  const showCanvas = useAppStore((s) => s.showCanvas)
  const [dragging, setDragging] = useState<WorkspacePanelId | null>(null)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persist = useCallback(
    (next: typeof layout) => {
      updateLayout(next)
      if (persistTimer.current) clearTimeout(persistTimer.current)
      persistTimer.current = setTimeout(() => {
        void useAppStore.getState().updateSettings({ workspaceLayout: next })
      }, 250)
    },
    [updateLayout]
  )

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable)
        return
      // Alt+Shift+R — reset layout
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        const next = resetWorkspaceLayout()
        persist(next)
        return
      }
      // Alt+1..5 focus/restore panels
      const map: Record<string, WorkspacePanelId> = {
        '1': 'explorer',
        '2': 'editor',
        '3': 'preview',
        '4': 'chat',
        '5': 'console'
      }
      if (e.altKey && !e.shiftKey && map[e.key]) {
        e.preventDefault()
        const id = map[e.key]
        const next = setPanelMinimized(layout, id, false)
        next.maximized = null
        persist(next)
        const el = document.querySelector(`[data-panel="${id}"]`) as HTMLElement | null
        el?.focus?.()
        el?.scrollIntoView({ block: 'nearest' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layout, persist])

  const onDropPanel = useCallback(
    (zone: WorkspaceZone, panelId: WorkspacePanelId) => {
      persist(movePanelToZone(layout, panelId, zone))
      setDragging(null)
    },
    [layout, persist]
  )

  const renderPanel = (id: WorkspacePanelId) => {
    let body: ReactNode = null
    switch (id) {
      case 'explorer':
        body = <FileTree />
        break
      case 'editor':
        body = showCanvas ? <CanvasView /> : <EditorPane />
        break
      case 'preview':
        body = <PreviewPanel embedded />
        break
      case 'chat':
        body = <ChatPanel />
        break
      case 'console':
        body = <TerminalPanel forceShow />
        break
      default:
        body = null
    }
    return (
      <PanelChrome key={id} id={id} onDragStart={setDragging}>
        {body}
      </PanelChrome>
    )
  }

  const maximized = layout.maximized
  const left = panelsInZone(layout, 'left')
  const center = panelsInZone(layout, 'center')
  const right = panelsInZone(layout, 'right')
  const bottom = panelsInZone(layout, 'bottom')

  const hasBottomVisible = useMemo(
    () =>
      bottom.some((p) => !p.minimized) ||
      Boolean(maximized && bottom.some((p) => p.id === maximized)),
    [bottom, maximized]
  )

  if (maximized) {
    return (
      <div className="ws-shell maximized-mode" role="main" aria-label="Workspace">
        <div className="ws-toolbar">
          <button
            type="button"
            className="btn ghost"
            onClick={() => persist({ ...layout, maximized: null })}
          >
            Exit maximize
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => persist(resetWorkspaceLayout())}
            title="Alt+Shift+R"
          >
            Reset layout
          </button>
        </div>
        {renderPanel(maximized)}
      </div>
    )
  }

  return (
    <div className="ws-shell" role="main" aria-label="Workspace">
      <div className="ws-toolbar">
        <span className="ws-toolbar-hint">
          Drag panel titles to dock · Alt+1–5 panels · Alt+Shift+R reset
        </span>
        <button
          type="button"
          className="btn ghost"
          onClick={() => persist(resetWorkspaceLayout())}
          title="Reset layout (Alt+Shift+R)"
        >
          Reset layout
        </button>
      </div>

      <div
        className={`ws-columns ${dragging ? 'dragging' : ''}`}
        style={
          {
            '--ws-left': `${layout.columnWidths.left}px`,
            '--ws-right': `${layout.columnWidths.right}px`,
            '--ws-bottom': hasBottomVisible ? `${layout.bottomHeight}px` : '0px'
          } as CSSProperties
        }
      >
        <DropZone zone="left" active={dragging != null} onDropPanel={onDropPanel}>
          {left.map((p) => renderPanel(p.id))}
        </DropZone>

        <div
          className="ws-splitter vertical"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize left column"
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startW = layout.columnWidths.left
            const onMove = (ev: PointerEvent) => {
              persist(setColumnWidth(layout, 'left', startW + (ev.clientX - startX)))
            }
            const onUp = () => {
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft')
              persist(setColumnWidth(layout, 'left', layout.columnWidths.left - 16))
            if (e.key === 'ArrowRight')
              persist(setColumnWidth(layout, 'left', layout.columnWidths.left + 16))
          }}
        />

        <DropZone
          zone="center"
          active={dragging != null}
          onDropPanel={onDropPanel}
          className="ws-center"
        >
          {center.map((p) => renderPanel(p.id))}
        </DropZone>

        <div
          className="ws-splitter vertical"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize right column"
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startW = layout.columnWidths.right
            const onMove = (ev: PointerEvent) => {
              persist(setColumnWidth(layout, 'right', startW - (ev.clientX - startX)))
            }
            const onUp = () => {
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft')
              persist(setColumnWidth(layout, 'right', layout.columnWidths.right + 16))
            if (e.key === 'ArrowRight')
              persist(setColumnWidth(layout, 'right', layout.columnWidths.right - 16))
          }}
        />

        <DropZone zone="right" active={dragging != null} onDropPanel={onDropPanel}>
          {right.map((p) => renderPanel(p.id))}
        </DropZone>
      </div>

      {hasBottomVisible && (
        <>
          <div
            className="ws-splitter horizontal"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize console"
            tabIndex={0}
            onPointerDown={(e) => {
              e.preventDefault()
              const startY = e.clientY
              const startH = layout.bottomHeight
              const onMove = (ev: PointerEvent) => {
                persist(setBottomHeight(layout, startH - (ev.clientY - startY)))
              }
              const onUp = () => {
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
              }
              window.addEventListener('pointermove', onMove)
              window.addEventListener('pointerup', onUp)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') persist(setBottomHeight(layout, layout.bottomHeight + 16))
              if (e.key === 'ArrowDown') persist(setBottomHeight(layout, layout.bottomHeight - 16))
            }}
          />
          <DropZone
            zone="bottom"
            active={dragging != null}
            onDropPanel={onDropPanel}
            className="ws-bottom"
            style={{ height: layout.bottomHeight }}
          >
            {bottom.map((p) => renderPanel(p.id))}
          </DropZone>
        </>
      )}

      {!hasBottomVisible && (
        <div className="ws-bottom-collapsed">
          {bottom.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ws-panel-chip"
              onClick={() => persist(setPanelMinimized(layout, p.id, false))}
            >
              Show {WORKSPACE_PANEL_LABELS[p.id]}
            </button>
          ))}
        </div>
      )}

      <ToolDock />
    </div>
  )
}
