// src/parent/composables/useHomeDataCache.ts
/**
 * 首頁待辦／底部徽章資料的快取層與失效機制。
 *
 * 待辦清單與「待辦」tab 徽章來自三支快取（useCachedAsync，TTL 60 秒）：
 *  - parent/today/summary（useHomeSummary：繳費、簽收通知、活動調查、才藝候補…）
 *  - parent/sign-requests/mine（useParentTodos：待簽入學文件）
 *  - parent/pickup/active（useParentTodos：臨時接送進行中）
 *
 * 問題：家長簽收通知、填完調查、簽完入學文件後回首頁，快取還在 TTL 內，待辦與
 * tab 徽章最多會掛著舊數字 60 秒——看起來像「沒送出去」。而且 useCachedAsync
 * 每個 consumer 各有自己的 data：一個 consumer refresh 只更新自己，ParentLayout
 * 的徽章、首頁清單不會跟著變。
 *
 * 這支在 useCachedAsync 外包一層登記：
 *  - 掛載中的 consumer 會登記自己的 refresh；invalidateHomeData() 對它們全部
 *    強制重抓（同 key 共用一次請求），畫面上所有數字一起更新，且不先清空成 0
 *  - 目前沒有 consumer 的 key 標成「過期」，下一次有人掛載或 refresh 時強制重抓
 *  - 若強制 refresh 只是併入「失效之前就已發出」的請求，結果可能是舊的，再抓一次
 */
import { getCurrentInstance, onUnmounted } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'

export const HOME_DATA_TTL_MS = 60_000

type Refresh = (force?: boolean) => Promise<unknown>

const trackedKeys = new Set<string>()
const liveRefreshers = new Map<string, Set<Refresh>>()
/** 每個 key 最近一次真正發出請求時的失效世代（判斷強制重抓是否只併入了失效前的舊請求） */
const lastStartedEpoch = new Map<string, number>()
/**
 * 每個 key 目前快取內容是哪個失效世代「成功」取回的。失效後的強制重抓若失敗
 * （斷線），快取仍是舊資料，這個世代不能前進，否則 TTL 內會被當成新資料沿用。
 */
const lastFreshEpoch = new Map<string, number>()
let invalidationEpoch = 0

/** 這個 key 的快取是在最近一次失效之前取回的 */
function isOutdated(key: string): boolean {
  const fresh = lastFreshEpoch.get(key)
  return fresh !== undefined && fresh < invalidationEpoch
}

export function useHomeDataCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { immediate?: boolean } = {},
) {
  const { immediate = true } = options
  trackedKeys.add(key)

  const cached = useCachedAsync<T>(
    key,
    async () => {
      // useCachedAsync 同步呼叫 fetcher，這裡記下的就是請求發出當下的世代
      const epoch = invalidationEpoch
      lastStartedEpoch.set(key, epoch)
      const result = await fetcher()
      // 只有成功取回才算這個世代的資料；失敗時保留「過期」狀態，下次刷新或掛載會再抓
      if ((lastFreshEpoch.get(key) ?? -1) < epoch) lastFreshEpoch.set(key, epoch)
      return result
    },
    { ttl: HOME_DATA_TTL_MS, immediate },
  )

  // 上次失效時沒有人掛著這支資料：TTL 內的快取已過時，掛載時強制重抓
  if (immediate && isOutdated(key)) void cached.refresh(true)

  if (getCurrentInstance()) {
    const own: Refresh = cached.refresh
    const set = liveRefreshers.get(key) ?? new Set<Refresh>()
    set.add(own)
    liveRefreshers.set(key, set)
    onUnmounted(() => {
      set.delete(own)
      if (set.size === 0 && liveRefreshers.get(key) === set) liveRefreshers.delete(key)
    })
  }

  /** 一般 refresh 也尊重「已失效」：例如 ParentLayout 每次換頁的徽章刷新 */
  function refresh(force = false) {
    return cached.refresh(force || isOutdated(key))
  }

  return { ...cached, refresh }
}

async function refetchLive(key: string, epoch: number): Promise<void> {
  const live = [...(liveRefreshers.get(key) ?? [])]
  if (live.length === 0) return // 已標成過期，等下一個 consumer 掛載時重抓
  await Promise.all(live.map((refresh) => refresh(true)))
  // 第一輪若只是併入失效前就發出的請求（結果可能是舊的），再抓一次
  const started = lastStartedEpoch.get(key)
  if (started !== undefined && started < epoch) {
    await Promise.all(live.map((refresh) => refresh(true)))
  }
}

/**
 * 讓待辦清單與 tab 徽章立刻反映家長剛完成的動作（簽收、填調查、簽文件），
 * 也是首頁／待辦頁下拉刷新的入口。不會 reject。
 */
export async function invalidateHomeData(): Promise<void> {
  const epoch = ++invalidationEpoch
  try {
    await Promise.all([...trackedKeys].map((key) => refetchLive(key, epoch)))
  } catch {
    /* useCachedAsync.refresh 本身不 reject；保險起見不讓呼叫端的成功分支被拖垮 */
  }
}

export function _resetHomeDataCacheForTesting(): void {
  trackedKeys.clear()
  liveRefreshers.clear()
  lastStartedEpoch.clear()
  lastFreshEpoch.clear()
  invalidationEpoch = 0
}
