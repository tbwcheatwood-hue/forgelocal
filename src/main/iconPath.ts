import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

/** Resolve the forge hammer-and-anvil icon for BrowserWindow / shortcuts. */
export function resolveAppIcon(): string | undefined {
  const candidates = [
    join(__dirname, '../../resources/icons/icon.png'),
    join(__dirname, '../../build/icon.png'),
    join(process.resourcesPath ?? '', 'icons/icon.png'),
    join(process.resourcesPath ?? '', 'icon.png'),
    join(app.getAppPath(), 'resources/icons/icon.png')
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return undefined
}
