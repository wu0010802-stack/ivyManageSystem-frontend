import { describe, expect, it } from 'vitest'
import { isNotFoundError, loadErrorMessage } from '../loadError'

describe('loadError', () => {
  it('只有 response.status === 404 才算找不到', () => {
    expect(isNotFoundError({ response: { status: 404 } })).toBe(true)
    expect(isNotFoundError({ response: { status: 500 } })).toBe(false)
    expect(isNotFoundError({ response: { status: 403 } })).toBe(false)
    // 斷線：axios 沒有 response
    expect(isNotFoundError(new Error('Network Error'))).toBe(false)
    expect(isNotFoundError(null)).toBe(false)
    expect(isNotFoundError('404')).toBe(false)
  })

  it('優先用 interceptor 正規化的 displayMessage，否則用 fallback', () => {
    expect(loadErrorMessage({ displayMessage: '網路連線異常' })).toBe('網路連線異常')
    expect(loadErrorMessage({ displayMessage: '' }, '載入失敗')).toBe('載入失敗')
    expect(loadErrorMessage(new Error('boom'), '載入失敗')).toBe('載入失敗')
    expect(loadErrorMessage(undefined)).toBe('載入失敗，請稍後再試')
  })
})
