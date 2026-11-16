import type { AppSettings, CatalogItem, ProviderSettings } from './types'

export type McpDockStatus = 'unavailable' | 'empty' | 'stub' | 'ready'

export interface McpDockToolRow {
  id: string
  name: string
  available: boolean
  reason: string
}

export interface McpDockSnapshot {
  status: McpDockStatus
  message: string
  tools: McpDockToolRow[]
}

export function isRemoteMode(provider: Pick<ProviderSettings, 'mode'>): boolean {
  return provider.mode === 'remote'
}

/** Online tools/extensions require an active remote cloud model selection. */
export function canUseOnlineTools(settings: AppSettings): boolean {
  return isRemoteMode(settings.provider) && Boolean(settings.provider.model?.trim())
}

export function catalogItemRequiresRemote(item: CatalogItem): boolean {
  if (item.requiresRemote === true) return true
  if (item.requiresRemote === false) return false
  return item.tags.some((t) => t === 'online' || t === 'cloud' || t === 'remote-online')
}

export function buildMcpDockSnapshot(catalog: CatalogItem[]): McpDockSnapshot {
  const tools = catalog
    .filter((item) => item.tags.includes('mcp') || item.id.includes('mcp'))
    .map((item) => ({
      id: item.id,
      name: item.name,
      available: item.implemented,
      reason: item.implemented
        ? 'Implemented in this build'
        : item.installGuidance || 'Not executable in this build'
    }))

  if (tools.length === 0) {
    return {
      status: 'empty',
      message: 'No MCP-related catalog entries found.',
      tools: []
    }
  }

  const anyReady = tools.some((t) => t.available)
  if (anyReady) {
    return {
      status: 'ready',
      message: 'MCP tools available from the local catalog.',
      tools
    }
  }

  return {
    status: 'stub',
    message: 'MCP dock is a catalog preview only — no live MCP runtime is connected in this build.',
    tools
  }
}

/** Disable any enabled tools that require remote when switching back to local. */
export function disableRemoteOnlyTools(settings: AppSettings, catalog: CatalogItem[]): AppSettings {
  if (canUseOnlineTools(settings)) return settings
  let changed = false
  const enabledTools = { ...settings.enabledTools }
  for (const item of catalog) {
    if (catalogItemRequiresRemote(item) && enabledTools[item.id]) {
      enabledTools[item.id] = false
      changed = true
    }
  }
  return changed ? { ...settings, enabledTools } : settings
}

export function assertOnlineToolAllowed(settings: AppSettings, item: CatalogItem): void {
  if (!catalogItemRequiresRemote(item)) return
  if (canUseOnlineTools(settings)) return
  throw new Error(
    `"${item.name}" requires an active remote cloud model. Switch Provider mode to Remote and select a model first.`
  )
}
