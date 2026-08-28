import { describe, it, expect } from 'vitest'
import { emptyVisitForm } from '@/constants/recruitment'

describe('emptyVisitForm', () => {
  it('回傳全空白、未預繳/未註冊的訪視表單預設值', () => {
    const f = emptyVisitForm()
    expect(f.child_name).toBe('')
    expect(f.month).toBe('')
    expect(f.month_raw).toBeNull()
    expect(f.grade).toBeNull()
    expect(f.birthday).toBeNull()
    expect(f.has_deposit).toBe(false)
    expect(f.rides_bus).toBe(false)
    expect(f.enrolled).toBe(false)
    expect(f.transfer_term).toBe(false)
    expect(f.no_deposit_reason).toBeNull()
    expect(f.geocoding_consent).toBe(false)
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
