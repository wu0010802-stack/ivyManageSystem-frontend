/**
 * BindAdditionalView — 加綁成功後導回原本要去的頁面（深連結保存，見
 * LoginView.redirectBack.test.ts 說明）。此頁需已登入才能進入，多為使用者
 * 從「我的」分頁主動點進來，但仍支援同一套 redirect 機制以與 Bind/Login
 * 一致（例如日後從深連結直接導到本頁的情境）。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import BindAdditionalView from '../BindAdditionalView.vue'

const { mockBindAdditional } = vi.hoisted(() => ({ mockBindAdditional: vi.fn() }))

vi.mock('@/parent/api/auth', () => ({
  bindAdditional: mockBindAdditional,
}))

vi.mock('@/parent/api/profile', () => ({
  getMyChildren: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

vi.mock('@/components/brand/BrandMark.vue', () => ({
  default: { template: '<div data-testid="brand-mark" />' },
}))

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/bind-additional', component: BindAdditionalView },
      { path: '/home', component: { template: '<div>home</div>' } },
      { path: '/fees', component: { template: '<div>fees</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
}

async function mountViewAt(initialLocation: string) {
  const router = createTestRouter()
  await router.push(initialLocation)
  const wrapper = mount(BindAdditionalView, { global: { plugins: [createPinia(), router] } })
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockBindAdditional.mockReset().mockResolvedValue({ data: { status: 'ok' } })
})

describe('BindAdditionalView — 加綁成功後導回原頁', () => {
  it('query 帶安全的 redirect → 加綁成功導向該頁，不是 /home', async () => {
    const { wrapper, router } = await mountViewAt('/bind-additional?redirect=%2Ffees')
    await wrapper.find('input').setValue('AAAA1111')
    await wrapper.find('button.submit-btn').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/fees')
  })

  it('沒有 redirect query → 維持原行為，回 /home', async () => {
    const { wrapper, router } = await mountViewAt('/bind-additional')
    await wrapper.find('input').setValue('AAAA1111')
    await wrapper.find('button.submit-btn').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
  })

  it('redirect query 帶反斜線變形 /\\evil.com → fallback /home', async () => {
    const { wrapper, router } = await mountViewAt('/bind-additional?redirect=%2F%5Cevil.com')
    await wrapper.find('input').setValue('AAAA1111')
    await wrapper.find('button.submit-btn').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
  })
})
