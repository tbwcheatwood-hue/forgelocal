import { estimateContentTokens, type ChatMessageContent } from './attachments'
import type { ChatCompletionRequest, ProviderMode, ProviderSettings } from './types'
import { isRemoteMode } from './providerTools'

/** Rough client-side estimate — not a tokenizer. Matches dock “chars÷4” heuristic. */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export function estimateMessagesTokens(
  messages: Array<{ content: string | ChatMessageContent }>
): number {
  return messages.reduce((n, m) => n + estimateContentTokens(m.content ?? ''), 0)
}

/**
 * OpenAI reasoning / o-series / gpt-5 chat models reject legacy `max_tokens`
 * and non-default temperature on Chat Completions.
 * Evidence: OpenAI Chat Completions API — max_tokens deprecated / incompatible
 * with o-series; use max_completion_tokens. Community + provider forks document
 * temperature != 1 rejections for o1/o3/o4/gpt-5.
 */
export function isOpenAiReasoningModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase()
  if (!id) return false
  // Strip org prefixes like "openai/"
  const bare = id.includes('/') ? id.split('/').pop()! : id
  return /^(o1|o3|o4)([.-]|$)/.test(bare) || /^gpt-5([.-]|$)/.test(bare)
}

export function isLikelyEmbeddingModelId(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return id.includes('embed') || id.includes('embedding')
}

export interface ChatBudgetInput {
  messages: Array<{ content: string | ChatMessageContent }>
  maxOutputTokens: number
  contextWindowTokens: number
}

export interface ChatBudgetResult {
  ok: boolean
  inputTokens: number
  maxOutputTokens: number
  contextWindowTokens: number
  remainingForOutput: number
  message?: string
}

/** Reject when estimated input + requested output cannot fit the context window. */
export function validateChatTokenBudget(input: ChatBudgetInput): ChatBudgetResult {
  const inputTokens = estimateMessagesTokens(input.messages)
  const remainingForOutput = input.contextWindowTokens - inputTokens
  if (inputTokens >= input.contextWindowTokens) {
    return {
      ok: false,
      inputTokens,
      maxOutputTokens: input.maxOutputTokens,
      contextWindowTokens: input.contextWindowTokens,
      remainingForOutput,
      message: `Estimated input (${inputTokens.toLocaleString()} tokens) already fills the context window (${input.contextWindowTokens.toLocaleString()}). Trim the prompt or context files.`
    }
  }
  if (inputTokens + input.maxOutputTokens > input.contextWindowTokens) {
    return {
      ok: false,
      inputTokens,
      maxOutputTokens: input.maxOutputTokens,
      contextWindowTokens: input.contextWindowTokens,
      remainingForOutput,
      message: `Estimated input (${inputTokens.toLocaleString()}) + max output (${input.maxOutputTokens.toLocaleString()}) exceeds context window (${input.contextWindowTokens.toLocaleString()}). Lower max output tokens or shrink the prompt.`
    }
  }
  return {
    ok: true,
    inputTokens,
    maxOutputTokens: input.maxOutputTokens,
    contextWindowTokens: input.contextWindowTokens,
    remainingForOutput
  }
}

export interface BuiltChatBody {
  body: Record<string, unknown>
  outputTokenParam: 'max_tokens' | 'max_completion_tokens' | null
  temperatureIncluded: boolean
  reasoningModel: boolean
}

/**
 * Build OpenAI-compatible /chat/completions JSON body with model-appropriate
 * output-token parameter names and temperature handling.
 *
 * - LM Studio local docs list `max_tokens` (https://lmstudio.ai/docs/developer/openai-compat/chat-completions)
 * - OpenAI Chat Completions: prefer `max_completion_tokens`; `max_tokens` incompatible with o-series
 */
export function buildChatCompletionBody(
  provider: ProviderSettings,
  request: ChatCompletionRequest
): BuiltChatBody {
  const model = (request.model || provider.model || '').trim()
  const remote = isRemoteMode(provider)
  const reasoningModel = isOpenAiReasoningModelId(model)
  const stream = provider.stream && request.stream !== false
  const maxOut =
    typeof request.maxOutputTokens === 'number' && request.maxOutputTokens > 0
      ? request.maxOutputTokens
      : provider.maxOutputTokens

  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
    stream
  }

  let temperatureIncluded = false
  if (!reasoningModel) {
    const temperature = request.temperature ?? provider.temperature ?? 0.2
    body.temperature = temperature
    temperatureIncluded = true
  }
  // Reasoning models: omit temperature (OpenAI default is 1; non-1 often 400s).

  let outputTokenParam: BuiltChatBody['outputTokenParam'] = null
  if (typeof maxOut === 'number' && maxOut > 0) {
    if (reasoningModel || (remote && shouldPreferMaxCompletionTokens(provider))) {
      body.max_completion_tokens = maxOut
      outputTokenParam = 'max_completion_tokens'
    } else {
      // Local LM Studio documented param; also widely supported by OpenAI-compat servers.
      body.max_tokens = maxOut
      outputTokenParam = 'max_tokens'
    }
  }

  return { body, outputTokenParam, temperatureIncluded, reasoningModel }
}

function shouldPreferMaxCompletionTokens(provider: ProviderSettings): boolean {
  // Official OpenAI host — always prefer max_completion_tokens for remote.
  try {
    const host = new URL(provider.baseUrl).hostname.toLowerCase()
    return host === 'api.openai.com' || host.endsWith('.openai.com')
  } catch {
    return false
  }
}

export function filterChatModels<T extends { id: string }>(models: T[]): T[] {
  return models.filter((m) => !isLikelyEmbeddingModelId(m.id))
}

export function resolveOutputTokenLimit(provider: ProviderSettings): number {
  return provider.maxOutputTokens ?? 4096
}

/** Only when the user/config set an explicit context window — never invent per-model sizes. */
export function resolveContextWindowTokens(provider: ProviderSettings): number | undefined {
  const n = provider.contextWindowTokens
  return typeof n === 'number' && n > 0 ? n : undefined
}

export type { ProviderMode }
