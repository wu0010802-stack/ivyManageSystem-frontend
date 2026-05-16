import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AdminSidebar from '@/components/layout/AdminSidebar.vue'

vi.mock('@/utils/auth', () => ({
  PERMISSION_VALUES: {},
  getUserInfo: () => ({ permissions: 0xFFFFFFFF, name: 'admin' }),
}))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
})

// 讓 el-aside 傳遞 slot 內容（預設字串 stub 會吃掉 slot）
const ElAsidePassthrough = { template: '<div><slot /></div>' }

describe('AdminSidebar collapse-toggle a11y', () => {
  it('收合按鈕是 <button> 且有 aria-label', async () => {
    const wrapper = mount(AdminSidebar, {
      global: {
        plugins: [router],
        stubs: {
          'el-aside': ElAsidePassthrough,
          'el-menu': { template: '<div><slot /></div>' },
          'el-menu-item': { template: '<div><slot /><slot name="title" /></div>' },
          'el-sub-menu': { template: '<div><slot /><slot name="title" /></div>' },
          'el-icon': { template: '<span><slot /></span>' },
          'el-scrollbar': { template: '<div><slot /></div>' },
          'el-badge': { template: '<span><slot /></span>' },
          'router-link': { template: '<a><slot /></a>' },
        },
      },
      props: { isMobile: false },
    })
    await router.isReady()
    const toggle = wrapper.find('.collapse-toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.element.tagName).toBe('BUTTON')
    expect(toggle.attributes('type')).toBe('button')
    expect(toggle.attributes('aria-label')).toMatch(/收合|展開/)
  })
})
