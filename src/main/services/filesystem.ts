import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import type { FileNode, SearchResult } from '../../shared/types'
import { assertSafeWorkspacePath, isPathInsideWorkspace, safeRelative } from './security'

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'release',
  'dist',
  '.vite',
  'coverage',
  '__pycache__'
])

export class FilesystemService {
  workspaceRoot: string | null = null
  allowOutside = false

  setWorkspace(root: string | null): void {
    this.workspaceRoot = root ? path.resolve(root) : null
  }

  setAllowOutside(allow: boolean): void {
    this.allowOutside = allow
  }

  private guard(targetPath: string) {
    return assertSafeWorkspacePath(targetPath, this.workspaceRoot, this.allowOutside)
  }

  async openWorkspace(dirPath: string): Promise<string> {
    const resolved = path.resolve(dirPath)
    const stat = await fs.stat(resolved)
    if (!stat.isDirectory()) {
      throw new Error('Path is not a directory')
    }
    this.workspaceRoot = resolved
    return resolved
  }

  async readTree(dirPath?: string, depth = 6): Promise<FileNode> {
    if (!this.workspaceRoot) throw new Error('No workspace open')
    const root = dirPath ? path.resolve(dirPath) : this.workspaceRoot
    const guarded = this.guard(root)
    if (!guarded.ok) throw new Error(guarded.error)
    return this.buildNode(guarded.path, depth)
  }

  private async buildNode(absPath: string, depth: number): Promise<FileNode> {
    const stat = await fs.stat(absPath)
    const name = path.basename(absPath)
    const relativePath = this.workspaceRoot ? safeRelative(this.workspaceRoot, absPath) : name
    if (!stat.isDirectory()) {
      return { name, path: absPath, relativePath, isDirectory: false }
    }
    const node: FileNode = {
      name: relativePath === '' ? path.basename(absPath) : name,
      path: absPath,
      relativePath: relativePath || '.',
      isDirectory: true,
      children: []
    }
    if (depth <= 0) return node
    const entries = await fs.readdir(absPath, { withFileTypes: true })
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const entry of sorted) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      const childPath = path.join(absPath, entry.name)
      try {
        node.children!.push(await this.buildNode(childPath, depth - 1))
      } catch {
        // skip unreadable entries
      }
    }
    return node
  }

  async readFile(
    filePath: string
  ): Promise<{ path: string; content: string; relativePath: string }> {
    const guarded = this.guard(filePath)
    if (!guarded.ok) {
      const err = new Error(guarded.error) as Error & { requiresApproval?: boolean }
      err.requiresApproval = guarded.requiresApproval
      throw err
    }
    const content = await fs.readFile(guarded.path, 'utf8')
    return {
      path: guarded.path,
      content,
      relativePath: this.workspaceRoot
        ? safeRelative(this.workspaceRoot, guarded.path)
        : path.basename(guarded.path)
    }
  }

  async writeFile(
    filePath: string,
    content: string
  ): Promise<{ path: string; relativePath: string }> {
    const guarded = this.guard(filePath)
    if (!guarded.ok) {
      const err = new Error(guarded.error) as Error & { requiresApproval?: boolean }
      err.requiresApproval = guarded.requiresApproval
      throw err
    }
    await fs.mkdir(path.dirname(guarded.path), { recursive: true })
    await fs.writeFile(guarded.path, content, 'utf8')
    return {
      path: guarded.path,
      relativePath: this.workspaceRoot
        ? safeRelative(this.workspaceRoot, guarded.path)
        : path.basename(guarded.path)
    }
  }

  async createFile(
    filePath: string,
    content = ''
  ): Promise<{ path: string; relativePath: string }> {
    const guarded = this.guard(filePath)
    if (!guarded.ok) throw new Error(guarded.error)
    if (fsSync.existsSync(guarded.path)) throw new Error('File already exists')
    return this.writeFile(guarded.path, content)
  }

  async deletePath(targetPath: string): Promise<void> {
    const guarded = this.guard(targetPath)
    if (!guarded.ok) throw new Error(guarded.error)
    const stat = await fs.stat(guarded.path)
    if (stat.isDirectory()) {
      await fs.rm(guarded.path, { recursive: true, force: false })
    } else {
      await fs.unlink(guarded.path)
    }
  }

  async search(query: string, maxResults = 100): Promise<SearchResult[]> {
    if (!this.workspaceRoot) throw new Error('No workspace open')
    if (!query.trim()) return []
    const results: SearchResult[] = []
    const walk = async (dir: string) => {
      if (results.length >= maxResults) return
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (results.length >= maxResults) return
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else {
          try {
            const content = await fs.readFile(full, 'utf8')
            if (content.includes('\0')) continue
            const lines = content.split(/\r?\n/)
            lines.forEach((line, idx) => {
              if (results.length >= maxResults) return
              const col = line.toLowerCase().indexOf(query.toLowerCase())
              if (col >= 0) {
                results.push({
                  path: full,
                  relativePath: safeRelative(this.workspaceRoot!, full),
                  line: idx + 1,
                  column: col + 1,
                  preview: line.trim().slice(0, 200)
                })
              }
            })
          } catch {
            // skip binary / unreadable
          }
        }
      }
    }
    await walk(this.workspaceRoot)
    return results
  }

  isInsideWorkspace(targetPath: string): boolean {
    if (!this.workspaceRoot) return false
    return isPathInsideWorkspace(targetPath, this.workspaceRoot)
  }

  async hasGit(): Promise<boolean> {
    if (!this.workspaceRoot) return false
    try {
      const stat = await fs.stat(path.join(this.workspaceRoot, '.git'))
      return stat.isDirectory()
    } catch {
      return false
    }
  }
}
