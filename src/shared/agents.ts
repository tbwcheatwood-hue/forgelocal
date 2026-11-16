/**
 * Multi-agent teaming for ForgeLocal.
 *
 * Inspired by LocalAGI's agent-pool / "generate group from one prompt" flow
 * (https://github.com/mudler/LocalAGI, MIT — see NOTICE). Patterns here are
 * independently implemented for ForgeLocal's Electron + LM Studio stack.
 */

export interface AgentRole {
  id: string
  name: string
  description: string
  systemPrompt: string
  /** When false, skipped in multi-agent runs. Default true. */
  enabled?: boolean
}

export interface AgentTeamSettings {
  /** When true, chat Send runs the cooperative team instead of a single assistant. */
  enabled: boolean
  agents: AgentRole[]
}

export const DEFAULT_AGENT_TEAM: AgentTeamSettings = {
  enabled: false,
  agents: [
    {
      id: 'planner',
      name: 'Planner',
      description: 'Clarifies goals, constraints, and a short plan.',
      systemPrompt:
        'You are Planner on a ForgeLocal coding team. Clarify the goal, list constraints from context, and outline a short actionable plan. Do not write full file diffs yet — hand off a clear brief for Implementer.',
      enabled: true
    },
    {
      id: 'implementer',
      name: 'Implementer',
      description: 'Produces concrete coding guidance and proposed edits.',
      systemPrompt:
        'You are Implementer on a ForgeLocal coding team. Follow the Planner brief. Propose concrete code changes using fenced blocks headed with // file: relative/path when editing. Do not claim files were written.',
      enabled: true
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      description: 'Checks the proposal for risks and polish.',
      systemPrompt:
        'You are Reviewer on a ForgeLocal coding team. Critique the Implementer output for correctness, safety, and missing edge cases. End with a concise final answer the user can act on. Keep // file: blocks if they should stay.',
      enabled: true
    }
  ]
}

export function createAgentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function validateAgentRole(input: Partial<AgentRole>): {
  ok: boolean
  agent?: AgentRole
  message?: string
} {
  const name = (input.name ?? '').trim()
  const description = (input.description ?? '').trim()
  const systemPrompt = (input.systemPrompt ?? '').trim()
  if (!name) return { ok: false, message: 'Agent name is required.' }
  if (!systemPrompt) return { ok: false, message: 'Agent system prompt is required.' }
  return {
    ok: true,
    agent: {
      id: (input.id ?? '').trim() || createAgentId(),
      name: name.slice(0, 64),
      description: description.slice(0, 280),
      systemPrompt: systemPrompt.slice(0, 8000),
      enabled: input.enabled !== false
    }
  }
}

export function normalizeAgentTeam(raw: unknown): AgentTeamSettings {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_AGENT_TEAM)
  const obj = raw as Partial<AgentTeamSettings>
  const agentsIn = Array.isArray(obj.agents) ? obj.agents : DEFAULT_AGENT_TEAM.agents
  const agents: AgentRole[] = []
  for (const item of agentsIn) {
    const v = validateAgentRole(item ?? {})
    if (v.ok && v.agent) agents.push(v.agent)
  }
  return {
    enabled: Boolean(obj.enabled),
    agents: agents.length ? agents : structuredClone(DEFAULT_AGENT_TEAM.agents)
  }
}

export function enabledAgents(team: AgentTeamSettings): AgentRole[] {
  return (team.agents ?? []).filter((a) => a.enabled !== false)
}

/** Prompt used to ask the model for a cooperative team (LocalAGI-style group generation). */
export function buildTeamGenerationUserPrompt(description: string): string {
  return `Design a small cooperative AI agent team for this goal:

${description.trim()}

Return ONLY valid JSON (no markdown fences) with this shape:
{"agents":[{"name":"string","description":"string","system_prompt":"string"}]}

Rules:
- 2 to 5 agents
- Distinct roles that collaborate (e.g. planner, implementer, reviewer)
- system_prompt must be concrete instructions for a coding assistant in ForgeLocal
- Prefer software/engineering roles when the goal is coding`
}

export function parseGeneratedAgents(raw: string): {
  ok: boolean
  agents: AgentRole[]
  message?: string
} {
  const text = (raw ?? '').trim()
  if (!text)
    return { ok: false, agents: [], message: 'Empty model response while generating team.' }

  let jsonText = text
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) jsonText = fence[1].trim()
  const brace = jsonText.match(/\{[\s\S]*\}/)
  if (brace) jsonText = brace[0]

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return {
      ok: false,
      agents: [],
      message: 'Could not parse team JSON from the model. Try again or add agents manually.'
    }
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { agents?: unknown }).agents)
      ? ((parsed as { agents: unknown[] }).agents ?? [])
      : null

  if (!list) {
    return { ok: false, agents: [], message: 'Team JSON must include an agents array.' }
  }

  const agents: AgentRole[] = []
  for (const item of list.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const v = validateAgentRole({
      name: typeof row.name === 'string' ? row.name : '',
      description: typeof row.description === 'string' ? row.description : '',
      systemPrompt:
        typeof row.system_prompt === 'string'
          ? row.system_prompt
          : typeof row.systemPrompt === 'string'
            ? row.systemPrompt
            : ''
    })
    if (v.ok && v.agent) agents.push(v.agent)
  }

  if (!agents.length) {
    return { ok: false, agents: [], message: 'No valid agent roles in the generated team.' }
  }
  return { ok: true, agents }
}

export interface AgentTurnResult {
  agent: AgentRole
  content: string
  error?: string
}

export function composeAgentUserMessage(input: {
  userGoal: string
  priorTurns: AgentTurnResult[]
  contextNote?: string
}): string {
  const parts = [`## User goal\n${input.userGoal.trim()}`]
  if (input.contextNote) parts.push(`## Context note\n${input.contextNote}`)
  if (input.priorTurns.length) {
    parts.push('## Prior team turns')
    for (const turn of input.priorTurns) {
      parts.push(`### ${turn.agent.name}\n${turn.content || turn.error || '(empty)'}`)
    }
    parts.push(
      'Continue as your role. Build on prior turns; do not ignore them. If you are the last reviewer, produce the final user-facing answer.'
    )
  } else {
    parts.push('You are first. Start the cooperative handoff for this goal.')
  }
  return parts.join('\n\n')
}

export function buildTeamTranscript(turns: AgentTurnResult[]): string {
  if (!turns.length) return ''
  return turns
    .map((t) => {
      const body = t.error
        ? `⚠️ ${t.error}\n\n_(team continued with remaining agents when possible)_`
        : t.content
      return `### ✦ ${t.agent.name}\n_${t.agent.description || 'team role'}_\n\n${body || '_(empty reply)_'}`
    })
    .join('\n\n---\n\n')
}

export function canRunMultiAgent(input: {
  teamEnabled: boolean
  featureEnabled: boolean
  model: string
  agents: AgentRole[]
}): { ok: boolean; message?: string } {
  if (!input.featureEnabled) {
    return { ok: false, message: 'Multi-agent teaming is disabled in the Tools catalog.' }
  }
  if (!input.teamEnabled) {
    return { ok: false, message: 'Multi-agent mode is off. Enable it in the Agents panel.' }
  }
  if (!input.model.trim()) {
    return { ok: false, message: 'Select a model before running a multi-agent team.' }
  }
  const active = input.agents.filter((a) => a.enabled !== false)
  if (!active.length) {
    return { ok: false, message: 'No enabled agents. Add or enable at least one role.' }
  }
  return { ok: true }
}
