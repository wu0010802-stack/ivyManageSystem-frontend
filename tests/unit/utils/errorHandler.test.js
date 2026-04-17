import { describe, it, expect } from 'vitest'
import {
  ErrorType,
  classifyError,
  getErrorMessage,
  isSilentError,
} from '@/utils/errorHandler'

const axiosError = (status, data = {}) => ({
  response: { status, data },
})

describe('classifyError', () => {
  it('回傳 UNKNOWN 對於 null / undefined', () => {
    expect(classifyError(null)).toBe(ErrorType.UNKNOWN)
    expect(classifyError(undefined)).toBe(ErrorType.UNKNOWN)
  })

  it('AbortController 取消被識別為 CANCELED', () => {
    expect(classifyError({ code: 'ERR_CANCELED' })).toBe(ErrorType.CANCELED)
    expect(classifyError({ name: 'CanceledError' })).toBe(ErrorType.CANCELED)
  })

  it('axios timeout（ECONNABORTED）被識別為 TIMEOUT', () => {
    expect(classifyError({ code: 'ECONNABORTED' })).toBe(ErrorType.TIMEOUT)
  })

  it('無 response 表示 NETWORK_ERROR', () => {
    expect(classifyError({ message: 'Network Error' })).toBe(
      ErrorType.NETWORK_ERROR,
    )
  })

  it.each([
    [401, ErrorType.UNAUTHORIZED],
    [403, ErrorType.FORBIDDEN],
    [404, ErrorType.NOT_FOUND],
    [409, ErrorType.CONFLICT],
    [422, ErrorType.VALIDATION],
    [429, ErrorType.RATE_LIMITED],
    [500, ErrorType.SERVER_ERROR],
    [503, ErrorType.SERVER_ERROR],
  ])('status %d → %s', (status, expected) => {
    expect(classifyError(axiosError(status))).toBe(expected)
  })

  it('未明確分類的狀態碼（如 418）回傳 UNKNOWN', () => {
    expect(classifyError(axiosError(418))).toBe(ErrorType.UNKNOWN)
  })
})

describe('getErrorMessage', () => {
  it('優先採用 interceptor 填入的 displayMessage', () => {
    const err = axiosError(500, { detail: '伺服器爆炸' })
    err.displayMessage = '已正規化的訊息'
    expect(getErrorMessage(err)).toBe('已正規化的訊息')
  })

  it('displayMessage 不存在時 fallback 到 detail 字串', () => {
    expect(getErrorMessage(axiosError(404, { detail: '找不到學生' }))).toBe(
      '找不到學生',
    )
  })

  it('FastAPI 驗證錯誤陣列取第一筆 msg', () => {
    const err = axiosError(422, {
      detail: [{ msg: 'field required', loc: ['body', 'name'] }],
    })
    expect(getErrorMessage(err)).toBe('field required')
  })

  it('detail 無訊息時回傳分類預設訊息', () => {
    expect(getErrorMessage(axiosError(500))).toBe('伺服器錯誤，請稍後再試')
    expect(getErrorMessage(axiosError(403))).toBe('權限不足，無法執行此操作')
  })

  it('可傳入 fallback 覆蓋分類預設訊息', () => {
    expect(getErrorMessage(axiosError(500), '自訂錯誤')).toBe('自訂錯誤')
  })

  it('null 錯誤時回傳 fallback 或預設', () => {
    expect(getErrorMessage(null)).toBe('操作失敗')
    expect(getErrorMessage(null, '載入失敗')).toBe('載入失敗')
  })

  it('空 detail 陣列退回狀態碼的分類預設訊息', () => {
    const err = axiosError(500, { detail: [] })
    expect(getErrorMessage(err)).toBe('伺服器錯誤，請稍後再試')
  })
})

describe('isSilentError', () => {
  it('AbortController 取消應靜默', () => {
    expect(isSilentError({ code: 'ERR_CANCELED' })).toBe(true)
  })

  it('一般 API 錯誤不應靜默', () => {
    expect(isSilentError(axiosError(500))).toBe(false)
    expect(isSilentError(axiosError(401))).toBe(false)
  })
})
