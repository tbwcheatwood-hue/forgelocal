import { describe, expect, it } from 'vitest'
import {
  buildChatCompletionBody,
  estimateMessagesTokens,
  filterChatModels,
  isOpenAiReasoningModelId,
  validateChatTokenBudget
} from '../src/shared/chatPayload'
import type { ProviderSettings } from '../src/shared/types'

const localProvider: ProviderSettings = {
  mode: 'local',
  baseUrl: 'http://localhost:1234/v1',
  apiKey: 'lm-studio',
  model: 'qwen2.5-3b-instruct',
  timeoutMs: 5000,
  stream: false,
  temperature: 0.2,
  maxOutputTokens: 4096
}

const openaiRemote: ProviderSettings = {
  mode: 'remote',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
  timeoutMs: 5000,
  stream: false,
  temperature: 0.2,
  maxOutputTokens: 2048
}

describe('model id classification', () => {
  it('detects OpenAI reasoning / gpt-5 families', () => {
    expect(isOpenAiReasoningModelId('o1')).toBe(true)
    expect(isOpenAiReasoningModelId('o3-mini')).toBe(true)
    expect(isOpenAiReasoningModelId('o4-mini-2025-04-16')).toBe(true)
    expect(isOpenAiReasoningModelId('gpt-5')).toBe(true)
    expect(isOpenAiReasoningModelId('openai/gpt-5-mini')).toBe(true)
    expect(isOpenAiReasoningModelId('gpt-4o')).toBe(false)
    expect(isOpenAiReasoningModelId('openai/gpt-oss-20b')).toBe(false)
    expect(isOpenAiReasoningModelId('qwen2.5-3b-instruct')).toBe(false)
  })

  it('filters embedding models from chat pickers', () => {
    const models = filterChatModels([
      { id: 'qwen2.5-3b-instruct' },
      { id: 'text-embedding-nomic-embed-text-v1.5' }
    ])
    expect(models.map((m) => m.id)).toEqual(['qwen2.5-3b-instruct'])
  })
})

describe('chat completion payload parameter names', () => {
  it('uses max_tokens + temperature for local LM Studio chat models', () => {
    const built = buildChatCompletionBody(localProvider, {
      model: localProvider.model,
      messages: [{ role: 'user', content: 'hi' }],
      stream: false
    })
    expect(built.outputTokenParam).toBe('max_tokens')
    expect(built.body.max_tokens).toBe(4096)
    expect(built.body.max_completion_tokens).toBeUndefined()
    expect(built.temperatureIncluded).toBe(true)
    expect(built.body.temperature).toBe(0.2)
  })

  it('uses max_completion_tokens and omits temperature for remote o-series', () => {
    const built = buildChatCompletionBody(
      { ...openaiRemote, model: 'o3-mini' },
      {
        model: 'o3-mini',
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
        temperature: 0.2
      }
    )
    expect(built.reasoningModel).toBe(true)
    expect(built.outputTokenParam).toBe('max_completion_tokens')
    expect(built.body.max_completion_tokens).toBe(2048)
    expect(built.body.max_tokens).toBeUndefined()
    expect(built.temperatureIncluded).toBe(false)
    expect(built.body.temperature).toBeUndefined()
  })

  it('uses max_completion_tokens on api.openai.com even for gpt-4o', () => {
    const built = buildChatCompletionBody(openaiRemote, {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }]
    })
    expect(built.outputTokenParam).toBe('max_completion_tokens')
    expect(built.body.temperature).toBe(0.2)
  })
})

describe('input + output token budget', () => {
  it('rejects when estimated input + requested output exceeds context window', () => {
    const messages = [{ content: 'x'.repeat(4000) }] // ~1000 tokens
    expect(estimateMessagesTokens(messages)).toBe(1000)
    const result = validateChatTokenBudget({
      messages,
      maxOutputTokens: 800,
      contextWindowTokens: 1500
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/exceeds context window/i)
  })

  it('allows requests that fit input + output within the window', () => {
    const result = validateChatTokenBudget({
      messages: [{ content: 'hello world' }],
      maxOutputTokens: 100,
      contextWindowTokens: 2048
    })
    expect(result.ok).toBe(true)
  })

  it('rejects when input alone fills the window', () => {
    const result = validateChatTokenBudget({
      messages: [{ content: 'y'.repeat(9000) }],
      maxOutputTokens: 100,
      contextWindowTokens: 2000
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/already fills/i)
  })
})
