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
const status = ref<unknown>(null)
const loading = ref(false)
const error = ref<unknown>(null)
let channel: BroadcastChannel | null = null
let inflight: Promise<unknown> | null = null
let cacheGeneration = 0

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function writeCache(payload: unknown) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ payload, cachedAt: Date.now() }))
  } catch {/* quota */}
}

function age(cache: { cachedAt: number } | null) { return cache ? Date.now() - cache.cachedAt : Infinity }

async function _fetch() {
  const generation = cacheGeneration
  loading.value = true
  try {
    const res = await getTodayStatus()
    if (generation !== cacheGeneration) return null
    const data = res.data
    status.value = data
    writeCache(data)
    error.value = null
    // BroadcastChannel 不傳個人化 payload，僅通知同帳號分頁重新驗證；共享裝置切換
    // LINE 帳號時，另一分頁的舊資料不能直接灌進目前記憶體。
    channel?.postMessage({ type: 'invalidated', ts: Date.now() })
    return data
  } catch (e) {
    if (generation !== cacheGeneration) return null
    error.value = e
    throw e
  } finally {
    if (generation === cacheGeneration) loading.value = false
  }
}

function startFetch(): Promise<unknown> {
  if (inflight) return inflight
  const request = _fetch()
  inflight = request
  request
    .finally(() => {
      if (inflight === request) inflight = null
    })
    .catch(() => {})
  return request
}

function ensureChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (msg) => {
      if (msg.data?.type === 'invalidated') {
        try { sessionStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
        status.value = null
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
          void startFetch()
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
        void startFetch()
      }
      return cache.payload
    }

    // 無 cache 或太舊：等 fetch
    if (!inflight) {
      void startFetch()
    }
    return inflight
  }

  function markStale() {
    try { sessionStorage.removeItem(CACHE_KEY) } catch {/* */}
  }

  return { status, loading, error, refresh, markStale }
}

/**
 * 登出時清除今日狀態快取：sessionStorage + module 層 in-memory status。
 *
 * 共用裝置下，下一位家長登入前必須清掉前一位的今日狀態（PII）；否則 60s FRESH_TTL
 * 內 refresh() 會直接回傳前一位的 cache，導致家長 A 登出後家長 B 看到 A 孩子狀態。
 * 不關閉 BroadcastChannel（下次 useTodayStatusCache() 會沿用）。
 */
export function clearTodayStatusCache() {
  cacheGeneration += 1
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
  status.value = null
  loading.value = false
  error.value = null
  inflight = null
  if (channel) {
    channel.close?.()
    channel = null
  }
}

// 測試用：重置 module-level state
export function _resetForTest() {
  cacheGeneration += 1
  status.value = null
  loading.value = false
  error.value = null
  inflight = null
  if (channel) { channel.close?.(); channel = null }
}
