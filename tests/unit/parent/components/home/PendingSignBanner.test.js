import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PendingSignBanner from '@/parent/components/home/PendingSignBanner.vue'

// useRouter mock：捕獲 push 呼叫
const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

describe('PendingSignBanner', () => {
  it('count = 0 不渲染', () => {
    const w = mount(PendingSignBanner, { props: { count: 0 } })
    expect(w.find('.pending-sign-banner').exists()).toBe(false)
  })

  it('count > 0 顯示「待簽 N 件」', () => {
    const w = mount(PendingSignBanner, { props: { count: 3 } })
    expect(w.find('.pending-sign-banner').exists()).toBe(true)
    expect(w.text()).toContain('待簽 3 件')
  })

  it('count = 1 渲染（單筆也要提醒）', () => {
    const w = mount(PendingSignBanner, { props: { count: 1 } })
    expect(w.find('.pending-sign-banner').exists()).toBe(true)
    expect(w.text()).toContain('待簽 1 件')
  })

  it('副標固定為「需家長簽收的通知」', () => {
    const w = mount(PendingSignBanner, { props: { count: 5 } })
    expect(w.text()).toContain('需家長簽收的通知')
  })

  it('aria-label 完整描述 count 與動作', () => {
    const w = mount(PendingSignBanner, { props: { count: 2 } })
    expect(w.find('.pending-sign-banner').attributes('aria-label')).toBe('待簽 2 件，點擊前往簽收')
  })

  it('點擊 banner 觸發 router.push(/events)', async () => {
    pushMock.mockClear()
    const w = mount(PendingSignBanner, { props: { count: 1 } })
    await w.find('.pending-sign-banner').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/events')
  })

  it('button 元素 type=button 不會觸發 form submit', () => {
    const w = mount(PendingSignBanner, { props: { count: 1 } })
    expect(w.find('.pending-sign-banner').attributes('type')).toBe('button')
  })
})
