import { describe, expect, it } from 'vitest'
import {
  buildTeamGenerationUserPrompt,
  buildTeamTranscript,
  canRunMultiAgent,
  composeAgentUserMessage,
  DEFAULT_AGENT_TEAM,
  enabledAgents,
  normalizeAgentTeam,
  parseGeneratedAgents,
  validateAgentRole
} from '../src/shared/agents'

describe('agent role validation', () => {
  it('requires name and system prompt', () => {
    expect(validateAgentRole({ name: '', systemPrompt: 'x' }).ok).toBe(false)
    expect(validateAgentRole({ name: 'Planner', systemPrompt: '' }).ok).toBe(false)
    const ok = validateAgentRole({
      name: 'Planner',
      description: 'plans',
      systemPrompt: 'Be brief.'
    })
    expect(ok.ok).toBe(true)
    expect(ok.agent?.name).toBe('Planner')
  })
})

describe('normalizeAgentTeam', () => {
  it('falls back to defaults for garbage input', () => {
    const team = normalizeAgentTeam(null)
    expect(team.enabled).toBe(false)
    expect(team.agents.length).toBe(DEFAULT_AGENT_TEAM.agents.length)
  })

  it('keeps valid custom agents and enabled flag', () => {
    const team = normalizeAgentTeam({
      enabled: true,
      agents: [
        { name: 'Scout', description: 'finds bugs', systemPrompt: 'Hunt carefully.', enabled: true }
      ]
    })
    expect(team.enabled).toBe(true)
    expect(team.agents).toHaveLength(1)
    expect(team.agents[0].name).toBe('Scout')
  })
})

describe('parseGeneratedAgents', () => {
  it('parses JSON object with agents array', () => {
    const raw = JSON.stringify({
      agents: [
        {
          name: 'Architect',
          description: 'design',
          system_prompt: 'Design the approach.'
        },
        {
          name: 'Coder',
          description: 'implement',
          systemPrompt: 'Write the code.'
        }
      ]
    })
    const parsed = parseGeneratedAgents(raw)
    expect(parsed.ok).toBe(true)
    expect(parsed.agents.map((a) => a.name)).toEqual(['Architect', 'Coder'])
  })

  it('accepts fenced JSON and strips extras', () => {
    const raw = `Sure.\n\`\`\`json\n{"agents":[{"name":"A","description":"","system_prompt":"Do A"}]}\n\`\`\``
    const parsed = parseGeneratedAgents(raw)
    expect(parsed.ok).toBe(true)
    expect(parsed.agents[0].name).toBe('A')
  })

  it('rejects empty / invalid payloads', () => {
    expect(parseGeneratedAgents('').ok).toBe(false)
    expect(parseGeneratedAgents('not json').ok).toBe(false)
    expect(parseGeneratedAgents('{"agents":[]}').ok).toBe(false)
  })
})

describe('team prompts and transcript', () => {
  it('builds a generation prompt that asks for JSON', () => {
    const prompt = buildTeamGenerationUserPrompt('ship a CLI')
    expect(prompt).toContain('ship a CLI')
    expect(prompt).toContain('"agents"')
  })

  it('composes handoff messages with prior turns', () => {
    const first = composeAgentUserMessage({
      userGoal: 'Fix login',
      priorTurns: []
    })
    expect(first).toContain('Fix login')
    expect(first).toContain('You are first')

    const next = composeAgentUserMessage({
      userGoal: 'Fix login',
      priorTurns: [
        {
          agent: DEFAULT_AGENT_TEAM.agents[0],
          content: 'Plan: check auth middleware'
        }
      ],
      contextNote: 'file a.ts'
    })
    expect(next).toContain('Prior team turns')
    expect(next).toContain('Plan: check auth middleware')
    expect(next).toContain('file a.ts')
  })

  it('builds a readable transcript including soft errors', () => {
    const text = buildTeamTranscript([
      { agent: DEFAULT_AGENT_TEAM.agents[0], content: 'Plan ok' },
      {
        agent: DEFAULT_AGENT_TEAM.agents[1],
        content: '',
        error: 'timeout'
      }
    ])
    expect(text).toContain('Planner')
    expect(text).toContain('timeout')
    expect(text).toContain('Implementer')
  })
})

describe('canRunMultiAgent gates', () => {
  it('requires feature, team toggle, model, and enabled agents', () => {
    expect(
      canRunMultiAgent({
        teamEnabled: true,
        featureEnabled: true,
        model: 'local-model',
        agents: DEFAULT_AGENT_TEAM.agents
      }).ok
    ).toBe(true)

    expect(
      canRunMultiAgent({
        teamEnabled: false,
        featureEnabled: true,
        model: 'local-model',
        agents: DEFAULT_AGENT_TEAM.agents
      }).ok
    ).toBe(false)

    expect(
      canRunMultiAgent({
        teamEnabled: true,
        featureEnabled: false,
        model: 'local-model',
        agents: DEFAULT_AGENT_TEAM.agents
      }).ok
    ).toBe(false)

    expect(
      canRunMultiAgent({
        teamEnabled: true,
        featureEnabled: true,
        model: '',
        agents: DEFAULT_AGENT_TEAM.agents
      }).ok
    ).toBe(false)

    expect(
      canRunMultiAgent({
        teamEnabled: true,
        featureEnabled: true,
        model: 'local-model',
        agents: DEFAULT_AGENT_TEAM.agents.map((a) => ({ ...a, enabled: false }))
      }).ok
    ).toBe(false)
  })

  it('filters enabledAgents', () => {
    const agents = [
      { ...DEFAULT_AGENT_TEAM.agents[0], enabled: true },
      { ...DEFAULT_AGENT_TEAM.agents[1], enabled: false }
    ]
    expect(enabledAgents({ enabled: true, agents })).toHaveLength(1)
  })
})
