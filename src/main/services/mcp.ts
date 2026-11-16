import { spawn } from 'child_process'
import type { McpServerConfig, McpServerProbeResult, McpToolInfo } from '../../shared/mcp'
import { validateMcpServerConfig } from '../../shared/mcp'
import { redactSecrets } from './security'

interface JsonRpcMessage {
  jsonrpc?: string
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string }
}

/**
 * Minimal local stdio MCP client: initialize + tools/list.
 * Does not call tools (invocation stays user-gated / future work).
 */
export class McpService {
  async probeServer(
    server: McpServerConfig,
    opts?: { timeoutMs?: number }
  ): Promise<McpServerProbeResult> {
    const validated = validateMcpServerConfig(server)
    if (!validated.ok) {
      return {
        serverId: server.id,
        status: 'error',
        message: validated.error,
        tools: []
      }
    }
    if (!validated.config.enabled) {
      return {
        serverId: server.id,
        status: 'disabled',
        message: 'Server is disabled.',
        tools: []
      }
    }

    const timeoutMs = opts?.timeoutMs ?? 12_000
    const started = Date.now()
    const cfg = validated.config

    return await new Promise((resolve) => {
      let settled = false
      let buffer = ''
      let nextId = 1
      const pending = new Map<number, { method: string; resolve: (msg: JsonRpcMessage) => void }>()

      const finish = (result: McpServerProbeResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          child.kill('SIGTERM')
        } catch {
          // ignore
        }
        resolve({ ...result, latencyMs: Date.now() - started })
      }

      const child = spawn(cfg.command, cfg.args, {
        cwd: cfg.cwd || undefined,
        env: { ...process.env, ...(cfg.env ?? {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      })

      const timer = setTimeout(() => {
        finish({
          serverId: cfg.id,
          status: 'error',
          message: `Timed out after ${timeoutMs}ms waiting for MCP tools/list.`,
          tools: []
        })
      }, timeoutMs)

      child.on('error', (err) => {
        finish({
          serverId: cfg.id,
          status: 'error',
          message: redactSecrets(
            `Failed to start MCP server: ${err.message}. Is the command installed?`
          ),
          tools: []
        })
      })

      child.stderr?.on('data', () => {
        // Intentionally not surfaced in full — may contain secrets from the server.
      })

      const send = (msg: Record<string, unknown>) => {
        child.stdin?.write(`${JSON.stringify(msg)}\n`)
      }

      const request = (method: string, params?: unknown) =>
        new Promise<JsonRpcMessage>((res) => {
          const id = nextId++
          pending.set(id, { method, resolve: res })
          send({ jsonrpc: '2.0', id, method, params })
        })

      const onMessage = async (msg: JsonRpcMessage) => {
        if (msg.id != null && pending.has(Number(msg.id))) {
          const waiter = pending.get(Number(msg.id))
          pending.delete(Number(msg.id))
          waiter?.resolve(msg)
        }
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let idx = buffer.indexOf('\n')
        while (idx >= 0) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (line) {
            try {
              void onMessage(JSON.parse(line) as JsonRpcMessage)
            } catch {
              // ignore non-JSON lines
            }
          }
          idx = buffer.indexOf('\n')
        }
      })

      child.on('close', (code) => {
        if (settled) return
        finish({
          serverId: cfg.id,
          status: 'error',
          message: `MCP process exited early (code ${code ?? '?'}).`,
          tools: []
        })
      })

      void (async () => {
        try {
          const init = await request('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'forgelocal', version: '0.1.0' }
          })
          if (init.error) {
            finish({
              serverId: cfg.id,
              status: 'error',
              message: redactSecrets(init.error.message || 'initialize failed'),
              tools: []
            })
            return
          }
          send({ jsonrpc: '2.0', method: 'notifications/initialized' })
          const listed = await request('tools/list', {})
          if (listed.error) {
            finish({
              serverId: cfg.id,
              status: 'error',
              message: redactSecrets(listed.error.message || 'tools/list failed'),
              tools: []
            })
            return
          }
          const toolsRaw = (listed.result as { tools?: McpToolInfo[] } | undefined)?.tools
          const tools = Array.isArray(toolsRaw)
            ? toolsRaw.map((t) => ({
                name: String(t.name),
                description: t.description ? String(t.description) : undefined,
                inputSchema:
                  t.inputSchema && typeof t.inputSchema === 'object'
                    ? (t.inputSchema as Record<string, unknown>)
                    : undefined
              }))
            : []
          finish({
            serverId: cfg.id,
            status: 'connected',
            message:
              tools.length > 0
                ? `Connected · ${tools.length} tool(s)`
                : 'Connected · server reported no tools',
            tools
          })
        } catch (err) {
          finish({
            serverId: cfg.id,
            status: 'error',
            message: redactSecrets(err instanceof Error ? err.message : String(err)),
            tools: []
          })
        }
      })()
    })
  }

  async probeAll(servers: McpServerConfig[]): Promise<Record<string, McpServerProbeResult>> {
    const out: Record<string, McpServerProbeResult> = {}
    for (const server of servers) {
      out[server.id] = await this.probeServer(server)
    }
    return out
  }
}
