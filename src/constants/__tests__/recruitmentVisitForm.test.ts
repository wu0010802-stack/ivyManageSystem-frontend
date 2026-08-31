import { describe, it, expect, vi } from 'vitest'

// 參觀日期預設今天（2026-08-28 UX）：固定 todayISO 讓民國轉換斷言可預期。
vi.mock('@/utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/format')>()
  return { ...actual, todayISO: () => '2026-08-28' }
})

import { emptyVisitForm, gradeForBirthday } from '@/constants/recruitment'

describe('emptyVisitForm', () => {
  it('回傳未預繳/未註冊的訪視表單預設值', () => {
    const f = emptyVisitForm()
    expect(f.child_name).toBe('')
    expect(f.grade).toBeNull()
    expect(f.birthday).toBeNull()
    expect(f.has_deposit).toBe(false)
    expect(f.rides_bus).toBe(false)
    expect(f.enrolled).toBe(false)
    expect(f.transfer_term).toBe(false)
    expect(f.no_deposit_reason).toBeNull()
    expect(f.geocoding_consent).toBe(false)
  })

  it('參觀日期預設今天（含民國格式的 visit_date 與 month）', () => {
    const f = emptyVisitForm()
    expect(f.month_raw).toBe('2026-08-28')
    expect(f.visit_date).toBe('115.08.28')
    expect(f.month).toBe('115.08')
  })

  it('序號留空：由後端依當月順序自動產生', () => {
    expect(emptyVisitForm().seq_no).toBe('')
  })

  it('不再帶行政區欄位（2026-08-28 起改由後端從 address 解析）', () => {
    expect('district' in emptyVisitForm()).toBe(false)
  })

  it('每次回傳全新物件（不共用參考）', () => {
    expect(emptyVisitForm()).not.toBe(emptyVisitForm())
  })
})

// 學年 N 的切齡日＝西元 (N+1911).09.01（含）；115 學年 → 2026-09-01
describe('gradeForBirthday', () => {
  it('依 9/1 足歲對映 2/3/4/5 歲 → 幼幼/小/中/大班', () => {
    expect(gradeForBirthday('2024-03-15', 115)).toBe('幼幼班')
    expect(gradeForBirthday('2023-03-15', 115)).toBe('小班')
    expect(gradeForBirthday('2022-03-15', 115)).toBe('中班')
    expect(gradeForBirthday('2021-03-15', 115)).toBe('大班')
  })

  it('9/1 邊界：當天出生算足歲、9/2 出生差一歲', () => {
    expect(gradeForBirthday('2021-09-01', 115)).toBe('大班') // 2026-09-01 滿 5 歲
    expect(gradeForBirthday('2021-09-02', 115)).toBe('中班') // 尚未滿 5 歲
  })

  it('範圍外回 null（未滿 2 歲或已達學齡）', () => {
    expect(gradeForBirthday('2025-01-01', 115)).toBeNull() // 1 歲
    expect(gradeForBirthday('2020-08-31', 115)).toBeNull() // 6 歲，已達國小學齡
  })

  it('畸形輸入回 null，不丟例外', () => {
    expect(gradeForBirthday('', 115)).toBeNull()
    expect(gradeForBirthday('not-a-date', 115)).toBeNull()
  })

  it('切齡以目標學年為準，不是今年', () => {
    // 2022-03-15 出生：115 學年中班、116 學年大班
    expect(gradeForBirthday('2022-03-15', 116)).toBe('大班')
  })
})
