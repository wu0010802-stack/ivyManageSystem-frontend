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

  // 後端 detail 不只是字串：BusinessError 回 {code, message, request_id} 物件，
  // FastAPI 422 回 [{loc,msg,type}] 陣列。生產環境 interceptor 已正規化成
  // displayMessage，但這裡是 interceptor 未觸發時的備援路徑，型別要誠實。
  it('detail 為 BusinessError 物件時取其 message，不回傳整個物件', () => {
    const err = {
      response: {
        data: {
          detail: { code: 'INSURANCE_BELOW_BASE', message: '投保薪資低於基本薪資' },
          message: '不該用這個',
        },
      },
    }
    const result = apiError(err)
    expect(result).toBe('投保薪資低於基本薪資')
    expect(result).not.toContain('[object Object]')
  })

  it('detail 為 422 陣列時跳過，落到下一層而非渲染成陣列', () => {
    const err = {
      response: {
        data: {
          detail: [{ loc: ['body', 'name'], msg: 'field required', type: 'missing' }],
          message: '後備 message',
        },
      },
    }
    expect(apiError(err)).toBe('後備 message')
  })

  it('detail 是無 message 的物件時落到 fallback', () => {
    const err = { response: { data: { detail: { code: 'SOME_CODE' } } } }
    expect(apiError(err, '預設文案')).toBe('預設文案')
  })
})
