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
    expect(f.enrolled).toBe(false)
    expect(f.transfer_term).toBe(false)
    expect(f.no_deposit_reason).toBeNull()
    expect(f.geocoding_consent).toBe(false)
  })

  it('每次回傳全新物件（不共用參考）', () => {
    expect(emptyVisitForm()).not.toBe(emptyVisitForm())
  })
})
