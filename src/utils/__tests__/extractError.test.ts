// 2026-08-13 棘輪收斂：extractErrorCode/extractErrorDetail 原本在
// PickupAuthorizationsView 與 PortalPickupAuthorizationsView 各複製一份，
// 上移到 utils/error.ts（棘輪 EXEMPT 檔）共用。行為必須與原 View 內版本逐字相同。
import { describe, it, expect } from 'vitest'
import { extractErrorCode, extractErrorDetail } from '../error'

describe('extractErrorCode', () => {
  it('取出 {error_code, detail} 形狀的 error_code', () => {
    const err = { response: { data: { detail: { error_code: 'code_locked', detail: '已鎖定' } } } }
    expect(extractErrorCode(err)).toBe('code_locked')
  })

  it('detail 為字串時回 undefined（無結構化 code）', () => {
    const err = { response: { data: { detail: '報名已截止' } } }
    expect(extractErrorCode(err)).toBeUndefined()
  })

  it('非 axios 錯誤（無 response）回 undefined', () => {
    expect(extractErrorCode(new Error('boom'))).toBeUndefined()
  })
})

describe('extractErrorDetail', () => {
  it('取出 {error_code, detail} 形狀的 detail 文字', () => {
    const err = { response: { data: { detail: { error_code: 'expired', detail: '授權已過期' } } } }
    expect(extractErrorDetail(err)).toBe('授權已過期')
  })

  it('detail 為純字串時直接回傳', () => {
    const err = { response: { data: { detail: '取件碼錯誤' } } }
    expect(extractErrorDetail(err)).toBe('取件碼錯誤')
  })

  it('無 detail 或形狀不符時回預設文案', () => {
    expect(extractErrorDetail({ response: { data: {} } })).toBe('操作失敗')
    expect(extractErrorDetail(new Error('boom'))).toBe('操作失敗')
    expect(extractErrorDetail({ response: { data: { detail: { error_code: 'x' } } } })).toBe('操作失敗')
  })
})
