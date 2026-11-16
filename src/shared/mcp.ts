import type { CatalogItem } from './types'

export type McpServerStatus =
  'idle' | 'connecting' | 'connected' | 'error' | 'disabled' | 'unavailable'

export interface McpServerConfig {
  id: string
  name: string
  /** Executable for a local stdio MCP server (no remote URL inventing). */
  command: string
  args: string[]
  cwd?: string
  /** Optional env overrides — values are never logged. */
  env?: Record<string, string>
  enabled: boolean
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpServerProbeResult {
  serverId: string
  status: McpServerStatus
  message: string
  tools: McpToolInfo[]
  latencyMs?: number
}

export type McpDockStatus =
  'unavailable' | 'empty' | 'stub' | 'ready' | 'configured' | 'error' | 'loading'

export interface McpDockCatalogRow {
  id: string
  name: string
  description: string
  available: boolean
  enabled: boolean
  reason: string
  tags: string[]
}

export interface McpDockSnapshot {
  status: McpDockStatus
  message: string
  catalogRows: McpDockCatalogRow[]
  servers: Array<{
    id: string
    name: string
    enabled: boolean
    command: string
    status: McpServerStatus
    message: string
    tools: McpToolInfo[]
  }>
}

const BLOCKED_COMMAND_RE = /[;&|`$<>]|^\s*https?:\/\//i

export function validateMcpServerConfig(
  input: Partial<McpServerConfig> & { name?: string; command?: string }
): { ok: true; config: McpServerConfig } | { ok: false; error: string } {
  const name = (input.name ?? '').trim()
  const command = (input.command ?? '').trim()
  if (!name) return { ok: false, error: 'MCP server name is required.' }
  if (!command)
    return { ok: false, error: 'MCP server command is required (local stdio executable).' }
  if (BLOCKED_COMMAND_RE.test(command)) {
    return {
      ok: false,
      error:
        'Command must be a local executable path or binary name — no shell operators or remote URLs.'
    }
  }
  const args = Array.isArray(input.args) ? input.args.map((a) => String(a)) : []
  for (const arg of args) {
    if (/[;&|`$]/.test(arg)) {
      return { ok: false, error: `Unsafe character in MCP arg: ${arg}` }
    }
  }
  const env =
    input.env && typeof input.env === 'object'
      ? Object.fromEntries(
          Object.entries(input.env)
            .filter(([k, v]) => k.trim() && typeof v === 'string')
            .map(([k, v]) => [k.trim(), v])
        )
      : undefined

  return {
    ok: true,
    config: {
      id: (input.id ?? '').trim() || cryptoRandomId(),
      name,
      command,
      args,
      cwd: input.cwd?.trim() || undefined,
      env,
      enabled: input.enabled !== false
    }
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `mcp-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function parseMcpArgsInput(raw: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return out.filter(Boolean)
}

export function isMcpCatalogItem(item: CatalogItem): boolean {
  return item.tags.includes('mcp') || item.id.includes('mcp')
}

export function buildMcpDockSnapshot(input: {
  catalog: CatalogItem[]
  enabledTools: Record<string, boolean>
  servers: McpServerConfig[]
  probes?: Record<string, McpServerProbeResult>
  query?: string
}): McpDockSnapshot {
  const q = (input.query ?? '').trim().toLowerCase()
  const catalogRows: McpDockCatalogRow[] = input.catalog
    .filter(isMcpCatalogItem)
    .filter((item) => {
      if (!q) return true
      return [item.name, item.description, item.source, ...item.tags]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      available: item.implemented,
      enabled: Boolean(input.enabledTools[item.id]),
      reason: item.implemented
        ? item.installGuidance || 'Available in this build'
        : item.installGuidance || 'Not implemented in this build',
      tags: item.tags
    }))

  const servers = input.servers.map((server) => {
    const probe = input.probes?.[server.id]
    if (!server.enabled) {
      return {
        id: server.id,
        name: server.name,
        enabled: false,
        command: server.command,
        status: 'disabled' as const,
        message: 'Disabled in settings',
        tools: []
      }
    }
    if (!probe) {
      return {
        id: server.id,
        name: server.name,
        enabled: true,
        command: [server.command, ...server.args].join(' '),
        status: 'idle' as const,
        message: 'Not probed yet — click Refresh tools',
        tools: []
      }
    }
    return {
      id: server.id,
      name: server.name,
      enabled: true,
      command: [server.command, ...server.args].join(' '),
      status: probe.status,
      message: probe.message,
      tools: probe.tools
    }
  })

  const featureEnabled = input.enabledTools['thirdparty-mcp-dock'] !== false
  if (!featureEnabled) {
    return {
      status: 'unavailable',
      message: 'MCP dock is disabled in the Tools catalog. Enable “MCP Tool Dock” to use it.',
      catalogRows,
      servers
    }
  }

  if (catalogRows.length === 0 && servers.length === 0) {
    return {
      status: 'empty',
      message: 'No MCP catalog entries or configured servers yet.',
      catalogRows,
      servers
    }
  }

  const connected = servers.filter((s) => s.status === 'connected')
  const errored = servers.filter((s) => s.status === 'error')
  const anyImplemented = catalogRows.some((r) => r.available)

  if (connected.length) {
    const toolCount = connected.reduce((n, s) => n + s.tools.length, 0)
    return {
      status: 'ready',
      message: `${connected.length} MCP server(s) connected · ${toolCount} tool(s) listed.`,
      catalogRows,
      servers
    }
  }

  if (servers.some((s) => s.enabled)) {
    if (errored.length && errored.length === servers.filter((s) => s.enabled).length) {
      return {
        status: 'error',
        message: 'Configured MCP servers failed to connect. Check command/args and try Refresh.',
        catalogRows,
        servers
      }
    }
    return {
      status: 'configured',
      message:
        'Local MCP servers are configured. Refresh to list tools over stdio (no remote credentials used).',
      catalogRows,
      servers
    }
  }

  if (anyImplemented) {
    return {
      status: 'ready',
      message:
        'MCP catalog is installed. Add a local stdio server below to list live tools, or browse catalog entries.',
      catalogRows,
      servers
    }
  }

  return {
    status: 'stub',
    message: 'MCP catalog entries found, but none are implemented yet.',
    catalogRows,
    servers
  }
}
