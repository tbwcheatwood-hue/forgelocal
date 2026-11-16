import { useMemo, useState } from 'react'
import {
  DEFAULT_AGENT_TEAM,
  createAgentId,
  enabledAgents,
  normalizeAgentTeam,
  validateAgentRole,
  type AgentRole
} from '@shared/agents'
import { useAppStore } from '../../stores/appStore'

export function AgentsPanel() {
  const settings = useAppStore((s) => s.settings)
  const streaming = useAppStore((s) => s.streaming)
  const setShow = useAppStore((s) => s.setShow)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const setToolEnabled = useAppStore((s) => s.setToolEnabled)
  const generateTeam = useAppStore((s) => s.generateTeam)
  const setError = useAppStore((s) => s.setError)

  const team = useMemo(() => normalizeAgentTeam(settings.agentTeam), [settings.agentTeam])
  const featureOn = settings.enabledTools['optional-multi-agent'] !== false
  const activeCount = enabledAgents(team).length

  const [goal, setGoal] = useState('')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    systemPrompt: ''
  })
  const [editId, setEditId] = useState<string | null>(null)

  const persist = async (next: typeof team) => {
    await updateSettings({ agentTeam: normalizeAgentTeam(next) })
  }

  const toggleMode = async () => {
    if (!featureOn && !team.enabled) {
      await setToolEnabled('optional-multi-agent', true)
    }
    await persist({ ...team, enabled: !team.enabled })
  }

  const onGenerate = async () => {
    if (!goal.trim() || generating || streaming) return
    setGenerating(true)
    try {
      const result = await generateTeam(goal.trim())
      if (!result.ok) {
        setError(result.error)
        return
      }
      await persist({ ...team, agents: result.agents, enabled: true })
      setGoal('')
    } finally {
      setGenerating(false)
    }
  }

  const saveDraft = async () => {
    const v = validateAgentRole({
      id: editId ?? createAgentId(),
      name: draft.name,
      description: draft.description,
      systemPrompt: draft.systemPrompt,
      enabled: true
    })
    if (!v.ok || !v.agent) {
      setError(v.message ?? 'Invalid agent')
      return
    }
    const agents = editId
      ? team.agents.map((a) => (a.id === editId ? v.agent! : a))
      : [...team.agents, v.agent]
    await persist({ ...team, agents })
    setDraft({ name: '', description: '', systemPrompt: '' })
    setEditId(null)
  }

  const startEdit = (agent: AgentRole) => {
    setEditId(agent.id)
    setDraft({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt
    })
  }

  return (
    <div className="lagi-agents" role="region" aria-label="Multi-agent team">
      <div className="lagi-agents-header">
        <div className="lagi-agents-title">
          <span className="lagi-mark" aria-hidden>
            ✦
          </span>
          <strong>Agents</strong>
          <span className="lagi-badge">{team.enabled ? 'multi' : 'single'}</span>
        </div>
        <button
          className="btn ghost"
          type="button"
          onClick={() => setShow('showAgentsPanel', false)}
        >
          Close
        </button>
      </div>

      <p className="lagi-agents-lead">
        LocalAGI-inspired cooperative roles on your model. Multi mode is off until you enable it —
        single-assistant chat stays the default.
      </p>

      {!featureOn && (
        <div className="error-state" style={{ marginBottom: 10 }}>
          Multi-agent catalog tool is disabled.{' '}
          <button
            className="btn primary"
            type="button"
            onClick={() => void setToolEnabled('optional-multi-agent', true)}
          >
            Enable in Tools
          </button>
        </div>
      )}

      <div className="lagi-row">
        <button
          className={`btn ${team.enabled ? 'primary' : ''}`}
          type="button"
          disabled={!featureOn && !team.enabled}
          onClick={() => void toggleMode()}
        >
          {team.enabled ? 'Multi-agent on' : 'Multi-agent off'}
        </button>
        <span className="lagi-meta">
          {activeCount} role{activeCount === 1 ? '' : 's'} · runs sequentially
        </span>
      </div>

      <div className="lagi-generate">
        <label className="lagi-label" htmlFor="lagi-goal">
          Generate team from one goal
        </label>
        <textarea
          id="lagi-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Refactor auth middleware with tests and a security review"
          rows={2}
          disabled={generating || streaming}
        />
        <button
          className="btn primary lagi-glow"
          type="button"
          disabled={!goal.trim() || generating || streaming || !settings.provider.model}
          onClick={() => void onGenerate()}
        >
          {generating ? 'Generating…' : 'Generate Team'}
        </button>
      </div>

      <ul className="lagi-agent-list">
        {team.agents.map((agent) => (
          <li key={agent.id} className={`lagi-agent-card ${agent.enabled === false ? 'off' : ''}`}>
            <div className="lagi-agent-top">
              <span className="lagi-agent-name">{agent.name}</span>
              <div className="lagi-agent-actions">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() =>
                    void persist({
                      ...team,
                      agents: team.agents.map((a) =>
                        a.id === agent.id ? { ...a, enabled: a.enabled === false } : a
                      )
                    })
                  }
                >
                  {agent.enabled === false ? 'Enable' : 'Disable'}
                </button>
                <button className="btn ghost" type="button" onClick={() => startEdit(agent)}>
                  Edit
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() =>
                    void persist({
                      ...team,
                      agents: team.agents.filter((a) => a.id !== agent.id)
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </div>
            <p className="lagi-agent-desc">{agent.description || 'No description'}</p>
          </li>
        ))}
      </ul>

      <div className="lagi-draft">
        <div className="lagi-label">{editId ? 'Edit role' : 'Add role'}</div>
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Name"
          aria-label="Agent name"
        />
        <input
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="Short description"
          aria-label="Agent description"
        />
        <textarea
          value={draft.systemPrompt}
          onChange={(e) => setDraft((d) => ({ ...d, systemPrompt: e.target.value }))}
          placeholder="System prompt"
          rows={3}
          aria-label="Agent system prompt"
        />
        <div className="lagi-row">
          <button className="btn primary" type="button" onClick={() => void saveDraft()}>
            {editId ? 'Save role' : 'Add role'}
          </button>
          {editId && (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setEditId(null)
                setDraft({ name: '', description: '', systemPrompt: '' })
              }}
            >
              Cancel edit
            </button>
          )}
          <button
            className="btn ghost"
            type="button"
            onClick={() => void persist(structuredClone(DEFAULT_AGENT_TEAM))}
          >
            Reset defaults
          </button>
        </div>
      </div>
    </div>
  )
}
