import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import {
  formatIsoMinute,
  countdownLabel,
  useCountdownBanner,
} from '@/composables/useCountdownBanner'

const FIXED_NOW = new Date('2026-05-17T12:00:00')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formatIsoMinute', () => {
  it('帶 T 的 ISO 轉成 YYYY-MM-DD HH:MM', () => {
    expect(formatIsoMinute('2026-05-17T08:30:00Z')).toBe('2026-05-17 08:30')
  })
  it('空值回空字串', () => {
    expect(formatIsoMinute('')).toBe('')
    expect(formatIsoMinute(null)).toBe('')
  })
})

describe('countdownLabel', () => {
  it('null/空 → 空字串', () => {
    expect(countdownLabel('')).toBe('')
    expect(countdownLabel(null)).toBe('')
  })

  it('無效時間 → 空字串', () => {
    expect(countdownLabel('not-a-date')).toBe('')
  })

  it('已過 → 「已逾期」', () => {
    const past = new Date(FIXED_NOW.getTime() - 60_000).toISOString()
    expect(countdownLabel(past)).toBe('已逾期')
  })

  it('>= 1 小時 → 「剩 N 小時」', () => {
    const future = new Date(FIXED_NOW.getTime() + 3 * 3600_000 + 5 * 60_000).toISOString()
    expect(countdownLabel(future)).toBe('剩 3 小時')
  })

  it('< 1 小時 → 「剩 N 分鐘」', () => {
    const future = new Date(FIXED_NOW.getTime() + 25 * 60_000).toISOString()
    expect(countdownLabel(future)).toBe('剩 25 分鐘')
  })
})

describe('useCountdownBanner', () => {
  it('沒 open_at/close_at → banner=null', () => {
    const { banner } = useCountdownBanner(ref({ is_open: true }))
    expect(banner.value).toBe(null)
  })

  it('close_at 已過 → info「報名已截止」', () => {
    const close = new Date(FIXED_NOW.getTime() - 60_000).toISOString()
    const { banner } = useCountdownBanner(ref({ is_open: true, close_at: close }))
    expect(banner.value.type).toBe('info')
    expect(banner.value.msg).toContain('報名已截止')
  })

  it('close_at 不到 3 天 → warning + 顯示時數分鐘', () => {
    const close = new Date(FIXED_NOW.getTime() + 2 * 24 * 3600_000 + 3 * 3600_000 + 15 * 60_000).toISOString()
    const { banner } = useCountdownBanner(ref({ is_open: true, close_at: close }))
    expect(banner.value.type).toBe('warning')
    expect(banner.value.msg).toContain('51 小時 15 分鐘')
  })

  it('close_at 超過 3 天 + is_open=true → banner=null', () => {
    const close = new Date(FIXED_NOW.getTime() + 10 * 24 * 3600_000).toISOString()
    const { banner } = useCountdownBanner(ref({ is_open: true, close_at: close }))
    expect(banner.value).toBe(null)
  })

  it('close_at 超過 3 天 + is_open=false → info「報名目前未開放」', () => {
    const close = new Date(FIXED_NOW.getTime() + 10 * 24 * 3600_000).toISOString()
    const { banner } = useCountdownBanner(ref({ is_open: false, close_at: close }))
    expect(banner.value.type).toBe('info')
    expect(banner.value.msg).toContain('未開放')
  })

  it('只 open_at + is_open=false → info「報名目前未開放」', () => {
    const open = new Date(FIXED_NOW.getTime() + 24 * 3600_000).toISOString()
    const { banner } = useCountdownBanner(ref({ is_open: false, open_at: open }))
    expect(banner.value.type).toBe('info')
  })

  it('reactive：timeInfo 改變後 banner 重新計算', () => {
    const info = ref({ is_open: true, close_at: null })
    const { banner } = useCountdownBanner(info)
    expect(banner.value).toBe(null)

    const close = new Date(FIXED_NOW.getTime() + 60 * 60_000).toISOString()
    info.value = { is_open: true, close_at: close }
    expect(banner.value.type).toBe('warning')
  })

  it('返回 countdownLabel/formatIsoMinute 引用', () => {
    const { countdownLabel: cl, formatIsoMinute: fm } = useCountdownBanner(ref({}))
    expect(typeof cl).toBe('function')
    expect(typeof fm).toBe('function')
  })
})
