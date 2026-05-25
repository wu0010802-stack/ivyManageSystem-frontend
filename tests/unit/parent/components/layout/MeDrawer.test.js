import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MeDrawer from '@/parent/components/layout/MeDrawer.vue'

const pushMock = vi.fn()
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))
vi.mock('@/parent/api/auth', () => ({
  logout: vi.fn().mockResolvedValue(undefined),
}))

const stubs = {
  ConfirmDialog: { template: '<div class="confirm-stub" v-if="open" />', props: ['open'] },
  Teleport: true,
}

beforeEach(() => {
  setActivePinia(createPinia())
  pushMock.mockClear()
  replaceMock.mockClear()
})

describe('MeDrawer', () => {
  it('modelValue=false 不渲染 aside（drawer）', () => {
    const w = mount(MeDrawer, { props: { modelValue: false }, global: { stubs } })
    expect(w.find('aside').exists()).toBe(false)
  })

  it('modelValue=true 渲染 drawer + 4 個 item', () => {
    const w = mount(MeDrawer, { props: { modelValue: true }, global: { stubs } })
    expect(w.find('aside').exists()).toBe(true)
    expect(w.findAll('.md-item')).toHaveLength(4)
    const labels = w.findAll('.md-label').map((el) => el.text())
    expect(labels).toEqual(['個人資料', '通知偏好', '加綁子女', '登出'])
  })

  it('登出 item 標 is-danger class', () => {
    const w = mount(MeDrawer, { props: { modelValue: true }, global: { stubs } })
    const items = w.findAll('.md-item')
    expect(items[3].classes()).toContain('is-danger')
    expect(items[0].classes()).not.toContain('is-danger')
  })

  it('點個人資料 → router.push(/me) 且 drawer 關閉', async () => {
    const w = mount(MeDrawer, { props: { modelValue: true }, global: { stubs } })
    await w.findAll('.md-item')[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/me')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0]).toBe(false)
  })

  it('點通知偏好 → router.push(/notifications/preferences)', async () => {
    const w = mount(MeDrawer, { props: { modelValue: true }, global: { stubs } })
    await w.findAll('.md-item')[1].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/notifications/preferences')
  })

  it('點加綁子女 → router.push(/bind-additional)', async () => {
    const w = mount(MeDrawer, { props: { modelValue: true }, global: { stubs } })
    await w.findAll('.md-item')[2].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/bind-additional')
  })

  it('點登出 → 顯示 ConfirmDialog 不直接跳轉', async () => {
    const w = mount(MeDrawer, { props: { modelValue: true }, global: { stubs } })
    await w.findAll('.md-item')[3].trigger('click')
    expect(pushMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
    expect(w.find('.confirm-stub').exists()).toBe(true)
  })

  it('backdrop 點擊 emit update:modelValue false', async () => {
    const w = mount(MeDrawer, { props: { modelValue: true }, global: { stubs } })
    await w.find('.me-drawer-backdrop').trigger('click')
    const emitted = w.emitted('update:modelValue')
    expect(emitted[emitted.length - 1][0]).toBe(false)
  })

  it('關閉按鈕 emit update:modelValue false', async () => {
    const w = mount(MeDrawer, { props: { modelValue: true }, global: { stubs } })
    await w.find('.md-close').trigger('click')
    const emitted = w.emitted('update:modelValue')
    expect(emitted[emitted.length - 1][0]).toBe(false)
  })

  it('header 顯示 userName 與 avatar initial（authStore 預設）', () => {
    const w = mount(MeDrawer, { props: { modelValue: true }, global: { stubs } })
    // authStore.user 預設 null → fallback '家長' + '家'
    expect(w.find('.md-user-name').text()).toBe('家長')
    expect(w.find('.md-avatar').text()).toBe('家')
  })
})
