/**
 * 家長端 axios 攔截器 —— 「目前 cookie 是員工身分」偵測。
 *
 * 背景（2026-09-01）：管理端與家長端同源、共用同一顆 httpOnly cookie
 * `access_token`（後端 utils/cookie.py `_COOKIE_PATH = "/api"`），且後端
 * `get_current_user` 只認這一顆。所以同一個瀏覽器先登入管理端（admin/teacher）
 * 再開家長端時，家長端每一支 API 都會被 `require_parent_role()` 擋成
 * 403「此 API 僅限家長端使用」（ivy-backend utils/auth.py:918）。
 *
 * 家長端 router 沒有 auth guard、攔截器又只對 401 導回登入頁，於是使用者看到
 * 的是滿頁「api 錯誤」而不是「你現在不是家長身分」。本測試釘住修法：這種 403
 * 要升成一個明確的全域提示（StaffSessionNotice），而其他 403 不受影響。
 *
 * 觸發條件刻意用 detail 文案逐字比對（而非再打一次 /auth/me 探測身分）：
 * 該文案是後端既有契約、有逐字斷言測試守著（ivy-backend
 * tests/test_staff_role_guard.py、test_portal_contact_book_photo_url_2026_07_27.py），
 * 且零額外請求、對合法的家長 403（IDOR）零誤判。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/parent/router', () => ({
  default: {
    replace: vi.fn(),
    currentRoute: { value: { path: '/home', fullPath: '/home' } },
  },
}))

import api from '@/parent/api/index'
import { useStaffSessionGate } from '@/parent/composables/useStaffSessionGate'
import { useConsentGate } from '@/parent/composables/useConsentGate'

describe('parent axios interceptor — 員工身分 cookie 偵測', () => {
  let apiMock: MockAdapter
  const gate = useStaffSessionGate()

  beforeEach(() => {
    setActivePinia(createPinia())
    apiMock = new MockAdapter(api)
    gate.reset()
    useConsentGate().reset()
  })

  afterEach(() => {
    apiMock.restore()
    gate.reset()
  })

  it('403「此 API 僅限家長端使用」→ 開啟 staff session 提示', async () => {
    apiMock.onGet('/parent/home/summary').reply(403, { detail: '此 API 僅限家長端使用' })

    await api.get('/parent/home/summary').catch(() => {})

    expect(gate.visible.value).toBe(true)
  })

  it('同一輪多支請求同時 403 只維持單一提示（module-singleton，不疊加）', async () => {
    apiMock.onGet('/parent/home/summary').reply(403, { detail: '此 API 僅限家長端使用' })
    apiMock.onGet('/parent/children').reply(403, { detail: '此 API 僅限家長端使用' })

    await Promise.all([
      api.get('/parent/home/summary').catch(() => {}),
      api.get('/parent/children').catch(() => {}),
    ])

    expect(gate.visible.value).toBe(true)
  })

  it('consent gate 的 403（帶 X-Consent-Required）不觸發 staff 提示', async () => {
    apiMock
      .onGet('/parent/home/summary')
      .reply(403, { detail: '請先重新簽署當期隱私權政策' }, { 'x-consent-required': 'privacy' })

    await api.get('/parent/home/summary').catch(() => {})

    expect(gate.visible.value).toBe(false)
    expect(useConsentGate().visible.value).toBe(true)
  })

  it('家長本人的其他 403（IDOR 等）不觸發 staff 提示', async () => {
    apiMock.onGet('/parent/children/999').reply(403, { detail: '無權存取此學生' })

    await api.get('/parent/children/999').catch(() => {})

    expect(gate.visible.value).toBe(false)
  })

  it('401 不觸發 staff 提示（走既有 refresh / 導回登入頁路徑）', async () => {
    apiMock.onGet('/parent/home/summary').reply(401)

    await api.get('/parent/home/summary').catch(() => {})

    expect(gate.visible.value).toBe(false)
  })
})
