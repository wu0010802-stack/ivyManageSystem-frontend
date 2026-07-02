import { describe, it, expect } from 'vitest'
import {
  SIGNOFF_MODULES,
  VENDOR_SIGNOFF_MODULE,
  MISC_SIGNOFF_MODULE,
} from '@/config/signoffModules'

describe('signoffModules config', () => {
  it('提供 vendor 與 misc 兩個模組、順序固定', () => {
    expect(SIGNOFF_MODULES.map((m) => m.key)).toEqual(['vendor', 'misc'])
  })

  it('鏡像欄位映射對齊後端欄位名', () => {
    expect(VENDOR_SIGNOFF_MODULE.fields.partyName.key).toBe('vendor_name')
    expect(VENDOR_SIGNOFF_MODULE.fields.date.key).toBe('payment_date')
    expect(VENDOR_SIGNOFF_MODULE.fields.docNumber.key).toBe('invoice_number')
    expect(MISC_SIGNOFF_MODULE.fields.partyName.key).toBe('payer_name')
    expect(MISC_SIGNOFF_MODULE.fields.date.key).toBe('receipt_date')
    expect(MISC_SIGNOFF_MODULE.fields.docNumber.key).toBe('receipt_number')
  })

  it('類別欄僅雜項收款有（6 類）', () => {
    expect(VENDOR_SIGNOFF_MODULE.category).toBeNull()
    expect(MISC_SIGNOFF_MODULE.category?.options).toHaveLength(6)
    expect(MISC_SIGNOFF_MODULE.category?.labelOf('rent')).toBe('場地租金')
  })

  it('權限碼對齊 PERMISSION_NAMES', () => {
    expect(VENDOR_SIGNOFF_MODULE.permissions).toEqual({
      read: 'VENDOR_PAYMENT_READ', write: 'VENDOR_PAYMENT_WRITE',
    })
    expect(MISC_SIGNOFF_MODULE.permissions).toEqual({
      read: 'MISC_RECEIPT_READ', write: 'MISC_RECEIPT_WRITE',
    })
  })

  it('api 綁定齊備（11 支皆為函式）', () => {
    for (const m of SIGNOFF_MODULES) {
      for (const fn of Object.values(m.api)) expect(typeof fn).toBe('function')
      expect(Object.keys(m.api)).toHaveLength(11)
    }
  })

  it('texts 全部非空字串且兩模組 key 集合一致', () => {
    const vendorKeys = Object.keys(VENDOR_SIGNOFF_MODULE.texts).sort()
    const miscKeys = Object.keys(MISC_SIGNOFF_MODULE.texts).sort()
    expect(miscKeys).toEqual(vendorKeys)
    for (const m of SIGNOFF_MODULES) {
      for (const v of Object.values(m.texts)) {
        expect(typeof v).toBe('string')
        expect((v as string).length).toBeGreaterThan(0)
      }
    }
  })
})
