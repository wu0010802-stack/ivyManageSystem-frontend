import { defineStore } from 'pinia'

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 分鐘

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
    entries: new Map(),
  }),
  actions: {
    _ns(namespace) {
      let ns = this.entries.get(namespace)
      if (!ns) {
        ns = new Map()
        this.entries.set(namespace, ns)
      }
      return ns
    },
    set(namespace, key, value, { ttlMs = DEFAULT_TTL_MS } = {}) {
      const ns = this._ns(namespace)
      ns.set(String(key), { value, expiresAt: Date.now() + ttlMs })
    },
    get(namespace, key) {
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
    has(namespace, key) {
      return this.get(namespace, key) !== undefined
    },
    invalidate(namespace, key = undefined) {
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
