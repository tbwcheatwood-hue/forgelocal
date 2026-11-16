import { describe, expect, it } from 'vitest'
import { applyEditApproval, parseProposedEdits } from '../src/main/services/edits'

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
