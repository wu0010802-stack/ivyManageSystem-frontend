/**
 * BindView — 首次 LINE 綁定成功也是一次「身分轉換」，必須與一般登入
 * （LoginView.completeLogin）走同一份家庭資料失效程序（2026-10-04 家長端深掃 F02）。
 *
 * 情境：家長 A 未登出，同一分頁改由 LINE 身分 B 走 need_binding → /bind。舊版
 * BindView 只呼叫 `authStore.setUser(B)`，A 的今日狀態快取（sessionStorage）、
 * useCachedAsync 摘要與 children store（loaded 旗標無 TTL）原樣留著，B 進首頁即
 * 看到 A 的孩子資料。所有 API 皆為合成 mock。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import BindView from '../BindView.vue'
import { useChildrenStore } from '@/parent/stores/children'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { useCachedAsync, _resetCacheForTesting } from '@/composables/useCachedAsync'

const { mockBind } = vi.hoisted(() => ({ mockBind: vi.fn() }))
vi.mock('@/parent/api/auth', () => ({ bind: mockBind, logout: vi.fn() }))

const TODAY_STATUS_CACHE_KEY = 'parent:today-status:v1'

beforeEach(() => {
  _resetCacheForTesting()
  sessionStorage.clear()
  mockBind.mockReset()
})

describe('BindView — 首次綁定成功清除前一位家長的個人化資料', () => {
  it('家庭 B 綁定成功後不能讀到家庭 A 的今日狀態、摘要與子女 store', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useParentAuthStore()
    auth.setUser({ user_id: 101, name: '合成家庭 A', role: 'parent' })
    const children = useChildrenStore()
    children.items = [{ student_id: 1001, name: '合成孩子 A' }]
    children.loaded = true
    sessionStorage.setItem(
      TODAY_STATUS_CACHE_KEY,
      JSON.stringify({ payload: { children: [{ student_id: 1001 }] }, cachedAt: Date.now() }),
    )
    const summaryA = useCachedAsync('parent/today/summary', async () => ({ owner: 'A' }))
    await flushPromises()
    expect(summaryA.data.value).toEqual({ owner: 'A' })

    mockBind.mockResolvedValue({
      data: { status: 'ok', user: { user_id: 202, name: '合成家庭 B', role: 'parent' } },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    await router.push('/bind')
    const wrapper = mount(BindView, { global: { plugins: [pinia, router] } })
    await wrapper.find('input').setValue('SYNTHB01')
    await wrapper.find('button.submit').trigger('click')
    await flushPromises()

    expect(auth.user).toMatchObject({ user_id: 202 })
    expect(sessionStorage.getItem(TODAY_STATUS_CACHE_KEY)).toBeNull()
    expect(summaryA.data.value).toBeNull()
    expect(children.items).toEqual([])
    expect(children.loaded).toBe(false)
    wrapper.unmount()
  })
})
