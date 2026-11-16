import {
  buildTeamGenerationUserPrompt,
  buildTeamTranscript,
  composeAgentUserMessage,
  enabledAgents,
  normalizeAgentTeam,
  parseGeneratedAgents,
  type AgentRole,
  type AgentTeamSettings,
  type AgentTurnResult
} from '../../shared/agents'
import type { ProviderSettings, StreamChunk } from '../../shared/types'
import { LmStudioService } from './lmstudio'

export class AgentsService {
  constructor(private lm: LmStudioService) {}

  async generateTeam(
    requestId: string,
    provider: ProviderSettings,
    description: string,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<{ ok: true; agents: AgentRole[] } | { ok: false; error: string }> {
    const goal = description.trim()
    if (!goal) return { ok: false, error: 'Describe the team goal before generating agents.' }
    if (!provider.model?.trim()) {
      return { ok: false, error: 'Select a model before generating a team.' }
    }

    let full = ''
    await this.lm.chat(
      requestId,
      { ...provider, stream: false },
      {
        model: provider.model,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              'You design cooperative AI agent teams. Reply with JSON only as instructed by the user.'
          },
          { role: 'user', content: buildTeamGenerationUserPrompt(goal) }
        ]
      },
      (chunk) => {
        if (chunk.type === 'delta' && chunk.content) full += chunk.content
        onChunk?.(chunk)
      }
    )

    if (!full.trim()) {
      return { ok: false, error: 'Model returned an empty team proposal.' }
    }
    const parsed = parseGeneratedAgents(full)
    if (!parsed.ok) return { ok: false, error: parsed.message ?? 'Invalid team proposal.' }
    return { ok: true, agents: parsed.agents }
  }

  async runTeam(
    requestId: string,
    provider: ProviderSettings,
    team: AgentTeamSettings,
    userGoal: string,
    contextBlock: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<{ content: string; turns: AgentTurnResult[] }> {
    const agents = enabledAgents(normalizeAgentTeam(team))
    if (!agents.length) {
      onChunk({ type: 'error', error: 'No enabled agents in the team.' })
      return { content: '', turns: [] }
    }
    if (!provider.model?.trim()) {
      onChunk({ type: 'error', error: 'No model selected for multi-agent run.' })
      return { content: '', turns: [] }
    }
    if (!userGoal.trim()) {
      onChunk({ type: 'error', error: 'Empty prompt — nothing for the team to do.' })
      return { content: '', turns: [] }
    }

    const turns: AgentTurnResult[] = []
    let cancelled = false

    for (const agent of agents) {
      if (cancelled) break
      onChunk({ type: 'agent_start', agentId: agent.id, agentName: agent.name })
      const header = `\n\n### ✦ ${agent.name}\n_${agent.description || 'team role'}_\n\n`
      onChunk({ type: 'delta', content: turns.length ? `\n\n---\n${header}` : header })

      const userContent = composeAgentUserMessage({
        userGoal,
        priorTurns: turns,
        contextNote: contextBlock || undefined
      })

      let agentText = ''
      let agentError: string | undefined
      const stepId = `${requestId}:${agent.id}`

      await this.lm.chat(
        stepId,
        provider,
        {
          model: provider.model,
          stream: provider.stream,
          messages: [
            { role: 'system', content: agent.systemPrompt },
            { role: 'user', content: userContent }
          ]
        },
        (chunk) => {
          if (chunk.type === 'cancelled') {
            cancelled = true
            onChunk({ type: 'cancelled' })
            return
          }
          if (chunk.type === 'error') {
            agentError = chunk.error ?? 'Agent step failed'
            onChunk({
              type: 'delta',
              content: `\n⚠️ ${agentError}\n`
            })
            return
          }
          if (chunk.type === 'delta' && chunk.content) {
            agentText += chunk.content
            onChunk({
              type: 'delta',
              content: chunk.content,
              agentId: agent.id,
              agentName: agent.name
            })
          }
        }
      )

      const turn: AgentTurnResult = {
        agent,
        content: agentText,
        error: agentError
      }
      turns.push(turn)
      onChunk({
        type: 'agent_done',
        agentId: agent.id,
        agentName: agent.name,
        content: agentText,
        error: agentError
      })

      // Soft continue after a failed step so later agents can still salvage value.
      if (cancelled) break
    }

    if (cancelled) {
      return { content: buildTeamTranscript(turns), turns }
    }

    const content = buildTeamTranscript(turns)
    onChunk({ type: 'done' })
    return { content, turns }
  }
}
