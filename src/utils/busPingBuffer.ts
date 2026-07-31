/**
 * 娃娃車 GPS 上報的取樣／節流／緩衝（隨車老師端使用）。
 *
 * `navigator.geolocation.watchPosition` 一秒可以回呼好幾次，直接每次都 POST
 * 會打爆網路與電池；本檔把高頻回呼收斂成「每 flushIntervalMs 一批」，並在
 * 收點當下就做四件事：
 *
 * ① **取樣節流**：距離「上一個被收下的點」未滿 `minIntervalMs` 就丟棄。
 *    沒有這層節流時，高頻回呼會在幾秒內把容量上限灌滿，較舊的點被擠掉——
 *    結果批次涵蓋的時間窗反而變窄（軌跡出現空洞），並非只是多送幾筆而已。
 * ② **合法性守衛**：後端 `api/bus/portal_trips.py::PingIn` 對 lat/lng/accuracy
 *    有 `ge`/`le` 約束，且 `PingBatchIn.points` 上限 30 筆。批次裡只要混進一個
 *    NaN 或超範圍座標，整批會被 422 退回——連同其他合法點一起遺失。因此壞點
 *    在進 buffer 前就丟掉，容量也硬夾在 `MAX_BATCH_POINTS`。
 * ③ **時間軸統一**：`at` 允許 naive（台北牆鐘，後端 `to_taipei_naive` 原樣保留）
 *    與 aware（`Z` / `+08:00`）兩種形式，一律走 `parseTaipeiDate` 解析後再比較；
 *    直接 `new Date(naive)` 會被裝置時區牽著走，非台灣時區的裝置整整位移 8 小時，
 *    節流門檻會完全失效。
 * ④ **時鐘暴衝防線**（呼叫端傳 `nowAt` 才啟用）：`at` 是唯一後端不設範圍的欄位
 *    （`3000-01-01` 照樣通過 Pydantic）。一個暴衝的未來時間戳會做兩件壞事：把節流
 *    基準推到未來，使其後所有真實點都算「時鐘回捲」而全數放行；並且 `post_pings`
 *    用 `max()` 取最新那筆寫 `trip.last_ping_at`，那個未來時間會被當成「最後更新」，
 *    家長端 stale 判定會誤以為資料很新。故對偏離 `nowAt` 超過 `maxSkewMs` 的點直接
 *    拒收——比「回捲一律拒收」溫和（校時後不會永久卡死），又擋得住暴衝。
 *
 *    ⚠ **這道防線的射程**：擋得住「單顆時間戳暴衝」（裝置時鐘正常、個別 `at` 壞掉），
 *    擋**不住**「整支裝置時鐘系統性錯誤」——`at` 與 `nowAt` 一起錯到 3000 年時兩者
 *    偏差為 0，全數放行。這是設計上限而非 bug：純用戶端的「現在」無法自我驗證。
 *    要再收斂只能讓 `nowAt` 改從**伺服器時間**推導（例如班次快照 response 的
 *    `Date` header，或 `trip.last_ping_at` 加上本地經過時間），留給 Task 12／未來評估。
 *
 * 位置資料屬個資：本檔**不 log、不落任何 storage**，錯誤路徑也只回傳布林／
 * 原陣列，不把座標放進任何訊息字串。
 *
 * `shouldSamplePing` / `pushPing` 為純函式（時間由呼叫端隨 `at` / `nowAt` 帶入，
 * 內部一律不讀時鐘），可獨立測試；`createPingBuffer` 只是包一層計時器的薄殼。
 */
import { parseTaipeiDate } from '@/utils/taipeiTime'

export interface PingPoint {
  lat: number
  lng: number
  /** 定位誤差半徑（公尺），來自 `GeolocationCoordinates.accuracy`。 */
  accuracy?: number
  /** 台北牆鐘 naive 或帶時區的 ISO 字串。 */
  at: string
}

/** 後端 `PingBatchIn.points` 的 `max_length`；超過會 422 退回整批。 */
export const MAX_BATCH_POINTS = 30
/** 預設批次送出間隔（毫秒）。 */
export const DEFAULT_FLUSH_INTERVAL_MS = 5000
/** 預設取樣最小間隔（毫秒）：娃娃車路況下每秒一點已足夠畫出軌跡。 */
export const DEFAULT_MIN_INTERVAL_MS = 1000
/** 預設可接受的定位誤差上限（公尺）：超過一公里的點畫在街道圖上只會誤導家長。 */
export const DEFAULT_MAX_ACCURACY_M = 1000
/** 預設可容忍的 `at` 對「現在」偏差（毫秒，1 小時）：足以吸收裝置時鐘的日常誤差。 */
export const DEFAULT_MAX_SKEW_MS = 60 * 60 * 1000

const LAT_ABS_MAX = 90
const LNG_ABS_MAX = 180

interface SampleOptions {
  minIntervalMs?: number
  maxAccuracyM?: number
  /**
   * 呼叫端提供的「現在」（純函式一律不讀時鐘）。**有給才做時鐘暴衝檢查**；
   * 不給時行為與未加此參數前完全相同。
   *
   * ⚠ **每一次呼叫都必須傳**（型別上選用只為向後相容）。這是 per-call 的檢查，
   * 沒有任何跨呼叫狀態會替漏傳的那次補上：只要有一次漏傳，該次的暴衝時間戳就會
   * 進緩衝，並成為後續所有點的節流基準。
   */
  nowAt?: string
  /** `at` 相對 `nowAt` 可容忍的偏差（毫秒），預設 `DEFAULT_MAX_SKEW_MS`。 */
  maxSkewMs?: number
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 取選項數值；非有限數或小於 min 一律退回預設值（呼叫端傳 NaN/Infinity/負數不該讓守衛失效）。 */
function option(value: number | undefined, fallback: number, min = 0): number {
  return isFiniteNumber(value) && value >= min ? value : fallback
}

/** 容量夾在 `[1, MAX_BATCH_POINTS]`：0 或負數會讓 `slice(-n)` 語意翻車。 */
function resolveMaxPoints(value: number | undefined): number {
  if (!isFiniteNumber(value)) return MAX_BATCH_POINTS
  return Math.min(Math.max(1, Math.floor(value)), MAX_BATCH_POINTS)
}

/**
 * 驗證座標／精度／時間戳是否符合後端 `PingIn` 的約束，順便回傳解析好的 `at`
 * （回 `null` 即不合法）。**回 Date 而非 boolean 是刻意的**：呼叫端拿得到解析
 * 結果就不必再解析一次，也就不會出現「驗過之後再判一次 null」的不可達分支。
 *
 * `p` 的 null 檢查與 `accuracy === null` 是給未走型別的 JS 呼叫端（例如
 * `GeolocationCoordinates` 的欄位在部分瀏覽器是 `null`）的防禦，兩者皆有測試。
 */
function validatePing(p: PingPoint | null | undefined): Date | null {
  if (!p) return null
  if (!isFiniteNumber(p.lat) || Math.abs(p.lat) > LAT_ABS_MAX) return null
  if (!isFiniteNumber(p.lng) || Math.abs(p.lng) > LNG_ABS_MAX) return null
  if (p.accuracy !== undefined && p.accuracy !== null) {
    if (!isFiniteNumber(p.accuracy) || p.accuracy < 0) return null
  }
  return parseTaipeiDate(p.at)
}

/**
 * 這個點該不該被收下？`prev` 是「上一個被收下的點」（非上一個 push 的點）。
 *
 * 時鐘回捲（間隔為負）一律收下並重新錨定基準：裝置校時後若改成永久拒收，
 * 整趟車就再也不會上報位置。代價是刻意交錯的時間戳可以繞過節流，故另有兩道
 * 防線——容量上限（`pushPing` 的 `maxPoints`）夾住批次大小，`nowAt` 時鐘暴衝
 * 檢查擋掉「用未來時間戳把基準推走」這條路。
 */
export function shouldSamplePing(
  prev: PingPoint | null | undefined,
  next: PingPoint,
  opts: SampleOptions = {},
): boolean {
  const nextAt = validatePing(next)
  if (!nextAt) return false

  const maxAccuracyM = option(opts.maxAccuracyM, DEFAULT_MAX_ACCURACY_M)
  if (isFiniteNumber(next.accuracy) && next.accuracy > maxAccuracyM) return false

  // 時鐘暴衝：偏離「現在」太遠的時間戳一律拒收（呼叫端有給 nowAt 才檢查）。
  const nowAt = opts.nowAt ? parseTaipeiDate(opts.nowAt) : null
  if (nowAt) {
    const maxSkewMs = option(opts.maxSkewMs, DEFAULT_MAX_SKEW_MS)
    if (Math.abs(nextAt.getTime() - nowAt.getTime()) > maxSkewMs) return false
  }

  const prevAt = prev ? parseTaipeiDate(prev.at) : null
  if (!prevAt) return true

  const deltaMs = nextAt.getTime() - prevAt.getTime()
  if (deltaMs < 0) return true

  return deltaMs >= option(opts.minIntervalMs, DEFAULT_MIN_INTERVAL_MS)
}

/**
 * 把新點併入緩衝陣列。**一律不就地變更 `points`**：被拒時原樣回傳同一個陣列，
 * 收下時回傳**新**陣列並保留最新 `maxPoints` 筆（丟最舊）。因此
 * `pushPing(pts, p) === pts` 可以當作「這個點被拒了」的判定訊號（有測試咬住）。
 */
export function pushPing(
  points: PingPoint[],
  next: PingPoint,
  opts: SampleOptions & { maxPoints?: number } = {},
): PingPoint[] {
  const prev = points.length > 0 ? points[points.length - 1] : null
  if (!shouldSamplePing(prev, next, opts)) return points

  const maxPoints = resolveMaxPoints(opts.maxPoints)
  const appended = [...points, next]
  return appended.length > maxPoints ? appended.slice(-maxPoints) : appended
}

/**
 * 建立節流緩衝器：`start()` 後 `push()` 進來的點會每 `flushIntervalMs` 批次
 * 交給 `onFlush`。
 *
 * ⚠ `push()` 只在 `start()` 與 `stop()` 之間有效——`stop()` 後殘留的
 * `watchPosition` 回呼不得再累積座標（停止追蹤即停止收集）。`stop()` 同時清空
 * 未送出的點；需要保住最後一批請先呼叫 `flushNow()` 再 `stop()`。
 *
 * ⚠ **節流基準只在同一批內有效**：`flushNow` 把緩衝清空後，下一批的第一個點沒有
 * 基準可比，一律收下。因此跨批次的兩個相鄰點（例如 `07:30:00` 與 `07:30:00.100`）
 * 都會被收下。影響上限是每個 flush 週期多一個點，刻意接受——若改成保留基準，
 * 就得在停止／重開追蹤時記得清掉它，反而多一條會忘記重設的狀態。
 *
 * ⚠ `push(p, nowAt)` 的第二個參數是呼叫端的「現在」，有給才啟用時鐘暴衝檢查
 * （見模組開頭 ④）。**必須每次 `push()` 都傳**（`new Date().toISOString()` 即可）——
 * 檢查是 per-call 的，沒有跨呼叫狀態會替漏傳的那次補上，只要漏一次，那顆暴衝的
 * 時間戳就會進緩衝並成為後續所有點的節流基準。型別上做成選用只為向後相容。
 */
export function createPingBuffer(opts: {
  flushIntervalMs?: number
  maxPoints?: number
  minIntervalMs?: number
  maxAccuracyM?: number
  maxSkewMs?: number
  onFlush: (points: PingPoint[]) => void
}) {
  const flushIntervalMs = option(opts.flushIntervalMs, DEFAULT_FLUSH_INTERVAL_MS, 1)
  const pushOpts = {
    minIntervalMs: opts.minIntervalMs,
    maxAccuracyM: opts.maxAccuracyM,
    maxSkewMs: opts.maxSkewMs,
    maxPoints: opts.maxPoints,
  }
  let points: PingPoint[] = []
  let timer: ReturnType<typeof setInterval> | null = null

  function flushNow(): void {
    if (points.length === 0) return
    const batch = points
    points = []
    opts.onFlush(batch)
  }

  return {
    push(p: PingPoint, nowAt?: string): void {
      if (timer === null) return
      points = pushPing(points, p, { ...pushOpts, nowAt })
    },
    start(): void {
      if (timer !== null) return
      timer = setInterval(flushNow, flushIntervalMs)
    },
    stop(): void {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      points = []
    },
    flushNow,
  }
}
