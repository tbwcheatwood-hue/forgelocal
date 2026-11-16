import { createHash, randomUUID } from 'crypto'
import path from 'path'
import type { ProposedEdit } from '../../shared/types'
import { isPathInsideWorkspace } from './security'

const FENCE_RE = /```(?:[\w.+-]+)?\s*\n(?:\/\/\s*)?(?:file|path):\s*(.+?)\n([\s\S]*?)```/gi

const ALT_FENCE_RE = /```(?:[\w.+-]+)?\s*\n([\s\S]*?)```/g

/** True absolute paths (home, tmp, Windows drive) — not repo-root style `/app/...`. */
export function looksLikeFilesystemAbsolute(p: string): boolean {
  const s = p.trim()
  if (/^[a-zA-Z]:[\\/]/.test(s)) return true
  if (!s.startsWith('/')) return false
  return (
    s.startsWith('/home/') ||
    s.startsWith('/Users/') ||
    s.startsWith('/tmp/') ||
    s.startsWith('/var/') ||
    s.startsWith('/private/') ||
    s.startsWith('/opt/') ||
    s.startsWith('/usr/') ||
    s.startsWith('/etc/') ||
    s.startsWith('/mnt/') ||
    s.startsWith('/Volumes/')
  )
}

/**
 * Normalize model-provided edit paths.
 * Models often emit `/app/src/...` (Android) — treat as workspace-relative, not FS root.
 */
export function normalizeEditRelativePath(raw: string): string | null {
  let s = (raw ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\/g, '/')
  if (!s) return null
  s = s.replace(/^file:\/\//i, '')
  // Drop drive letters for relative normalization
  s = s.replace(/^[a-zA-Z]:\//, '')
  // Strip leading ./ and lone leading slashes for repo-relative paths
  s = s.replace(/^\.\//, '')
  if (s.startsWith('/') && !looksLikeFilesystemAbsolute(s)) {
    s = s.replace(/^\/+/, '')
  }
  if (!s || s.includes('..')) return null
  if (looksLikeFilesystemAbsolute(s)) return null
  return s.slice(0, 512)
}

/**
 * Resolve where Accept should write, always under the open workspace root.
 */
export function resolveEditTargetPath(
  workspaceRoot: string | null,
  edit: Pick<ProposedEdit, 'path' | 'relativePath'>
): { ok: true; path: string; relativePath: string } | { ok: false; error: string } {
  if (!workspaceRoot) {
    return { ok: false, error: 'No workspace open — open the project before accepting edits.' }
  }
  const root = path.resolve(workspaceRoot)
  const candidates: string[] = []

  const rel =
    normalizeEditRelativePath(edit.relativePath) || normalizeEditRelativePath(edit.path) || null
  if (rel) candidates.push(path.join(root, rel))

  const rawPath = (edit.path ?? '').trim()
  if (rawPath && looksLikeFilesystemAbsolute(rawPath)) {
    const abs = path.resolve(rawPath)
    if (isPathInsideWorkspace(abs, root)) candidates.unshift(abs)
    else {
      // Absolute path outside root: if it contains the workspace as a prefix
      // segment mismatch (symlink/casing), still try relative fallback only.
      const stripped = normalizeEditRelativePath(rawPath)
      if (stripped) candidates.push(path.join(root, stripped))
      // Also try path relative to root when abs starts with root after normalize
      const under = abs.startsWith(root + path.sep) ? abs : null
      if (under) candidates.unshift(under)
    }
  } else if (rawPath && !rel) {
    const fromPath = normalizeEditRelativePath(rawPath)
    if (fromPath) candidates.push(path.join(root, fromPath))
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (isPathInsideWorkspace(resolved, root)) {
      return {
        ok: true,
        path: resolved,
        relativePath: path.relative(root, resolved).split(path.sep).join('/')
      }
    }
  }

  const hint = edit.relativePath || edit.path || '(empty)'
  return {
    ok: false,
    error: `Path is outside the workspace: ${hint}. Open the correct project root, or use a path under it.`
  }
}

export function parseProposedEdits(
  assistantText: string,
  contextFiles: Array<{ relativePath: string; path: string; content: string }>
): ProposedEdit[] {
  const edits: ProposedEdit[] = []
  const seen = new Set<string>()

  for (const match of assistantText.matchAll(FENCE_RE)) {
    const rawPath = match[1].trim().replace(/^["']|["']$/g, '')
    const relativePath = normalizeEditRelativePath(rawPath) || rawPath.replace(/^\/+/, '')
    const proposedContent = match[2].replace(/\n$/, '')
    const ctx = contextFiles.find(
      (f) =>
        f.relativePath === relativePath ||
        f.relativePath === rawPath ||
        f.path.endsWith(relativePath) ||
        f.path.endsWith(rawPath.replace(/^\/+/, ''))
    )
    const key = relativePath
    if (seen.has(key)) continue
    seen.add(key)
    edits.push({
      id: randomUUID(),
      path: ctx?.path ?? relativePath,
      relativePath: ctx?.relativePath ?? relativePath,
      originalContent: ctx?.content ?? '',
      proposedContent,
      summary: summarizeDiff(ctx?.content ?? '', proposedContent),
      status: 'pending'
    })
  }

  if (edits.length === 0 && contextFiles.length === 1) {
    const fences = [...assistantText.matchAll(ALT_FENCE_RE)]
    if (fences.length === 1) {
      const proposedContent = fences[0][1].replace(/\n$/, '')
      const ctx = contextFiles[0]
      if (proposedContent !== ctx.content) {
        edits.push({
          id: randomUUID(),
          path: ctx.path,
          relativePath: ctx.relativePath,
          originalContent: ctx.content,
          proposedContent,
          summary: summarizeDiff(ctx.content, proposedContent),
          status: 'pending'
        })
      }
    }
  }

  return edits
}

export function summarizeDiff(original: string, proposed: string): string {
  const a = original.split(/\r?\n/)
  const b = proposed.split(/\r?\n/)
  let added = 0
  let removed = 0
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (a[i] === undefined) added++
    else if (b[i] === undefined) removed++
    else if (a[i] !== b[i]) {
      added++
      removed++
    }
  }
  if (added === 0 && removed === 0) return 'No textual changes detected'
  return `~${removed} removed / ~${added} added line slots (${a.length} → ${b.length} lines)`
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

export function applyEditApproval(
  edit: ProposedEdit,
  decision: 'accepted' | 'rejected'
): ProposedEdit {
  return { ...edit, status: decision }
}
