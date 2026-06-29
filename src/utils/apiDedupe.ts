import type { AxiosInstance, AxiosRequestConfig } from 'axios'

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return ''
  if (typeof obj !== 'object') return String(obj)
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']'
  }
  const keys = Object.keys(obj).sort()
  return '{' + keys
    .map((k) => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k]))
    .join(',') + '}'
}

// 二進位/串流 body（FormData / Blob / File / ArrayBuffer）無可列舉 own keys，
// stableStringify 的 Object.keys 會回 [] → 全部塌成 '{}'，使同 URL 併發上傳被去重吞掉
// 較晚的檔案（qa-loop round2 2026-06-29）。上傳本就不該因「同 URL」被併單。
function isBinaryBody(p: unknown): boolean {
  if (p == null || typeof p !== 'object') return false
  return (
    (typeof FormData !== 'undefined' && p instanceof FormData) ||
    (typeof Blob !== 'undefined' && p instanceof Blob) ||
    (typeof ArrayBuffer !== 'undefined' && p instanceof ArrayBuffer)
  )
}

let _binaryBodySeq = 0

function buildKey(method: string, url: unknown, payload: unknown) {
  const m = (method || 'get').toUpperCase()
  // 二進位 body 給唯一 key（停用去重），避免併發上傳塌成同 key 吞檔。
  if (isBinaryBody(payload)) {
    return `${m} ${url || ''} __binary__${++_binaryBodySeq}`
  }
  const body = payload == null ? '' : stableStringify(payload)
  return `${m} ${url || ''} ${body}`
}

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])
const READ_METHODS = new Set(['get', 'head'])

/**
 * 在 axios instance 上套用「同 key in-flight 請求去重」。
 * - mutating（POST/PUT/PATCH/DELETE）：以 method+url+body 為 key，併發共用 promise；
 *   防止按鈕連點重送。
 * - read（GET/HEAD）：以 method+url+params 為 key，併發共用 promise；
 *   防止多個元件同時 mount 各自打同一支 endpoint。**不快取已完成結果**，
 *   結果快取請走 store TTL 或 SW runtimeCache。
 * - config.meta.allowConcurrent=true 可繞過去重。
 */
export function applyDedupe(instance: AxiosInstance) {
  const inflight = new Map<string, Promise<unknown>>()

  const run = (key: string, config: AxiosRequestConfig & { meta?: { allowConcurrent?: boolean } }, original: () => Promise<unknown>) => {
    if ((config as Record<string, unknown>)?.['meta'] && ((config as Record<string, unknown>)['meta'] as Record<string, unknown>)?.['allowConcurrent']) return original()
    const existing = inflight.get(key)
    if (existing) return existing
    const p = original().finally(() => inflight.delete(key))
    inflight.set(key, p)
    return p
  }

  // post / put / patch: (url, data, config)
  for (const method of ['post', 'put', 'patch']) {
    const original = (instance as unknown as Record<string, (url: string, data?: unknown, config?: AxiosRequestConfig) => Promise<unknown>>)[method].bind(instance)
    ;(instance as unknown as Record<string, unknown>)[method] = function (url: string, data: unknown, config: AxiosRequestConfig) {
      const key = buildKey(method, url, data)
      return run(key, config || {}, () => original(url, data, config))
    }
  }

  // delete: (url, config)，data 可在 config.data
  {
    const original = instance.delete.bind(instance)
    ;(instance as unknown as Record<string, unknown>)['delete'] = function (url: string, config: AxiosRequestConfig & { data?: unknown }) {
      const cfg = config || {}
      const key = buildKey('delete', url, cfg.data)
      return run(key, cfg, () => original(url, config))
    }
  }

  // get / head: (url, config)，dedupe key 用 url + params
  for (const method of ['get', 'head']) {
    const original = (instance as unknown as Record<string, (url: string, config?: AxiosRequestConfig) => Promise<unknown>>)[method].bind(instance)
    ;(instance as unknown as Record<string, unknown>)[method] = function (url: string, config: AxiosRequestConfig & { params?: unknown }) {
      const cfg = config || {}
      const key = buildKey(method, url, cfg.params)
      return run(key, cfg, () => original(url, config))
    }
  }

  // 直接呼叫 instance(config) 或 instance.request(config)
  const originalRequest = instance.request.bind(instance)
  ;(instance as unknown as Record<string, unknown>)['request'] = function (configOrUrl: string | AxiosRequestConfig, maybeConfig?: AxiosRequestConfig) {
    const config: AxiosRequestConfig =
      typeof configOrUrl === 'string'
        ? { ...(maybeConfig || {}), url: configOrUrl }
        : (configOrUrl || {})

    const method = ((config.method || 'get') as string).toLowerCase()
    if (MUTATING_METHODS.has(method)) {
      const key = buildKey(method, config.url, config.data)
      return run(key, config, () => originalRequest(config))
    }
    if (READ_METHODS.has(method)) {
      const key = buildKey(method, config.url, config.params)
      return run(key, config, () => originalRequest(config))
    }
    return originalRequest(config)
  }

  return instance
}

export { stableStringify }
