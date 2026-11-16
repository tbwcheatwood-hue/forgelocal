import { describe, expect, it } from 'vitest'
import {
  assertOnlineToolAllowed,
  buildMcpDockSnapshot,
  canUseOnlineTools,
  catalogItemRequiresRemote,
  disableRemoteOnlyTools,
  isRemoteMode
} from '../src/shared/providerTools'
import type { AppSettings, CatalogItem } from '../src/shared/types'
import { DEFAULT_SETTINGS } from '../src/shared/types'

const onlineItem: CatalogItem = {
  id: 'optional-online-extensions',
  name: 'Online tools & extensions',
  description: 'test',
  category: 'ai-tools',
  tags: ['online', 'cloud'],
  trust: 'optional',
  source: 'bundled',
  implemented: true,
  enabledByDefault: false,
  requiresRemote: true,
  installGuidance: 'needs remote'
}

const mcpItem: CatalogItem = {
  id: 'thirdparty-mcp-dock',
  name: 'MCP Tool Dock',
  description: 'mcp',
  category: 'ai-tools',
  tags: ['mcp', 'dock'],
  trust: 'third-party',
  source: 'bundled',
  implemented: true,
  enabledByDefault: true,
  installGuidance: 'local stdio'
}

const remoteModels: CatalogItem = {
  id: 'thirdparty-remote-models',
  name: 'Remote Cloud Models',
  description: 'settings',
  category: 'ai-tools',
  tags: ['cloud', 'remote'],
  trust: 'third-party',
  source: 'settings',
  implemented: true,
  enabledByDefault: false,
  requiresRemote: false,
  installGuidance: 'settings'
}

function settingsWith(
  partial: Partial<AppSettings['provider']> & { enabledTools?: Record<string, boolean> }
): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    provider: {
      ...DEFAULT_SETTINGS.provider,
      ...partial
    },
    enabledTools: partial.enabledTools ?? {}
  }
}

describe('provider / online tool gating', () => {
  it('treats only mode=remote as remote', () => {
    expect(isRemoteMode({ mode: 'local' })).toBe(false)
    expect(isRemoteMode({ mode: 'remote' })).toBe(true)
  })

  it('requires remote mode + selected model for online tools', () => {
    expect(canUseOnlineTools(settingsWith({ mode: 'local', model: 'anything' }))).toBe(false)
    expect(canUseOnlineTools(settingsWith({ mode: 'remote', model: '' }))).toBe(false)
    expect(canUseOnlineTools(settingsWith({ mode: 'remote', model: 'gpt-test' }))).toBe(true)
  })

  it('respects explicit requiresRemote flags over cloud tags', () => {
    expect(catalogItemRequiresRemote(onlineItem)).toBe(true)
    expect(catalogItemRequiresRemote(remoteModels)).toBe(false)
  })

  it('blocks enabling online tools on local model', () => {
    expect(() =>
      assertOnlineToolAllowed(settingsWith({ mode: 'local', model: 'local-1' }), onlineItem)
    ).toThrow(/remote cloud model/i)
  })

  it('allows enabling online tools when remote model is active', () => {
    expect(() =>
      assertOnlineToolAllowed(settingsWith({ mode: 'remote', model: 'gpt-test' }), onlineItem)
    ).not.toThrow()
  })

  it('disables remote-only tools when leaving remote+model', () => {
    const next = disableRemoteOnlyTools(
      settingsWith({
        mode: 'local',
        model: '',
        enabledTools: { 'optional-online-extensions': true, 'builtin-terminal': true }
      }),
      [onlineItem, mcpItem]
    )
    expect(next.enabledTools['optional-online-extensions']).toBe(false)
    expect(next.enabledTools['builtin-terminal']).toBe(true)
  })
})

describe('MCP dock snapshot (via providerTools re-export)', () => {
  it('reports ready for implemented MCP catalog without live servers', () => {
    const snap = buildMcpDockSnapshot({
      catalog: [mcpItem],
      enabledTools: { 'thirdparty-mcp-dock': true },
      servers: []
    })
    expect(snap.status).toBe('ready')
    expect(snap.catalogRows[0]?.available).toBe(true)
  })

  it('reports empty when no MCP catalog entries', () => {
    const snap = buildMcpDockSnapshot({
      catalog: [remoteModels],
      enabledTools: {},
      servers: []
    })
    expect(snap.status).toBe('empty')
  })
})
