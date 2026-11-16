import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import type { AppSettings, ChatCompletionRequest, ProposedEdit } from '../../shared/types'
import {
  assertOnlineToolAllowed,
  disableRemoteOnlyTools,
  isRemoteMode
} from '../../shared/providerTools'
import { checkPromptSize, prepareContextFiles, PROMPT_MAX_CHARS } from '../../shared/messageLimits'
import type { McpServerConfig } from '../../shared/mcp'
import { validateMcpServerConfig } from '../../shared/mcp'
import { normalizeAgentTeam } from '../../shared/agents'
import { AgentsService } from '../services/agents'
import { CatalogService } from '../services/catalog'
import { parseProposedEdits } from '../services/edits'
import { FilesystemService } from '../services/filesystem'
import { LmStudioService } from '../services/lmstudio'
import { McpService } from '../services/mcp'
import { SettingsService } from '../services/settings'
import { validateCommandSafety } from '../services/security'

export interface Services {
  fs: FilesystemService
  settings: SettingsService
  lm: LmStudioService
  catalog: CatalogService
  mcp: McpService
  agents: AgentsService
}

function applySettingsSideEffects(
  fileService: FilesystemService,
  settings: SettingsService,
  catalog: CatalogService,
  next: AppSettings
): AppSettings {
  const sanitized = disableRemoteOnlyTools(next, catalog.list())
  const finalSettings =
    sanitized === next ? next : settings.updateSettings({ enabledTools: sanitized.enabledTools })
  fileService.setAllowOutside(finalSettings.allowPathsOutsideWorkspace)
  return finalSettings
}

export function registerIpc(services: Services): void {
  const { fs: fileService, settings, lm, catalog, mcp, agents } = services

  ipcMain.handle('settings:get', () => settings.getSettings())
  ipcMain.handle('settings:update', (_e, partial: Partial<AppSettings>) => {
    const next = settings.updateSettings(partial)
    return applySettingsSideEffects(fileService, settings, catalog, next)
  })

  ipcMain.handle('workspace:open', async (_e, dirPath?: string) => {
    let target = dirPath
    if (!target) {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })
      if (result.canceled || !result.filePaths[0]) return null
      target = result.filePaths[0]
    }
    const root = await fileService.openWorkspace(target)
    settings.addRecentProject(root)
    return { root, tree: await fileService.readTree(), hasGit: await fileService.hasGit() }
  })

  ipcMain.handle('workspace:tree', async () => {
    if (!fileService.workspaceRoot) return null
    return fileService.readTree()
  })

  ipcMain.handle('workspace:recent', () => settings.getSettings().recentProjects)

  ipcMain.handle('file:read', async (_e, filePath: string) => fileService.readFile(filePath))
  ipcMain.handle('file:write', async (_e, filePath: string, content: string) =>
    fileService.writeFile(filePath, content)
  )
  ipcMain.handle('file:create', async (_e, filePath: string, content?: string) =>
    fileService.createFile(filePath, content)
  )
  ipcMain.handle('file:delete', async (_e, filePath: string) => {
    await fileService.deletePath(filePath)
    return true
  })
  ipcMain.handle('file:search', async (_e, query: string) => fileService.search(query))

  ipcMain.handle('lm:test', async () => {
    const provider = settings.getSettings().provider
    return lm.testConnection(provider)
  })

  ipcMain.handle('lm:models', async () => {
    const provider = settings.getSettings().provider
    return lm.listModels(provider)
  })

  ipcMain.handle(
    'lm:chat',
    async (
      event,
      payload: {
        requestId: string
        messages: ChatCompletionRequest['messages']
        contextFiles: Array<{ relativePath: string; path: string; content: string }>
      }
    ) => {
      const provider = settings.getSettings().provider

      const normalizedMessages = (payload.messages ?? []).map((m) => {
        const content = typeof m.content === 'string' ? m.content : ''
        const check = checkPromptSize(content)
        if (!check.ok && m.role === 'user') {
          throw new Error(check.message ?? `Message exceeds ${PROMPT_MAX_CHARS} characters`)
        }
        return {
          role: m.role,
          content: content.length > PROMPT_MAX_CHARS ? content.slice(0, PROMPT_MAX_CHARS) : content
        }
      })

      const prepared = prepareContextFiles(payload.contextFiles ?? [])
      const systemParts = [
        isRemoteMode(provider)
          ? 'You are ForgeLocal, a coding assistant using a user-configured remote OpenAI-compatible model.'
          : 'You are ForgeLocal, a local coding assistant.',
        'Only use the files the user explicitly attached as context.',
        'When proposing file edits, use fenced code blocks headed with: // file: relative/path',
        'Do not claim to have written files; the user must accept diffs.'
      ]
      if (prepared.message) systemParts.push(prepared.message)
      if (prepared.files.length) {
        systemParts.push('Attached context files:')
        for (const file of prepared.files) {
          systemParts.push(`--- ${file.relativePath} ---\n${file.content}`)
        }
      }

      const messages: ChatCompletionRequest['messages'] = [
        { role: 'system', content: systemParts.join('\n\n') },
        ...normalizedMessages
      ]

      let full = ''
      await lm.chat(
        payload.requestId,
        provider,
        { messages, model: provider.model, stream: provider.stream },
        (chunk) => {
          if (chunk.type === 'delta' && chunk.content) full += chunk.content
          try {
            event.sender.send('lm:chunk', { requestId: payload.requestId, chunk })
          } catch {
            // Sender may be gone if the window closed mid-stream.
          }
        }
      )

      const proposedEdits = parseProposedEdits(full, prepared.files)
      return { content: full, proposedEdits }
    }
  )

  ipcMain.handle('lm:cancel', (_e, requestId: string) => lm.cancel(requestId))

  ipcMain.handle(
    'agents:generateTeam',
    async (
      event,
      payload: { requestId: string; description: string }
    ): Promise<{ ok: true; agents: unknown } | { ok: false; error: string }> => {
      const provider = settings.getSettings().provider
      const result = await agents.generateTeam(
        payload.requestId,
        provider,
        payload.description,
        (chunk) => {
          try {
            event.sender.send('lm:chunk', { requestId: payload.requestId, chunk })
          } catch {
            /* window gone */
          }
        }
      )
      return result
    }
  )

  ipcMain.handle(
    'agents:runTeam',
    async (
      event,
      payload: {
        requestId: string
        messages: ChatCompletionRequest['messages']
        contextFiles: Array<{ relativePath: string; path: string; content: string }>
      }
    ) => {
      const current = settings.getSettings()
      const provider = current.provider
      const team = normalizeAgentTeam(current.agentTeam)
      const featureOn = current.enabledTools['optional-multi-agent'] !== false
      if (!featureOn) {
        throw new Error('Multi-agent teaming is disabled in the Tools catalog.')
      }
      if (!team.enabled) {
        throw new Error('Multi-agent mode is off. Enable it in the Agents panel.')
      }

      const prepared = prepareContextFiles(payload.contextFiles ?? [])
      const contextBlock = prepared.files.length
        ? prepared.files.map((f) => `--- ${f.relativePath} ---\n${f.content}`).join('\n\n')
        : ''
      const userGoal =
        [...(payload.messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? ''

      const send = (chunk: import('../../shared/types').StreamChunk) => {
        try {
          event.sender.send('lm:chunk', { requestId: payload.requestId, chunk })
        } catch {
          /* window gone */
        }
      }

      const { content, turns } = await agents.runTeam(
        payload.requestId,
        provider,
        team,
        userGoal,
        contextBlock,
        send
      )
      const proposedEdits = parseProposedEdits(content, prepared.files)
      return {
        content,
        proposedEdits,
        agentRun: {
          mode: 'multi' as const,
          turns: turns.map((t) => ({
            agentId: t.agent.id,
            agentName: t.agent.name,
            content: t.content,
            error: t.error
          }))
        }
      }
    }
  )

  ipcMain.handle(
    'edits:apply',
    async (_e, edit: ProposedEdit, decision: 'accepted' | 'rejected') => {
      if (decision === 'rejected') {
        return { ...edit, status: 'rejected' as const }
      }
      if (decision !== 'accepted') {
        throw new Error('Invalid decision')
      }
      await fileService.writeFile(edit.path, edit.proposedContent)
      return { ...edit, status: 'accepted' as const }
    }
  )

  ipcMain.handle('catalog:list', () => catalog.list())
  ipcMain.handle('catalog:search', (_e, filter) => catalog.search(filter ?? {}))
  ipcMain.handle('catalog:get', (_e, id: string) => catalog.get(id))
  ipcMain.handle('catalog:refresh', () => catalog.refreshOffline())

  ipcMain.handle('catalog:setEnabled', (_e, id: string, enabled: boolean) => {
    const item = catalog.get(id)
    if (!item) throw new Error('Unknown catalog item')
    if (!item.implemented && enabled) {
      throw new Error(
        `"${item.name}" is not implemented in this build and cannot be enabled as installed.`
      )
    }
    const current = settings.getSettings()
    if (enabled) assertOnlineToolAllowed(current, item)
    const next = settings.updateSettings({
      enabledTools: { ...current.enabledTools, [id]: enabled }
    })
    return applySettingsSideEffects(fileService, settings, catalog, next)
  })

  ipcMain.handle('mcp:listServers', () => settings.getSettings().mcpServers ?? [])

  ipcMain.handle('mcp:upsertServer', (_e, input: Partial<McpServerConfig>) => {
    const validated = validateMcpServerConfig(input)
    if (!validated.ok) throw new Error(validated.error)
    const current = settings.getSettings()
    const servers = [...(current.mcpServers ?? [])]
    const idx = servers.findIndex((s) => s.id === validated.config.id)
    if (idx >= 0) servers[idx] = validated.config
    else servers.push(validated.config)
    return settings.updateSettings({ mcpServers: servers })
  })

  ipcMain.handle('mcp:removeServer', (_e, id: string) => {
    const current = settings.getSettings()
    return settings.updateSettings({
      mcpServers: (current.mcpServers ?? []).filter((s) => s.id !== id)
    })
  })

  ipcMain.handle('mcp:probeServer', async (_e, id: string) => {
    const server = (settings.getSettings().mcpServers ?? []).find((s) => s.id === id)
    if (!server) throw new Error('Unknown MCP server')
    return mcp.probeServer(server)
  })

  ipcMain.handle('mcp:probeAll', async () => {
    const servers = settings.getSettings().mcpServers ?? []
    return mcp.probeAll(servers)
  })

  ipcMain.handle('chat:sessions', () => settings.getChatSessions())
  ipcMain.handle('chat:save', (_e, session) => {
    try {
      return settings.saveChatSession(session)
    } catch (err) {
      throw new Error(
        `Chat history was not saved (${err instanceof Error ? err.message : String(err)}). Your in-memory conversation is still available.`
      )
    }
  })
  ipcMain.handle('chat:delete', (_e, id: string) => settings.deleteChatSession(id))

  ipcMain.handle(
    'terminal:runApproved',
    async (event, payload: { command: string; cwd?: string; requestId?: string }) => {
      const safety = validateCommandSafety(payload.command)
      if (!safety.safe) {
        return { ok: false as const, error: safety.reason }
      }
      const cwd = payload.cwd || fileService.workspaceRoot || process.cwd()
      if (
        fileService.workspaceRoot &&
        !fileService.isInsideWorkspace(cwd) &&
        !settings.getSettings().allowPathsOutsideWorkspace
      ) {
        return {
          ok: false as const,
          error: 'Command cwd is outside the workspace and outside-path access is disabled.'
        }
      }

      return await new Promise((resolve) => {
        const child = spawn(payload.command, {
          cwd,
          shell: true,
          env: process.env
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => {
          const text = d.toString()
          stdout += text
          event.sender.send('terminal:data', { stream: 'stdout', data: text })
        })
        child.stderr.on('data', (d) => {
          const text = d.toString()
          stderr += text
          event.sender.send('terminal:data', { stream: 'stderr', data: text })
        })
        child.on('error', (err) => {
          resolve({ ok: false as const, error: err.message, stdout, stderr })
        })
        child.on('close', (code) => {
          resolve({ ok: true as const, code: code ?? 0, stdout, stderr })
        })
      })
    }
  )

  ipcMain.handle('dialog:confirm', async (_e, message: string, detail?: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showMessageBox(win ?? undefined!, {
      type: 'warning',
      buttons: ['Cancel', 'Confirm'],
      defaultId: 0,
      cancelId: 0,
      message,
      detail
    })
    return result.response === 1
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs allowed')
    await shell.openExternal(url)
  })

  ipcMain.handle('util:id', () => randomUUID())
}
