import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadingPanel from '@/components/common/LoadingPanel.vue'

describe('LoadingPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loading=false 且 empty=false 時顯示預設 slot', () => {
    const wrapper = mount(LoadingPanel, {
      props: { loading: false, empty: false },
      slots: { default: '<div class="content">data</div>' },
    })
    expect(wrapper.find('.content').exists()).toBe(true)
  })

  it('empty=true 時顯示 empty slot', () => {
    const wrapper = mount(LoadingPanel, {
      props: { loading: false, empty: true },
      slots: {
        default: '<div class="content">data</div>',
        empty: '<div class="empty-msg">no data</div>',
      },
    })
    expect(wrapper.find('.content').exists()).toBe(false)
    expect(wrapper.find('.empty-msg').exists()).toBe(true)
  })

  it('loading=true 超過 delay 後顯示 spinner', async () => {
    const wrapper = mount(LoadingPanel, {
      props: { loading: true, delay: 100, minShowMs: 0 },
      slots: { default: '<div class="content">data</div>' },
    })
    expect(wrapper.find('.loading-panel-spinner').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(100)
    expect(wrapper.find('.loading-panel-spinner').exists()).toBe(true)
  })

  it('variant=skeleton 時顯示 skeleton slot', async () => {
    const wrapper = mount(LoadingPanel, {
      props: { loading: true, variant: 'skeleton', delay: 0, minShowMs: 0 },
      slots: {
        default: '<div class="content">x</div>',
        skeleton: '<div class="skel">bones</div>',
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.find('.skel').exists()).toBe(true)
    expect(wrapper.find('.content').exists()).toBe(false)
  })

  it('loading 轉 false 若未達 minShowMs 會延遲才切換', async () => {
    const wrapper = mount(LoadingPanel, {
      props: { loading: true, delay: 0, minShowMs: 300 },
      slots: { default: '<div class="content">data</div>' },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.find('.loading-panel-spinner').exists()).toBe(true)

    await wrapper.setProps({ loading: false })
    await vi.advanceTimersByTimeAsync(100)
    expect(wrapper.find('.loading-panel-spinner').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(300)
    expect(wrapper.find('.loading-panel-spinner').exists()).toBe(false)
    expect(wrapper.find('.content').exists()).toBe(true)
  })
})
