import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MockAdapter from 'axios-mock-adapter'

import api from '@/api'

/**
 * 下載端點用 responseType:'blob'；伺服器回 JSON 錯誤時 error.response.data 是 Blob，
 * 既有 displayMessage 正規化（讀 detail.message）讀不到 → 使用者只看到通用「下載失敗」。
 * interceptor 應先把 application/json 的 blob 解析回物件，讓真實錯誤（如「本月薪資尚未封存」）浮現。
 */
describe('axios interceptor — blob 錯誤回應解析（下載端點真實錯誤浮現）', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(api)
  })
  afterEach(() => {
    mock.restore()
  })

  it('blob(JSON) 錯誤體 → 解析出 detail.message 設為 displayMessage（非通用 fallback）', async () => {
    const blob = new Blob(
      [JSON.stringify({ detail: { message: '本月薪資尚未封存', code: 'SALARY_NOT_CLOSED' } })],
      { type: 'application/json' },
    )
    mock.onGet('/exports/salary').reply(409, blob)

    const err = await api.get('/exports/salary', { responseType: 'blob' }).catch((e) => e)

    expect(err.displayMessage).toBe('本月薪資尚未封存')
    // 解析後的物件覆蓋原 blob，供 errorDetail / mapXxxError 取 code
    expect(err.response.data).toMatchObject({ detail: { code: 'SALARY_NOT_CLOSED' } })
  })

  it('非 JSON blob（真的二進位 partial）→ 解析略過、不炸，走 5xx 友善 fallback', async () => {
    const blob = new Blob(['\x00\x01binary'], { type: 'application/octet-stream' })
    mock.onGet('/exports/bin').reply(500, blob)

    const err = await api.get('/exports/bin', { responseType: 'blob' }).catch((e) => e)

    expect(err.displayMessage).toContain('稍後再試')
  })
})
