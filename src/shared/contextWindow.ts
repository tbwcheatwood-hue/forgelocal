import type { LmModel, ProviderSettings } from './types'

/** Common preset sizes for the Settings control (tokens). */
export const CONTEXT_WINDOW_PRESETS = [4096, 8192, 16384, 32768, 65536, 131072] as const

export const CONTEXT_WINDOW_MIN = 1024
export const CONTEXT_WINDOW_MAX = 2_000_000

/** Keys some OpenAI-compatible servers attach to model objects (when present). */
const CONTEXT_META_KEYS = [
  'max_model_len',
  'max_context_length',
  'context_length',
  'context_window',
  'n_ctx',
  'max_tokens'
] as const

export interface ContextWindowParseResult {
  ok: boolean
  value?: number
  message?: string
}

export function parseContextWindowInput(raw: string): ContextWindowParseResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: true, value: undefined }
  }
  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      message: 'Context window must be a whole number of tokens, or left blank.'
    }
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < CONTEXT_WINDOW_MIN) {
    return {
      ok: false,
      message: `Context window must be at least ${CONTEXT_WINDOW_MIN.toLocaleString()} tokens.`
    }
  }
  if (value > CONTEXT_WINDOW_MAX) {
    return {
      ok: false,
      message: `Context window must be at most ${CONTEXT_WINDOW_MAX.toLocaleString()} tokens.`
    }
  }
  return { ok: true, value }
}

/**
 * Read a context limit only when the model object (or known metadata) actually
 * exposes one. Never invents per-GGUF windows — LM Studio /v1/models typically
 * returns only id/object/owned_by.
 */
export function extractKnownContextLimitFromModel(
  model: LmModel | Record<string, unknown> | null | undefined
): number | undefined {
  if (!model || typeof model !== 'object') return undefined
  const record = model as Record<string, unknown>
  for (const key of CONTEXT_META_KEYS) {
    const raw = record[key]
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (Number.isFinite(n) && n >= CONTEXT_WINDOW_MIN) {
      return Math.floor(n)
    }
  }
  return undefined
}

export function resolveKnownModelContextLimit(
  modelId: string,
  models: Array<LmModel | Record<string, unknown>>
): number | undefined {
  const id = modelId.trim()
  if (!id) return undefined
  const match = models.find((m) => {
    const mid = typeof (m as { id?: unknown }).id === 'string' ? (m as { id: string }).id : ''
    return mid === id
  })
  return extractKnownContextLimitFromModel(match)
}

export interface ContextWindowValidationInput {
  requested?: number
  knownLimit?: number
  modelId?: string
}

export interface ContextWindowValidationResult {
  ok: boolean
  value?: number
  message?: string
  /** Soft warning when unknown — user value is still accepted. */
  warning?: string
}

/**
 * Validate a user-selected context window against a known model limit when one
 * exists. Unknown limits: allow the value with an honest warning.
 */
export function validateContextWindowSelection(
  input: ContextWindowValidationInput
): ContextWindowValidationResult {
  const requested = input.requested
  if (requested == null) {
    return {
      ok: true,
      value: undefined,
      warning:
        'No context window set. Budget checks and token-aware context truncation stay disabled until you choose a size.'
    }
  }
  if (!Number.isFinite(requested) || requested < CONTEXT_WINDOW_MIN) {
    return {
      ok: false,
      message: `Context window must be at least ${CONTEXT_WINDOW_MIN.toLocaleString()} tokens.`
    }
  }
  if (requested > CONTEXT_WINDOW_MAX) {
    return {
      ok: false,
      message: `Context window must be at most ${CONTEXT_WINDOW_MAX.toLocaleString()} tokens.`
    }
  }

  const known = input.knownLimit
  if (typeof known === 'number' && known > 0 && requested > known) {
    const modelLabel = input.modelId?.trim() || 'the selected model'
    return {
      ok: false,
      message: `${requested.toLocaleString()} tokens exceeds the known limit for ${modelLabel} (${known.toLocaleString()}). Lower the context window.`
    }
  }

  if (typeof known === 'number' && known > 0) {
    return {
      ok: true,
      value: requested,
      warning: `Known model limit: ${known.toLocaleString()} tokens.`
    }
  }

  return {
    ok: true,
    value: requested,
    warning:
      'Model context length is unknown from the API (common for LM Studio GGUFs). Your value is used for budgeting only — it does not change the model.'
  }
}

export function applyContextWindowOnModelChange(input: {
  provider: ProviderSettings
  nextModelId: string
  models: Array<LmModel | Record<string, unknown>>
}): { provider: ProviderSettings; warning?: string; cleared?: boolean } {
  const known = resolveKnownModelContextLimit(input.nextModelId, input.models)
  const current = input.provider.contextWindowTokens
  if (current == null) {
    return { provider: input.provider }
  }
  const check = validateContextWindowSelection({
    requested: current,
    knownLimit: known,
    modelId: input.nextModelId
  })
  if (!check.ok) {
    const next = { ...input.provider }
    delete next.contextWindowTokens
    return {
      provider: next,
      cleared: true,
      warning:
        check.message ??
        'Cleared context window because it exceeded the newly selected model’s known limit.'
    }
  }
  return { provider: input.provider, warning: check.warning }
}
