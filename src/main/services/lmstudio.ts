import type {
  ChatCompletionRequest,
  LmConnectionResult,
  LmModel,
  ProviderSettings,
  StreamChunk
} from '../../shared/types'
import { isRemoteMode } from '../../shared/providerTools'
import { redactSecrets } from './security'

export class LmStudioService {
  private abortControllers = new Map<string, AbortController>()

  async testConnection(provider: ProviderSettings): Promise<LmConnectionResult> {
    const baseUrl = provider.baseUrl.replace(/\/$/, '')
    const remote = isRemoteMode(provider)
    const label = remote ? 'remote OpenAI-compatible API' : 'LM Studio'
    const started = Date.now()

    if (remote && !provider.apiKey.trim()) {
      return {
        status: 'error',
        message:
          'Remote mode needs an API key in Settings. Keys stay on this machine and are never logged.',
        models: [],
        baseUrl
      }
    }

    if (!baseUrl) {
      return {
        status: 'error',
        message: remote
          ? 'Remote base URL is empty. Set an OpenAI-compatible endpoint in Settings.'
          : 'LM Studio base URL is empty.',
        models: [],
        baseUrl
      }
    }

    try {
      const modelsUrl = `${baseUrl}/models`
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        Math.min(provider.timeoutMs || 120000, 10000)
      )
      const res = await fetch(modelsUrl, {
        method: 'GET',
        headers: this.headers(provider),
        signal: controller.signal
      })
      clearTimeout(timeout)
      const latencyMs = Date.now() - started

      if (!res.ok) {
        return {
          status: 'error',
          message: `${label} responded with HTTP ${res.status}. Check base URL and credentials.`,
          models: [],
          baseUrl,
          latencyMs
        }
      }

      const data = (await res.json()) as { data?: LmModel[] }
      const models = Array.isArray(data.data) ? data.data : []
      if (models.length === 0) {
        return {
          status: 'no-model',
          message: remote
            ? 'Connected to the remote API, but no models were listed for this key/endpoint.'
            : 'Connected to LM Studio, but no models are loaded. Load a model in LM Studio and try again.',
          models: [],
          baseUrl,
          latencyMs
        }
      }
      return {
        status: 'connected',
        message: `Connected (${remote ? 'remote' : 'local'}). ${models.length} model(s) available.`,
        models,
        baseUrl,
        latencyMs
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const lowered = message.toLowerCase()
      if (lowered.includes('abort')) {
        return {
          status: 'unreachable',
          message: remote
            ? 'Timed out reaching the remote API. Check the base URL, network, and firewall.'
            : 'Timed out reaching LM Studio. Check that the server is started (Developer → Start Server).',
          models: [],
          baseUrl
        }
      }
      if (
        lowered.includes('econnrefused') ||
        lowered.includes('fetch failed') ||
        lowered.includes('network')
      ) {
        return {
          status: 'stopped',
          message: remote
            ? 'Cannot reach the remote OpenAI-compatible endpoint. Verify base URL and network access.'
            : 'Cannot reach LM Studio at this URL. Start LM Studio, load a model, and enable the local server on the configured port.',
          models: [],
          baseUrl
        }
      }
      return {
        status: 'unreachable',
        message: redactSecrets(`Unable to connect: ${message}`),
        models: [],
        baseUrl
      }
    }
  }

  async listModels(provider: ProviderSettings): Promise<LmModel[]> {
    const result = await this.testConnection(provider)
    return result.models
  }

  async chat(
    requestId: string,
    provider: ProviderSettings,
    request: ChatCompletionRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const baseUrl = provider.baseUrl.replace(/\/$/, '')
    const remote = isRemoteMode(provider)
    if (!provider.model && !request.model) {
      onChunk({
        type: 'error',
        error: remote
          ? 'No model selected. Choose a remote model from the list after connecting.'
          : 'No model selected. Choose a model from the LM Studio list.'
      })
      return
    }

    if (remote && !provider.apiKey.trim()) {
      onChunk({
        type: 'error',
        error: 'Remote mode requires an API key in Settings before chatting.'
      })
      return
    }

    const controller = new AbortController()
    this.abortControllers.set(requestId, controller)
    const timeout = setTimeout(() => controller.abort(), provider.timeoutMs || 120000)

    const body = {
      model: request.model || provider.model,
      messages: request.messages,
      stream: provider.stream && request.stream !== false,
      temperature: request.temperature ?? 0.2
    }

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.headers(provider),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        onChunk({
          type: 'error',
          error: redactSecrets(
            `${remote ? 'Remote API' : 'LM Studio'} error HTTP ${res.status}: ${text.slice(0, 400) || res.statusText}`
          )
        })
        return
      }

      if (body.stream && res.body) {
        await this.consumeStream(res.body, onChunk, controller.signal)
      } else {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>
        }
        const content = json.choices?.[0]?.message?.content
        if (!content) {
          onChunk({
            type: 'error',
            error: `Empty or malformed response from ${remote ? 'remote API' : 'LM Studio'}.`
          })
          return
        }
        onChunk({ type: 'delta', content })
        onChunk({ type: 'done' })
      }
    } catch (err) {
      if (controller.signal.aborted) {
        onChunk({ type: 'cancelled' })
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      onChunk({ type: 'error', error: redactSecrets(message) })
    } finally {
      clearTimeout(timeout)
      this.abortControllers.delete(requestId)
    }
  }

  cancel(requestId: string): boolean {
    const controller = this.abortControllers.get(requestId)
    if (!controller) return false
    controller.abort()
    this.abortControllers.delete(requestId)
    return true
  }

  private headers(provider: ProviderSettings): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (provider.apiKey) {
      headers.Authorization = `Bearer ${provider.apiKey}`
    }
    return headers
  }

  private async consumeStream(
    body: ReadableStream<Uint8Array>,
    onChunk: (chunk: StreamChunk) => void,
    signal: AbortSignal
  ): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let receivedAny = false

    try {
      let reading = true
      while (reading) {
        if (signal.aborted) {
          onChunk({ type: 'cancelled' })
          return
        }
        const { done, value } = await reader.read()
        if (done) {
          reading = false
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line || line.startsWith(':')) continue
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') {
            onChunk({ type: 'done' })
            return
          }
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
            }
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              receivedAny = true
              onChunk({ type: 'delta', content: delta })
            }
            if (parsed.choices?.[0]?.finish_reason) {
              onChunk({ type: 'done' })
              return
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
      if (!receivedAny) {
        onChunk({
          type: 'error',
          error: 'Stream ended without content. The model may be incompatible or unloaded.'
        })
      } else {
        onChunk({ type: 'done' })
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // ignore
      }
    }
  }
}
