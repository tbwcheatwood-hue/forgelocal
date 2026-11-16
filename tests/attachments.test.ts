import { describe, expect, it } from 'vitest'
import {
  ATTACH_MAX_COUNT,
  ATTACH_MAX_FILE_BYTES,
  buildUserMessageContent,
  classifyAttachment,
  contentToPlainText,
  guessMimeType,
  modelLikelySupportsVision,
  prepareAttachmentContext,
  truncateAttachmentText,
  validateAttachmentBatch,
  type ComposerAttachment
} from '../src/shared/attachments'

describe('attachment classification', () => {
  it('classifies common types', () => {
    expect(classifyAttachment('a.png', 'image/png')).toBe('image')
    expect(classifyAttachment('a.PDF', 'application/pdf')).toBe('pdf')
    expect(classifyAttachment('notes.docx', '')).toBe('docx')
    expect(classifyAttachment('readme.md', 'text/markdown')).toBe('text')
    expect(classifyAttachment('blob.bin', 'application/octet-stream')).toBe('other')
  })

  it('guesses mime from extension', () => {
    expect(guessMimeType('x.jpg')).toBe('image/jpeg')
    expect(guessMimeType('x.pdf')).toBe('application/pdf')
  })
})

describe('vision heuristic', () => {
  it('recognizes known vision models and rejects unknowns honestly', () => {
    expect(modelLikelySupportsVision('llava-v1.6')).toBe(true)
    expect(modelLikelySupportsVision('gpt-4o')).toBe(true)
    expect(modelLikelySupportsVision('openai/gpt-4o-mini')).toBe(true)
    expect(modelLikelySupportsVision('qwen2-vl')).toBe(true)
    expect(modelLikelySupportsVision('llama-3.1-8b-instruct')).toBe(false)
    expect(modelLikelySupportsVision('')).toBe(false)
  })
})

describe('batch limits', () => {
  it('rejects oversized files and batches', () => {
    expect(
      validateAttachmentBatch([{ name: 'big.bin', sizeBytes: ATTACH_MAX_FILE_BYTES + 1 }]).ok
    ).toBe(false)
    const many = Array.from({ length: ATTACH_MAX_COUNT + 1 }, (_, i) => ({
      name: `f${i}.txt`,
      sizeBytes: 10
    }))
    expect(validateAttachmentBatch(many).ok).toBe(false)
    expect(validateAttachmentBatch([{ name: 'ok.txt', sizeBytes: 100 }]).ok).toBe(true)
  })
})

describe('prepareAttachmentContext', () => {
  const image: ComposerAttachment = {
    id: '1',
    name: 'shot.png',
    mimeType: 'image/png',
    kind: 'image',
    sizeBytes: 100,
    imageDataUrl: 'data:image/png;base64,aaa'
  }
  const pdf: ComposerAttachment = {
    id: '2',
    name: 'spec.pdf',
    mimeType: 'application/pdf',
    kind: 'pdf',
    sizeBytes: 200,
    textExcerpt: 'Section 1: requirements'
  }

  it('sends image_url for vision models', () => {
    const prepared = prepareAttachmentContext([image, pdf], 'llava')
    expect(prepared.usedVision).toBe(true)
    expect(prepared.imageParts).toHaveLength(1)
    expect(prepared.textBlocks.some((b) => b.includes('requirements'))).toBe(true)
    const content = buildUserMessageContent('Summarize', prepared)
    expect(Array.isArray(content)).toBe(true)
    if (Array.isArray(content)) {
      expect(content[0]).toMatchObject({ type: 'text' })
      expect(content.some((p) => p.type === 'image_url')).toBe(true)
    }
  })

  it('falls back honestly when model is not vision-capable', () => {
    const prepared = prepareAttachmentContext([image], 'llama-3.1-8b')
    expect(prepared.usedVision).toBe(false)
    expect(prepared.skippedImages).toContain('shot.png')
    expect(prepared.textBlocks.join(' ')).toMatch(/not recognized as vision-capable/)
    expect(prepared.textBlocks.join(' ')).toMatch(/No OCR was run/)
    const content = buildUserMessageContent('What is this?', prepared)
    expect(typeof content).toBe('string')
  })

  it('plain-text helper flattens multimodal content', () => {
    expect(contentToPlainText('hi')).toBe('hi')
    expect(
      contentToPlainText([
        { type: 'text', text: 'a' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,x' } }
      ])
    ).toContain('[image]')
  })

  it('truncates long attachment text', () => {
    const long = 'x'.repeat(100_000)
    const { truncated, text } = truncateAttachmentText(long, 1000)
    expect(truncated).toBe(true)
    expect(text.length).toBeLessThanOrEqual(1000 + 80)
  })
})
