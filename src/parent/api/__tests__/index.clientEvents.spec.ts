/**
 * `src/parent/api/index.ts` 回應攔截器的 `reportClientEvent` 掛點
 *（api_timeout / api_5xx / maintenance_hit，以及 09-05 新增的 login_failed
 * 特判）——本檔先前完全零測試覆蓋，是 SPEC-023 批次 3 風險最高的檔案（三個
 * 回報掛點都在裡面）。
 *
 * 用 `axios-mock-adapter` 掛在真實家長端 axios instance 上，讓假回應／假
 * 錯誤走過真正的攔截器邏輯（而非另外重寫一份判斷邏輯來測自己）；把會導頁／
 * 彈全域 UI 的相依（consent gate／staff session gate／tenantBlocked／router／
 * toast）換成 stub，避免測試環境炸掉或產生看不見的副作用——不動攔截器本身
 * 的業務邏輯。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'

vi.mock('@/parent/utils/clientEvents', () => ({
  reportClientEvent: vi.fn(),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/parent/composables/useConsentGate', () => ({
  useConsentGate: () => ({
    visible: { value: false },
    pendingScope: { value: null },
    require: vi.fn(),
    resolve: vi.fn(),
    reset: vi.fn(),
  }),
}))
vi.mock('@/parent/composables/useStaffSessionGate', () => ({
  useStaffSessionGate: () => ({
    visible: { value: false },
    require: vi.fn(),
    reset: vi.fn(),
  }),
}))
vi.mock('@/utils/tenantBlocked', () => ({
  showTenantBlocked: vi.fn(),
  isTenantBlocked: () => false,
}))
vi.mock('@/parent/router', () => ({
  default: {
    currentRoute: { value: { path: '/home', fullPath: '/home' } },
    replace: vi.fn(),
  },
}))

import api from '../index'
import { reportClientEvent } from '@/parent/utils/clientEvents'

const mockedReport = reportClientEvent as unknown as ReturnType<typeof vi.fn>

describe('src/parent/api/index.ts 回應攔截器 — reportClientEvent 掛點', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(api)
  })

  afterEach(() => {
    mock.restore()
  })

  it('網路層失敗（無 response）打到一般端點 → api_timeout，route_name 正確', async () => {
    mock.onGet('/parent/children').networkError()
    await api.get('/parent/children').catch(() => {})
    expect(mockedReport).toHaveBeenCalledTimes(1)
    expect(mockedReport).toHaveBeenCalledWith(
      'api_timeout',
      expect.objectContaining({ route_name: '/parent/children' }),
    )
  })

  it('網路層失敗打到 /parent/auth/liff-login → login_failed，不是 api_timeout', async () => {
    mock.onPost('/parent/auth/liff-login').networkError()
    await api.post('/parent/auth/liff-login', { id_token: 'x' }).catch(() => {})
    expect(mockedReport).toHaveBeenCalledTimes(1)
    expect(mockedReport).toHaveBeenCalledWith(
      'login_failed',
      expect.objectContaining({ route_name: '/parent/auth/liff-login' }),
    )
    expect(mockedReport).not.toHaveBeenCalledWith('api_timeout', expect.anything())
  })

  it('同上但 URL 帶 query string → 仍命中 login_failed（釘住正規化）', async () => {
    const urlWithQuery = '/parent/auth/liff-login?redirect=%2Fhome'
    mock.onPost(urlWithQuery).networkError()
    await api.post(urlWithQuery, { id_token: 'x' }).catch(() => {})
    expect(mockedReport).toHaveBeenCalledTimes(1)
    expect(mockedReport).toHaveBeenCalledWith('login_failed', expect.anything())
  })

  it('網路層失敗打到 /parent/auth/device-setup → login_failed', async () => {
    mock.onPost('/parent/auth/device-setup').networkError()
    await api.post('/parent/auth/device-setup', { code: 'ABCD' }).catch(() => {})
    expect(mockedReport).toHaveBeenCalledTimes(1)
    expect(mockedReport).toHaveBeenCalledWith(
      'login_failed',
      expect.objectContaining({ route_name: '/parent/auth/device-setup' }),
    )
  })

  it('5xx（有 response）→ api_5xx，帶 status_code', async () => {
    mock.onGet('/parent/children').reply(500, { detail: '伺服器錯誤' })
    await api.get('/parent/children').catch(() => {})
    expect(mockedReport).toHaveBeenCalledTimes(1)
    expect(mockedReport).toHaveBeenCalledWith(
      'api_5xx',
      expect.objectContaining({ status_code: 500 }),
    )
  })

  it('503 + MAINTENANCE_MODE envelope → maintenance_hit', async () => {
    mock.onGet('/parent/children').reply(503, {
      detail: { code: 'MAINTENANCE_MODE', message: '系統維護中' },
    })
    await api.get('/parent/children').catch(() => {})
    expect(mockedReport).toHaveBeenCalledTimes(1)
    expect(mockedReport).toHaveBeenCalledWith(
      'maintenance_hit',
      expect.objectContaining({ status_code: 503 }),
    )
  })

  it('4xx（非 5xx、非 503 維護）→ 不送任何事件', async () => {
    mock.onGet('/parent/children').reply(400, { detail: '參數錯誤' })
    await api.get('/parent/children').catch(() => {})
    expect(mockedReport).not.toHaveBeenCalled()
  })

  it('成功回應 → 不送任何事件', async () => {
    mock.onGet('/parent/children').reply(200, { items: [] })
    await api.get('/parent/children')
    expect(mockedReport).not.toHaveBeenCalled()
  })
})
