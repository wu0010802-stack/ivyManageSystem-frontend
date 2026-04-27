import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

describe('MobileErrorRetry', () => {
  it('error 為 null 時顯示 fallback', () => {
    const wrapper = mount(MobileErrorRetry, { props: { error: null } })
    expect(wrapper.text()).toContain('載入失敗，請稍後再試')
  })

  it('優先取 error.displayMessage', () => {
    const err = { displayMessage: '此公告不在可見範圍', message: 'fallback msg' }
    const wrapper = mount(MobileErrorRetry, { props: { error: err } })
    expect(wrapper.text()).toContain('此公告不在可見範圍')
    expect(wrapper.text()).not.toContain('fallback msg')
  })

  it('error 為字串時直接顯示', () => {
    const wrapper = mount(MobileErrorRetry, { props: { error: 'oops' } })
    expect(wrapper.text()).toContain('oops')
  })

  it('點擊重試 emit retry', async () => {
    const wrapper = mount(MobileErrorRetry, { props: { error: null } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
