import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores/appStore'

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

  if (!showTerminal) return null

  return (
    <div className="terminal-panel" role="region" aria-label="Terminal">
      <div className="terminal-toolbar">
        <strong style={{ fontSize: 12, color: 'var(--text-dim)' }}>Terminal · Command Cards</strong>
        <input
          style={{ flex: 1 }}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Type a command, then Approve to run"
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
        <div className="command-card">
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
            Approval required · {pendingCommand.reason}
          </div>
          <pre style={{ margin: 0, fontFamily: 'var(--font-code)', fontSize: 12 }}>
            {pendingCommand.command}
          </pre>
          <div className="diff-actions">
            <button className="btn primary" onClick={() => approveCommand()}>
              Approve & Run
            </button>
            <button className="btn" onClick={() => rejectCommand()}>
              Reject
            </button>
          </div>
        </div>
      )}
      <div className="terminal-output">
        {terminalLog || 'Ready. AI commands appear as cards and need approval.'}
      </div>
    </div>
  )
}
