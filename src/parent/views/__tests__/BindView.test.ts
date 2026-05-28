/**
 * BindView — 綁定碼錯誤情境 friendly error 顯示。
 *
 * 驗證 useFriendlyError 接入：errorDetail.code 應對應 nextStep；未知 code 仍能 fallback。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import BindView from '../BindView.vue'

// ===== Module mocks (hoisted) =====
const { mockBind } = vi.hoisted(() => ({ mockBind: vi.fn() }))

vi.mock('@/parent/api/auth', () => ({
  bind: mockBind,
}))

vi.mock('@/components/brand/BrandMark.vue', () => ({
  default: { template: '<div data-testid="brand-mark" />' },
}))

// ===== Helpers =====
function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
}

function mountBindView() {
  return mount(BindView, {
    global: {
      plugins: [createPinia(), createTestRouter()],
    },
  })
}

function makeBusinessError(code: string, message: string) {
  // 模擬 parent/api/index.ts interceptor 已展開的 envelope
  return {
    isAxiosError: true,
    response: { status: 400, data: { detail: { code, message } } },
    errorDetail: { code, message },
    displayMessage: message,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockBind.mockReset()
})

describe('BindView — friendly error', () => {
  it('空綁定碼不送 API，顯示「請輸入綁定碼」', async () => {
    const w = mountBindView()
    await w.find('button.submit').trigger('click')
    await flushPromises()
    expect(mockBind).not.toHaveBeenCalled()
    expect(w.find('[data-testid="bind-error"]').text()).toContain('請輸入綁定碼')
  })

  it('BIND_CODE_INVALID → 顯示 message + nextStep（LINE 主選單）', async () => {
    mockBind.mockRejectedValueOnce(makeBusinessError('BIND_CODE_INVALID', '綁定碼無效或已過期'))
    const w = mountBindView()
    await w.find('input').setValue('AAAA1111')
    await w.find('button.submit').trigger('click')
    await flushPromises()

    const errorBox = w.find('[data-testid="bind-error"]')
    expect(errorBox.exists()).toBe(true)
    expect(errorBox.text()).toContain('綁定碼無效或已過期')
    const nextStep = w.find('[data-testid="bind-error-next-step"]')
    expect(nextStep.exists()).toBe(true)
    expect(nextStep.text()).toMatch(/LINE 主選單/)
  })

  it('BIND_CODE_EXPIRED → 顯示 nextStep 且出現「我已重新拿碼」CTA', async () => {
    mockBind.mockRejectedValueOnce(makeBusinessError('BIND_CODE_EXPIRED', '綁定碼已過期'))
    const w = mountBindView()
    await w.find('input').setValue('BBBB2222')
    await w.find('button.submit').trigger('click')
    await flushPromises()

    expect(w.find('[data-testid="bind-error-next-step"]').text()).toMatch(/重新產生/)
    // needsNewCode 觸發 recovery CTA
    expect(w.find('.recovery-retry').exists()).toBe(true)
  })

  it('BIND_CODE_NOT_FOUND → 顯示 nextStep 但不出現「我已重新拿碼」CTA', async () => {
    mockBind.mockRejectedValueOnce(makeBusinessError('BIND_CODE_NOT_FOUND', '找不到此綁定碼'))
    const w = mountBindView()
    await w.find('input').setValue('CCCC3333')
    await w.find('button.submit').trigger('click')
    await flushPromises()

    expect(w.find('[data-testid="bind-error-next-step"]').text()).toMatch(/輸入是否正確/)
    expect(w.find('.recovery-retry').exists()).toBe(false)
  })

  it('未知 code → fallback 到 displayMessage 且無 nextStep', async () => {
    mockBind.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { detail: '伺服器爆了' } },
      errorDetail: null,
      displayMessage: '伺服器爆了',
    })
    const w = mountBindView()
    await w.find('input').setValue('DDDD4444')
    await w.find('button.submit').trigger('click')
    await flushPromises()

    expect(w.find('[data-testid="bind-error"]').text()).toContain('伺服器爆了')
    expect(w.find('[data-testid="bind-error-next-step"]').exists()).toBe(false)
  })
})
