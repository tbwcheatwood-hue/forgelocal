import { describe, expect, it } from 'vitest'
import {
  checkPromptSize,
  estimateWordCount,
  prepareContextFiles,
  PROMPT_MAX_CHARS,
  PROMPT_SOFT_CHARS,
  truncateChatSessionForStorage,
  truncateText
} from '../src/shared/messageLimits'

describe('message size guards', () => {
  it('allows ~3k-word prompts under the hard cap', () => {
    const words = Array.from({ length: 3200 }, (_, i) => `word${i}`).join(' ')
    expect(words.length).toBeLessThan(PROMPT_MAX_CHARS)
    const result = checkPromptSize(words)
    expect(result.ok).toBe(true)
    expect(result.truncated).toBe(false)
    expect(estimateWordCount(words)).toBe(3200)
  })

  it('soft-warns large but acceptable prompts', () => {
    const text = 'x'.repeat(PROMPT_SOFT_CHARS)
    const result = checkPromptSize(text)
    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/large prompt/i)
  })

  it('rejects prompts over the hard cap with a clear message', () => {
    const text = 'y'.repeat(PROMPT_MAX_CHARS + 500)
    const result = checkPromptSize(text)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/too large/i)
    expect(result.message).toMatch(/100[,.]?000/)
  })

  it('truncates oversized context files and total budget', () => {
    const files = [
      { path: '/a', relativePath: 'a.ts', content: 'A'.repeat(200_000) },
      { path: '/b', relativePath: 'b.ts', content: 'B'.repeat(200_000) }
    ]
    const prepared = prepareContextFiles(files)
    expect(prepared.truncated).toBe(true)
    expect(prepared.files.length).toBeGreaterThan(0)
    const total = prepared.files.reduce((n, f) => n + f.content.length, 0)
    expect(total).toBeLessThanOrEqual(250_000)
    expect(prepared.message).toMatch(/truncated/i)
  })

  it('truncates chat sessions for safe electron-store persistence', () => {
    const session = truncateChatSessionForStorage({
      id: 's1',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'z'.repeat(120_000),
          proposedEdits: [
            {
              id: 'e1',
              originalContent: 'o'.repeat(200_000),
              proposedContent: 'p'.repeat(200_000)
            }
          ]
        }
      ]
    })
    const msg = session.messages[0]
    expect(String(msg.content).length).toBeLessThan(120_000)
    const edit = (msg.proposedEdits as Array<Record<string, string>>)[0]
    expect(edit.originalContent.length).toBeLessThan(200_000)
    expect(edit.proposedContent.length).toBeLessThan(200_000)
  })

  it('truncateText leaves short strings alone', () => {
    expect(truncateText('hello', 100).truncated).toBe(false)
    expect(truncateText('hello', 100).text).toBe('hello')
  })
})
