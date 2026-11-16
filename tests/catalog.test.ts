import path from 'path'
import { describe, expect, it } from 'vitest'
import { CatalogService } from '../src/main/services/catalog'

describe('offline tools catalog', () => {
  const catalog = new CatalogService(path.resolve('resources/catalog.json'))

  it('loads bundled catalog items', () => {
    expect(catalog.list().length).toBeGreaterThan(5)
  })

  it('searches by keyword across name, tags, and description', () => {
    const hits = catalog.search({ query: 'diff' })
    expect(hits.some((i) => i.id === 'builtin-diff-review')).toBe(true)
  })

  it('filters by category and trust', () => {
    const ai = catalog.search({ category: 'ai-tools' })
    expect(ai.every((i) => i.category === 'ai-tools')).toBe(true)
    const third = catalog.search({ trust: 'third-party' })
    expect(third.every((i) => i.trust === 'third-party')).toBe(true)
  })

  it('distinguishes implemented vs stub items', () => {
    const stubs = catalog.search({ query: 'mcp' })
    expect(stubs[0]?.implemented).toBe(false)
    const builtin = catalog.get('builtin-lmstudio')
    expect(builtin?.implemented).toBe(true)
    expect(builtin?.trust).toBe('built-in')
    const online = catalog.get('optional-online-extensions')
    expect(online?.requiresRemote).toBe(true)
    expect(online?.implemented).toBe(true)
    const remote = catalog.get('thirdparty-remote-models')
    expect(remote?.implemented).toBe(true)
    expect(remote?.requiresRemote).toBe(false)
  })

  it('reloads the offline catalog without network', () => {
    const result = catalog.refreshOffline()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.count).toBeGreaterThan(0)
  })
})
