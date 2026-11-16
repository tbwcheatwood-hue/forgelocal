/**
 * Local inference provider discovery (Companion-style port probes).
 * Inspired by LocalForge Companion providers.js 0.3.2 (MIT) — see NOTICE.
 */

import {
  DEFAULT_PROVIDER_CANDIDATES,
  normalizeCompanionBaseUrl,
  type DiscoveredProvider
} from './companion'

export { DEFAULT_PROVIDER_CANDIDATES }

async function fetchJson(
  url: string,
  timeoutMs = 900
): Promise<{
  ok: boolean
  status: number
  json: unknown
  text: string
  headers: Headers | null
  error?: string
}> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ac.signal })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { ok: res.ok, status: res.status, json, text, headers: res.headers }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: '',
      headers: null,
      error: e instanceof Error ? e.message : String(e)
    }
  } finally {
    clearTimeout(timer)
  }
}

function guessOpenAiName(base: string, res: { json: unknown; headers: Headers | null }): string {
  const server = (res.headers?.get('server') || '').toLowerCase()
  if (server.includes('lmstudio') || server.includes('lm-studio')) return 'LM Studio'
  if (server.includes('llama.cpp')) return 'llama.cpp server'
  if (server.includes('uvicorn')) return 'Lemonade Server (uvicorn)'
  const data = (res.json as { data?: Array<{ id?: string }> } | null)?.data ?? []
  const ids = data.map((m) => String(m.id || '')).join(' ')
  if (/localforge|llama-server|llamacpp/i.test(ids)) return 'llama.cpp server'
  if (base.includes(':1234')) return 'LM Studio'
  if (base.includes(':8080') || base.includes(':1337')) return 'llama.cpp server'
  return 'OpenAI-compatible'
}

export async function probeEndpoint(baseUrl: string): Promise<DiscoveredProvider> {
  const base = normalizeCompanionBaseUrl(baseUrl)

  const tags = await fetchJson(`${base}/api/tags`)
  const tagsJson = tags.json as { models?: Array<Record<string, unknown>> } | null
  if (tags.ok && tagsJson?.models) {
    return {
      kind: 'ollama',
      baseUrl: base,
      name: 'Ollama',
      reachable: true,
      models: tagsJson.models.map((m) => {
        const details = (m.details as Record<string, unknown> | undefined) ?? {}
        return {
          id: String(m.name ?? ''),
          display: String(m.name ?? ''),
          sizeBytes: typeof m.size === 'number' ? m.size : null,
          paramSize: typeof details.parameter_size === 'string' ? details.parameter_size : null,
          quant: typeof details.quantization_level === 'string' ? details.quantization_level : null
        }
      })
    }
  }

  const v1 = await fetchJson(`${base}/v1/models`)
  const v1Json = v1.json as { data?: Array<{ id?: string }> } | null
  if (v1.ok && v1Json?.data) {
    return {
      kind: 'openai',
      baseUrl: `${base}/v1`,
      name: guessOpenAiName(base, v1),
      reachable: true,
      models: v1Json.data.map((m) => ({ id: String(m.id ?? ''), display: String(m.id ?? '') }))
    }
  }

  const lem = await fetchJson(`${base}/api/v1/models`)
  const lemJson = lem.json as { data?: Array<{ id?: string }> } | null
  if (lem.ok && lemJson?.data) {
    return {
      kind: 'openai',
      baseUrl: `${base}/api/v1`,
      name: 'Lemonade Server',
      reachable: true,
      models: lemJson.data.map((m) => ({ id: String(m.id ?? ''), display: String(m.id ?? '') }))
    }
  }

  return { kind: null, baseUrl: base, name: 'Unreachable', reachable: false, models: [] }
}

export async function discoverProviders(extraUrls: string[] = []): Promise<DiscoveredProvider[]> {
  const urls = [
    ...new Set([
      ...extraUrls.map(normalizeCompanionBaseUrl),
      ...DEFAULT_PROVIDER_CANDIDATES.map((u) => u)
    ])
  ]
  const results = await Promise.all(urls.map((u) => probeEndpoint(u)))
  return results.filter((r) => r.reachable)
}
