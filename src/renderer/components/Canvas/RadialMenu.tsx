import type { CSSProperties } from 'react'
import { useAppStore } from '../../stores/appStore'

const ACTIONS: Array<{
  label: string
  intent: 'extract' | 'optimize' | 'tests' | 'explain'
  style: CSSProperties
}> = [
  { label: 'Extract', intent: 'extract', style: { top: 14, left: 54 } },
  { label: 'Optimize', intent: 'optimize', style: { top: 68, right: 8 } },
  { label: 'Tests', intent: 'tests', style: { bottom: 14, left: 60 } },
  { label: 'Explain', intent: 'explain', style: { top: 68, left: 8 } }
]

export function RadialMenu() {
  const open = useAppStore((s) => s.radialOpen)
  const pos = useAppStore((s) => s.radialPos)
  const setRadialOpen = useAppStore((s) => s.setRadialOpen)
  const enabled = useAppStore((s) => s.settings.enabledTools['optional-ambient-radial'] !== false)
  const runIntent = useAppStore((s) => s.runIntent)
  const selectionText = useAppStore((s) => s.selectionText)

  if (!open || !enabled) return null

  const style: CSSProperties = pos
    ? {
        left: Math.min(pos.x, window.innerWidth - 200),
        top: Math.min(pos.y, window.innerHeight - 200)
      }
    : { right: 28, bottom: 96 }

  return (
    <div className="radial-menu" style={style} role="menu" aria-label="Intent radial">
      <button className="radial-core btn ghost" onClick={() => setRadialOpen(false)} title="Close">
        {selectionText ? 'Sel' : 'AI'}
      </button>
      {ACTIONS.map((action) => (
        <button
          key={action.intent}
          className="radial-spoke"
          style={action.style}
          onClick={() => void runIntent(action.intent)}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}
