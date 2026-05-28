import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MockAdapter from 'axios-mock-adapter'

// 家長端 axios instance
import api from '@/parent/api/index'
import { DEFAULT_MESSAGES, ErrorType } from '@/utils/errorHandler'

describe('parent api interceptor — friendly fallback (Phase 5)', () => {
  let mock

  beforeEach(() => {
    mock = new MockAdapter(api)
  })

  afterEach(() => {
    mock.restore()
  })

  it('5xx 無 detail → displayMessage fallback 到 SERVER_ERROR 友善文字', async () => {
    mock.onGet('/ping-500').reply(500)
    const err = await api.get('/ping-500').catch((e) => e)
    expect(err.displayMessage).toBe(DEFAULT_MESSAGES[ErrorType.SERVER_ERROR])
  })

  it('5xx 含字串 detail → 採用後端字串 detail', async () => {
    mock.onGet('/ping-500-detail').reply(500, { detail: '聯絡簿服務忙線中' })
    const err = await api.get('/ping-500-detail').catch((e) => e)
    expect(err.displayMessage).toBe('聯絡簿服務忙線中')
  })

  it('5xx 含 envelope object detail → 採用 detail.message + 完整 errorDetail', async () => {
    mock.onGet('/ping-500-envelope').reply(500, {
      detail: {
        code: 'BIND_CODE_INVALID',
        message: '綁定碼無效',
        request_id: 'r-1',
      },
    })
    const err = await api.get('/ping-500-envelope').catch((e) => e)
    expect(err.displayMessage).toBe('綁定碼無效')
    expect(err.errorDetail).toMatchObject({ code: 'BIND_CODE_INVALID' })
  })

  it('Network error（無 response）→ displayMessage fallback 到 NETWORK_ERROR', async () => {
    mock.onGet('/network-down').networkError()
    const err = await api.get('/network-down').catch((e) => e)
    expect(err.displayMessage).toBe(DEFAULT_MESSAGES[ErrorType.NETWORK_ERROR])
  })

  it('Timeout（無 response）→ displayMessage fallback 到 TIMEOUT', async () => {
    mock.onGet('/timeout-endpoint').timeout()
    const err = await api.get('/timeout-endpoint').catch((e) => e)
    expect(err.displayMessage).toBe(DEFAULT_MESSAGES[ErrorType.TIMEOUT])
  })

  it('4xx 無 detail → fallback 到對應分類訊息（例：404 → NOT_FOUND）', async () => {
    mock.onGet('/missing').reply(404)
    const err = await api.get('/missing').catch((e) => e)
    expect(err.displayMessage).toBe(DEFAULT_MESSAGES[ErrorType.NOT_FOUND])
  })
})
