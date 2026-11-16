import type { AppSettings, CatalogItem, ProviderSettings } from './types'

export type { McpDockSnapshot, McpDockStatus } from './mcp'
export { buildMcpDockSnapshot, isMcpCatalogItem, validateMcpServerConfig } from './mcp'

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
