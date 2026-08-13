/**
 * BindView — 綁定成功後導回原本要去的頁面（深連結保存，見 LoginView.redirectBack.test.ts 說明）。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import BindView from '../BindView.vue'

const { mockBind } = vi.hoisted(() => ({ mockBind: vi.fn() }))

vi.mock('@/parent/api/auth', () => ({
  bind: mockBind,
}))

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/bind', component: BindView },
      { path: '/home', component: { template: '<div>home</div>' } },
      { path: '/fees', component: { template: '<div>fees</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
}

async function mountBindViewAt(initialLocation: string) {
  const router = createTestRouter()
  await router.push(initialLocation)
  const wrapper = mount(BindView, { global: { plugins: [createPinia(), router] } })
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockBind.mockReset()
})

describe('BindView — 綁定成功後導回原頁', () => {
  it('query 帶安全的 redirect → 綁定成功導向該頁，不是 /home', async () => {
    mockBind.mockResolvedValueOnce({ data: { status: 'ok', user: { id: 1, name: '家長' } } })
    const { wrapper, router } = await mountBindViewAt('/bind?redirect=%2Ffees')
    await wrapper.find('input').setValue('AAAA1111')
    await wrapper.find('button.submit').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/fees')
  })

  it('沒有 redirect query → 維持原行為，回 /home', async () => {
    mockBind.mockResolvedValueOnce({ data: { status: 'ok', user: { id: 1, name: '家長' } } })
    const { wrapper, router } = await mountBindViewAt('/bind')
    await wrapper.find('input').setValue('AAAA1111')
    await wrapper.find('button.submit').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
  })

  it('redirect query 是協議相對路徑 //evil.com → fallback /home', async () => {
    mockBind.mockResolvedValueOnce({ data: { status: 'ok', user: { id: 1, name: '家長' } } })
    const { wrapper, router } = await mountBindViewAt('/bind?redirect=%2F%2Fevil.com')
    await wrapper.find('input').setValue('AAAA1111')
    await wrapper.find('button.submit').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
  })
})
