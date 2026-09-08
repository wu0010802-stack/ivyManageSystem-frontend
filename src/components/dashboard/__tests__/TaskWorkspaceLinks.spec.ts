import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import TaskWorkspaceLinks from '../TaskWorkspaceLinks.vue'
import { hasPermission } from '@/utils/auth'

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => false) }))
const render = () => mount(TaskWorkspaceLinks, { global: { stubs: { RouterLink: RouterLinkStub } } })

describe('跨模組待辦入口', () => {
  it('無權限時不顯示任何入口', () => {
    vi.mocked(hasPermission).mockReturnValue(false)
    expect(render().find('section').exists()).toBe(false)
  })
  it('只持學費權限時只顯示學費入口，不將未查詢的數量當零', () => {
    vi.mocked(hasPermission).mockImplementation(code => code === 'FEES_READ')
    const wrapper = render()
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(1)
    expect(links[0].props('to')).toBe('/fees')
    expect(wrapper.text()).toContain('不納入人事與出勤摘要筆數')
  })
})
