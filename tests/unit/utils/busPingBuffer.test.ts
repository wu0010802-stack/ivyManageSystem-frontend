/**
 * 娃娃車 GPS 上報節流／緩衝純函式測試。
 *
 * 重點不在「有沒有回傳東西」，而在「留下的是哪幾個點、順序對不對」——
 * 因此幾乎所有斷言都比對 `at` 的完整陣列而非長度。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_MAX_SKEW_MS,
  MAX_BATCH_POINTS,
  createPingBuffer,
  pushPing,
  shouldSamplePing,
  type PingPoint,
} from '@/utils/busPingBuffer'

// 2026-07-30 07:30:00 台北 = 2026-07-29 23:30:00 UTC
const BASE_UTC_MS = Date.UTC(2026, 6, 29, 23, 30, 0)

/**
 * 產生台北牆鐘 naive 字串（後端 `PingIn.at` 契約），偏移量以毫秒計。
 * **毫秒必須保留**（只有剛好整秒才省略），否則 `point(999)` 會塌成 `point(0)`，
 * 「差 1 毫秒」的邊界測試就變成在測「差 0 毫秒」，off-by-one 變異抓不到。
 */
function wallClock(offsetMs: number): string {
  const d = new Date(BASE_UTC_MS + offsetMs + 8 * 60 * 60 * 1000)
  return d.toISOString().replace(/\.000Z$/, '').replace(/Z$/, '')
}

/** 產生同一時刻的 aware（帶 Z）字串，用來驗證兩種格式落在同一時間軸。 */
function awareUtc(offsetMs: number): string {
  return new Date(BASE_UTC_MS + offsetMs).toISOString()
}

function point(offsetMs: number, extra: Partial<PingPoint> = {}): PingPoint {
  return { lat: 22.6, lng: 120.3, at: wallClock(offsetMs), ...extra }
}

describe('shouldSamplePing — 座標／精度守衛', () => {
  it('沒有基準點時第一個點一律收下', () => {
    expect(shouldSamplePing(null, point(0))).toBe(true)
    expect(shouldSamplePing(undefined, point(0))).toBe(true)
  })

  it('緯經度邊界值：剛好 ±90 / ±180 收下，超出即拒', () => {
    expect(shouldSamplePing(null, point(0, { lat: 90 }))).toBe(true)
    expect(shouldSamplePing(null, point(0, { lat: -90 }))).toBe(true)
    expect(shouldSamplePing(null, point(0, { lng: 180 }))).toBe(true)
    expect(shouldSamplePing(null, point(0, { lng: -180 }))).toBe(true)
    expect(shouldSamplePing(null, point(0, { lat: 90.0001 }))).toBe(false)
    expect(shouldSamplePing(null, point(0, { lat: -90.0001 }))).toBe(false)
    expect(shouldSamplePing(null, point(0, { lng: 180.0001 }))).toBe(false)
    expect(shouldSamplePing(null, point(0, { lng: -180.0001 }))).toBe(false)
  })

  it('座標 0 是合法值（不可被 falsy 檢查誤殺）', () => {
    expect(shouldSamplePing(null, point(0, { lat: 0, lng: 0 }))).toBe(true)
  })

  it('NaN / Infinity 座標一律拒（送出去會讓後端 422 整批）', () => {
    expect(shouldSamplePing(null, point(0, { lat: Number.NaN }))).toBe(false)
    expect(shouldSamplePing(null, point(0, { lng: Number.NaN }))).toBe(false)
    expect(shouldSamplePing(null, point(0, { lat: Number.POSITIVE_INFINITY }))).toBe(false)
    expect(shouldSamplePing(null, point(0, { lng: Number.NEGATIVE_INFINITY }))).toBe(false)
  })

  it('accuracy：未提供與 0 都收下，負數與 NaN 拒（後端 ge=0）', () => {
    expect(shouldSamplePing(null, point(0))).toBe(true)
    expect(shouldSamplePing(null, point(0, { accuracy: 0 }))).toBe(true)
    expect(shouldSamplePing(null, point(0, { accuracy: -0.0001 }))).toBe(false)
    expect(shouldSamplePing(null, point(0, { accuracy: Number.NaN }))).toBe(false)
  })

  it('accuracy 邊界：剛好等於門檻收下，超過一點點即拒', () => {
    const opts = { maxAccuracyM: 500 }
    expect(shouldSamplePing(null, point(0, { accuracy: 499.9999 }), opts)).toBe(true)
    expect(shouldSamplePing(null, point(0, { accuracy: 500 }), opts)).toBe(true)
    expect(shouldSamplePing(null, point(0, { accuracy: 500.0001 }), opts)).toBe(false)
  })

  it('at 無法解析時拒（空字串／亂碼）', () => {
    expect(shouldSamplePing(null, { lat: 22.6, lng: 120.3, at: '' })).toBe(false)
    expect(shouldSamplePing(null, { lat: 22.6, lng: 120.3, at: '不是時間' })).toBe(false)
  })

  it('點本身為 null／undefined 時拒（未走型別的 JS 呼叫端）', () => {
    expect(shouldSamplePing(null, null as unknown as PingPoint)).toBe(false)
    expect(shouldSamplePing(null, undefined as unknown as PingPoint)).toBe(false)
  })

  it('accuracy 為 null 視同未提供（部分瀏覽器的 GeolocationCoordinates 給 null）', () => {
    const p = { lat: 22.6, lng: 120.3, at: wallClock(0), accuracy: null as unknown as number }
    expect(shouldSamplePing(null, p)).toBe(true)
  })
})

describe('shouldSamplePing — 時鐘暴衝（nowAt）', () => {
  const now = wallClock(0)

  it('未傳 nowAt 時完全不檢查（與加此參數前相容）', () => {
    expect(shouldSamplePing(null, point(1000 * 60 * 60 * 24 * 365))).toBe(true)
    expect(shouldSamplePing(null, { lat: 22.6, lng: 120.3, at: '3000-01-01T00:00:00' })).toBe(true)
  })

  it('傳了 nowAt 就擋掉暴衝到未來的時間戳', () => {
    expect(
      shouldSamplePing(null, { lat: 22.6, lng: 120.3, at: '3000-01-01T00:00:00' }, { nowAt: now }),
    ).toBe(false)
  })

  it('偏差邊界：剛好等於 maxSkewMs 收下，多 1 毫秒即拒（未來與過去對稱）', () => {
    const opts = { nowAt: now, maxSkewMs: 60_000 }
    expect(shouldSamplePing(null, point(60_000), opts)).toBe(true)
    expect(shouldSamplePing(null, point(60_001), opts)).toBe(false)
    expect(shouldSamplePing(null, point(-60_000), opts)).toBe(true)
    expect(shouldSamplePing(null, point(-60_001), opts)).toBe(false)
  })

  it('maxSkewMs 預設 1 小時', () => {
    expect(DEFAULT_MAX_SKEW_MS).toBe(3_600_000)
    expect(shouldSamplePing(null, point(3_600_000), { nowAt: now })).toBe(true)
    expect(shouldSamplePing(null, point(3_600_001), { nowAt: now })).toBe(false)
  })

  it('maxSkewMs 為 NaN／負數／Infinity 時退回預設 1 小時', () => {
    for (const maxSkewMs of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(shouldSamplePing(null, point(3_600_000), { nowAt: now, maxSkewMs })).toBe(true)
      expect(shouldSamplePing(null, point(3_600_001), { nowAt: now, maxSkewMs })).toBe(false)
    }
  })

  it('maxSkewMs 為 0 時只收 at 與 nowAt 完全相同的點（0 是合法門檻，不退回預設）', () => {
    const opts = { nowAt: now, maxSkewMs: 0 }
    expect(shouldSamplePing(null, point(0), opts)).toBe(true)
    expect(shouldSamplePing(null, point(1), opts)).toBe(false)
    expect(shouldSamplePing(null, point(-1), opts)).toBe(false)
  })

  it('nowAt 本身不可解析時視為沒給（不因壞參數而全擋）', () => {
    expect(shouldSamplePing(null, point(0), { nowAt: '不是時間' })).toBe(true)
    expect(shouldSamplePing(null, point(3_600_001), { nowAt: '' })).toBe(true)
  })

  it('nowAt 也吃 aware 字串（與 at 同一時間軸）', () => {
    expect(shouldSamplePing(null, point(3_600_001), { nowAt: awareUtc(0) })).toBe(false)
    expect(shouldSamplePing(null, point(3_600_000), { nowAt: awareUtc(0) })).toBe(true)
  })

  it('暴衝的未來點無法再把節流基準推走（reviewer 的繞過情境）', () => {
    // 先塞一個 3000 年的點，其後 50 個間隔 <100ms 的真實點原本會全數被當「時鐘回捲」收下
    let pts: PingPoint[] = []
    pts = pushPing(pts, { lat: 22.6, lng: 120.3, at: '3000-01-01T00:00:00' }, { nowAt: wallClock(0) })
    expect(pts).toHaveLength(0)
    for (let i = 0; i < 50; i += 1) {
      pts = pushPing(pts, point(i * 80), { nowAt: wallClock(i * 80) })
    }
    // 節流正常運作：4 秒的高頻點只留下每秒一個
    expect(pts.map((p) => p.at)).toEqual([
      wallClock(0),
      wallClock(1040),
      wallClock(2080),
      wallClock(3120),
    ])
  })
})

describe('shouldSamplePing — 時間節流邊界', () => {
  const opts = { minIntervalMs: 1000 }

  it('間隔剛好等於門檻要收下，差 1 毫秒就拒', () => {
    expect(shouldSamplePing(point(0), point(1000), opts)).toBe(true)
    expect(shouldSamplePing(point(0), point(999), opts)).toBe(false)
  })

  it('重複時間戳（間隔 0）拒', () => {
    expect(shouldSamplePing(point(0), point(0), opts)).toBe(false)
  })

  it('minIntervalMs=0 等同關閉節流，重複時間戳也收', () => {
    expect(shouldSamplePing(point(0), point(0), { minIntervalMs: 0 })).toBe(true)
  })

  it('minIntervalMs 為 NaN／負數時退回預設 1 秒（壞選項不得讓節流失效）', () => {
    expect(shouldSamplePing(point(0), point(500), { minIntervalMs: Number.NaN })).toBe(false)
    expect(shouldSamplePing(point(0), point(500), { minIntervalMs: -1 })).toBe(false)
    expect(shouldSamplePing(point(0), point(1000), { minIntervalMs: Number.NaN })).toBe(true)
  })

  it('maxAccuracyM 為 NaN／負數時退回預設 1000 公尺（壞選項不得全擋或全放）', () => {
    expect(shouldSamplePing(null, point(0, { accuracy: 500 }), { maxAccuracyM: Number.NaN })).toBe(true)
    expect(shouldSamplePing(null, point(0, { accuracy: 500 }), { maxAccuracyM: -1 })).toBe(true)
    expect(shouldSamplePing(null, point(0, { accuracy: 1500 }), { maxAccuracyM: Number.NaN })).toBe(false)
  })

  it('選項為 Infinity 時退回預設（Infinity 門檻會讓節流永久拒收所有點）', () => {
    const inf = Number.POSITIVE_INFINITY
    expect(shouldSamplePing(point(0), point(1000), { minIntervalMs: inf })).toBe(true)
    expect(shouldSamplePing(point(0), point(999), { minIntervalMs: inf })).toBe(false)
    // maxAccuracyM: Infinity 若被採用會讓精度門檻完全失效
    expect(shouldSamplePing(null, point(0, { accuracy: 1500 }), { maxAccuracyM: inf })).toBe(false)
    expect(shouldSamplePing(null, point(0, { accuracy: 900 }), { maxAccuracyM: inf })).toBe(true)
  })

  it('裝置時鐘回捲（間隔為負）要收下並重新錨定，不可永久卡死', () => {
    expect(shouldSamplePing(point(10_000), point(0), opts)).toBe(true)
    // 重新錨定後，相對新基準未滿門檻的點依然被擋
    expect(shouldSamplePing(point(0), point(500), opts)).toBe(false)
  })

  it('naive 台北字串與 aware UTC 字串落在同一時間軸（跨時區裝置）', () => {
    const prev = point(0) // naive 台北牆鐘
    const nextAware: PingPoint = { lat: 22.6, lng: 120.3, at: awareUtc(999) }
    // 同一時刻只差 999ms，未達門檻；若把 naive 當 UTC 解析會位移 8 小時而誤收
    expect(shouldSamplePing(prev, nextAware, opts)).toBe(false)
    expect(shouldSamplePing(prev, { ...nextAware, at: awareUtc(1000) }, opts)).toBe(true)
  })

  it('非台灣時區的裝置也算得對（TZ=America/New_York）', () => {
    const original = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(shouldSamplePing(point(0), { lat: 22.6, lng: 120.3, at: awareUtc(999) }, opts)).toBe(false)
      expect(shouldSamplePing(point(0), point(1000), opts)).toBe(true)
    } finally {
      process.env.TZ = original
    }
  })
})

describe('pushPing — 容量、順序與基準點', () => {
  it('依序累積，回傳的是 push 順序', () => {
    let pts: PingPoint[] = []
    pts = pushPing(pts, point(0))
    pts = pushPing(pts, point(1000))
    pts = pushPing(pts, point(2000))
    expect(pts.map((p) => p.at)).toEqual([wallClock(0), wallClock(1000), wallClock(2000)])
  })

  it('超過 maxPoints 丟最舊、保最新且順序不變', () => {
    let pts: PingPoint[] = []
    for (let i = 0; i < 3; i += 1) pts = pushPing(pts, point(i * 1000), { maxPoints: 2 })
    expect(pts.map((p) => p.at)).toEqual([wallClock(1000), wallClock(2000)])
  })

  it('maxPoints 上限被夾到後端可接受的 30 筆', () => {
    let pts: PingPoint[] = []
    for (let i = 0; i < 35; i += 1) pts = pushPing(pts, point(i * 1000), { maxPoints: 100 })
    expect(MAX_BATCH_POINTS).toBe(30)
    expect(pts).toHaveLength(30)
    expect(pts[0].at).toBe(wallClock(5 * 1000))
    expect(pts[29].at).toBe(wallClock(34 * 1000))
  })

  it('maxPoints 為 0／負數／NaN 時退回安全值（至少留住最新一點）', () => {
    for (const maxPoints of [0, -5, Number.NaN]) {
      let pts: PingPoint[] = []
      pts = pushPing(pts, point(0), { maxPoints })
      pts = pushPing(pts, point(1000), { maxPoints })
      expect(pts.length).toBeGreaterThanOrEqual(1)
      expect(pts[pts.length - 1].at).toBe(wallClock(1000))
    }
  })

  it('被拒的點不改動原陣列，且回傳「同一個」陣列（Task 12 靠此判定被拒）', () => {
    const pts = [point(0)]
    const next = pushPing(pts, point(500))
    expect(pts.map((p) => p.at)).toEqual([wallClock(0)])
    expect(next.map((p) => p.at)).toEqual([wallClock(0)])
    expect(next).toBe(pts)
  })

  it('收下時回傳「新」陣列且原陣列不被就地變更', () => {
    const pts = [point(0)]
    const next = pushPing(pts, point(1000))
    expect(next).not.toBe(pts)
    expect(pts.map((p) => p.at)).toEqual([wallClock(0)])
    expect(next.map((p) => p.at)).toEqual([wallClock(0), wallClock(1000)])
  })

  it('超過容量而裁切時同樣不就地變更原陣列', () => {
    const pts = [point(0), point(1000)]
    const next = pushPing(pts, point(2000), { maxPoints: 2 })
    expect(next).not.toBe(pts)
    expect(pts.map((p) => p.at)).toEqual([wallClock(0), wallClock(1000)])
    expect(next.map((p) => p.at)).toEqual([wallClock(1000), wallClock(2000)])
  })

  it('節流基準是「最後被收下的點」而非「最後被 push 的點」', () => {
    let pts: PingPoint[] = []
    pts = pushPing(pts, point(0))
    pts = pushPing(pts, point(500)) // 被擋
    pts = pushPing(pts, point(1000)) // 相對 0 已滿 1 秒 → 應收
    expect(pts.map((p) => p.at)).toEqual([wallClock(0), wallClock(1000)])
  })

  it('真實 GPS 序列：跳點、重複時間戳、時鐘倒退、爛精度混雜', () => {
    const seq: PingPoint[] = [
      point(0, { accuracy: 12 }), // 收：首點
      point(300, { accuracy: 8 }), // 拒：間隔 300ms
      point(1000, { accuracy: 5000 }), // 拒：精度 5 公里
      point(1200, { accuracy: 10 }), // 收：距上次收下（0）已 1200ms
      point(1200, { accuracy: 10 }), // 拒：重複時間戳
      { lat: Number.NaN, lng: 120.3, at: wallClock(3000) }, // 拒：座標壞掉
      point(600, { accuracy: 9 }), // 收：時鐘回捲，重新錨定
      point(900, { accuracy: 9 }), // 拒：相對新基準只有 300ms
      point(1600, { accuracy: 9 }), // 收：相對新基準 1000ms
    ]
    let pts: PingPoint[] = []
    for (const p of seq) pts = pushPing(pts, p, { minIntervalMs: 1000, maxAccuracyM: 1000 })
    expect(pts.map((p) => p.at)).toEqual([
      wallClock(0),
      wallClock(1200),
      wallClock(600),
      wallClock(1600),
    ])
  })

  it('交錯偽造時間戳無法灌爆批次（容量是硬防線）', () => {
    let pts: PingPoint[] = []
    for (let i = 0; i < 200; i += 1) {
      // 一前一後跳動的時間戳可繞過節流（回捲一律收下），但容量必須擋住
      pts = pushPing(pts, point(i % 2 === 0 ? 0 : 10_000), { minIntervalMs: 1000 })
    }
    expect(pts).toHaveLength(MAX_BATCH_POINTS)
  })
})

describe('createPingBuffer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('累積多點、間隔到才 flush 一批，且內容與順序正確', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, onFlush })
    buf.start()
    buf.push(point(0))
    buf.push(point(1000))
    buf.push(point(2000))
    expect(onFlush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(onFlush).toHaveBeenCalledOnce()
    expect(onFlush.mock.calls[0][0].map((p: PingPoint) => p.at)).toEqual([
      wallClock(0),
      wallClock(1000),
      wallClock(2000),
    ])
  })

  it('flushIntervalMs 為 0／負數／NaN 時退回 5 秒（否則變成 setInterval(fn, 0) 的 flush 風暴）', () => {
    // 直接斷言交給 setInterval 的延遲值：若改成 advanceTimersByTime 觀測，
    // 「延遲被算成 0」的變異體會讓假計時器原地空轉，測試不是紅而是掛住。
    const spy = vi.spyOn(globalThis, 'setInterval')
    try {
      for (const flushIntervalMs of [0, -1, Number.NaN]) {
        spy.mockClear()
        const buf = createPingBuffer({ flushIntervalMs, onFlush: vi.fn() })
        buf.start()
        expect(spy).toHaveBeenCalledWith(expect.any(Function), DEFAULT_FLUSH_INTERVAL_MS)
        buf.stop()
      }
    } finally {
      spy.mockRestore()
    }
  })

  it('預設 flushIntervalMs 為 5 秒（4999 毫秒還不送）', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ onFlush })
    buf.start()
    buf.push(point(0))
    vi.advanceTimersByTime(4999)
    expect(onFlush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onFlush).toHaveBeenCalledOnce()
  })

  it('push 的 nowAt 會被帶進取樣守衛（時鐘暴衝的點不進 buffer）', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, onFlush })
    buf.start()
    buf.push({ lat: 22.6, lng: 120.3, at: '3000-01-01T00:00:00' }, wallClock(0))
    buf.push(point(0), wallClock(0))
    vi.advanceTimersByTime(5000)
    expect(onFlush.mock.calls[0][0].map((p: PingPoint) => p.at)).toEqual([wallClock(0)])
  })

  it('空 buffer 不觸發 flush', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, onFlush })
    buf.start()
    vi.advanceTimersByTime(15000)
    expect(onFlush).not.toHaveBeenCalled()
  })

  it('flush 後清空，兩批內容不重疊', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, onFlush })
    buf.start()
    buf.push(point(0))
    vi.advanceTimersByTime(5000)
    buf.push(point(6000))
    vi.advanceTimersByTime(5000)
    expect(onFlush).toHaveBeenCalledTimes(2)
    expect(onFlush.mock.calls[0][0].map((p: PingPoint) => p.at)).toEqual([wallClock(0)])
    expect(onFlush.mock.calls[1][0].map((p: PingPoint) => p.at)).toEqual([wallClock(6000)])
  })

  it('已送出的批次是快照，後續 push 不會改到它', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, onFlush })
    buf.start()
    buf.push(point(0))
    vi.advanceTimersByTime(5000)
    const batch = onFlush.mock.calls[0][0] as PingPoint[]
    buf.push(point(6000))
    buf.push(point(7000))
    expect(batch.map((p) => p.at)).toEqual([wallClock(0)])
  })

  it('flushNow 立即送出並清空，之後計時器不重送', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, onFlush })
    buf.start()
    buf.push(point(0))
    buf.flushNow()
    expect(onFlush).toHaveBeenCalledOnce()
    expect(onFlush.mock.calls[0][0].map((p: PingPoint) => p.at)).toEqual([wallClock(0)])
    vi.advanceTimersByTime(5000)
    expect(onFlush).toHaveBeenCalledOnce()
  })

  it('重複 start 只有一個計時器，且 stop 一定收得乾淨', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, onFlush })
    buf.start()
    buf.start()
    // 只斷言 onFlush 次數會被「第二個計時器剛好 flush 到空 buffer」蒙混過去；
    // 真正的危害是 stop() 只清得掉最後一個 handle，孤兒計時器會在停止追蹤後續跑。
    expect(vi.getTimerCount()).toBe(1)
    buf.push(point(0))
    vi.advanceTimersByTime(5000)
    expect(onFlush).toHaveBeenCalledOnce()
    buf.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('超過 maxPoints 丟最舊、保最新', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, maxPoints: 2, onFlush })
    buf.start()
    buf.push(point(0))
    buf.push(point(1000))
    buf.push(point(2000))
    vi.advanceTimersByTime(5000)
    expect(onFlush.mock.calls[0][0].map((p: PingPoint) => p.at)).toEqual([
      wallClock(1000),
      wallClock(2000),
    ])
  })

  it('stop 後不再 flush，且已緩衝的座標被丟棄', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, onFlush })
    buf.start()
    buf.push(point(0))
    buf.stop()
    vi.advanceTimersByTime(10000)
    expect(onFlush).not.toHaveBeenCalled()
    // 重新開始也不能把上一段的座標補送出去
    buf.start()
    vi.advanceTimersByTime(5000)
    expect(onFlush).not.toHaveBeenCalled()
  })

  it('stop 之後殘留的 watchPosition 回呼不得再累積座標', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, onFlush })
    buf.start()
    buf.stop()
    buf.push(point(0))
    buf.push(point(1000))
    buf.start()
    vi.advanceTimersByTime(5000)
    expect(onFlush).not.toHaveBeenCalled()
  })

  it('start 之前的 push 不累積（未開始追蹤即不得收集位置）', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, onFlush })
    buf.push(point(0))
    buf.start()
    vi.advanceTimersByTime(5000)
    expect(onFlush).not.toHaveBeenCalled()
  })

  it('節流在 buffer 層同樣生效（高頻回呼被收斂）', () => {
    const onFlush = vi.fn()
    const buf = createPingBuffer({ flushIntervalMs: 5000, minIntervalMs: 1000, onFlush })
    buf.start()
    for (let i = 0; i <= 20; i += 1) buf.push(point(i * 250))
    vi.advanceTimersByTime(5000)
    expect(onFlush.mock.calls[0][0].map((p: PingPoint) => p.at)).toEqual([
      wallClock(0),
      wallClock(1000),
      wallClock(2000),
      wallClock(3000),
      wallClock(4000),
      wallClock(5000),
    ])
  })
})

describe('隱私守則', () => {
  it('模組原始碼不含 console / storage 寫入', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/utils/busPingBuffer.ts'), 'utf-8')
    expect(src).not.toMatch(/console\s*\./)
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
  })

  it('執行期不呼叫 console、不寫入 storage', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    )
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    try {
      let pts: PingPoint[] = []
      pts = pushPing(pts, point(0))
      pts = pushPing(pts, { lat: Number.NaN, lng: 120.3, at: '壞掉' })
      expect(pts).toHaveLength(1)
      for (const s of spies) expect(s).not.toHaveBeenCalled()
      expect(setItem).not.toHaveBeenCalled()
    } finally {
      for (const s of spies) s.mockRestore()
      setItem.mockRestore()
    }
  })
})
