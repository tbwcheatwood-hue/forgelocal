import { useMemo, useState } from 'react'
import { enabledAgents, normalizeAgentTeam } from '@shared/agents'
import { useAppStore } from '../../stores/appStore'
import { DiffReview } from '../DiffReview/DiffReview'
import { isRemoteMode } from '@shared/providerTools'
import {
  estimateWordCount,
  PROMPT_MAX_CHARS,
  PROMPT_SOFT_CHARS,
  UI_MESSAGE_COLLAPSE_CHARS
} from '@shared/messageLimits'

function MessageBody({ content, streaming }: { content: string; streaming: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const text = content || (streaming ? '…' : '')
  const needsCollapse = text.length > UI_MESSAGE_COLLAPSE_CHARS
  const shown =
    !needsCollapse || expanded ? text : `${text.slice(0, UI_MESSAGE_COLLAPSE_CHARS)}\n\n…`

  return (
    <div className="body">
      {shown}
      {needsCollapse && (
        <div className="msg-collapse">
          <button className="btn ghost" type="button" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : `Show more (${text.length.toLocaleString()} chars)`}
          </button>
        </div>
      )}
    </div>
  )
}

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
  const setShow = useAppStore((s) => s.setShow)
  const activeAgentName = useAppStore((s) => s.activeAgentName)
  const updateSettings = useAppStore((s) => s.updateSettings)

  const contextFiles = useMemo(
    () => openFiles.filter((f) => selectedContext.includes(f.path)),
    [openFiles, selectedContext]
  )

  const team = useMemo(() => normalizeAgentTeam(settings.agentTeam), [settings.agentTeam])
  const featureOn = settings.enabledTools['optional-multi-agent'] !== false
  const multiOn = featureOn && team.enabled
  const roleNames = enabledAgents(team)
    .map((a) => a.name)
    .join(' → ')

  const disconnected = !lmStatus || lmStatus.status !== 'connected'
  const remote = isRemoteMode(settings.provider)
  const promptChars = prompt.length
  const promptWords = estimateWordCount(prompt)
  const overHard = promptChars > PROMPT_MAX_CHARS
  const overSoft = promptChars >= PROMPT_SOFT_CHARS

  const submit = async () => {
    if (!prompt.trim() || streaming || overHard) return
    const toSend = prompt
    setPrompt('')
    await sendPrompt(toSend)
  }

  return (
    <div className="panel ai-panel">
      <div className="panel-header">
        <span>Assistant{multiOn ? ' · team' : ''}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`btn ${multiOn ? 'primary' : 'ghost'}`}
            type="button"
            onClick={() => setShow('showAgentsPanel', true)}
            title="Configure multi-agent team"
          >
            Agents
          </button>
          <button
            className="btn ghost"
            onClick={() => refreshLm()}
            title={remote ? 'Test remote API connection' : 'Test LM Studio connection'}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="chat-toolbar">
        <div className="status-line" title={lmStatus?.message}>
          <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
          <span>
            {lmStatus?.message ??
              (remote ? 'Remote API status unknown' : 'LM Studio status unknown')}
          </span>
        </div>
        <label>
          Model ({remote ? 'remote' : 'local'})
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
        {featureOn && (
          <label className="chat-multi-toggle" title={roleNames || 'No agents enabled'}>
            <input
              type="checkbox"
              checked={team.enabled}
              onChange={(e) =>
                void updateSettings({
                  agentTeam: { ...team, enabled: e.target.checked }
                })
              }
            />
            Multi-agent
            {streaming && activeAgentName
              ? ` · ${activeAgentName}`
              : multiOn
                ? ` · ${roleNames}`
                : ''}
          </label>
        )}
      </div>

      <div className="panel-body chat-messages">
        {!session?.messages.length && (
          <div className="chat-empty">
            <h3>Ask with intent</h3>
            <p>
              Attach only the files you choose, then prompt your {remote ? 'remote' : 'local'}{' '}
              model. Proposed edits arrive as reviewable diffs — never silent overwrites.
            </p>
          </div>
        )}
        {session?.messages.map((msg) => (
          <div
            key={msg.id}
            className={`msg ${msg.role}${msg.agentRun?.mode === 'multi' ? ' lagi-team-msg' : ''}`}
          >
            <div className="role">
              {msg.role}
              {msg.agentRun?.mode === 'multi' ? ' · multi-agent' : ''}
            </div>
            <MessageBody content={msg.content} streaming={streaming && msg.role === 'assistant'} />
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
          placeholder={remote ? 'Ask your remote model…' : 'Ask your local model…'}
          aria-label="Prompt"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <div
          style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}
        >
          {overHard ? (
            <span className="composer-hint warn">
              Prompt too large ({promptChars.toLocaleString()} / {PROMPT_MAX_CHARS.toLocaleString()}{' '}
              chars, ~{promptWords.toLocaleString()} words). Shorten before sending.
            </span>
          ) : overSoft ? (
            <span className="composer-hint warn">
              Large prompt (~{promptWords.toLocaleString()} words). Still sendable; models may
              struggle.
            </span>
          ) : disconnected ? (
            <span className="composer-hint warn">
              {remote
                ? 'Connect remote API in Settings (base URL + API key)'
                : 'Connect LM Studio to send · localhost:1234/v1'}
            </span>
          ) : (
            <span className="composer-hint">
              Ctrl/⌘ + Enter to send
              {promptChars > 0
                ? ` · ${promptChars.toLocaleString()} chars / ~${promptWords.toLocaleString()} words`
                : ''}
            </span>
          )}
          {streaming ? (
            <button className="btn danger" onClick={() => cancelPrompt()}>
              Cancel
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={
                !prompt.trim() || disconnected || !settings.provider.model || overHard || streaming
              }
              onClick={() => void submit()}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
