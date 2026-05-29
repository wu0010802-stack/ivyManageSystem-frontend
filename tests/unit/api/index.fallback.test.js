import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'

// Mock sentry 避免 interceptor 在錯誤路徑跑真實 sentry init
vi.mock('@/utils/sentry', () => ({
  captureException: vi.fn(() => Promise.resolve()),
  sanitizeUrl: vi.fn((url) => url),
}))

// 管理端 axios instance；interceptor 在 import 時掛載
import api from '@/api/index'
import { DEFAULT_MESSAGES, ErrorType } from '@/utils/errorHandler'

describe('admin api interceptor — friendly fallback (Phase 5)', () => {
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
    expect(err.errorType).toBe(ErrorType.SERVER_ERROR)
  })

  it('5xx 含字串 detail → 採用後端字串 detail（不覆蓋）', async () => {
    mock.onGet('/ping-500-detail').reply(500, { detail: '結算服務忙線中' })
    const err = await api.get('/ping-500-detail').catch((e) => e)
    expect(err.displayMessage).toBe('結算服務忙線中')
  })

  it('5xx 含 envelope object detail → 採用 detail.message（不覆蓋）', async () => {
    mock.onGet('/ping-500-envelope').reply(500, {
      detail: { code: 'SALARY_TIMEOUT', message: '薪資結算超時' },
    })
    const err = await api.get('/ping-500-envelope').catch((e) => e)
    expect(err.displayMessage).toBe('薪資結算超時')
    expect(err.errorDetail).toMatchObject({ code: 'SALARY_TIMEOUT' })
  })

  it('Network error（無 response）→ displayMessage fallback 到 NETWORK_ERROR', async () => {
    mock.onGet('/network-down').networkError()
    const err = await api.get('/network-down').catch((e) => e)
    expect(err.displayMessage).toBe(DEFAULT_MESSAGES[ErrorType.NETWORK_ERROR])
    expect(err.errorType).toBe(ErrorType.NETWORK_ERROR)
  })

  it('Timeout（無 response）→ displayMessage fallback 到 TIMEOUT', async () => {
    mock.onGet('/timeout-endpoint').timeout()
    const err = await api.get('/timeout-endpoint').catch((e) => e)
    expect(err.displayMessage).toBe(DEFAULT_MESSAGES[ErrorType.TIMEOUT])
    expect(err.errorType).toBe(ErrorType.TIMEOUT)
  })

  it('4xx 無 detail → fallback 到對應分類訊息（例：403 → FORBIDDEN）', async () => {
    mock.onGet('/forbidden').reply(403)
    const err = await api.get('/forbidden').catch((e) => e)
    expect(err.displayMessage).toBe(DEFAULT_MESSAGES[ErrorType.FORBIDDEN])
  })
})
