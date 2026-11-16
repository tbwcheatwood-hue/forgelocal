import { createHash, randomUUID } from 'crypto'
import type { ProposedEdit } from '../../shared/types'

const FENCE_RE = /```(?:[\w.+-]+)?\s*\n(?:\/\/\s*)?(?:file|path):\s*(.+?)\n([\s\S]*?)```/gi

const ALT_FENCE_RE = /```(?:[\w.+-]+)?\s*\n([\s\S]*?)```/g

export function parseProposedEdits(
  assistantText: string,
  contextFiles: Array<{ relativePath: string; path: string; content: string }>
): ProposedEdit[] {
  const edits: ProposedEdit[] = []
  const seen = new Set<string>()

  for (const match of assistantText.matchAll(FENCE_RE)) {
    const relativePath = match[1].trim().replace(/^["']|["']$/g, '')
    const proposedContent = match[2].replace(/\n$/, '')
    const ctx = contextFiles.find(
      (f) => f.relativePath === relativePath || f.path.endsWith(relativePath)
    )
    const key = relativePath
    if (seen.has(key)) continue
    seen.add(key)
    edits.push({
      id: randomUUID(),
      path: ctx?.path ?? relativePath,
      relativePath,
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
