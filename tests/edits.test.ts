import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  applyEditApproval,
  normalizeEditRelativePath,
  parseProposedEdits,
  resolveEditTargetPath
} from '../src/main/services/edits'

describe('safe file-edit approval flows', () => {
  const context = [
    {
      path: '/tmp/ws/src/hello.ts',
      relativePath: 'src/hello.ts',
      content: 'export const hello = "world"\n'
    }
  ]

  it('parses fenced file edits from assistant output', () => {
    const text = [
      'Here is a fix:',
      '```ts',
      '// file: src/hello.ts',
      'export const hello = "forge"',
      '```'
    ].join('\n')

    const edits = parseProposedEdits(text, context)
    expect(edits).toHaveLength(1)
    expect(edits[0].relativePath).toBe('src/hello.ts')
    expect(edits[0].proposedContent).toContain('forge')
    expect(edits[0].status).toBe('pending')
  })

  it('does not apply edits until explicitly accepted', () => {
    const text = ['```ts', '// file: src/hello.ts', 'export const hello = "accepted"', '```'].join(
      '\n'
    )
    const [edit] = parseProposedEdits(text, context)
    const rejected = applyEditApproval(edit, 'rejected')
    const accepted = applyEditApproval(edit, 'accepted')
    expect(rejected.status).toBe('rejected')
    expect(accepted.status).toBe('accepted')
    expect(edit.status).toBe('pending')
  })

  it('falls back to single-context fence when path header missing', () => {
    const text = ['```ts', 'export const hello = "solo"', '```'].join('\n')
    const edits = parseProposedEdits(text, context)
    expect(edits).toHaveLength(1)
    expect(edits[0].path).toBe(context[0].path)
  })

  it('returns no edits for prose-only answers', () => {
    expect(parseProposedEdits('Looks fine to me.', context)).toEqual([])
  })
})

describe('resolveEditTargetPath (Accept)', () => {
  const root = path.resolve('/home/livingroom/WORK BOOKS/Calculator')

  it('joins workspace-relative Android paths', () => {
    const resolved = resolveEditTargetPath(root, {
      path: 'app/src/main/java/com/example/app/ui/MainActivity.kt',
      relativePath: 'app/src/main/java/com/example/app/ui/MainActivity.kt'
    })
    expect(resolved.ok).toBe(true)
    if (resolved.ok) {
      expect(resolved.path).toBe(
        path.join(root, 'app/src/main/java/com/example/app/ui/MainActivity.kt')
      )
    }
  })

  it('treats leading-slash repo paths as relative (not FS root)', () => {
    // Models often emit // file: /app/src/... for Android — previously denied as /app/...
    const resolved = resolveEditTargetPath(root, {
      path: '/app/src/main/java/com/example/app/ui/MainActivity.kt',
      relativePath: '/app/src/main/java/com/example/app/ui/MainActivity.kt'
    })
    expect(resolved.ok).toBe(true)
    if (resolved.ok) {
      expect(resolved.path).toBe(
        path.join(root, 'app/src/main/java/com/example/app/ui/MainActivity.kt')
      )
      expect(resolved.relativePath).toBe('app/src/main/java/com/example/app/ui/MainActivity.kt')
    }
  })

  it('accepts absolute paths that already sit inside the workspace', () => {
    const abs = path.join(root, 'app/src/main/java/com/example/app/ui/MainActivity.kt')
    const resolved = resolveEditTargetPath(root, {
      path: abs,
      relativePath: 'app/src/main/java/com/example/app/ui/MainActivity.kt'
    })
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(resolved.path).toBe(abs)
  })

  it('still denies paths that escape the open project', () => {
    const resolved = resolveEditTargetPath(root, {
      path: '/etc/passwd',
      relativePath: '/etc/passwd'
    })
    expect(resolved.ok).toBe(false)
  })

  it('requires an open workspace', () => {
    const resolved = resolveEditTargetPath(null, {
      path: 'app/MainActivity.kt',
      relativePath: 'app/MainActivity.kt'
    })
    expect(resolved.ok).toBe(false)
  })
})

describe('normalizeEditRelativePath', () => {
  it('strips leading slash for app/src style paths', () => {
    expect(normalizeEditRelativePath('/app/src/main/MainActivity.kt')).toBe(
      'app/src/main/MainActivity.kt'
    )
  })

  it('rejects traversal', () => {
    expect(normalizeEditRelativePath('../secret')).toBeNull()
  })
})
