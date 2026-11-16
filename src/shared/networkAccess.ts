/**
 * Network / CSP policy for ForgeLocal.
 * Opens renderer + preview enough for localhost, LAN URLs, and general internet
 * while keeping nodeIntegration off (enforced in main BrowserWindow prefs).
 */

/** IDE / renderer meta CSP — allows https/http/ws fetches & CDN assets. */
export const RENDERER_CSP = [
  "default-src 'self'",
  // Monaco workers + occasional CDN scripts (still no Node in renderer)
  "script-src 'self' 'wasm-unsafe-eval' http: https: blob:",
  "style-src 'self' 'unsafe-inline' http: https:",
  "font-src 'self' data: http: https:",
  "img-src 'self' data: blob: http: https:",
  "media-src 'self' data: blob: http: https:",
  // LM Studio / remote APIs / websockets / preview loopback
  "connect-src 'self' http: https: ws: wss:",
  // Preview iframe (loopback) + https embeds
  'frame-src http: https: data: blob:',
  'child-src http: https: blob:',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'"
].join('; ')

/**
 * CSP for generated-app preview responses.
 * Apps must be able to fetch APIs, load CDN scripts/fonts, and use websockets.
 */
export const PREVIEW_CSP = [
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "script-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "style-src * data: blob: 'unsafe-inline'",
  'img-src * data: blob:',
  'font-src * data:',
  'media-src * data: blob:',
  'connect-src * ws: wss: http: https:',
  'frame-src * data: blob:',
  'worker-src * blob:',
  // Allow embedding inside the ForgeLocal shell (file://, localhost, or custom)
  'frame-ancestors *'
].join('; ')

/** Permissions the IDE / preview may grant (still no Node in renderer). */
export const ALLOWED_WEB_PERMISSIONS = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
  'media',
  'mediaKeySystem',
  'display-capture',
  'fullscreen',
  'pointerLock',
  'notifications',
  'window-management',
  'storage-access',
  'focus-without-user-activation',
  'clipboard-write'
])

export function isAllowedWebPermission(permission: string): boolean {
  return ALLOWED_WEB_PERMISSIONS.has(permission)
}
