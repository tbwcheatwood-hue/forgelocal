import type { FileNode } from '@shared/types'

export interface CanvasCard {
  path: string
  name: string
  relativePath: string
  dir: string
  x: number
  y: number
  ext: string
}

export function flattenFiles(node: FileNode | null, acc: FileNode[] = []): FileNode[] {
  if (!node) return acc
  if (!node.isDirectory) acc.push(node)
  node.children?.forEach((c) => flattenFiles(c, acc))
  return acc
}

/** Pack files into directory clusters for the architectural map. */
export function layoutCanvasCards(files: FileNode[], limit = 64): CanvasCard[] {
  const sliced = files.slice(0, limit)
  const byDir = new Map<string, FileNode[]>()
  for (const file of sliced) {
    const parts = file.relativePath.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
    const list = byDir.get(dir) ?? []
    list.push(file)
    byDir.set(dir, list)
  }

  const dirs = [...byDir.keys()].sort()
  const cards: CanvasCard[] = []
  const clusterCols = Math.max(2, Math.ceil(Math.sqrt(dirs.length)))

  dirs.forEach((dir, di) => {
    const clusterCol = di % clusterCols
    const clusterRow = Math.floor(di / clusterCols)
    const originX = 48 + clusterCol * 420
    const originY = 48 + clusterRow * 320
    const group = byDir.get(dir) ?? []
    group.forEach((file, fi) => {
      const col = fi % 2
      const row = Math.floor(fi / 2)
      cards.push({
        path: file.path,
        name: file.name,
        relativePath: file.relativePath,
        dir,
        x: originX + col * 186,
        y: originY + row * 96,
        ext: file.name.includes('.') ? (file.name.split('.').pop() ?? '') : ''
      })
    })
  })

  return cards
}

export function relatedCards(cards: CanvasCard[], focusPath: string, limit = 6): CanvasCard[] {
  const focus = cards.find((c) => c.path === focusPath)
  if (!focus) return []
  return cards.filter((c) => c.path !== focusPath && c.dir === focus.dir).slice(0, limit)
}
