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

// 2026-07-31 起純時間窗語意（is_open 開關已移除）：
// 雙空物件（無 open_at/close_at）＝報名未開放，取代舊版的 banner=null。
// timeInfoRef 本身為 null/undefined（資料尚未載入）則仍回 null，
// 與「已載入但雙空＝未開放」區分開來，避免載入期間誤閃「未開放」訊息。
// 順序＝null → 雙空 → 已截止 → 尚未開始 → 48h/3 天內倒數提醒 → null（開放中且無需提醒）。
describe('useCountdownBanner', () => {
  it('timeInfoRef 為 null（尚未載入）→ banner=null（不誤閃未開放）', () => {
    const { banner } = useCountdownBanner(ref(null))
    expect(banner.value).toBe(null)
  })

  it('timeInfoRef 為 undefined（尚未載入）→ banner=null', () => {
    const { banner } = useCountdownBanner(ref(undefined))
    expect(banner.value).toBe(null)
  })

  it('雙空（無 open_at/close_at）→ info「報名目前未開放」', () => {
    const { banner } = useCountdownBanner(ref({}))
    expect(banner.value.type).toBe('info')
    expect(banner.value.msg).toContain('報名目前未開放')
  })

  it('close_at 已過 → info「報名已截止」', () => {
    const close = new Date(FIXED_NOW.getTime() - 60_000).toISOString()
    const { banner } = useCountdownBanner(ref({ close_at: close }))
    expect(banner.value.type).toBe('info')
    expect(banner.value.msg).toContain('報名已截止')
  })

  it('close_at 不到 3 天 → warning + 顯示時數分鐘', () => {
    const close = new Date(FIXED_NOW.getTime() + 2 * 24 * 3600_000 + 3 * 3600_000 + 15 * 60_000).toISOString()
    const { banner } = useCountdownBanner(ref({ close_at: close }))
    expect(banner.value.type).toBe('warning')
    expect(banner.value.msg).toContain('51 小時 15 分鐘')
  })

  it('close_at 超過 3 天、無 open_at 限制 → banner=null（開放中，無需提醒）', () => {
    const close = new Date(FIXED_NOW.getTime() + 10 * 24 * 3600_000).toISOString()
    const { banner } = useCountdownBanner(ref({ close_at: close }))
    expect(banner.value).toBe(null)
  })

  it('open_at 尚未到 → info「報名尚未開始」', () => {
    const open = new Date(FIXED_NOW.getTime() + 24 * 3600_000).toISOString()
    const { banner } = useCountdownBanner(ref({ open_at: open }))
    expect(banner.value.type).toBe('info')
    expect(banner.value.msg).toContain('報名尚未開始')
    expect(banner.value.msg).toContain(formatIsoMinute(open))
  })

  it('只設 open_at 且已到（無 close_at）→ banner=null（立即開放，持續中）', () => {
    const open = new Date(FIXED_NOW.getTime() - 24 * 3600_000).toISOString()
    const { banner } = useCountdownBanner(ref({ open_at: open }))
    expect(banner.value).toBe(null)
  })

  it('reactive：timeInfo 改變後 banner 重新計算', () => {
    const openPast = new Date(FIXED_NOW.getTime() - 24 * 3600_000).toISOString()
    const info = ref({ open_at: openPast, close_at: null })
    const { banner } = useCountdownBanner(info)
    expect(banner.value).toBe(null)

    const close = new Date(FIXED_NOW.getTime() + 60 * 60_000).toISOString()
    info.value = { open_at: openPast, close_at: close }
    expect(banner.value.type).toBe('warning')
  })

  it('返回 countdownLabel/formatIsoMinute 引用', () => {
    const { countdownLabel: cl, formatIsoMinute: fm } = useCountdownBanner(ref({}))
    expect(typeof cl).toBe('function')
    expect(typeof fm).toBe('function')
  })
})
