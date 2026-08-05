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
 * @param {(signal: AbortSignal) => Promise<T>} fetcher
 * @param {Object} [options]
 * @param {number} [options.ttl=60_000]   多久內視為 fresh，不背景 refetch
 * @param {boolean} [options.immediate=true]  mount 時是否自動 fetch
 * @param {T|null}  [options.initialData=null]
 *
 * @returns {{
 *   data, error, pending, fetchedAt, isStale,
 *   refresh: (force?: boolean) => Promise,
 *   invalidate: () => void,
 * }}
 */

import { computed, onUnmounted, ref, shallowRef, toValue, type MaybeRefOrGetter } from 'vue'

interface CacheEntry<T> {
  data: T | null
  fetchedAt: number
  inflight: Promise<T | null | undefined> | null
}

interface ActiveCacheConsumer {
  clear: () => void
}

/**
 * ⚠ 多租戶守則（frontend-core §2.8，**不要幫它自動加租戶前綴**）
 *
 * `_cache` 是 module-level in-memory Map，生命週期 = 單一分頁。正式環境每個租戶是
 * 獨立 origin（獨立 JS context），跨租戶污染的唯一路徑是「同一分頁內切換 acting
 * tenant」——而該切換依 CT-A-06 必走 `advanceAdminSession()`，它會呼叫
 * `invalidateCachedAsync()` 全清（見 `src/utils/adminSession.ts`）。
 *
 * 因此：
 *  - **既有 call site 的 key 一律不改**（零收益 churn，且會打破 `invalidate(prefix)` 語意）；
 *  - **總部（hq）頁面的 key 必須自己含 acting tenant**，例如
 *    `hq:${actingTenantId}:reports:finance:${period}`，或用
 *    `@/utils/tenantStorage` 的 `tenantCacheKey(base)`。這樣即使切換時有 race，
 *    也不會讀到他租戶的條目，且 `invalidateCachedAsync('hq:')` 仍可做細粒度失效。
 */
const _cache = new Map<string, CacheEntry<unknown>>()
const _activeControllers = new Map<string, Set<AbortController>>()
const _activeConsumers = new Map<string, Set<ActiveCacheConsumer>>()
//   key -> { data, fetchedAt, inflight }

export function _resetCacheForTesting() {
  for (const controllers of _activeControllers.values()) {
    controllers.forEach((controller) => controller.abort())
  }
  _activeControllers.clear()
  for (const consumers of _activeConsumers.values()) {
    consumers.forEach((consumer) => consumer.clear())
  }
  _activeConsumers.clear()
  _cache.clear()
}

function trackController(key: string, controller: AbortController): void {
  const controllers = _activeControllers.get(key) ?? new Set<AbortController>()
  controllers.add(controller)
  _activeControllers.set(key, controllers)
}

function untrackController(key: string, controller: AbortController): void {
  const controllers = _activeControllers.get(key)
  if (!controllers) return
  controllers.delete(controller)
  if (controllers.size === 0) _activeControllers.delete(key)
}

function abortControllers(key: string): void {
  const controllers = _activeControllers.get(key)
  controllers?.forEach((controller) => controller.abort())
  _activeControllers.delete(key)
}

function trackConsumer(key: string, consumer: ActiveCacheConsumer): void {
  const consumers = _activeConsumers.get(key) ?? new Set<ActiveCacheConsumer>()
  consumers.add(consumer)
  _activeConsumers.set(key, consumers)
}

function untrackConsumer(key: string, consumer: ActiveCacheConsumer): void {
  const consumers = _activeConsumers.get(key)
  if (!consumers) return
  consumers.delete(consumer)
  if (consumers.size === 0) _activeConsumers.delete(key)
}

function clearConsumers(key: string): void {
  _activeConsumers.get(key)?.forEach((consumer) => consumer.clear())
}

export function useCachedAsync<T = unknown>(
  keySource: MaybeRefOrGetter<string>,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: { ttl?: number; immediate?: boolean; initialData?: T | null } = {}
) {
  const { ttl = 60_000, immediate = true, initialData = null } = options

  const resolveKey = () => toValue(keySource)
  const key = resolveKey()

  const entry = (_cache.get(key) as CacheEntry<T> | undefined) || { data: initialData, fetchedAt: 0, inflight: null }
  if (!_cache.has(key)) _cache.set(key, entry as CacheEntry<unknown>)

  const data = shallowRef<T | null>(entry.data)
  const error = ref<unknown>(null)
  const pending = ref(false)
  const fetchedAt = ref(entry.fetchedAt)

  let controller: AbortController | null = null
  const consumer: ActiveCacheConsumer = {
    clear: () => {
      controller?.abort()
      controller = null
      data.value = null
      error.value = null
      pending.value = false
      fetchedAt.value = 0
    },
  }
  trackConsumer(key, consumer)

  const isStale = computed(() => {
    if (!fetchedAt.value) return true
    return Date.now() - fetchedAt.value > ttl
  })

  function _syncFromCache() {
    const currentKey = resolveKey()
    const e = _cache.get(currentKey) as CacheEntry<T> | undefined
    if (!e) return
    data.value = e.data
    fetchedAt.value = e.fetchedAt
  }

  async function refresh(force = false): Promise<T | null | undefined> {
    const currentKey = resolveKey()
    const e = _cache.get(currentKey) as CacheEntry<T> | undefined

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

    const requestController = new AbortController()
    controller = requestController
    trackController(currentKey, requestController)
    const promise: Promise<T | null | undefined> = (async () => {
      const k = resolveKey()
      try {
        const result = await fetcher(requestController.signal)
        if (requestController.signal.aborted) return data.value
        data.value = result
        fetchedAt.value = Date.now()
        _cache.set(k, { data: result as unknown, fetchedAt: fetchedAt.value, inflight: null })
        return result
      } catch (err) {
        if (requestController.signal.aborted) return data.value
        error.value = err
        // 失敗時不更新 cache（保留舊資料）
        const cur = _cache.get(k)
        if (cur) cur.inflight = null
        throw err
      } finally {
        untrackController(k, requestController)
        pending.value = false
      }
    })()

    const currentKey2 = resolveKey()
    const cur: CacheEntry<unknown> = _cache.get(currentKey2) || { data: data.value as unknown, fetchedAt: fetchedAt.value, inflight: null }
    cur.inflight = promise as Promise<unknown>
    _cache.set(currentKey2, cur)

    try {
      return await promise
    } catch {
      return data.value
    }
  }

  function invalidate() {
    const currentKey = resolveKey()
    abortControllers(currentKey)
    _cache.delete(currentKey)
    clearConsumers(currentKey)
  }

  if (immediate) {
    // fire-and-forget
    refresh(false).catch(() => {})
  }

  onUnmounted(() => {
    if (controller) controller.abort()
    untrackConsumer(key, consumer)
  })

  return { data, error, pending, fetchedAt, isStale, refresh, invalidate }
}

/**
 * 全域 invalidate（例如登出時清掉所有家長 cache）。
 * 沒帶前綴 → 清空所有；帶前綴 → 只清前綴匹配的 key。
 */
export function invalidateCachedAsync(prefix?: string) {
  if (!prefix) {
    for (const key of [..._activeControllers.keys()]) abortControllers(key)
    for (const key of [..._activeConsumers.keys()]) clearConsumers(key)
    _cache.clear()
    return
  }
  for (const key of [..._activeControllers.keys()]) {
    if (key.startsWith(prefix)) abortControllers(key)
  }
  for (const key of [..._activeConsumers.keys()]) {
    if (key.startsWith(prefix)) clearConsumers(key)
  }
  for (const key of [..._cache.keys()]) {
    if (typeof key === 'string' && key.startsWith(prefix)) _cache.delete(key)
  }
}
