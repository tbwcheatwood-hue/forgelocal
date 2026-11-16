import { useMemo, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { DEFAULT_PROVIDER, DEFAULT_REMOTE_PROVIDER } from '@shared/types'
import type { ProviderMode } from '@shared/types'
import { isRemoteMode } from '@shared/providerTools'
import {
  CONTEXT_WINDOW_PRESETS,
  parseContextWindowInput,
  resolveKnownModelContextLimit,
  validateContextWindowSelection
} from '@shared/contextWindow'

export function SettingsModal() {
  const show = useAppStore((s) => s.showSettings)
  const setShow = useAppStore((s) => s.setShow)
  const settings = useAppStore((s) => s.settings)
  const models = useAppStore((s) => s.models)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const refreshLm = useAppStore((s) => s.refreshLm)
  const lmStatus = useAppStore((s) => s.lmStatus)
  const [mode, setMode] = useState<ProviderMode>(settings.provider.mode ?? 'local')
  const [baseUrl, setBaseUrl] = useState(settings.provider.baseUrl)
  const [apiKey, setApiKey] = useState(settings.provider.apiKey)
  const [timeoutMs, setTimeoutMs] = useState(String(settings.provider.timeoutMs))
  const [stream, setStream] = useState(settings.provider.stream)
  const [temperature, setTemperature] = useState(String(settings.provider.temperature ?? 0.2))
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    String(settings.provider.maxOutputTokens ?? 4096)
  )
  const initialCtx = settings.provider.contextWindowTokens
  const [contextPreset, setContextPreset] = useState(() => {
    if (!initialCtx) return 'unset'
    return (CONTEXT_WINDOW_PRESETS as readonly number[]).includes(initialCtx)
      ? String(initialCtx)
      : 'custom'
  })
  const [contextCustom, setContextCustom] = useState(
    initialCtx && !(CONTEXT_WINDOW_PRESETS as readonly number[]).includes(initialCtx)
      ? String(initialCtx)
      : ''
  )
  const [contextError, setContextError] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState(String(settings.fontSize))
  const [allowOutside, setAllowOutside] = useState(settings.allowPathsOutsideWorkspace)

  const knownLimit = useMemo(
    () => resolveKnownModelContextLimit(settings.provider.model, models),
    [settings.provider.model, models]
  )

  const selectedContextRaw =
    contextPreset === 'unset' ? '' : contextPreset === 'custom' ? contextCustom : contextPreset

  const contextPreview = useMemo(() => {
    const parsed = parseContextWindowInput(selectedContextRaw)
    if (!parsed.ok) {
      return {
        ok: false as const,
        message: parsed.message,
        warning: undefined as string | undefined
      }
    }
    return validateContextWindowSelection({
      requested: parsed.value,
      knownLimit,
      modelId: settings.provider.model
    })
  }, [selectedContextRaw, knownLimit, settings.provider.model])

  if (!show) return null

  const remote = mode === 'remote'

  const switchMode = (next: ProviderMode) => {
    setMode(next)
    if (next === 'remote' && !isRemoteMode(settings.provider)) {
      setBaseUrl(DEFAULT_REMOTE_PROVIDER.baseUrl)
      setApiKey('')
    } else if (next === 'local' && isRemoteMode(settings.provider)) {
      setBaseUrl(DEFAULT_PROVIDER.baseUrl)
      setApiKey(DEFAULT_PROVIDER.apiKey)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setShow('showSettings', false)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 92vw)' }}
      >
        <div className="modal-header">
          <strong>Settings</strong>
          <button className="btn" onClick={() => setShow('showSettings', false)}>
            Close
          </button>
        </div>
        <div className="modal-body settings-grid">
          <fieldset className="provider-mode">
            <legend>Provider mode</legend>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="provider-mode"
                checked={mode === 'local'}
                onChange={() => switchMode('local')}
              />
              Local (LM Studio)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="provider-mode"
                checked={mode === 'remote'}
                onChange={() => switchMode('remote')}
              />
              Remote (OpenAI-compatible)
            </label>
          </fieldset>
          <label>
            {remote ? 'Remote API base URL' : 'LM Studio base URL'}
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </label>
          <label>
            {remote
              ? 'API key (stored locally; never logged)'
              : 'API key (local placeholder; not a cloud secret)'}
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type={remote ? 'password' : 'text'}
              autoComplete="off"
            />
          </label>
          <label>
            Timeout (ms)
            <input value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} />
          </label>
          <label>
            Temperature (ignored for OpenAI o-series / gpt-5)
            <input value={temperature} onChange={(e) => setTemperature(e.target.value)} />
          </label>
          <label>
            Max output tokens
            <input value={maxOutputTokens} onChange={(e) => setMaxOutputTokens(e.target.value)} />
          </label>

          <fieldset className="provider-mode" aria-describedby="context-window-help">
            <legend>AI context window (tokens)</legend>
            <label>
              Size
              <select
                value={contextPreset}
                aria-label="Context window size"
                onChange={(e) => {
                  setContextPreset(e.target.value)
                  setContextError(null)
                }}
              >
                <option value="unset">Unset (no client budget)</option>
                {CONTEXT_WINDOW_PRESETS.map((n) => (
                  <option key={n} value={String(n)}>
                    {n.toLocaleString()} tokens
                    {knownLimit != null && n > knownLimit ? ' — exceeds known model limit' : ''}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            </label>
            {contextPreset === 'custom' && (
              <label>
                Custom token count
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={contextCustom}
                  aria-label="Custom context window tokens"
                  onChange={(e) => {
                    setContextCustom(e.target.value)
                    setContextError(null)
                  }}
                  placeholder="e.g. 24576"
                />
              </label>
            )}
            <p
              id="context-window-help"
              style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}
            >
              {knownLimit != null ? (
                <>
                  Selected model reports a known limit of{' '}
                  <strong>{knownLimit.toLocaleString()}</strong> tokens. Values above that are
                  blocked.
                </>
              ) : (
                <>
                  Context length is <strong>unknown</strong> for the current model — LM Studio{' '}
                  <code>/v1/models</code> does not expose GGUF windows, and ForgeLocal will not
                  invent one. Set a size only for client-side budgeting / truncation.
                </>
              )}
            </p>
            {contextPreview.warning && !contextError && (
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>
                {contextPreview.warning}
              </p>
            )}
            {(contextError || (!contextPreview.ok && contextPreview.message)) && (
              <p role="alert" style={{ color: 'var(--danger, #c47d45)', fontSize: 12, margin: 0 }}>
                {contextError ?? contextPreview.message}
              </p>
            )}
          </fieldset>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} />
            Stream responses when available
          </label>
          <label>
            Editor font size
            <input value={fontSize} onChange={(e) => setFontSize(e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={allowOutside}
              onChange={(e) => setAllowOutside(e.target.checked)}
            />
            Allow filesystem paths outside workspace (requires care)
          </label>
          <div className="status-pill" title={lmStatus?.message}>
            <span className={`status-dot ${lmStatus?.status ?? 'unknown'}`} />
            {lmStatus?.message ?? 'Not tested'}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.45 }}>
            {remote ? (
              <>
                Remote mode uses your base URL + API key against an OpenAI-compatible{' '}
                <code>/models</code> and <code>/chat/completions</code> API. ForgeLocal does not
                invent credentials. Online tools/extensions unlock only after a remote model is
                selected. Switching back to Local disables those tools automatically.
              </>
            ) : (
              <>
                Troubleshooting: ensure LM Studio is running, a model is loaded, and Local Server is
                started on the configured port. Local mode never silently falls back to a remote
                provider.
              </>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={() => refreshLm()}>
            Test connection
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              const parsed = parseContextWindowInput(selectedContextRaw)
              if (!parsed.ok) {
                setContextError(parsed.message ?? 'Invalid context window')
                return
              }
              const validated = validateContextWindowSelection({
                requested: parsed.value,
                knownLimit,
                modelId: settings.provider.model
              })
              if (!validated.ok) {
                setContextError(validated.message ?? 'Invalid context window')
                return
              }
              await updateSettings({
                fontSize: Number(fontSize) || 14,
                allowPathsOutsideWorkspace: allowOutside,
                provider: {
                  ...settings.provider,
                  mode,
                  baseUrl:
                    baseUrl.trim() ||
                    (mode === 'remote'
                      ? DEFAULT_REMOTE_PROVIDER.baseUrl
                      : DEFAULT_PROVIDER.baseUrl),
                  apiKey,
                  timeoutMs: Number(timeoutMs) || 120000,
                  stream,
                  temperature: Number(temperature) || 0.2,
                  maxOutputTokens: Math.max(1, Number(maxOutputTokens) || 4096),
                  contextWindowTokens: validated.value,
                  // Clear model when switching mode so the user picks from the new endpoint
                  model: mode === settings.provider.mode ? settings.provider.model : ''
                }
              })
              setShow('showSettings', false)
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
