import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TodayTimeline from '@/parent/components/home-timeline/TodayTimeline.vue'

const stubs = { ParentIcon: true, CrownIcon: true }

function makeEvent(over = {}) {
  return {
    id: 'e1',
    bucket: 'morning',
    variant: 'past',
    time: null,
    primary: '小明 已入園',
    secondary: '大象班',
    tone: 'success',
    path: '/attendance',
    ...over,
  }
}

describe('TodayTimeline', () => {
  it('buckets 為空 → 顯示 empty 文案', () => {
    const wrapper = mount(TodayTimeline, { props: { buckets: [] }, global: { stubs } })
    expect(wrapper.find('.timeline').exists()).toBe(false)
    expect(wrapper.text()).toContain('今天目前沒有需要處理的事項')
  })

  it('渲染所有 bucket 與 label', () => {
    const wrapper = mount(TodayTimeline, {
      props: {
        buckets: [
          { key: 'morning', label: '早上', items: [makeEvent()] },
          { key: 'later', label: '晚一些', items: [makeEvent({ id: 'fees', primary: '待繳費' })] },
        ],
      },
      global: { stubs },
    })
    const labels = wrapper.findAll('.bucket-label').map((n) => n.text())
    expect(labels).toEqual(['早上', '晚一些'])
  })

  it('點擊 row → emit navigate(path)', async () => {
    const wrapper = mount(TodayTimeline, {
      props: {
        buckets: [
          { key: 'later', label: '晚一些', items: [makeEvent({ id: 'fees', path: '/fees' })] },
        ],
      },
      global: { stubs },
    })
    await wrapper.find('.entry').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['/fees'])
  })

  it('item 無 path → entry disabled，不 emit', async () => {
    const wrapper = mount(TodayTimeline, {
      props: {
        buckets: [
          { key: 'morning', label: '早上', items: [makeEvent({ path: null })] },
        ],
      },
      global: { stubs },
    })
    const btn = wrapper.find('.entry')
    expect(btn.attributes('disabled')).toBeDefined()
  })
})
