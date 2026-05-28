import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'

// vi.hoisted 確保下方 vi.mock factory 拿到的是同一個 ref（避免 TDZ）
const { routerReplaceMock, currentRoutePath, elWarningMock } = vi.hoisted(() => ({
  routerReplaceMock: vi.fn(),
  currentRoutePath: { value: { path: '/some-page' } },
  elWarningMock: vi.fn(),
}))

vi.mock('@/router', () => ({
  default: {
    replace: (...args: unknown[]) => routerReplaceMock(...args),
    currentRoute: currentRoutePath,
  },
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: {
      ...actual.ElMessage,
      warning: (...args: unknown[]) => elWarningMock(...args),
    },
  }
})

import api from '@/api'

describe('admin axios interceptor — kill switch (Phase 4 Task 4.3)', () => {
  let mock: MockAdapter

  beforeEach(() => {
    routerReplaceMock.mockReset()
    elWarningMock.mockReset()
    currentRoutePath.value.path = '/some-page'
    mock = new MockAdapter(api)
  })

  afterEach(() => {
    mock.restore()
  })

  it('503 + code=MAINTENANCE_MODE → router.replace(/maintenance) 並 reject', async () => {
    mock.onGet('/ping').reply(503, {
      detail: { message: '預計 23:00 完成', code: 'MAINTENANCE_MODE', retry_after: 300 },
    })
    const err = await api.get('/ping').catch((e) => e)
    expect(routerReplaceMock).toHaveBeenCalledTimes(1)
    expect(routerReplaceMock.mock.calls[0][0]).toMatchObject({
      path: '/maintenance',
      query: { message: '預計 23:00 完成' },
    })
    expect(err.response.status).toBe(503)
  })

  it('當已在 /maintenance 時不重複 router.replace（防無窮 redirect）', async () => {
    currentRoutePath.value.path = '/maintenance'
    mock.onGet('/ping').reply(503, {
      detail: { message: 'still down', code: 'MAINTENANCE_MODE' },
    })
    await api.get('/ping').catch(() => {})
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('503 + code=READ_ONLY_MODE → ElMessage.warning，不 redirect', async () => {
    mock.onGet('/ping').reply(503, {
      detail: { message: '系統暫時唯讀', code: 'READ_ONLY_MODE' },
    })
    await api.get('/ping').catch(() => {})
    expect(elWarningMock).toHaveBeenCalledWith('系統暫時唯讀')
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('503 沒 code → 不 redirect（走 FE-B fallback）', async () => {
    mock.onGet('/ping').reply(503, { detail: '臨時錯誤' })
    const err = await api.get('/ping').catch((e) => e)
    expect(routerReplaceMock).not.toHaveBeenCalled()
    expect(elWarningMock).not.toHaveBeenCalled()
    // FE-B 已將 detail 字串設成 displayMessage
    expect(err.displayMessage).toBe('臨時錯誤')
  })

  it('非 503 5xx 不 trigger kill switch（FE-B fallback 仍生效）', async () => {
    mock.onGet('/ping').reply(500)
    const err = await api.get('/ping').catch((e) => e)
    expect(routerReplaceMock).not.toHaveBeenCalled()
    // FE-B 的 SERVER_ERROR 友善文案應 fallback
    expect(err.displayMessage).toContain('稍後再試')
  })
})
