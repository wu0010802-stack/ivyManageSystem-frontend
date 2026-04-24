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

function buildKey(method, url, data) {
  const m = (method || 'get').toUpperCase()
  const body = data == null ? '' : stableStringify(data)
  return `${m} ${url || ''} ${body}`
}

/**
 * 在 axios instance 上套用「同 key mutating 請求去重」。
 * 包裝 post/put/patch/delete 四個 HTTP 方法以及 request 本身。
 * 同 key 的併發 mutating 請求共用同一個 Promise；
 * GET/HEAD/OPTIONS 不去重；config.meta.allowConcurrent=true 可繞過。
 */
export function applyDedupe(instance) {
  const inflight = new Map()

  const run = (method, url, data, config, original) => {
    if (config?.meta?.allowConcurrent) return original()
    const key = buildKey(method, url, data)
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
      return run(method, url, data, config || {}, () => original(url, data, config))
    }
  }

  // delete: (url, config)，data 可在 config.data
  {
    const original = instance.delete.bind(instance)
    instance.delete = function (url, config) {
      const cfg = config || {}
      return run('delete', url, cfg.data, cfg, () => original(url, config))
    }
  }

  // 直接呼叫 instance(config) 或 instance.request(config)
  // 同樣對 mutating method 做去重
  const originalRequest = instance.request.bind(instance)
  instance.request = function (configOrUrl, maybeConfig) {
    const config =
      typeof configOrUrl === 'string'
        ? { ...(maybeConfig || {}), url: configOrUrl }
        : (configOrUrl || {})

    const method = (config.method || 'get').toLowerCase()
    if (method !== 'post' && method !== 'put' && method !== 'patch' && method !== 'delete') {
      return originalRequest(configOrUrl, maybeConfig)
    }
    return run(method, config.url, config.data, config, () => originalRequest(configOrUrl, maybeConfig))
  }

  return instance
}

export { stableStringify }
