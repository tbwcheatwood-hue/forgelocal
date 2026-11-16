import { useMemo, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { DiffReview } from '../DiffReview/DiffReview'

export function ChatPanel() {
  const [prompt, setPrompt] = useState('')
  const session = useAppStore((s) => s.session)
  const openFiles = useAppStore((s) => s.openFiles)
  const selectedContext = useAppStore((s) => s.selectedContext)
  const toggleContext = useAppStore((s) => s.toggleContext)
  const sendPrompt = useAppStore((s) => s.sendPrompt)
  const cancelPrompt = useAppStore((s) => s.cancelPrompt)
  const streaming = useAppStore((s) => s.streaming)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const models = useAppStore((s) => s.models)
  const settings = useAppStore((s) => s.settings)
  const selectModel = useAppStore((s) => s.selectModel)
  const refreshLm = useAppStore((s) => s.refreshLm)
  const decideEdit = useAppStore((s) => s.decideEdit)

  const contextFiles = useMemo(
    () => openFiles.filter((f) => selectedContext.includes(f.path)),
    [openFiles, selectedContext]
  )

  const disconnected = !lmStatus || lmStatus.status !== 'connected'

  return (
    <div
      className="panel"
      style={{ borderLeft: '1px solid var(--border-soft)', borderRight: 'none' }}
    >
      <div className="panel-header">
        <span>AI Assistant</span>
        <button className="btn ghost" onClick={() => refreshLm()} title="Test LM Studio connection">
          Refresh
        </button>
      </div>

      <div
        style={{
          padding: 10,
          borderBottom: '1px solid var(--border-soft)',
          display: 'grid',
          gap: 8
        }}
      >
        <div className="status-pill" title={lmStatus?.message}>
          <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
          {lmStatus?.message ?? 'LM Studio status unknown'}
        </div>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-dim)' }}>
          Model
          <select
            value={settings.provider.model}
            onChange={(e) => selectModel(e.target.value)}
            aria-label="Select model"
          >
            <option value="">Select a model…</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="panel-body chat-messages" aria-live="polite">
        {!session?.messages.length && (
          <div className="empty-state">
            Select context files, then ask the local model for help. Edits appear as reviewable
            diffs.
          </div>
        )}
        {session?.messages.map((msg) => (
          <div key={msg.id} className={`msg ${msg.role}`}>
            <div className="role">{msg.role}</div>
            <div className="body">{msg.content || (streaming ? '…' : '')}</div>
            {msg.error && <div className="error-state">{msg.error}</div>}
            {msg.proposedEdits?.map((edit) => (
              <DiffReview key={edit.id} edit={edit} onDecide={decideEdit} />
            ))}
          </div>
        ))}
      </div>

      <div className="chat-composer">
        <div className="context-chips" aria-label="Selected context files">
          {contextFiles.length === 0 && (
            <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
              No context selected — only your prompt will be sent.
            </span>
          )}
          {contextFiles.map((f) => (
            <span className="chip" key={f.path}>
              {f.relativePath}
              <button aria-label={`Remove ${f.relativePath}`} onClick={() => toggleContext(f.path)}>
                ×
              </button>
            </span>
          ))}
          {openFiles
            .filter((f) => !selectedContext.includes(f.path))
            .slice(0, 4)
            .map((f) => (
              <button key={f.path} className="chip" onClick={() => toggleContext(f.path)}>
                + {f.relativePath.split('/').pop()}
              </button>
            ))}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask your local model…"
          aria-label="Prompt"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void sendPrompt(prompt).then(() => setPrompt(''))
            }
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {streaming ? (
            <button className="btn danger" onClick={() => cancelPrompt()}>
              Cancel
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={!prompt.trim() || disconnected || !settings.provider.model}
              onClick={() => void sendPrompt(prompt).then(() => setPrompt(''))}
            >
              Send
            </button>
          )}
        </div>
        {disconnected && (
          <div className="error-state" style={{ padding: 0, textAlign: 'left' }}>
            Connect LM Studio to send prompts. Default URL: http://localhost:1234/v1
          </div>
        )}
      </div>
    </div>
  )
}
