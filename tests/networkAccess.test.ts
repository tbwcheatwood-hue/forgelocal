import { describe, expect, it } from 'vitest'
import {
  ALLOWED_WEB_PERMISSIONS,
  isAllowedWebPermission,
  PREVIEW_CSP,
  RENDERER_CSP
} from '../src/shared/networkAccess'

describe('RENDERER_CSP', () => {
  it('allows general http/https/ws connectivity and frames', () => {
    expect(RENDERER_CSP).toContain('connect-src')
    expect(RENDERER_CSP).toMatch(/connect-src[^;]*https:/)
    expect(RENDERER_CSP).toMatch(/connect-src[^;]*http:/)
    expect(RENDERER_CSP).toMatch(/connect-src[^;]*ws:/)
    expect(RENDERER_CSP).toMatch(/connect-src[^;]*wss:/)
    expect(RENDERER_CSP).toMatch(/img-src[^;]*https:/)
    expect(RENDERER_CSP).toMatch(/font-src[^;]*https:/)
    expect(RENDERER_CSP).toMatch(/media-src[^;]*https:/)
    expect(RENDERER_CSP).toMatch(/script-src[^;]*https:/)
    expect(RENDERER_CSP).toMatch(/frame-src[^;]*https:/)
  })

  it('keeps object-src none', () => {
    expect(RENDERER_CSP).toContain("object-src 'none'")
  })
})

describe('PREVIEW_CSP', () => {
  it('allows embedding and broad network for generated apps', () => {
    expect(PREVIEW_CSP).toContain('frame-ancestors *')
    expect(PREVIEW_CSP).toMatch(/connect-src[^;]*\*/)
  })
})

describe('permissions', () => {
  it('allows media/clipboard and denies serial-like unknowns', () => {
    expect(isAllowedWebPermission('media')).toBe(true)
    expect(isAllowedWebPermission('clipboard-read')).toBe(true)
    expect(isAllowedWebPermission('serial')).toBe(false)
    expect(isAllowedWebPermission('usb')).toBe(false)
    expect(ALLOWED_WEB_PERMISSIONS.size).toBeGreaterThan(5)
  })
})
