import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { ToolDock } from '../Layout/ToolDock'

export function TerminalPanel() {
  const showTerminal = useAppStore((s) => s.showTerminal)
  const terminalLog = useAppStore((s) => s.terminalLog)
  const pendingCommand = useAppStore((s) => s.pendingCommand)
  const approveCommand = useAppStore((s) => s.approveCommand)
  const rejectCommand = useAppStore((s) => s.rejectCommand)
  const proposeCommand = useAppStore((s) => s.proposeCommand)
  const [manual, setManual] = useState('')

  useEffect(() => {
    return window.forge.onTerminalData(({ data }) => {
      useAppStore.setState({
        terminalLog: useAppStore.getState().terminalLog + data
      })
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pendingCommand) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && (e.target as HTMLInputElement).value)) return
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        void approveCommand()
      } else if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('.ghost-layer')) {
        // Ghost layer owns Esc when present; still allow reject here if focus is terminal
        if ((e.target as HTMLElement)?.closest?.('.terminal-panel')) {
          e.preventDefault()
          rejectCommand()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingCommand, approveCommand, rejectCommand])

  if (!showTerminal) {
    return <ToolDock />
  }

  return (
    <div className="terminal-stack">
      <div className="terminal-panel" role="region" aria-label="Terminal">
        <div className="terminal-toolbar">
          <strong>Command Cards</strong>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Stage a command for approval — Enter"
            aria-label="Manual command"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manual.trim()) {
                proposeCommand(manual.trim(), 'Manual command card')
                setManual('')
              }
            }}
          />
        </div>
        {pendingCommand && (
          <div className="command-card glass">
            <div className="command-card-head">
              <span>Approval required</span>
              <span className="composer-hint">{pendingCommand.reason}</span>
            </div>
            <pre>{pendingCommand.command}</pre>
            <div className="diff-actions">
              <button className="btn primary" onClick={() => void approveCommand()}>
                Approve & Run
              </button>
              <button className="btn" onClick={() => rejectCommand()}>
                Reject
              </button>
            </div>
          </div>
        )}
        <div className="terminal-output">
          {terminalLog || 'Ready. AI shell suggestions appear as glass command cards.'}
        </div>
      </div>
      <ToolDock />
    </div>
  )
}
