import { describe, it, expect } from 'vitest'
import { isSilentError } from '@/utils/errorHandler'

// isSilentError 既有行為（AbortController CANCELED）不可翻紅，額外驗證
// 新增的通用 `.silent === true` 標記路徑（供 StudentDuplicateCreateCancelled
// 等「使用者主動取消後續確認」場景沿用既有靜默慣例，src/utils/studentDuplicateConflict.ts）。
describe('isSilentError', () => {
  it('既有行為：axios CanceledError（AbortController）→ true', () => {
    expect(isSilentError({ code: 'ERR_CANCELED' })).toBe(true)
    expect(isSilentError({ name: 'CanceledError' })).toBe(true)
  })

  it('一般錯誤（無 silent 標記）→ false', () => {
    expect(isSilentError({ response: { status: 500 } })).toBe(false)
    expect(isSilentError(new Error('boom'))).toBe(false)
  })

  it('error.silent === true → true（新增通用靜默標記）', () => {
    class Sentinel extends Error {
      readonly silent = true
    }
    expect(isSilentError(new Sentinel())).toBe(true)
  })

  it('error.silent === false（非 true 值）→ 不視為靜默', () => {
    expect(isSilentError({ silent: false, response: { status: 409 } })).toBe(false)
  })
})
