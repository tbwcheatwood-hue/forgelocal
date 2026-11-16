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
    const mcpHits = catalog.search({ query: 'mcp' })
    expect(mcpHits.some((i) => i.id === 'thirdparty-mcp-dock' && i.implemented)).toBe(true)
    expect(mcpHits.some((i) => i.id === 'builtin-mcp-stdio' && i.implemented)).toBe(true)
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

  it('indexes official MCP sources, registries, and stdio starters', () => {
    const expected = [
      'mcp-ref-official-servers',
      'mcp-ref-servers-archived',
      'mcp-ref-voltagent-official',
      'mcp-ref-awesome-punkpeye',
      'mcp-ref-awesome-appcypher',
      'mcp-ref-openhands-extensions',
      'mcp-ref-registry-official',
      'mcp-ref-smithery',
      'mcp-ref-pulsemcp',
      'mcp-ref-cline-marketplace',
      'optional-mcp-context7-starter',
      'optional-mcp-playwright-starter',
      'optional-mcp-repomix-starter',
      'optional-mcp-git-starter',
      'optional-mcp-fetch-starter'
    ]
    for (const id of expected) {
      const item = catalog.get(id)
      expect(item, id).toBeTruthy()
      expect(item!.tags).toContain('mcp')
      expect(item!.requiresRemote).not.toBe(true)
    }
    expect(
      catalog.search({ query: 'context7' }).some((i) => i.id === 'optional-mcp-context7-starter')
    ).toBe(true)
    expect(catalog.search({ query: 'smithery' }).some((i) => i.id === 'mcp-ref-smithery')).toBe(
      true
    )
    expect(catalog.get('optional-mcp-filesystem-example')?.mcpSuggested?.command).toBe('npx')
    expect(catalog.get('mcp-ref-openhands-extensions')?.sampleConfigJson).toMatch(/mcpServers/)
  })

  it('reloads the offline catalog without network', () => {
    const result = catalog.refreshOffline()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.count).toBeGreaterThan(0)
  })
})
