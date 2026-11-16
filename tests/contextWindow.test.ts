import { describe, expect, it } from 'vitest'
import {
  applyContextWindowOnModelChange,
  extractKnownContextLimitFromModel,
  parseContextWindowInput,
  resolveKnownModelContextLimit,
  validateContextWindowSelection
} from '../src/shared/contextWindow'
import { prepareContextFiles } from '../src/shared/messageLimits'
import type { ProviderSettings } from '../src/shared/types'
import { mergeProviderSettings } from '../src/main/services/settings'

const baseProvider: ProviderSettings = {
  mode: 'local',
  baseUrl: 'http://localhost:1234/v1',
  apiKey: 'lm-studio',
  model: 'qwen2.5-3b-instruct',
  timeoutMs: 5000,
  stream: false,
  maxOutputTokens: 1024
}

describe('context window parsing / validation', () => {
  it('accepts blank as unset', () => {
    expect(parseContextWindowInput('')).toEqual({ ok: true, value: undefined })
    expect(parseContextWindowInput('  ')).toEqual({ ok: true, value: undefined })
  })

  it('rejects non-numeric and too-small values', () => {
    expect(parseContextWindowInput('abc').ok).toBe(false)
    expect(parseContextWindowInput('12').ok).toBe(false)
    expect(parseContextWindowInput('8192').value).toBe(8192)
  })

  it('blocks values above a known model limit and allows unknown models', () => {
    const blocked = validateContextWindowSelection({
      requested: 131072,
      knownLimit: 8192,
      modelId: 'demo-model'
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.message).toMatch(/exceeds the known limit/i)

    const unknown = validateContextWindowSelection({
      requested: 32768,
      modelId: 'qwen2.5-3b-instruct'
    })
    expect(unknown.ok).toBe(true)
    expect(unknown.warning).toMatch(/unknown/i)
  })

  it('reads context limits only from model metadata when present', () => {
    expect(extractKnownContextLimitFromModel({ id: 'local-gguf', object: 'model' })).toBeUndefined()
    expect(
      extractKnownContextLimitFromModel({
        id: 'served',
        object: 'model',
        max_model_len: 32768
      })
    ).toBe(32768)
    expect(
      resolveKnownModelContextLimit('served', [
        { id: 'other', object: 'model' },
        { id: 'served', object: 'model', context_length: 16384 }
      ])
    ).toBe(16384)
  })

  it('clears an oversized context window when switching to a known smaller model', () => {
    const result = applyContextWindowOnModelChange({
      provider: { ...baseProvider, contextWindowTokens: 65536 },
      nextModelId: 'tiny',
      models: [{ id: 'tiny', object: 'model', max_context_length: 4096 }]
    })
    expect(result.cleared).toBe(true)
    expect(result.provider.contextWindowTokens).toBeUndefined()
  })
})

describe('context window persistence + apply path', () => {
  it('merges and clears contextWindowTokens for settings persistence', () => {
    const withWindow = mergeProviderSettings(baseProvider, { contextWindowTokens: 16384 })
    expect(withWindow.contextWindowTokens).toBe(16384)
    const cleared = mergeProviderSettings(withWindow, { contextWindowTokens: undefined })
    expect(cleared.contextWindowTokens).toBeUndefined()
    const kept = mergeProviderSettings(withWindow, { model: 'other' })
    expect(kept.contextWindowTokens).toBe(16384)
  })

  it('truncates assembled context using the selected token window', () => {
    const files = [
      { path: '/a', relativePath: 'a.ts', content: 'A'.repeat(40_000) },
      { path: '/b', relativePath: 'b.ts', content: 'B'.repeat(40_000) }
    ]
    const prepared = prepareContextFiles(files, {
      contextWindowTokens: 4096,
      maxOutputTokens: 1024,
      reservedPromptTokens: 256
    })
    expect(prepared.truncated).toBe(true)
    const total = prepared.files.reduce((n, f) => n + f.content.length, 0)
    // Remaining tokens ≈ 4096 - 1024 - 256 = 2816 → ~11264 chars
    expect(total).toBeLessThanOrEqual(12_000)
    expect(prepared.message).toMatch(/token window/i)
  })
})
