import { describe, it, expect } from 'vitest'
import { apiError } from '@/utils/error'

describe('apiError()', () => {
  it('優先使用 displayMessage（interceptor 注入）', () => {
    const err = {
      displayMessage: '由 interceptor 設定',
      response: { data: { detail: '後端 detail' } },
      message: 'axios message',
    }
    expect(apiError(err)).toBe('由 interceptor 設定')
  })

  it('無 displayMessage 時讀 response.data.detail', () => {
    const err = {
      response: { data: { detail: '後端 detail', message: '不該用這個' } },
      message: 'axios message',
    }
    expect(apiError(err)).toBe('後端 detail')
  })

  it('沒有 detail 時讀 response.data.message', () => {
    const err = {
      response: { data: { message: '後端 message' } },
      message: 'axios message',
    }
    expect(apiError(err)).toBe('後端 message')
  })

  it('沒有 response 時不爆，使用預設 fallback', () => {
    expect(apiError({})).toBe('操作失敗')
  })

  it('error 為 null / undefined 也回 fallback', () => {
    expect(apiError(null)).toBe('操作失敗')
    expect(apiError(undefined)).toBe('操作失敗')
  })

  it('自訂 fallback 訊息', () => {
    expect(apiError({}, '請稍後重試')).toBe('請稍後重試')
    expect(apiError(null, '請稍後重試')).toBe('請稍後重試')
  })

  it('detail 為空字串時跳到下一層 fallback', () => {
    // 空字串 falsy，繼續往下找
    const err = {
      response: { data: { detail: '', message: '後備 message' } },
    }
    expect(apiError(err)).toBe('後備 message')
  })

  it('error.message 不在 fallback 鏈中（不會被自動使用）', () => {
    // 設計上 axios 的 message 不會被當作 displayMessage 來源
    const err = { message: 'Network Error' }
    expect(apiError(err)).toBe('操作失敗')
    expect(apiError(err, 'my fb')).toBe('my fb')
  })
})
