import { useMemo, useState } from 'react'
import type { FileNode } from '@shared/types'
import { useAppStore } from '../../stores/appStore'

function flattenFiles(node: FileNode | null, acc: FileNode[] = []): FileNode[] {
  if (!node) return acc
  if (!node.isDirectory) acc.push(node)
  node.children?.forEach((c) => flattenFiles(c, acc))
  return acc
}

export function CanvasView() {
  const showCanvas = useAppStore((s) => s.showCanvas)
  const tree = useAppStore((s) => s.tree)
  const openFile = useAppStore((s) => s.openFile)
  const activePath = useAppStore((s) => s.activePath)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 40, y: 40 })

  const files = useMemo(() => flattenFiles(tree).slice(0, 48), [tree])

  if (!showCanvas) return null

  return (
    <div className="canvas-view" role="region" aria-label="Infinite canvas">
      <div style={{ position: 'absolute', zIndex: 2, top: 10, left: 10, display: 'flex', gap: 8 }}>
        <button className="btn" onClick={() => setScale((s) => Math.min(1.8, s + 0.1))}>
          Zoom +
        </button>
        <button className="btn" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}>
          Zoom −
        </button>
        <button className="btn" onClick={() => setOffset({ x: 40, y: 40 })}>
          Reset lens
        </button>
      </div>
      <div
        className="canvas-surface"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        onMouseDown={(e) => {
          const startX = e.clientX
          const startY = e.clientY
          const origin = { ...offset }
          const move = (ev: MouseEvent) => {
            setOffset({
              x: origin.x + (ev.clientX - startX),
              y: origin.y + (ev.clientY - startY)
            })
          }
          const up = () => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      >
        {files.map((file, i) => {
          const col = i % 6
          const row = Math.floor(i / 6)
          return (
            <button
              key={file.path}
              className={`sat-card ${activePath === file.path ? 'focused' : ''}`}
              style={{ left: col * 190, top: row * 110 }}
              onClick={() => openFile(file.path)}
            >
              <div className="name">{file.name}</div>
              <div style={{ color: 'var(--text-faint)', fontSize: 11, marginTop: 4 }}>
                {file.relativePath}
              </div>
            </button>
          )
        })}
        {!files.length && <div className="empty-state">Open a project to populate the canvas.</div>}
      </div>
    </div>
  )
}
