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
    <div className="panel ai-panel">
      <div className="panel-header">
        <span>Assistant</span>
        <button className="btn ghost" onClick={() => refreshLm()} title="Test LM Studio connection">
          Refresh
        </button>
      </div>

      <div className="chat-toolbar">
        <div className="status-line" title={lmStatus?.message}>
          <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
          <span>{lmStatus?.message ?? 'LM Studio status unknown'}</span>
        </div>
        <label>
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
          <div className="chat-empty">
            <h3>Ask with intent</h3>
            <p>
              Attach only the files you choose, then prompt your local model. Proposed edits arrive
              as reviewable diffs — never silent overwrites.
            </p>
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
            <span className="composer-hint">
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
        <div
          style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}
        >
          {disconnected ? (
            <span className="composer-hint warn">
              Connect LM Studio to send · localhost:1234/v1
            </span>
          ) : (
            <span className="composer-hint">Ctrl/⌘ + Enter to send</span>
          )}
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
      </div>
    </div>
  )
}
