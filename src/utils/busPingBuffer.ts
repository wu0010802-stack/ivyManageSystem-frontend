/**
 * 娃娃車 GPS 上報的取樣／節流／緩衝（隨車老師端使用）。
 *
 * `navigator.geolocation.watchPosition` 一秒可以回呼好幾次，直接每次都 POST
 * 會打爆網路與電池；本檔把高頻回呼收斂成「每 flushIntervalMs 一批」，並在
 * 收點當下就做三件事：
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
 *
 * 位置資料屬個資：本檔**不 log、不落任何 storage**，錯誤路徑也只回傳布林／
 * 原陣列，不把座標放進任何訊息字串。
 *
 * `shouldSamplePing` / `pushPing` 為純函式（時間由呼叫端隨 `at` 帶入，內部不讀
 * 時鐘），可獨立測試；`createPingBuffer` 只是包一層計時器的薄殼。
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

const LAT_ABS_MAX = 90
const LNG_ABS_MAX = 180

interface SampleOptions {
  minIntervalMs?: number
  maxAccuracyM?: number
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 取選項數值；非有限數或小於 min 一律退回預設值（呼叫端傳 NaN/負數不該讓守衛失效）。 */
function option(value: number | undefined, fallback: number, min = 0): number {
  return isFiniteNumber(value) && value >= min ? value : fallback
}

/** 容量夾在 `[1, MAX_BATCH_POINTS]`：0 或負數會讓 `slice(-n)` 語意翻車。 */
function resolveMaxPoints(value: number | undefined): number {
  if (!isFiniteNumber(value)) return MAX_BATCH_POINTS
  return Math.min(Math.max(1, Math.floor(value)), MAX_BATCH_POINTS)
}

/** 座標／精度／時間戳是否符合後端 `PingIn` 的約束。 */
function isValidPingPoint(p: PingPoint | null | undefined): boolean {
  if (!p) return false
  if (!isFiniteNumber(p.lat) || Math.abs(p.lat) > LAT_ABS_MAX) return false
  if (!isFiniteNumber(p.lng) || Math.abs(p.lng) > LNG_ABS_MAX) return false
  if (p.accuracy !== undefined && p.accuracy !== null) {
    if (!isFiniteNumber(p.accuracy) || p.accuracy < 0) return false
  }
  return parseTaipeiDate(p.at) !== null
}

/**
 * 這個點該不該被收下？`prev` 是「上一個被收下的點」（非上一個 push 的點）。
 *
 * 時鐘回捲（間隔為負）一律收下並重新錨定基準：裝置校時後若改成永久拒收，
 * 整趟車就再也不會上報位置。代價是刻意交錯的時間戳可以繞過節流，故容量上限
 * （`pushPing` 的 `maxPoints`）才是批次大小的硬防線。
 */
export function shouldSamplePing(
  prev: PingPoint | null | undefined,
  next: PingPoint,
  opts: SampleOptions = {},
): boolean {
  if (!isValidPingPoint(next)) return false

  const maxAccuracyM = option(opts.maxAccuracyM, DEFAULT_MAX_ACCURACY_M)
  if (isFiniteNumber(next.accuracy) && next.accuracy > maxAccuracyM) return false

  const prevAt = prev ? parseTaipeiDate(prev.at) : null
  if (!prevAt) return true

  const nextAt = parseTaipeiDate(next.at)
  if (!nextAt) return false
  const deltaMs = nextAt.getTime() - prevAt.getTime()
  if (deltaMs < 0) return true

  return deltaMs >= option(opts.minIntervalMs, DEFAULT_MIN_INTERVAL_MS)
}

/**
 * 把新點併入緩衝陣列。被拒的點回傳原陣列（不就地變更），收下時回傳新陣列並
 * 保留最新 `maxPoints` 筆（丟最舊）。
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
 */
export function createPingBuffer(opts: {
  flushIntervalMs?: number
  maxPoints?: number
  minIntervalMs?: number
  maxAccuracyM?: number
  onFlush: (points: PingPoint[]) => void
}) {
  const flushIntervalMs = option(opts.flushIntervalMs, DEFAULT_FLUSH_INTERVAL_MS, 1)
  const pushOpts = {
    minIntervalMs: opts.minIntervalMs,
    maxAccuracyM: opts.maxAccuracyM,
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
    push(p: PingPoint): void {
      if (timer === null) return
      points = pushPing(points, p, pushOpts)
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
