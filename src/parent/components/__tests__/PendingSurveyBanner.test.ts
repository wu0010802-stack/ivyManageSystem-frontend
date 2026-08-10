import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PendingSurveyBanner from '@/parent/components/home/PendingSurveyBanner.vue'

// useRouter mock：捕獲 push 呼叫
const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

describe('PendingSurveyBanner', () => {
  it('count = 0 不渲染', () => {
    const w = mount(PendingSurveyBanner, { props: { count: 0 } })
    expect(w.find('.psb-banner').exists()).toBe(false)
  })

  it('count > 0 顯示「有 N 份活動調查待回覆」', () => {
    const w = mount(PendingSurveyBanner, { props: { count: 2 } })
    expect(w.find('.psb-banner').exists()).toBe(true)
    expect(w.text()).toContain('有 2 份活動調查待回覆')
  })

  it('點擊 banner 觸發 router.push(/surveys)', async () => {
    pushMock.mockClear()
    const w = mount(PendingSurveyBanner, { props: { count: 1 } })
    await w.find('.psb-banner').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/surveys')
  })

  it('button 元素 type=button 不會觸發 form submit', () => {
    const w = mount(PendingSurveyBanner, { props: { count: 1 } })
    expect(w.find('.psb-banner').attributes('type')).toBe('button')
  })
})
