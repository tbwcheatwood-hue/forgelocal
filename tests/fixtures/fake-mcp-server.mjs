#!/usr/bin/env node
/**
 * Minimal stdio MCP server fixture for ForgeLocal tests / smoke.
 * Speaks initialize + tools/list only.
 */
import readline from 'node:readline'

const tools = [
  {
    name: 'echo',
    description: 'Echo a message (fixture tool)',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message']
    }
  },
  {
    name: 'ping',
    description: 'Return pong',
    inputSchema: { type: 'object', properties: {} }
  }
]

const rl = readline.createInterface({ input: process.stdin, terminal: false })

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let msg
  try {
    msg = JSON.parse(trimmed)
  } catch {
    return
  }
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'forgelocal-fake-mcp', version: '0.0.1' }
      }
    })
    return
  }
  if (msg.method === 'notifications/initialized') return
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    return
  }
  if (msg.id != null) {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `Method not found: ${msg.method}` }
    })
  }
})
