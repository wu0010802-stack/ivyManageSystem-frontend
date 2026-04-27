/**
 * useCachedAsync — 帶 TTL + stale-while-revalidate 的非同步資料 composable
 *
 * 在 useAsyncState 之上加一層全域 in-memory cache：
 *  - 切回已開過的頁時，先顯示快取 data（loading=false）+ 背景刷新
 *  - 失敗時保留舊資料，error 物件給 UI 決定如何提示（toast / retry）
 *  - 多個元件 mount 同 key 時 dedupe（一次 inflight 共用）
 *
 * 跟管理端 axios 層的 applyDedupe 互補：dedupe 解 race，本層解「切頁/重訪」的瀑布。
 *
 * @param {string} key  快取鍵；同一 key 的多個 caller 共用 cache
 * @param {(signal: AbortSignal) => Promise<any>} fetcher
 * @param {Object} [options]
 * @param {number} [options.ttl=60_000]   多久內視為 fresh，不背景 refetch
 * @param {boolean} [options.immediate=true]  mount 時是否自動 fetch
 * @param {any}    [options.initialData=null]
 *
 * @returns {{
 *   data, error, pending, isStale,
 *   refresh: (force?: boolean) => Promise,
 *   invalidate: () => void,
 * }}
 */

import { computed, onUnmounted, ref, shallowRef } from 'vue'

const _cache = new Map()
//   key -> { data, fetchedAt, inflight }

export function _resetCacheForTesting() {
  _cache.clear()
}

export function useCachedAsync(key, fetcher, options = {}) {
  const { ttl = 60_000, immediate = true, initialData = null } = options

  const entry = _cache.get(key) || { data: initialData, fetchedAt: 0, inflight: null }
  if (!_cache.has(key)) _cache.set(key, entry)

  const data = shallowRef(entry.data)
  const error = ref(null)
  const pending = ref(false)
  const fetchedAt = ref(entry.fetchedAt)

  const isStale = computed(() => {
    if (!fetchedAt.value) return true
    return Date.now() - fetchedAt.value > ttl
  })

  let controller = null

  function _syncFromCache() {
    const e = _cache.get(key)
    if (!e) return
    data.value = e.data
    fetchedAt.value = e.fetchedAt
  }

  async function refresh(force = false) {
    const e = _cache.get(key)

    // 共用 inflight：避免多 caller 同 key 重複 fetch
    if (e?.inflight) {
      pending.value = data.value == null
      try {
        await e.inflight
      } catch {
        /* 由原 inflight 的 caller 處理錯誤；此處僅同步 cache */
      }
      _syncFromCache()
      pending.value = false
      return data.value
    }

    if (!force && e && e.fetchedAt && Date.now() - e.fetchedAt <= ttl) {
      _syncFromCache()
      return data.value
    }

    error.value = null
    // 有舊資料就不要顯示 spinner（SWR 行為）；無舊資料才顯示 loading
    pending.value = data.value == null

    controller = new AbortController()
    const promise = (async () => {
      try {
        const result = await fetcher(controller.signal)
        if (controller.signal.aborted) return data.value
        data.value = result
        fetchedAt.value = Date.now()
        _cache.set(key, { data: result, fetchedAt: fetchedAt.value, inflight: null })
        return result
      } catch (err) {
        if (controller.signal.aborted) return data.value
        error.value = err
        // 失敗時不更新 cache（保留舊資料）
        const cur = _cache.get(key)
        if (cur) cur.inflight = null
        throw err
      } finally {
        pending.value = false
      }
    })()

    const cur = _cache.get(key) || { data: data.value, fetchedAt: fetchedAt.value }
    cur.inflight = promise
    _cache.set(key, cur)

    try {
      return await promise
    } catch {
      return data.value
    }
  }

  function invalidate() {
    _cache.delete(key)
    fetchedAt.value = 0
  }

  if (immediate) {
    // fire-and-forget
    refresh(false).catch(() => {})
  }

  onUnmounted(() => {
    if (controller) controller.abort()
  })

  return { data, error, pending, fetchedAt, isStale, refresh, invalidate }
}

/**
 * 全域 invalidate（例如登出時清掉所有家長 cache）。
 * 沒帶前綴 → 清空所有；帶前綴 → 只清前綴匹配的 key。
 */
export function invalidateCachedAsync(prefix) {
  if (!prefix) {
    _cache.clear()
    return
  }
  for (const key of [..._cache.keys()]) {
    if (typeof key === 'string' && key.startsWith(prefix)) _cache.delete(key)
  }
}
