/**
 * 娃娃車 GPS 模擬器——**測試用，正式環境永不啟用**。
 *
 * 為什麼需要它：娃娃車司機端（教師 Portal 的娃娃車班次頁）靠
 * `navigator.geolocation.watchPosition` 取得位置。在辦公室的桌機上開這一頁，
 * 瀏覽器只會回一個固定不動的座標（Wi-Fi／IP 定位），無法驗證「車輛在地圖上移動」
 * 「到站觸發快到提醒」這些真正要測的行為。這支模擬器接管 `navigator.geolocation`，
 * 讓車輛沿著指定的站點序列自動行駛。
 *
 * ## 啟用方式（三道閘，缺一不可）
 * 1. build 時設 `VITE_BUS_GPS_SIMULATOR=1`（未設＝這支模組不會被載入，
 *    `installBusGpsSimulator` 的呼叫端是動態 import）。
 * 2. 安裝發生在 `main.ts`，早於任何 `watchPosition` 呼叫。
 * 3. 畫面右下角會**常駐一個醒目的紅色面板**，不可能不小心在正式環境跑著卻沒發現。
 *
 * ⚠ **正式部署絕對不要設這個變數。** 設了等於司機端上報的是假座標，
 * 家長會在地圖上看到一台不存在的車。
 *
 * ## 設計取捨
 * - **接管 `navigator.geolocation` 而不是改 composable**：司機端的
 *   `usePortalBusTrip` 完全不知道模擬器存在，生產程式碼路徑零改動、零條件分支。
 *   代價是本檔要正確實作 Geolocation API 的介面形狀。
 * - **保留原始物件**：`uninstall()` 可還原，避免測試環境互相污染。
 * - 位置每秒發一次，對齊前端取樣節流（`busPingBuffer` 的 `DEFAULT_MIN_INTERVAL_MS`）。
 *   發太快只會被緩衝丟掉，沒有意義。
 */
import { ref, type Ref } from 'vue'

/** 一個路徑點。`label` 只用於面板顯示（通常是學生姓名或站序）。 */
export interface SimWaypoint {
  lat: number
  lng: number
  label?: string
}

export interface SimState {
  /** 是否正在行駛（false＝停在原地，仍會持續回報同一個座標）。 */
  running: boolean
  waypoints: SimWaypoint[]
  /** 目前所在的路段索引（0 代表 waypoints[0] → waypoints[1] 這一段）。 */
  segmentIndex: number
  /** 目前路段已走完的比例，0..1。 */
  segmentProgress: number
  speedKmh: number
  position: { lat: number; lng: number } | null
  /** 已抵達終點。 */
  finished: boolean
}

const TICK_MS = 1000
const DEFAULT_SPEED_KMH = 30
const EARTH_RADIUS_M = 6_371_000

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** 兩點間的地表距離（公尺）。 */
function haversineMeters(a: SimWaypoint, b: SimWaypoint): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 沿 a→b 線性內插到比例 t（0..1）。短距離下把經緯度當平面處理，誤差可忽略。 */
function lerp(a: SimWaypoint, b: SimWaypoint, t: number): { lat: number; lng: number } {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}

/** a→b 的方位角（度，正北為 0）；面板顯示與 `coords.heading` 用。 */
function bearingDeg(a: SimWaypoint, b: SimWaypoint): number {
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

type WatchCallback = (pos: GeolocationPosition) => void

interface Watcher {
  id: number
  success: WatchCallback
}

export interface BusGpsSimulator {
  readonly state: Ref<SimState>
  setWaypoints(points: SimWaypoint[]): void
  play(): void
  pause(): void
  toggle(): void
  setSpeedKmh(kmh: number): void
  /** 直接跳到第 index 個路徑點（用來略過長途路段，快速測到站行為）。 */
  jumpTo(index: number): void
  reset(): void
  uninstall(): void
}

let singleton: BusGpsSimulator | null = null

/**
 * 安裝模擬器並接管 `navigator.geolocation`。重複呼叫只會回同一個實例。
 *
 * 回傳 `null` 代表這個環境沒有可接管的 `navigator`（SSR／測試 stub），呼叫端應
 * 視為「模擬器不可用」而不是錯誤。
 */
export function installBusGpsSimulator(): BusGpsSimulator | null {
  if (singleton) return singleton
  if (typeof navigator === 'undefined') return null

  const state = ref<SimState>({
    running: false,
    waypoints: [],
    segmentIndex: 0,
    segmentProgress: 0,
    speedKmh: DEFAULT_SPEED_KMH,
    position: null,
    finished: false,
  })

  const watchers: Watcher[] = []
  let nextWatchId = 1
  let timer: ReturnType<typeof setInterval> | null = null
  const original = navigator.geolocation

  function currentHeading(): number | null {
    const { waypoints, segmentIndex } = state.value
    const from = waypoints[segmentIndex]
    const to = waypoints[segmentIndex + 1]
    return from && to ? bearingDeg(from, to) : null
  }

  function emit(): void {
    const pos = state.value.position
    if (!pos) return
    const heading = currentHeading()
    const payload = {
      coords: {
        latitude: pos.lat,
        longitude: pos.lng,
        // 真實裝置的精度會浮動；固定值會讓「精度不佳」的呈現永遠測不到。
        accuracy: 8 + Math.random() * 8,
        altitude: null,
        altitudeAccuracy: null,
        heading: state.value.running ? heading : null,
        speed: state.value.running ? (state.value.speedKmh * 1000) / 3600 : 0,
      },
      timestamp: Date.now(),
    } as unknown as GeolocationPosition
    watchers.forEach((w) => {
      try {
        w.success(payload)
      } catch {
        // 單一訂閱者拋錯不該讓其他訂閱者收不到位置。
      }
    })
  }

  /** 依速度推進一個 tick，跨段時把剩餘距離帶到下一段。 */
  function advance(): void {
    const s = state.value
    if (!s.running || s.waypoints.length < 2) {
      emit()
      return
    }
    let remaining = ((s.speedKmh * 1000) / 3600) * (TICK_MS / 1000)
    let idx = s.segmentIndex
    let progress = s.segmentProgress

    while (remaining > 0 && idx < s.waypoints.length - 1) {
      const from = s.waypoints[idx]
      const to = s.waypoints[idx + 1]
      const segLen = haversineMeters(from, to)
      if (segLen < 0.5) {
        // 同一個座標連續出現（例如兩位學生住同一棟）：直接跳過，否則會卡住不動。
        idx += 1
        progress = 0
        continue
      }
      const remainOnSeg = segLen * (1 - progress)
      if (remaining < remainOnSeg) {
        progress += remaining / segLen
        remaining = 0
      } else {
        remaining -= remainOnSeg
        idx += 1
        progress = 0
      }
    }

    const atEnd = idx >= s.waypoints.length - 1
    const from = s.waypoints[Math.min(idx, s.waypoints.length - 1)]
    const to = s.waypoints[idx + 1]
    state.value = {
      ...s,
      segmentIndex: atEnd ? s.waypoints.length - 1 : idx,
      segmentProgress: atEnd ? 0 : progress,
      position: atEnd || !to ? { lat: from.lat, lng: from.lng } : lerp(from, to, progress),
      running: !atEnd,
      finished: atEnd,
    }
    emit()
  }

  function ensureTimer(): void {
    if (timer !== null) return
    timer = setInterval(advance, TICK_MS)
  }

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  // --- 接管 Geolocation API ---
  const fake: Geolocation = {
    getCurrentPosition: (success) => {
      if (state.value.position) emit()
      else if (original) original.getCurrentPosition(success)
    },
    watchPosition: (success) => {
      const id = nextWatchId
      nextWatchId += 1
      watchers.push({ id, success: success as WatchCallback })
      ensureTimer()
      // 已經有位置就立刻回一顆，不讓呼叫端空等一個 tick。
      if (state.value.position) queueMicrotask(emit)
      return id
    },
    clearWatch: (id: number) => {
      const i = watchers.findIndex((w) => w.id === id)
      if (i >= 0) watchers.splice(i, 1)
      if (watchers.length === 0) stopTimer()
    },
  }

  Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true })

  singleton = {
    state,
    setWaypoints(points: SimWaypoint[]) {
      const first = points[0] ?? null
      state.value = {
        ...state.value,
        waypoints: points,
        segmentIndex: 0,
        segmentProgress: 0,
        finished: false,
        running: false,
        position: first ? { lat: first.lat, lng: first.lng } : null,
      }
      emit()
    },
    play() {
      if (state.value.waypoints.length < 2) return
      // 已抵達終點時再按播放＝從頭跑一趟，否則按鈕會變成沒有反應的死鍵。
      state.value = state.value.finished
        ? { ...state.value, running: true, finished: false, segmentIndex: 0, segmentProgress: 0 }
        : { ...state.value, running: true }
      ensureTimer()
    },
    pause() {
      state.value = { ...state.value, running: false }
    },
    toggle() {
      if (state.value.running) singleton?.pause()
      else singleton?.play()
    },
    setSpeedKmh(kmh: number) {
      state.value = { ...state.value, speedKmh: Math.max(1, Math.min(120, kmh)) }
    },
    jumpTo(index: number) {
      const { waypoints } = state.value
      const i = Math.max(0, Math.min(waypoints.length - 1, index))
      const wp = waypoints[i]
      if (!wp) return
      state.value = {
        ...state.value,
        segmentIndex: i,
        segmentProgress: 0,
        position: { lat: wp.lat, lng: wp.lng },
        finished: i >= waypoints.length - 1,
      }
      emit()
    },
    reset() {
      stopTimer()
      state.value = {
        running: false,
        waypoints: [],
        segmentIndex: 0,
        segmentProgress: 0,
        speedKmh: DEFAULT_SPEED_KMH,
        position: null,
        finished: false,
      }
    },
    uninstall() {
      stopTimer()
      watchers.length = 0
      Object.defineProperty(navigator, 'geolocation', { value: original, configurable: true })
      singleton = null
    },
  }
  return singleton
}

/** 取得已安裝的模擬器；未安裝回 `null`（正式環境恆為 null）。 */
export function getBusGpsSimulator(): BusGpsSimulator | null {
  return singleton
}

/** 這個 build 有沒有開啟模擬器。呼叫端據此決定要不要動態載入本模組與面板。 */
export function isBusGpsSimulatorEnabled(): boolean {
  return import.meta.env.VITE_BUS_GPS_SIMULATOR === '1'
}
