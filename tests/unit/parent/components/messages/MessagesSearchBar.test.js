import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MessagesSearchBar from '@/parent/components/messages/MessagesSearchBar.vue'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

describe('MessagesSearchBar', () => {
  it('渲染搜尋 button + placeholder + search icon', () => {
    const w = mount(MessagesSearchBar)
    expect(w.find('.messages-search-bar').exists()).toBe(true)
    expect(w.text()).toContain('搜尋訊息、公告或問小幫手')
    expect(w.find('.msb-icon').text()).toBe('search')
  })

  it('aria-label 明示動作', () => {
    const w = mount(MessagesSearchBar)
    expect(w.find('.messages-search-bar').attributes('aria-label')).toBe('開啟搜尋與小幫手')
  })

  it('click 觸發 router.push(/assistant)', async () => {
    pushMock.mockClear()
    const w = mount(MessagesSearchBar)
    await w.find('.messages-search-bar').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/assistant')
  })

  it('button type=button 不會觸發 form submit', () => {
    const w = mount(MessagesSearchBar)
    expect(w.find('.messages-search-bar').attributes('type')).toBe('button')
  })
})
