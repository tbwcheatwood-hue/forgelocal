import Store from 'electron-store'
import type { AppSettings, ChatSession } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

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
      provider
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
      }
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
    const sessions = this.getChatSessions()
    const idx = sessions.findIndex((s) => s.id === session.id)
    if (idx >= 0) sessions[idx] = session
    else sessions.unshift(session)
    const trimmed = sessions.slice(0, 50)
    this.store.set('chatSessions', trimmed)
    return trimmed
  }

  deleteChatSession(id: string): ChatSession[] {
    const sessions = this.getChatSessions().filter((s) => s.id !== id)
    this.store.set('chatSessions', sessions)
    return sessions
  }
}
