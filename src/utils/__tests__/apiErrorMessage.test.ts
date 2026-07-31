// 2026-07-31 稽核：公開報名頁把 axios 錯誤的 detail 直接印給家長，而 FastAPI 422 的
// detail 是 pydantic 錯誤物件陣列（truthy）→ 中文 fallback 永遠輪不到，畫面出現
// 一整包 JSON 加 pydantic 官網除錯連結。
import { describe, it, expect } from 'vitest'
import { apiErrorMessage } from '../apiErrorMessage'

const FALLBACK = '送出失敗，請稍後再試。'

describe('apiErrorMessage', () => {
  it('422 的 pydantic 錯誤陣列不得外洩，改用中文 fallback', () => {
    const err = {
      response: {
        data: {
          detail: [
            {
              type: 'value_error',
              loc: ['body', 'email'],
              msg: 'value is not a valid email address: There must be something after the @-sign.',
              input: 'wang@',
              url: 'https://errors.pydantic.dev/2.11/v/value_error',
            },
          ],
        },
      },
    }
    expect(apiErrorMessage(err, FALLBACK)).toBe(FALLBACK)
  })

  it('後端刻意回的字串 detail 照常顯示', () => {
    const err = { response: { data: { detail: '報名已截止' } } }
    expect(apiErrorMessage(err, FALLBACK)).toBe('報名已截止')
  })

  it('envelope 形式 { detail: { code, message } } 取 message', () => {
    const err = {
      response: { data: { detail: { code: 'NOT_PENDING', message: '此課程非待確認狀態' } } },
    }
    expect(apiErrorMessage(err, FALLBACK)).toBe('此課程非待確認狀態')
  })

  it('攔截器正規化過的 displayMessage 優先', () => {
    const err = {
      displayMessage: '連線逾時',
      response: { data: { detail: '不該用到這個' } },
    }
    expect(apiErrorMessage(err, FALLBACK)).toBe('連線逾時')
  })

  it('網路錯誤（沒有 response）走 fallback', () => {
    expect(apiErrorMessage(new Error('Network Error'), FALLBACK)).toBe(FALLBACK)
    expect(apiErrorMessage(undefined, FALLBACK)).toBe(FALLBACK)
  })

  it('空字串 detail 不得蓋掉 fallback', () => {
    expect(apiErrorMessage({ response: { data: { detail: '   ' } } }, FALLBACK)).toBe(FALLBACK)
  })
})
