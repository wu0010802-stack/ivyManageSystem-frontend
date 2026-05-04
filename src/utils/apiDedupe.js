function stableStringify(obj) {
  if (obj === null || obj === undefined) return ''
  if (typeof obj !== 'object') return String(obj)
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']'
  }
  const keys = Object.keys(obj).sort()
  return '{' + keys
    .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
    .join(',') + '}'
}

function buildKey(method, url, payload) {
  const m = (method || 'get').toUpperCase()
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
export function applyDedupe(instance) {
  const inflight = new Map()

  const run = (key, config, original) => {
    if (config?.meta?.allowConcurrent) return original()
    const existing = inflight.get(key)
    if (existing) return existing
    const p = original().finally(() => inflight.delete(key))
    inflight.set(key, p)
    return p
  }

  // post / put / patch: (url, data, config)
  for (const method of ['post', 'put', 'patch']) {
    const original = instance[method].bind(instance)
    instance[method] = function (url, data, config) {
      const key = buildKey(method, url, data)
      return run(key, config || {}, () => original(url, data, config))
    }
  }

  // delete: (url, config)，data 可在 config.data
  {
    const original = instance.delete.bind(instance)
    instance.delete = function (url, config) {
      const cfg = config || {}
      const key = buildKey('delete', url, cfg.data)
      return run(key, cfg, () => original(url, config))
    }
  }

  // get / head: (url, config)，dedupe key 用 url + params
  for (const method of ['get', 'head']) {
    const original = instance[method].bind(instance)
    instance[method] = function (url, config) {
      const cfg = config || {}
      const key = buildKey(method, url, cfg.params)
      return run(key, cfg, () => original(url, config))
    }
  }

  // 直接呼叫 instance(config) 或 instance.request(config)
  const originalRequest = instance.request.bind(instance)
  instance.request = function (configOrUrl, maybeConfig) {
    const config =
      typeof configOrUrl === 'string'
        ? { ...(maybeConfig || {}), url: configOrUrl }
        : (configOrUrl || {})

    const method = (config.method || 'get').toLowerCase()
    if (MUTATING_METHODS.has(method)) {
      const key = buildKey(method, config.url, config.data)
      return run(key, config, () => originalRequest(configOrUrl, maybeConfig))
    }
    if (READ_METHODS.has(method)) {
      const key = buildKey(method, config.url, config.params)
      return run(key, config, () => originalRequest(configOrUrl, maybeConfig))
    }
    return originalRequest(configOrUrl, maybeConfig)
  }

  return instance
}

export { stableStringify }
