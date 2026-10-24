import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installBusGpsSimulator, getBusGpsSimulator, type BusGpsSimulator } from '@/utils/busGpsSimulator'

/**
 * 高雄鳳山一帶的三個點，彼此相距數百公尺——刻意不用 0.0001 度那種
 * 「一個 tick 就跑完」的距離，否則推進邏輯的分段行為完全測不到。
 */
const WAYPOINTS = [
  { lat: 22.6270, lng: 120.3620, label: '園所' },
  { lat: 22.6300, lng: 120.3620, label: '小明' }, // 約 333 公尺（正北）
  { lat: 22.6330, lng: 120.3620, label: '小華' }, // 再 333 公尺
]

let sim: BusGpsSimulator

beforeEach(() => {
  vi.useFakeTimers()
  const installed = installBusGpsSimulator()
  if (!installed) throw new Error('模擬器安裝失敗（測試環境缺 navigator）')
  sim = installed
})

afterEach(() => {
  sim.uninstall()
  vi.useRealTimers()
})

/** 收集 watchPosition 回報的所有座標。 */
function watchAll(): Array<{ lat: number; lng: number }> {
  const got: Array<{ lat: number; lng: number }> = []
  navigator.geolocation.watchPosition((pos) => {
    got.push({ lat: pos.coords.latitude, lng: pos.coords.longitude })
  })
  return got
}

describe('busGpsSimulator — 安裝與接管', () => {
  it('接管 navigator.geolocation，uninstall 後還原成接管前那一個', () => {
    const fake = navigator.geolocation
    expect(getBusGpsSimulator()).toBe(sim)

    sim.uninstall()

    const restored = navigator.geolocation
    expect(restored).not.toBe(fake)
    expect(getBusGpsSimulator()).toBeNull()

    // 重裝以維持 afterEach 的前提，順帶確認再次接管確實換掉了物件。
    const again = installBusGpsSimulator()
    expect(again).not.toBeNull()
    expect(navigator.geolocation).not.toBe(restored)
    sim = again as BusGpsSimulator
  })

  it('重複安裝回同一個實例', () => {
    expect(installBusGpsSimulator()).toBe(sim)
  })
})

describe('busGpsSimulator — 行駛', () => {
  it('設定站點後停在起點，尚未行駛', () => {
    sim.setWaypoints(WAYPOINTS)

    expect(sim.state.value.position).toEqual({ lat: 22.6270, lng: 120.3620 })
    expect(sim.state.value.running).toBe(false)
  })

  it('播放後沿路徑往北移動', async () => {
    sim.setWaypoints(WAYPOINTS)
    const got = watchAll()
    sim.play()

    await vi.advanceTimersByTimeAsync(3000)

    // 30 km/h ≈ 8.33 公尺/秒，3 秒約 25 公尺：仍在第一段內，緯度應已增加。
    expect(got.length).toBeGreaterThanOrEqual(3)
    const last = got[got.length - 1]
    expect(last.lat).toBeGreaterThan(22.6270)
    expect(last.lat).toBeLessThan(22.6300)
    expect(last.lng).toBeCloseTo(120.3620, 6)
  })

  it('走完一段後進入下一段', async () => {
    sim.setWaypoints(WAYPOINTS)
    sim.setSpeedKmh(60) // 16.7 公尺/秒
    sim.play()

    // 第一段約 333 公尺，60 km/h 需要約 20 秒。
    await vi.advanceTimersByTimeAsync(25_000)

    expect(sim.state.value.segmentIndex).toBe(1)
  })

  it('抵達終點後停止並標記 finished', async () => {
    sim.setWaypoints(WAYPOINTS)
    sim.setSpeedKmh(120)
    sim.play()

    // 全長約 666 公尺，120 km/h（33.3 公尺/秒）需要約 20 秒；給足 60 秒。
    await vi.advanceTimersByTimeAsync(60_000)

    expect(sim.state.value.finished).toBe(true)
    expect(sim.state.value.running).toBe(false)
    expect(sim.state.value.position).toEqual({ lat: 22.6330, lng: 120.3620 })
  })

  it('抵達終點後再按播放會從頭跑一趟（不是死鍵）', async () => {
    sim.setWaypoints(WAYPOINTS)
    sim.setSpeedKmh(120)
    sim.play()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sim.state.value.finished).toBe(true)

    sim.play()

    expect(sim.state.value.running).toBe(true)
    expect(sim.state.value.finished).toBe(false)
    expect(sim.state.value.segmentIndex).toBe(0)
  })

  it('暫停後不再前進', async () => {
    sim.setWaypoints(WAYPOINTS)
    sim.play()
    await vi.advanceTimersByTimeAsync(3000)
    const frozen = sim.state.value.position

    sim.pause()
    await vi.advanceTimersByTimeAsync(5000)

    expect(sim.state.value.position).toEqual(frozen)
  })

  it('站點少於兩個時 play 不啟動（沒有路徑可走）', () => {
    sim.setWaypoints([WAYPOINTS[0]])

    sim.play()

    expect(sim.state.value.running).toBe(false)
  })

  it('兩個站點座標相同時不會卡住，直接跳過該段', async () => {
    sim.setWaypoints([WAYPOINTS[0], { ...WAYPOINTS[0] }, WAYPOINTS[2]])
    sim.setSpeedKmh(60)
    sim.play()

    await vi.advanceTimersByTimeAsync(5000)

    expect(sim.state.value.segmentIndex).toBeGreaterThanOrEqual(1)
  })
})

describe('busGpsSimulator — 手動控制', () => {
  it('jumpTo 直接把車移到指定站', () => {
    sim.setWaypoints(WAYPOINTS)

    sim.jumpTo(2)

    expect(sim.state.value.position).toEqual({ lat: 22.6330, lng: 120.3620 })
    expect(sim.state.value.finished).toBe(true)
  })

  it('jumpTo 超出範圍時夾在合法區間內', () => {
    sim.setWaypoints(WAYPOINTS)

    sim.jumpTo(99)

    expect(sim.state.value.segmentIndex).toBe(2)
  })

  it('車速夾在 1..120 之間', () => {
    sim.setSpeedKmh(0)
    expect(sim.state.value.speedKmh).toBe(1)

    sim.setSpeedKmh(999)
    expect(sim.state.value.speedKmh).toBe(120)
  })

  it('clearWatch 後不再收到位置', async () => {
    sim.setWaypoints(WAYPOINTS)
    const got: unknown[] = []
    const id = navigator.geolocation.watchPosition((pos) => got.push(pos))
    sim.play()
    await vi.advanceTimersByTimeAsync(2000)
    const before = got.length
    expect(before).toBeGreaterThan(0)

    navigator.geolocation.clearWatch(id)
    await vi.advanceTimersByTimeAsync(5000)

    expect(got.length).toBe(before)
  })

  it('回報的 coords 帶 accuracy 與 heading，形狀符合 GeolocationPosition', async () => {
    sim.setWaypoints(WAYPOINTS)
    let pos: GeolocationPosition | null = null
    navigator.geolocation.watchPosition((p) => { pos = p })
    sim.play()

    await vi.advanceTimersByTimeAsync(1000)

    expect(pos).not.toBeNull()
    const coords = pos!.coords
    expect(coords.accuracy).toBeGreaterThan(0)
    expect(coords.heading).toBeCloseTo(0, 0) // 正北
    expect(coords.speed).toBeCloseTo(30_000 / 3600, 3)
    expect(typeof pos!.timestamp).toBe('number')
  })
})
