import { defineStore } from 'pinia'

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 分鐘

interface CacheEntry {
  value: unknown
  expiresAt: number
}

/**
 * Portal 共用本地 cache。
 *
 * 取代各 view 內散落的 sheetCache / sessionDetail / scheduleMonthCache 等本地 Map，
 * 並提供 TTL、namespace、invalidate API。
 *
 * 使用：
 *   const cache = usePortalCache()
 *   cache.set('attendance', '2026-05', sheetData)
 *   const cached = cache.get('attendance', '2026-05')
 *   cache.invalidate('attendance')  // 整個 namespace
 *   cache.invalidate('attendance', '2026-05')  // 單筆
 */
export const usePortalCache = defineStore('portalCache', {
  state: () => ({
    // entries: Map<namespace, Map<key, { value, expiresAt }>>
    entries: new Map<string, Map<string, CacheEntry>>(),
  }),
  actions: {
    _ns(namespace: string): Map<string, CacheEntry> {
      let ns = this.entries.get(namespace)
      if (!ns) {
        ns = new Map<string, CacheEntry>()
        this.entries.set(namespace, ns)
      }
      return ns
    },
    set(namespace: string, key: string | number, value: unknown, { ttlMs = DEFAULT_TTL_MS } = {}) {
      const ns = this._ns(namespace)
      ns.set(String(key), { value, expiresAt: Date.now() + ttlMs })
    },
    get(namespace: string, key: string | number): unknown {
      const ns = this.entries.get(namespace)
      if (!ns) return undefined
      const entry = ns.get(String(key))
      if (!entry) return undefined
      if (entry.expiresAt < Date.now()) {
        ns.delete(String(key))
        return undefined
      }
      return entry.value
    },
    has(namespace: string, key: string | number) {
      return this.get(namespace, key) !== undefined
    },
    invalidate(namespace: string, key?: string | number) {
      if (key === undefined) {
        this.entries.delete(namespace)
        return
      }
      const ns = this.entries.get(namespace)
      if (ns) ns.delete(String(key))
    },
    clear() {
      this.entries.clear()
    },
  },
})
