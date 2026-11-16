import type { CSSProperties } from 'react'
import { useAppStore } from '../../stores/appStore'

export function RadialMenu() {
  const open = useAppStore((s) => s.radialOpen)
  const setRadialOpen = useAppStore((s) => s.setRadialOpen)
  const enabled = useAppStore((s) => s.settings.enabledTools['optional-ambient-radial'])
  const sendPrompt = useAppStore((s) => s.sendPrompt)
  const activePath = useAppStore((s) => s.activePath)
  const toggleContext = useAppStore((s) => s.toggleContext)

  if (!open || !enabled) return null

  const actions = [
    {
      label: 'Explain',
      style: { top: 16, left: 58 },
      run: () => sendPrompt('Explain the selected / active file briefly.')
    },
    {
      label: 'Refactor',
      style: { top: 70, right: 12 },
      run: () =>
        sendPrompt('Propose a safe refactor as a reviewable diff for the attached context.')
    },
    {
      label: 'Tests',
      style: { bottom: 16, left: 64 },
      run: () => sendPrompt('Propose unit tests for the attached context as a new file diff.')
    },
    {
      label: 'Context',
      style: { top: 70, left: 12 },
      run: () => activePath && toggleContext(activePath)
    }
  ]

  return (
    <div className="radial-menu" style={{ right: 24, bottom: 24 }} role="menu">
      <button className="btn ghost" onClick={() => setRadialOpen(false)}>
        Close
      </button>
      {actions.map((action) => (
        <button
          key={action.label}
          style={action.style as CSSProperties}
          onClick={() => {
            action.run()
            setRadialOpen(false)
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}
