/**
 * 家長端今日狀態快取（attendance/leave/medication/dismissal）。
 *
 * 行為：
 *  - sessionStorage 持久化，60s TTL
 *  - 60-300s 期間 stale-while-revalidate
 *  - BroadcastChannel 跨 tab 同步（不支援時靜默降級）
 *  - 可見性回前景且 cache age > 60s 自動 refresh
 *  - markStale() 強制下次重打
 */
import { ref } from 'vue'
import { getTodayStatus } from '@/parent/api/profile'

const CACHE_KEY = 'parent:today-status:v1'
const FRESH_TTL_MS = 60_000
const SWR_TTL_MS = 300_000
const CHANNEL_NAME = 'parent-today-status'

// 模組層 singleton state
const status = ref(null)
const loading = ref(false)
const error = ref(null)
let channel = null
let inflight = null

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function writeCache(payload) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ payload, cachedAt: Date.now() }))
  } catch {/* quota */}
}

function age(cache) { return cache ? Date.now() - cache.cachedAt : Infinity }

async function _fetch() {
  loading.value = true
  try {
    const res = await getTodayStatus()
    const data = res.data
    status.value = data
    writeCache(data)
    error.value = null
    channel?.postMessage({ type: 'updated', payload: data, ts: Date.now() })
    return data
  } catch (e) {
    error.value = e
    throw e
  } finally {
    loading.value = false
  }
}

function ensureChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (msg) => {
      if (msg.data?.type === 'updated' && msg.data.payload) {
        status.value = msg.data.payload
        writeCache(msg.data.payload)
      }
    }
  } catch {/* ignore */}
}

let visibilityBound = false
function ensureVisibility() {
  if (visibilityBound || typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const cache = readCache()
      if (age(cache) > FRESH_TTL_MS) {
        if (!inflight) {
          inflight = _fetch().finally(() => { inflight = null })
        }
      }
    }
  })
  visibilityBound = true
}

export function useTodayStatusCache() {
  ensureChannel()
  ensureVisibility()

  // 初始 hydrate from cache（不論是否 fresh）
  if (status.value === null) {
    const cache = readCache()
    if (cache) status.value = cache.payload
  }

  async function refresh() {
    const cache = readCache()
    const a = age(cache)

    if (a < FRESH_TTL_MS) {
      status.value = cache.payload
      return cache.payload
    }

    if (cache && a < SWR_TTL_MS) {
      // SWR：先給 stale 再背景 fetch
      status.value = cache.payload
      if (!inflight) {
        inflight = _fetch().finally(() => { inflight = null })
      }
      return cache.payload
    }

    // 無 cache 或太舊：等 fetch
    if (!inflight) {
      inflight = _fetch().finally(() => { inflight = null })
    }
    return inflight
  }

  function markStale() {
    try { sessionStorage.removeItem(CACHE_KEY) } catch {/* */}
  }

  return { status, loading, error, refresh, markStale }
}

// 測試用：重置 module-level state
export function _resetForTest() {
  status.value = null
  loading.value = false
  error.value = null
  inflight = null
  if (channel) { channel.close?.(); channel = null }
}
