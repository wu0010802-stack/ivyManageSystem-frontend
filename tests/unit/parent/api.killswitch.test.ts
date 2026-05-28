import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'

const { routerReplaceMock, currentRoutePath, toastWarnMock } = vi.hoisted(() => ({
  routerReplaceMock: vi.fn(),
  currentRoutePath: { value: { path: '/home' } },
  toastWarnMock: vi.fn(),
}))

vi.mock('@/parent/router', () => ({
  default: {
    replace: (...args: unknown[]) => routerReplaceMock(...args),
    currentRoute: currentRoutePath,
  },
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warn: (...args: unknown[]) => toastWarnMock(...args),
    info: vi.fn(),
  },
}))

import api from '@/parent/api/index'

describe('parent axios interceptor — kill switch (Phase 4 Task 4.4)', () => {
  let mock: MockAdapter

  beforeEach(() => {
    routerReplaceMock.mockReset()
    toastWarnMock.mockReset()
    currentRoutePath.value.path = '/home'
    mock = new MockAdapter(api)
  })

  afterEach(() => {
    mock.restore()
  })

  it('503 + MAINTENANCE_MODE → router.replace(/maintenance)', async () => {
    mock.onGet('/ping').reply(503, {
      detail: { message: '預計凌晨完成', code: 'MAINTENANCE_MODE' },
    })
    await api.get('/ping').catch(() => {})
    expect(routerReplaceMock).toHaveBeenCalledTimes(1)
    expect(routerReplaceMock.mock.calls[0][0]).toMatchObject({
      path: '/maintenance',
      query: { message: '預計凌晨完成' },
    })
  })

  it('已在 /maintenance 時不重複 replace', async () => {
    currentRoutePath.value.path = '/maintenance'
    mock.onGet('/ping').reply(503, {
      detail: { message: 'down', code: 'MAINTENANCE_MODE' },
    })
    await api.get('/ping').catch(() => {})
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('503 + READ_ONLY_MODE → toast.warn 不 redirect', async () => {
    mock.onPost('/data').reply(503, {
      detail: { message: '系統暫時唯讀', code: 'READ_ONLY_MODE' },
    })
    await api.post('/data', {}).catch(() => {})
    expect(toastWarnMock).toHaveBeenCalledWith('系統暫時唯讀')
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('503 沒 code 走 FE-B fallback displayMessage', async () => {
    mock.onGet('/ping').reply(503, { detail: '臨時錯誤' })
    const err = await api.get('/ping').catch((e) => e)
    expect(routerReplaceMock).not.toHaveBeenCalled()
    expect(err.displayMessage).toBe('臨時錯誤')
  })
})
