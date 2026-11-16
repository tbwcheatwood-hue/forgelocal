import path from 'path'
import { describe, expect, it } from 'vitest'
import { buildMcpDockSnapshot, parseMcpArgsInput, validateMcpServerConfig } from '../src/shared/mcp'
import { McpService } from '../src/main/services/mcp'
import type { CatalogItem } from '../src/shared/types'

const mcpDock: CatalogItem = {
  id: 'thirdparty-mcp-dock',
  name: 'MCP Tool Dock',
  description: 'dock',
  category: 'ai-tools',
  tags: ['mcp', 'dock'],
  trust: 'third-party',
  source: 'bundled',
  implemented: true,
  enabledByDefault: true,
  installGuidance: 'Enable and add servers'
}

describe('MCP config validation', () => {
  it('accepts a local stdio command', () => {
    const result = validateMcpServerConfig({
      name: 'Fixture',
      command: 'node',
      args: ['tests/fixtures/fake-mcp-server.mjs'],
      enabled: true
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.command).toBe('node')
      expect(result.config.args).toEqual(['tests/fixtures/fake-mcp-server.mjs'])
    }
  })

  it('rejects remote URLs and shell operators', () => {
    expect(validateMcpServerConfig({ name: 'x', command: 'https://evil.example' }).ok).toBe(false)
    expect(validateMcpServerConfig({ name: 'x', command: 'node; rm -rf /' }).ok).toBe(false)
    expect(validateMcpServerConfig({ name: 'x', command: 'node', args: ['a;b'] }).ok).toBe(false)
  })

  it('parses quoted args', () => {
    expect(parseMcpArgsInput(`-y "@scope/pkg" /tmp/workspace`)).toEqual([
      '-y',
      '@scope/pkg',
      '/tmp/workspace'
    ])
  })
})

describe('MCP dock snapshot', () => {
  it('reports ready when catalog MCP is implemented', () => {
    const snap = buildMcpDockSnapshot({
      catalog: [mcpDock],
      enabledTools: { 'thirdparty-mcp-dock': true },
      servers: []
    })
    expect(snap.status).toBe('ready')
    expect(snap.catalogRows).toHaveLength(1)
  })

  it('reports configured when servers exist but are unprobed', () => {
    const snap = buildMcpDockSnapshot({
      catalog: [mcpDock],
      enabledTools: { 'thirdparty-mcp-dock': true },
      servers: [
        {
          id: 's1',
          name: 'Fixture',
          command: 'node',
          args: ['x'],
          enabled: true
        }
      ]
    })
    expect(snap.status).toBe('configured')
  })

  it('filters catalog rows by query', () => {
    const snap = buildMcpDockSnapshot({
      catalog: [mcpDock],
      enabledTools: {},
      servers: [],
      query: 'filesystem'
    })
    expect(snap.catalogRows).toHaveLength(0)
  })
})

describe('MCP stdio probe', () => {
  it('lists tools from the fake local MCP server', async () => {
    const fixture = path.resolve('tests/fixtures/fake-mcp-server.mjs')
    const mcp = new McpService()
    const result = await mcp.probeServer({
      id: 'fixture',
      name: 'Fixture',
      command: process.execPath,
      args: [fixture],
      enabled: true
    })
    expect(result.status).toBe('connected')
    expect(result.tools.map((t) => t.name).sort()).toEqual(['echo', 'ping'])
  }, 20_000)
})
