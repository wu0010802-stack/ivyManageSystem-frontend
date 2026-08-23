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

  it('vendor 與 misc 皆有類別設定', () => {
    expect(MISC_SIGNOFF_MODULE.category?.options).toHaveLength(6)
    expect(MISC_SIGNOFF_MODULE.category?.labelOf('rent')).toBe('場地租金')
  })

  it('vendor 模組有 7 類 category 設定', () => {
    expect(VENDOR_SIGNOFF_MODULE.category).not.toBeNull()
    expect(VENDOR_SIGNOFF_MODULE.category?.options).toHaveLength(7)
    expect(VENDOR_SIGNOFF_MODULE.category?.options.map((o) => o.value)).toContain('清潔衛生')
    expect(VENDOR_SIGNOFF_MODULE.category?.labelOf('其他')).toBe('其他')
  })

  it('權限碼對齊 PERMISSION_NAMES', () => {
    expect(VENDOR_SIGNOFF_MODULE.permissions).toEqual({
      read: 'VENDOR_PAYMENT_READ', write: 'VENDOR_PAYMENT_WRITE',
    })
    expect(MISC_SIGNOFF_MODULE.permissions).toEqual({
      read: 'MISC_RECEIPT_READ', write: 'MISC_RECEIPT_WRITE',
    })
  })

  it('api 綁定齊備（12 支皆為函式，含 batchSign）', () => {
    for (const m of SIGNOFF_MODULES) {
      for (const fn of Object.values(m.api)) expect(typeof fn).toBe('function')
      expect(Object.keys(m.api)).toHaveLength(12)
      expect(m.api.batchSign).toBeTypeOf('function')
    }
  })

  it('exportPath/exportFilename 對齊後端匯出路由與檔名', () => {
    expect(VENDOR_SIGNOFF_MODULE.exportPath).toBe('/exports/vendor-payments')
    expect(VENDOR_SIGNOFF_MODULE.exportFilename).toBe('廠商付款簽收紀錄.xlsx')
    expect(MISC_SIGNOFF_MODULE.exportPath).toBe('/exports/misc-receipts')
    expect(MISC_SIGNOFF_MODULE.exportFilename).toBe('雜項收款簽收紀錄.xlsx')
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
