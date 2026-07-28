import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ref, defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import { useRegistrationWindow, computeNoticeState } from '@/composables/useRegistrationWindow'

// A1-P7：從 ActivityPublicView 抽出的時段狀態子系統測試
// 包裝成 mount-able component 以觸發 onMounted / onUnmounted lifecycle，
// 並從 mount instance 拿回 composable 出口做斷言。

function mountWithComposable({ timeInfo, submitting, tickIntervalMs = 30_000 }) {
  let exposed = null
  const TestHost = defineComponent({
    setup() {
      exposed = useRegistrationWindow({ timeInfo, submitting }, { tickIntervalMs })
      return () => h('div')
    },
  })
  const wrapper = mount(TestHost)
  return { wrapper, get: () => exposed }
}

describe('useRegistrationWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is_open=false → 報名尚未開放', () => {
    const timeInfo = ref({ is_open: false })
    const submitting = ref(false)
    const { wrapper, get } = mountWithComposable({ timeInfo, submitting })
    expect(get().noticeState.value?.title).toBe('報名尚未開放')
    expect(get().isRegistrationOpen.value).toBe(false)
    expect(get().submitButtonLabel.value).toBe('報名尚未開放')
    expect(get().submitButtonDisabled.value).toBe(true)
    wrapper.unmount()
  })

  it('開放期間 → noticeState null、可送出', () => {
    const timeInfo = ref({
      is_open: true,
      open_at: '2026-02-01T00:00:00Z',
      close_at: '2026-04-01T23:59:59Z',
    })
    const submitting = ref(false)
    const { wrapper, get } = mountWithComposable({ timeInfo, submitting })
    expect(get().noticeState.value).toBeNull()
    expect(get().isRegistrationOpen.value).toBe(true)
    expect(get().submitButtonLabel.value).toBe('送出報名')
    expect(get().submitButtonDisabled.value).toBe(false)
    wrapper.unmount()
  })

  it('截止前 48h 內 → 收尾提醒，但仍可送出（提醒非封鎖）', () => {
    // now=2026-03-01 10:00 UTC；close_at=2026-03-02 12:00 UTC（26h 後）
    const timeInfo = ref({
      is_open: true,
      open_at: '2026-02-01T00:00:00Z',
      close_at: '2026-03-02T12:00:00Z',
    })
    const submitting = ref(false)
    const { wrapper, get } = mountWithComposable({ timeInfo, submitting })
    expect(get().noticeState.value?.title).toBe('報名即將截止')
    expect(get().noticeState.value?.variant).toBe('is-warning')
    // 回歸：截止前提醒只是提示，報名視窗仍開放，送出按鈕不得鎖死
    expect(get().isRegistrationOpen.value).toBe(true)
    expect(get().submitButtonLabel.value).toBe('送出報名')
    expect(get().submitButtonDisabled.value).toBe(false)
    wrapper.unmount()
  })

  it('超過 close_at → 報名已截止，送出鎖死', () => {
    // now=2026-03-01 10:00 UTC；close_at=2026-02-28 12:00 UTC（已過）
    const timeInfo = ref({
      is_open: true,
      open_at: '2026-02-01T00:00:00Z',
      close_at: '2026-02-28T12:00:00Z',
    })
    const submitting = ref(false)
    const { wrapper, get } = mountWithComposable({ timeInfo, submitting })
    expect(get().noticeState.value?.title).toBe('報名已截止')
    expect(get().isRegistrationOpen.value).toBe(false)
    expect(get().submitButtonLabel.value).toBe('報名已截止')
    expect(get().submitButtonDisabled.value).toBe(true)
    wrapper.unmount()
  })

  it('submitting=true 期間 label 改「送出中…」', () => {
    const timeInfo = ref({
      is_open: true,
      open_at: '2026-02-01T00:00:00Z',
      close_at: '2026-04-01T23:59:59Z',
    })
    const submitting = ref(true)
    const { wrapper, get } = mountWithComposable({ timeInfo, submitting })
    expect(get().submitButtonLabel.value).toBe('送出中…')
    expect(get().submitButtonDisabled.value).toBe(true)
    wrapper.unmount()
  })

  it('tick 後 nowTick 推進，noticeState 隨時間變化', async () => {
    const timeInfo = ref({
      is_open: true,
      open_at: '2026-03-01T11:00:00Z', // 1 小時後開
      close_at: '2026-04-01T23:59:59Z',
    })
    const submitting = ref(false)
    const { wrapper, get } = mountWithComposable({
      timeInfo,
      submitting,
      tickIntervalMs: 1000,
    })
    expect(get().noticeState.value?.title).toBe('報名尚未開始')
    // 推進 2 小時，open_at 已過，應該變開放
    vi.setSystemTime(new Date('2026-03-01T13:00:00Z'))
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(get().noticeState.value).toBeNull()
    wrapper.unmount()
  })

  it('unmount 清掉 interval（無記憶體洩漏）', () => {
    const timeInfo = ref({ is_open: false })
    const submitting = ref(false)
    const before = vi.getTimerCount()
    const { wrapper } = mountWithComposable({ timeInfo, submitting })
    expect(vi.getTimerCount()).toBeGreaterThan(before)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(before)
  })
})

// F5：computeNoticeState 抽成獨立 pure function 後的直接測試（不需 mount / timer）。
// now 固定於 2026-03-01T10:00:00Z，語意與上方 mount-based 測試一致。
describe('computeNoticeState（pure function）', () => {
  const NOW = new Date('2026-03-01T10:00:00Z').getTime()

  it('is_open=false → 報名尚未開放（blocking）', () => {
    const state = computeNoticeState({ is_open: false }, NOW)
    expect(state).toEqual({
      variant: 'is-warning',
      title: '報名尚未開放',
      message: '目前尚未開放線上報名，請稍後再試。',
      blocking: true,
    })
  })

  it('open_at 尚未到 → 報名尚未開始（blocking）', () => {
    const state = computeNoticeState(
      { is_open: true, open_at: '2026-03-02T00:00:00Z', close_at: null },
      NOW,
    )
    expect(state?.title).toBe('報名尚未開始')
    expect(state?.blocking).toBe(true)
    expect(state?.variant).toBe('is-warning')
  })

  it('close_at 已過 → 報名已截止（blocking）', () => {
    const state = computeNoticeState(
      { is_open: true, open_at: '2026-02-01T00:00:00Z', close_at: '2026-02-28T12:00:00Z' },
      NOW,
    )
    expect(state).toEqual({
      variant: 'is-danger',
      title: '報名已截止',
      message: '感謝您的關注，本期報名已結束。',
      blocking: true,
    })
  })

  it('close_at 在 48h 內但未過 → 報名即將截止（非 blocking）', () => {
    const state = computeNoticeState(
      { is_open: true, open_at: '2026-02-01T00:00:00Z', close_at: '2026-03-02T12:00:00Z' },
      NOW,
    )
    expect(state?.title).toBe('報名即將截止')
    expect(state?.blocking).toBe(false)
    expect(state?.variant).toBe('is-warning')
  })

  it('開放中、無 48h 內截止 → null', () => {
    const state = computeNoticeState(
      { is_open: true, open_at: '2026-02-01T00:00:00Z', close_at: '2026-04-01T23:59:59Z' },
      NOW,
    )
    expect(state).toBeNull()
  })

  it('settings 為空物件（bootstrap 尚未回來的預設值不含 is_open）→ 視為未開放', () => {
    const state = computeNoticeState({}, NOW)
    expect(state?.title).toBe('報名尚未開放')
  })
})
