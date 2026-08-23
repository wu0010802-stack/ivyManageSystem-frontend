/**
 * useDismissalReservationChime.test.ts
 *
 * 後台接送佇列右欄：家長預約（reservation，尚未抵達）通知
 * - 送出即播報：不論剩幾分鐘，第一次出現在佇列就立刻播報一次（三音提示，drawChimeTones
 *   建立 3 個 oscillator）
 * - 倒數到剩 10 / 5 分鐘各再播報一次；若送出當下已落在某門檻內，
 *   該門檻視為已隨送出播過，不重複緊接著再播一次
 * - 已抵達／非預約／已離開追蹤範圍的通知不觸發
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useDismissalReservationChime } from '../useDismissalReservationChime'
import type { DismissalCallView } from '../useDismissalUrgency'

// ── mock AudioContext（比照 usePortalDismissalAlerts.spec.ts 慣例）──
// 三音提示（drawChimeTones）每次播報建立 3 個 oscillator，用計數判斷播了幾次。
const createOscillatorSpy = vi.fn(() => ({
  type: '', frequency: { value: 0, setValueAtTime: vi.fn() },
  connect: () => ({ connect: vi.fn() }), start: vi.fn(), stop: vi.fn(),
}))
class MockAudioCtx {
  state = 'running'; currentTime = 0
  createOscillator() { return createOscillatorSpy() }
  createGain() { return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() } }
  resume() { return Promise.resolve() }
  close() { return Promise.resolve() }
  get destination() { return {} }
}

const BASE = new Date('2026-08-22T09:00:00+08:00').getTime()
const TONES_PER_ANNOUNCE = 3

function isoAt(minutesFromBase: number): string {
  return new Date(BASE + minutesFromBase * 60000).toISOString()
}

function mountHost(activeCalls: Ref<DismissalCallView[]>) {
  const Host = defineComponent({
    setup() {
      useDismissalReservationChime(activeCalls)
      return () => h('div')
    },
  })
  return mount(Host)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE)
  vi.stubGlobal('AudioContext', MockAudioCtx as unknown as typeof AudioContext)
  createOscillatorSpy.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDismissalReservationChime', () => {
  it('送出即播報：不論剩幾分鐘，掛載當下立刻播一次', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, request_source: 'parent', arrived_at: null, expected_arrival_at: isoAt(47) },
    ])
    const wrapper = mountHost(activeCalls)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(TONES_PER_ANNOUNCE)
    wrapper.unmount()
  })

  it('倒數跨過剩 10 分鐘 → 再播一次；再跨過剩 5 分鐘 → 再播一次；之後不重複播', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, request_source: 'parent', arrived_at: null, expected_arrival_at: isoAt(11) },
    ])
    mountHost(activeCalls)
    // 送出即播報（剩 11 分，尚未落在任何門檻內）
    expect(createOscillatorSpy).toHaveBeenCalledTimes(1 * TONES_PER_ANNOUNCE)

    // 前進 60s（useNowClock 每 30s tick 兩次）：剩餘時間 11min → 10min，跨過里程碑 10
    await vi.advanceTimersByTimeAsync(60_000)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(2 * TONES_PER_ANNOUNCE)

    // 再前進 5 分鐘：剩餘時間 10min → 5min，跨過里程碑 5
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(3 * TONES_PER_ANNOUNCE)

    // 再前進 2 分鐘（剩餘 3min）：兩個里程碑都已播過，不應再播
    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(3 * TONES_PER_ANNOUNCE)
  })

  it('送出當下已落在剩 10 分鐘門檻內（剩 8 分）：送出播報涵蓋該門檻，不重複；剩 5 分鐘仍會再播一次', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, request_source: 'parent', arrived_at: null, expected_arrival_at: isoAt(8) },
    ])
    mountHost(activeCalls)
    // 送出即播報（剩 8 分，已落在 10 分門檻內 → 該門檻視為已播過）
    expect(createOscillatorSpy).toHaveBeenCalledTimes(1 * TONES_PER_ANNOUNCE)

    // 前進 3 分鐘：剩餘 8min → 5min，跨過里程碑 5（10 分門檻已在送出時消化，不重複）
    await vi.advanceTimersByTimeAsync(3 * 60_000)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(2 * TONES_PER_ANNOUNCE)
  })

  it('送出當下已落在兩個門檻內（剩 3 分）：只播送出當下這一次，之後不再重複', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, request_source: 'parent', arrived_at: null, expected_arrival_at: isoAt(3) },
    ])
    mountHost(activeCalls)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(1 * TONES_PER_ANNOUNCE)

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(1 * TONES_PER_ANNOUNCE)
  })

  it('已抵達（arrived_at 非 null）不觸發，即使 ETA 已在門檻內', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, request_source: 'parent', arrived_at: isoAt(0), expected_arrival_at: isoAt(3) },
    ])
    mountHost(activeCalls)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(createOscillatorSpy).not.toHaveBeenCalled()
  })

  it('非家長預約（staff 現場建立）不觸發', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, request_source: 'staff', arrived_at: isoAt(0), expected_arrival_at: isoAt(3) },
    ])
    mountHost(activeCalls)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(createOscillatorSpy).not.toHaveBeenCalled()
  })

  it('通知離開追蹤範圍（從 activeCalls 移除）後不再檢查，不報錯、不再增加播報', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, request_source: 'parent', arrived_at: null, expected_arrival_at: isoAt(11) },
    ])
    mountHost(activeCalls)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(1 * TONES_PER_ANNOUNCE) // 送出即播報

    activeCalls.value = []
    await expect(vi.advanceTimersByTimeAsync(5 * 60_000)).resolves.not.toThrow()
    expect(createOscillatorSpy).toHaveBeenCalledTimes(1 * TONES_PER_ANNOUNCE)
  })
})
