/**
 * LocalForge Companion bridge helpers for ForgeLocal.
 *
 * Inspired by LocalForge Companion 0.3.2 (MIT) — pairing, health, provider
 * discovery defaults, and local-first security posture. Independently
 * implemented for Electron; see NOTICE. Does not vendor companion source.
 */

export interface CompanionBridgeSettings {
  /** When true, ForgeLocal may probe/pair a Companion service. Default false. */
  enabled: boolean
  /** Companion base URL (loopback by default). */
  baseUrl: string
  /** Bearer token from pairing (stored locally only). */
  token: string
  /** Last device label used when pairing. */
  deviceLabel: string
}

export const DEFAULT_COMPANION_BRIDGE: CompanionBridgeSettings = {
  enabled: false,
  baseUrl: 'http://127.0.0.1:7337',
  token: '',
  deviceLabel: 'ForgeLocal'
}

export function normalizeCompanionBaseUrl(raw: string): string {
  let b = String(raw || '')
    .trim()
    .replace(/\/+$/, '')
  if (!b) return DEFAULT_COMPANION_BRIDGE.baseUrl
  if (!/^https?:\/\//i.test(b)) b = `http://${b}`
  return b.replace(/\/+$/, '')
}

export function normalizeCompanionBridge(raw: unknown): CompanionBridgeSettings {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_COMPANION_BRIDGE)
  const obj = raw as Partial<CompanionBridgeSettings>
  return {
    enabled: Boolean(obj.enabled),
    baseUrl: normalizeCompanionBaseUrl(obj.baseUrl ?? DEFAULT_COMPANION_BRIDGE.baseUrl),
    token: typeof obj.token === 'string' ? obj.token.slice(0, 512) : '',
    deviceLabel:
      typeof obj.deviceLabel === 'string' && obj.deviceLabel.trim()
        ? obj.deviceLabel.trim().slice(0, 64)
        : DEFAULT_COMPANION_BRIDGE.deviceLabel
  }
}

export interface CompanionHealth {
  ok: boolean
  reachable: boolean
  name?: string
  version?: string
  platform?: string
  paired?: boolean
  workspaces?: Array<{ id: string; name?: string; path?: string }>
  buildId?: string
  message: string
  latencyMs?: number
  baseUrl: string
}

export interface CompanionPairResult {
  ok: boolean
  token?: string
  companion?: { name?: string; version?: string; platform?: string }
  error?: string
}

export interface DiscoveredProvider {
  kind: 'ollama' | 'openai' | null
  baseUrl: string
  name: string
  reachable: boolean
  models: Array<{
    id: string
    display: string
    sizeBytes?: number | null
    paramSize?: string | null
    quant?: string | null
  }>
}

/** Default local inference endpoints probed by Companion-style discovery. */
export const DEFAULT_PROVIDER_CANDIDATES = [
  'http://127.0.0.1:11434', // Ollama
  'http://127.0.0.1:1234', // LM Studio
  'http://127.0.0.1:8080', // llama.cpp llama-server
  'http://127.0.0.1:8000', // Lemonade
  'http://127.0.0.1:1337' // llama-server alt
] as const

export interface HardwareInventory {
  platform: string
  arch: string
  hostname: string
  cpuModel: string | null
  cpuCores: number
  ramTotalBytes: number | null
  ramAvailableBytes: number | null
  gpus: Array<{
    kind: string
    name: string | null
    vramBytes: number | null
    driver: string | null
  }>
  npu: { detected: boolean; runtime: string | null; detail: string | null }
  inferenceRuntimes: string[]
  measuredAt: number
  source: 'local' | 'companion'
}

export interface GitSnapshot {
  ok: boolean
  hasRepo: boolean
  branch?: string
  dirty?: boolean
  ahead?: number
  behind?: number
  statusLines: string[]
  recentLog: string[]
  message: string
}

export interface PreviewSession {
  ok: boolean
  url?: string
  token?: string
  root?: string
  message: string
}

export type CommandScreenResult =
  { allowed: true; flagged?: boolean } | { allowed: false; reason: string; needsConfirm: boolean }
