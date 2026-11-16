import { afterEach, describe, expect, it, vi } from 'vitest'
import { LmStudioService } from '../src/main/services/lmstudio'
import type { ProviderSettings } from '../src/shared/types'

const provider: ProviderSettings = {
  mode: 'local',
  baseUrl: 'http://localhost:1234/v1',
  apiKey: 'lm-studio',
  model: 'test-model',
  timeoutMs: 5000,
  stream: false
}

describe('LM Studio connection and model handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reports connected with discovered models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ id: 'local-model', object: 'model' }] })
      }))
    )
    const lm = new LmStudioService()
    const result = await lm.testConnection(provider)
    expect(result.status).toBe('connected')
    expect(result.models[0].id).toBe('local-model')
  })

  it('reports no-model when server has an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [] })
      }))
    )
    const lm = new LmStudioService()
    const result = await lm.testConnection(provider)
    expect(result.status).toBe('no-model')
  })

  it('reports stopped/unreachable on connection refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch failed: ECONNREFUSED')
      })
    )
    const lm = new LmStudioService()
    const result = await lm.testConnection(provider)
    expect(['stopped', 'unreachable']).toContain(result.status)
    expect(result.message.toLowerCase()).toContain('lm studio')
  })

  it('surfaces API errors and never invents a remote fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'model crashed'
      }))
    )
    const lm = new LmStudioService()
    const chunks: Array<{ type: string; error?: string; content?: string }> = []
    await lm.chat(
      'req-1',
      provider,
      {
        model: 'test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: false
      },
      (chunk) => chunks.push(chunk)
    )
    expect(chunks.some((c) => c.type === 'error')).toBe(true)
    expect(JSON.stringify(chunks)).not.toMatch(/openai\.com|api\.anthropic|googleapis/i)
  })

  it('errors clearly when no model is selected', async () => {
    const lm = new LmStudioService()
    const chunks: Array<{ type: string; error?: string }> = []
    await lm.chat(
      'req-2',
      { ...provider, model: '' },
      { model: '', messages: [{ role: 'user', content: 'hi' }] },
      (chunk) => chunks.push(chunk)
    )
    expect(chunks[0]?.type).toBe('error')
    expect(chunks[0]?.error?.toLowerCase()).toContain('no model')
  })

  it('requires an API key in remote mode before listing models', async () => {
    const lm = new LmStudioService()
    const result = await lm.testConnection({
      ...provider,
      mode: 'remote',
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
      model: ''
    })
    expect(result.status).toBe('error')
    expect(result.message.toLowerCase()).toContain('api key')
  })

  it('uses remote messaging when connecting to a remote endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch failed: ECONNREFUSED')
      })
    )
    const lm = new LmStudioService()
    const result = await lm.testConnection({
      ...provider,
      mode: 'remote',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test'
    })
    expect(['stopped', 'unreachable']).toContain(result.status)
    expect(result.message.toLowerCase()).toMatch(/remote/)
    expect(result.message.toLowerCase()).not.toContain('lm studio')
  })

  it('supports cancellation via abort controller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted')
            reject(err)
          })
        })
      })
    )
    const lm = new LmStudioService()
    const chunks: Array<{ type: string }> = []
    const promise = lm.chat(
      'req-cancel',
      provider,
      { model: 'test-model', messages: [{ role: 'user', content: 'hi' }], stream: false },
      (chunk) => chunks.push(chunk)
    )
    expect(lm.cancel('req-cancel')).toBe(true)
    await promise
    expect(chunks.some((c) => c.type === 'cancelled' || c.type === 'error')).toBe(true)
  })
})
