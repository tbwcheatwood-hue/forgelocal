import Store from 'electron-store'
import type { AppSettings, ChatSession } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { truncateChatSessionForStorage } from '../../shared/messageLimits'

interface StoreSchema {
  settings: AppSettings
  chatSessions: ChatSession[]
  pendingApprovals: never[]
}

export class SettingsService {
  private store: Store<StoreSchema>

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'forgelocal',
      defaults: {
        settings: structuredClone(DEFAULT_SETTINGS),
        chatSessions: [],
        pendingApprovals: []
      }
    })
  }

  getSettings(): AppSettings {
    const settings = this.store.get('settings')
    const provider = {
      ...DEFAULT_SETTINGS.provider,
      ...(settings.provider ?? {})
    }
    if (provider.mode !== 'local' && provider.mode !== 'remote') {
      provider.mode = 'local'
    }
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...settings,
      provider,
      mcpServers: Array.isArray(settings.mcpServers)
        ? settings.mcpServers
        : structuredClone(DEFAULT_SETTINGS.mcpServers)
    }
  }

  updateSettings(partial: Partial<AppSettings>): AppSettings {
    const current = this.getSettings()
    const next: AppSettings = {
      ...current,
      ...partial,
      provider: {
        ...current.provider,
        ...(partial.provider ?? {})
      },
      enabledTools: {
        ...current.enabledTools,
        ...(partial.enabledTools ?? {})
      },
      toolConfigs: {
        ...current.toolConfigs,
        ...(partial.toolConfigs ?? {})
      },
      mcpServers: Array.isArray(partial.mcpServers) ? partial.mcpServers : current.mcpServers
    }
    this.store.set('settings', next)
    return next
  }

  addRecentProject(projectPath: string): AppSettings {
    const settings = this.getSettings()
    const recent = [projectPath, ...settings.recentProjects.filter((p) => p !== projectPath)].slice(
      0,
      12
    )
    return this.updateSettings({ recentProjects: recent })
  }

  getChatSessions(): ChatSession[] {
    return this.store.get('chatSessions') ?? []
  }

  saveChatSession(session: ChatSession): ChatSession[] {
    const safeSession = truncateChatSessionForStorage(session)
    const sessions = this.getChatSessions()
    const idx = sessions.findIndex((s) => s.id === safeSession.id)
    if (idx >= 0) sessions[idx] = safeSession
    else sessions.unshift(safeSession)
    const trimmed = sessions.slice(0, 50)
    try {
      this.store.set('chatSessions', trimmed)
    } catch (err) {
      // Persist failure must not take down the app (oversized JSON / disk errors).
      const lean = trimmed.map((s) =>
        truncateChatSessionForStorage({
          ...s,
          messages: s.messages.map((m) => ({
            ...m,
            content:
              typeof m.content === 'string' && m.content.length > 8_000
                ? `${m.content.slice(0, 8_000)}\n\n…[storage fallback truncate]`
                : m.content,
            proposedEdits: undefined
          }))
        })
      ) as ChatSession[]
      try {
        this.store.set('chatSessions', lean.slice(0, 20))
        return lean.slice(0, 20)
      } catch {
        throw new Error(
          `Could not save chat history: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    return trimmed
  }

  deleteChatSession(id: string): ChatSession[] {
    const sessions = this.getChatSessions().filter((s) => s.id !== id)
    this.store.set('chatSessions', sessions)
    return sessions
  }
}
