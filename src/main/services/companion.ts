import {
  normalizeCompanionBridge,
  normalizeCompanionBaseUrl,
  type CompanionBridgeSettings,
  type CompanionHealth,
  type CompanionPairResult
} from '../../shared/companion'

export class CompanionService {
  async health(bridge: CompanionBridgeSettings): Promise<CompanionHealth> {
    const cfg = normalizeCompanionBridge(bridge)
    const baseUrl = normalizeCompanionBaseUrl(cfg.baseUrl)
    const started = Date.now()
    try {
      const res = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(2500)
      })
      const latencyMs = Date.now() - started
      if (!res.ok) {
        return {
          ok: false,
          reachable: true,
          message: `Companion responded HTTP ${res.status}`,
          latencyMs,
          baseUrl
        }
      }
      const json = (await res.json()) as Record<string, unknown>
      return {
        ok: Boolean(json.ok ?? true),
        reachable: true,
        name: typeof json.name === 'string' ? json.name : 'localforge-companion',
        version: typeof json.version === 'string' ? json.version : undefined,
        platform: typeof json.platform === 'string' ? json.platform : undefined,
        paired: typeof json.paired === 'boolean' ? json.paired : undefined,
        workspaces: Array.isArray(json.workspaces)
          ? (json.workspaces as CompanionHealth['workspaces'])
          : undefined,
        buildId: typeof json.buildId === 'string' ? json.buildId : undefined,
        message: 'Companion reachable',
        latencyMs,
        baseUrl
      }
    } catch (err) {
      return {
        ok: false,
        reachable: false,
        message:
          err instanceof Error
            ? `Cannot reach companion at ${baseUrl} (${err.message})`
            : `Cannot reach companion at ${baseUrl}`,
        latencyMs: Date.now() - started,
        baseUrl
      }
    }
  }

  async pair(
    bridge: CompanionBridgeSettings,
    code: string
  ): Promise<CompanionPairResult & { bridge?: CompanionBridgeSettings }> {
    const cfg = normalizeCompanionBridge(bridge)
    const baseUrl = normalizeCompanionBaseUrl(cfg.baseUrl)
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return { ok: false, error: 'Missing pairing code.' }
    try {
      const res = await fetch(`${baseUrl}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, deviceLabel: cfg.deviceLabel || 'ForgeLocal' }),
        signal: AbortSignal.timeout(5000)
      })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        return {
          ok: false,
          error: typeof json.error === 'string' ? json.error : `Pair failed (HTTP ${res.status})`
        }
      }
      const token = typeof json.token === 'string' ? json.token : ''
      if (!token) return { ok: false, error: 'Pair response missing token.' }
      const companion = json.companion as CompanionPairResult['companion']
      return {
        ok: true,
        token,
        companion,
        bridge: {
          ...cfg,
          enabled: true,
          baseUrl,
          token
        }
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  async authenticatedGet(
    bridge: CompanionBridgeSettings,
    path: string
  ): Promise<{ ok: boolean; status: number; json: unknown; error?: string }> {
    const cfg = normalizeCompanionBridge(bridge)
    if (!cfg.token) return { ok: false, status: 401, json: null, error: 'Not paired (no token).' }
    const baseUrl = normalizeCompanionBaseUrl(cfg.baseUrl)
    try {
      const res = await fetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
        signal: AbortSignal.timeout(5000)
      })
      const json = await res.json().catch(() => null)
      return { ok: res.ok, status: res.status, json }
    } catch (err) {
      return {
        ok: false,
        status: 0,
        json: null,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }
}
