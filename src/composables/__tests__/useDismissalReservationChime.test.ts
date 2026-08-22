/**
 * useDismissalReservationChime.test.ts
 *
 * 後台接送佇列右欄：家長預約（reservation，尚未抵達）倒數到剩 10 / 5 分鐘
 * 各鳴一聲柔和提示，每個里程碑只鳴一次；已抵達／非預約／已離開追蹤範圍
 * 的通知不觸發。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useDismissalReservationChime } from '../useDismissalReservationChime'
import type { DismissalCallView } from '../useDismissalUrgency'

// ── mock AudioContext（比照 usePortalDismissalAlerts.spec.ts 慣例）──
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
  it('剩餘 11 分鐘時掛載：尚未跨過任何里程碑，不鳴聲', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, request_source: 'parent', arrived_at: null, expected_arrival_at: isoAt(11) },
    ])
    const wrapper = mountHost(activeCalls)
    expect(createOscillatorSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('倒數跨過剩 10 分鐘 → 鳴一聲；再跨過剩 5 分鐘 → 再鳴一聲；之後不重複鳴', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, request_source: 'parent', arrived_at: null, expected_arrival_at: isoAt(11) },
    ])
    mountHost(activeCalls)
    expect(createOscillatorSpy).not.toHaveBeenCalled()

    // 前進 60s（useNowClock 每 30s tick 兩次）：剩餘時間 11min → 10min，跨過里程碑 10
    await vi.advanceTimersByTimeAsync(60_000)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(1)

    // 再前進 5 分鐘：剩餘時間 10min → 5min，跨過里程碑 5
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(2)

    // 再前進 2 分鐘（剩餘 3min）：兩個里程碑都已鳴過，不應再鳴
    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(createOscillatorSpy).toHaveBeenCalledTimes(2)
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

  it('通知離開追蹤範圍（從 activeCalls 移除）後不再檢查，不報錯', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, request_source: 'parent', arrived_at: null, expected_arrival_at: isoAt(11) },
    ])
    mountHost(activeCalls)
    activeCalls.value = []
    await expect(vi.advanceTimersByTimeAsync(5 * 60_000)).resolves.not.toThrow()
    expect(createOscillatorSpy).not.toHaveBeenCalled()
  })
})
