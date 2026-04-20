import { defineStore } from 'pinia'

const DEFAULT_TTL = 3 * 60 * 1000
const DEFAULT_STALE_MAX_AGE = 60 * 60 * 1000

function stableStringify(obj) {
  if (obj === null || obj === undefined) return ''
  if (typeof obj !== 'object') return String(obj)
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']'
  }
  const keys = Object.keys(obj).sort()
  return '{' + keys
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
    .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
    .join(',') + '}'
}

function defaultExtract(res) {
  if (Array.isArray(res?.data)) return { items: res.data, meta: {} }
  const d = res?.data || {}
  const { items = [], ...rest } = d
  return { items, meta: rest }
}

/**
 * 建立「以 params 為 key 快取多份清單」的 Pinia store 工廠。
 * 每個 entry 為 { data, meta, fetchedAt, pending }。
 *
 * @param {string}   storeName
 * @param {Function} apiFn  - (params) => Promise<{ data }>
 * @param {Object}   options
 *   @param {Function} extract  - (res) => { items, meta }，預設支援 res.data 為 array 或 { items, total, ... }
 *   @param {number}   ttl
 *   @param {string}   errorMsg
 */
export function createKeyedFetchStore(storeName, apiFn, {
  extract = defaultExtract,
  ttl = DEFAULT_TTL,
  errorMsg = '資料載入失敗',
} = {}) {
  return defineStore(storeName, {
    state: () => ({
      entries: new Map(),
      loading: false,
      error: null,
    }),

    getters: {
      allItems(state) {
        const out = []
        for (const entry of state.entries.values()) {
          for (const item of entry.data) out.push(item)
        }
        return out
      },
      byId(state) {
        return (id) => {
          for (const entry of state.entries.values()) {
            const hit = entry.data.find((x) => x && x.id === id)
            if (hit) return hit
          }
          return null
        }
      },
    },

    actions: {
      _keyOf(params) {
        return stableStringify(params || {})
      },

      getEntry(params) {
        return this.entries.get(this._keyOf(params)) || null
      },

      items(params) {
        return this.getEntry(params)?.data ?? []
      },

      meta(params) {
        return this.getEntry(params)?.meta ?? {}
      },

      async fetchByKey(params = {}, { force = false } = {}) {
        const key = this._keyOf(params)
        const existing = this.entries.get(key)
        if (!force && existing && Date.now() - existing.fetchedAt < ttl) {
          return { items: existing.data, meta: existing.meta }
        }
        if (existing && existing.pending) return existing.pending

        const entry = existing || { data: [], meta: {}, fetchedAt: 0, pending: null }
        this.loading = true
        this.error = null

        entry.pending = apiFn(params)
          .then((res) => {
            const { items, meta } = extract(res)
            entry.data = items || []
            entry.meta = meta || {}
            entry.fetchedAt = Date.now()
            this.entries.set(key, entry)
            return { items: entry.data, meta: entry.meta }
          })
          .catch((err) => {
            this.error = err?.response?.data?.detail || errorMsg
            throw err
          })
          .finally(() => {
            entry.pending = null
            this.loading = false
          })

        this.entries.set(key, entry)
        return entry.pending
      },

      invalidateKey(params) {
        const key = this._keyOf(params)
        const entry = this.entries.get(key)
        if (entry) entry.fetchedAt = 0
      },

      invalidateWhere(predicateOnKey) {
        for (const [key, entry] of this.entries) {
          if (predicateOnKey(key)) entry.fetchedAt = 0
        }
      },

      invalidateAll() {
        for (const entry of this.entries.values()) entry.fetchedAt = 0
      },

      /**
       * 對所有 entry 套用樂觀 patch。
       * @param {Function} predicate (item) => boolean
       * @param {Function} patchFn   (item) => partial patch；回傳 null 表刪除
       * @returns {Array} snapshot 用於回滾
       */
      patchLocal(predicate, patchFn) {
        const snapshots = []
        for (const [key, entry] of this.entries) {
          for (let i = entry.data.length - 1; i >= 0; i--) {
            const item = entry.data[i]
            if (!predicate(item)) continue
            snapshots.push([key, i, item])
            const patched = patchFn(item)
            if (patched === null) entry.data.splice(i, 1)
            else entry.data[i] = { ...item, ...patched }
          }
        }
        return snapshots
      },

      rollbackLocal(snapshots) {
        for (const [key, index, prev] of snapshots) {
          const entry = this.entries.get(key)
          if (!entry) continue
          if (index >= entry.data.length) entry.data.push(prev)
          else entry.data.splice(index, 0, prev)
        }
      },

      clearStale(maxAge = DEFAULT_STALE_MAX_AGE) {
        const now = Date.now()
        for (const [key, entry] of this.entries) {
          if (now - entry.fetchedAt > maxAge) this.entries.delete(key)
        }
      },

      clearAll() {
        this.entries.clear()
      },
    },
  })
}

export { stableStringify }
