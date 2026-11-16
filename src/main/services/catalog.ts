import fs from 'fs'
import path from 'path'
import type { CatalogFilter, CatalogItem } from '../../shared/types'

export type { CatalogFilter }

export class CatalogService {
  private items: CatalogItem[] = []

  constructor(catalogPath?: string) {
    const candidates = [
      catalogPath,
      path.join(__dirname, '../../resources/catalog.json'),
      path.join(process.resourcesPath ?? '', 'catalog.json'),
      path.join(process.cwd(), 'resources/catalog.json')
    ].filter(Boolean) as string[]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, 'utf8')
        this.items = JSON.parse(raw) as CatalogItem[]
        return
      }
    }
    this.items = []
  }

  list(): CatalogItem[] {
    return [...this.items]
  }

  get(id: string): CatalogItem | undefined {
    return this.items.find((item) => item.id === id)
  }

  search(filter: CatalogFilter = {}): CatalogItem[] {
    const query = (filter.query ?? '').trim().toLowerCase()
    return this.items.filter((item) => {
      if (filter.category && filter.category !== 'all' && item.category !== filter.category) {
        return false
      }
      if (filter.trust && filter.trust !== 'all' && item.trust !== filter.trust) {
        return false
      }
      if (filter.implementedOnly && !item.implemented) {
        return false
      }
      if (!query) return true
      const haystack = [
        item.name,
        item.description,
        item.source,
        item.homepage ?? '',
        item.installGuidance,
        item.sampleConfigJson ?? '',
        item.mcpSuggested?.name ?? '',
        item.mcpSuggested?.command ?? '',
        ...(item.mcpSuggested?.args ?? []),
        ...item.tags
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }

  /** Online refresh is explicit and optional; this build only reloads the bundled catalog. */
  refreshOffline(): { ok: true; count: number } | { ok: false; error: string } {
    try {
      const bundled = path.join(process.cwd(), 'resources/catalog.json')
      if (!fs.existsSync(bundled)) {
        return { ok: false, error: 'Bundled catalog not found' }
      }
      this.items = JSON.parse(fs.readFileSync(bundled, 'utf8')) as CatalogItem[]
      return { ok: true, count: this.items.length }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }
}
