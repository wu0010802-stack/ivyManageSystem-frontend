import { defineStore } from 'pinia'

const DEFAULT_TTL = 3 * 60 * 1000
const DEFAULT_STALE_MAX_AGE = 60 * 60 * 1000

interface KeyedEntry {
  data: unknown[]
  meta: Record<string, unknown>
  fetchedAt: number
  pending: Promise<{ items: unknown[]; meta: Record<string, unknown> }> | null
}

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return ''
  if (typeof obj !== 'object') return String(obj)
  if (Array.isArray(obj)) {
    return '[' + (obj as unknown[]).map(stableStringify).join(',') + ']'
  }
  const rec = obj as Record<string, unknown>
  const keys = Object.keys(rec).sort()
  return '{' + keys
    .filter((k) => rec[k] !== undefined && rec[k] !== null && rec[k] !== '')
    .map((k) => JSON.stringify(k) + ':' + stableStringify(rec[k]))
    .join(',') + '}'
}

function defaultExtract(res: unknown): { items: unknown[]; meta: Record<string, unknown> } {
  const r = res as { data?: unknown } | null
  if (Array.isArray(r?.data)) return { items: r!.data as unknown[], meta: {} }
  const d = (r?.data || {}) as Record<string, unknown>
  const { items = [], ...rest } = d
  return { items: (items as unknown[]), meta: rest }
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
export function createKeyedFetchStore(
  storeName: string,
  apiFn: (params?: unknown) => Promise<unknown>,
  {
    extract = defaultExtract,
    ttl = DEFAULT_TTL,
    errorMsg = '資料載入失敗',
  }: {
    extract?: (res: unknown) => { items: unknown[]; meta: Record<string, unknown> }
    ttl?: number
    errorMsg?: string
  } = {},
) {
  return defineStore(storeName, {
    state: () => ({
      entries: new Map<string, KeyedEntry>(),
      loadingKeys: new Set<string>(),
      error: null as string | null,
    }),

    getters: {
      loading(state) {
        return state.loadingKeys.size > 0
      },
      allItems(state) {
        const out: unknown[] = []
        for (const entry of state.entries.values()) {
          for (const item of entry.data) out.push(item)
        }
        return out
      },
      byId(state) {
        return (id: unknown) => {
          for (const entry of state.entries.values()) {
            const hit = entry.data.find((x) => x && (x as { id: unknown }).id === id)
            if (hit) return hit
          }
          return null
        }
      },
    },

    actions: {
      _keyOf(params: unknown) {
        return stableStringify(params || {})
      },

      getEntry(params: unknown): KeyedEntry | null {
        return this.entries.get(this._keyOf(params)) || null
      },

      isLoading(params: unknown) {
        return this.loadingKeys.has(this._keyOf(params))
      },

      items(params: unknown) {
        return this.getEntry(params)?.data ?? []
      },

      meta(params: unknown) {
        return this.getEntry(params)?.meta ?? {}
      },

      async fetchByKey(params: unknown = {}, { force = false } = {}) {
        const key = this._keyOf(params)
        const existing = this.entries.get(key) ?? null
        if (!force && existing && Date.now() - existing.fetchedAt < ttl) {
          return { items: existing.data, meta: existing.meta }
        }
        if (existing && existing.pending) return existing.pending

        const entry: KeyedEntry = existing || { data: [], meta: {}, fetchedAt: 0, pending: null }
        this.loadingKeys.add(key)
        this.error = null

        entry.pending = apiFn(params)
          .then((res: unknown) => {
            const { items, meta } = extract(res)
            entry.data = items || []
            entry.meta = meta || {}
            entry.fetchedAt = Date.now()
            this.entries.set(key, entry)
            return { items: entry.data, meta: entry.meta }
          })
          .catch((err: { response?: { data?: { detail?: string } } }) => {
            this.error = err?.response?.data?.detail || errorMsg
            throw err
          })
          .finally(() => {
            entry.pending = null
            this.loadingKeys.delete(key)
          })

        this.entries.set(key, entry)
        return entry.pending
      },

      invalidateKey(params: unknown) {
        const key = this._keyOf(params)
        const entry = this.entries.get(key)
        if (entry) entry.fetchedAt = 0
      },

      invalidateWhere(predicateOnKey: (key: string) => boolean) {
        for (const [key, entry] of this.entries) {
          if (predicateOnKey(key)) entry.fetchedAt = 0
        }
      },

      invalidateAll() {
        for (const entry of this.entries.values()) entry.fetchedAt = 0
      },

      /**
       * 對所有 entry 套用樂觀 patch。
       * @param predicate (item) => boolean
       * @param patchFn   (item) => partial patch；回傳 null 表刪除
       * @returns snapshot 用於回滾
       */
      patchLocal(
        predicate: (item: unknown) => boolean,
        patchFn: (item: unknown) => Record<string, unknown> | null,
      ) {
        const snapshots: [string, number, unknown][] = []
        for (const [key, entry] of this.entries) {
          for (let i = entry.data.length - 1; i >= 0; i--) {
            const item = entry.data[i]
            if (!predicate(item)) continue
            snapshots.push([key, i, item])
            const patched = patchFn(item)
            if (patched === null) entry.data.splice(i, 1)
            else entry.data[i] = { ...(item as object), ...patched }
          }
        }
        return snapshots
      },

      rollbackLocal(snapshots: [string, number, unknown][]) {
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
