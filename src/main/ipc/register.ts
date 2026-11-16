import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import type { AppSettings, ChatCompletionRequest, ProposedEdit } from '../../shared/types'
import { CatalogService } from '../services/catalog'
import { parseProposedEdits } from '../services/edits'
import { FilesystemService } from '../services/filesystem'
import { LmStudioService } from '../services/lmstudio'
import { SettingsService } from '../services/settings'
import { validateCommandSafety } from '../services/security'

export interface Services {
  fs: FilesystemService
  settings: SettingsService
  lm: LmStudioService
  catalog: CatalogService
}

export function registerIpc(services: Services): void {
  const { fs: fileService, settings, lm, catalog } = services

  ipcMain.handle('settings:get', () => settings.getSettings())
  ipcMain.handle('settings:update', (_e, partial: Partial<AppSettings>) => {
    const next = settings.updateSettings(partial)
    fileService.setAllowOutside(next.allowPathsOutsideWorkspace)
    return next
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
      const systemParts = [
        'You are ForgeLocal, a local coding assistant.',
        'Only use the files the user explicitly attached as context.',
        'When proposing file edits, use fenced code blocks headed with: // file: relative/path',
        'Do not claim to have written files; the user must accept diffs.'
      ]
      if (payload.contextFiles.length) {
        systemParts.push('Attached context files:')
        for (const file of payload.contextFiles) {
          systemParts.push(`--- ${file.relativePath} ---\n${file.content}`)
        }
      }

      const messages: ChatCompletionRequest['messages'] = [
        { role: 'system', content: systemParts.join('\n\n') },
        ...payload.messages
      ]

      let full = ''
      await lm.chat(
        payload.requestId,
        provider,
        { messages, model: provider.model, stream: provider.stream },
        (chunk) => {
          if (chunk.type === 'delta' && chunk.content) full += chunk.content
          event.sender.send('lm:chunk', { requestId: payload.requestId, chunk })
        }
      )

      const proposedEdits = parseProposedEdits(full, payload.contextFiles)
      return { content: full, proposedEdits }
    }
  )

  ipcMain.handle('lm:cancel', (_e, requestId: string) => lm.cancel(requestId))

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
    return settings.updateSettings({
      enabledTools: { ...current.enabledTools, [id]: enabled }
    })
  })

  ipcMain.handle('chat:sessions', () => settings.getChatSessions())
  ipcMain.handle('chat:save', (_e, session) => settings.saveChatSession(session))
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
