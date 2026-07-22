import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'

const { captureExceptionMock, sanitizeUrlMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(() => Promise.resolve()),
  sanitizeUrlMock: vi.fn(() => '/children/:id?phone=%5BFiltered%5D'),
}))

vi.mock('@/utils/sentry', () => ({
  captureException: captureExceptionMock,
  sanitizeUrl: sanitizeUrlMock,
}))

// 家長端 axios instance
import api from '@/parent/api/index'
import { DEFAULT_MESSAGES, ErrorType } from '@/utils/errorHandler'

describe('parent api interceptor — friendly fallback (Phase 5)', () => {
  let mock

  beforeEach(() => {
    captureExceptionMock.mockClear()
    sanitizeUrlMock.mockClear()
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

  it('422 detail 為 FastAPI validation array 時不把陣列交給 UI', async () => {
    mock.onPost('/validation-422').reply(422, {
      detail: [{ loc: ['body', 'name'], msg: 'field required', type: 'missing' }],
    })

    const err = await api.post('/validation-422').catch((e) => e)

    expect(Array.isArray(err.displayMessage)).toBe(false)
    expect(err.displayMessage).toBe(DEFAULT_MESSAGES[ErrorType.VALIDATION])
    expect(err.errorDetail).toBeNull()
  })

  it('5xx 會以去識別 URL 上報 Sentry，4xx 不上報', async () => {
    const privateUrl = '/children/123?phone=0912345678'
    mock.onGet(privateUrl).reply(500)
    const serverErr = await api.get(privateUrl).catch((e) => e)

    expect(sanitizeUrlMock).toHaveBeenCalledWith(privateUrl)
    expect(captureExceptionMock).toHaveBeenCalledWith(serverErr, {
      url: '/children/:id?phone=%5BFiltered%5D',
      method: 'get',
      status: 500,
    })

    captureExceptionMock.mockClear()
    mock.onGet('/missing-child').reply(404)
    await api.get('/missing-child').catch((e) => e)
    expect(captureExceptionMock).not.toHaveBeenCalled()
  })
})
