import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import OverviewTab from '@/components/student/tabs/OverviewTab.vue'

describe('OverviewTab 入學學期', () => {
  it('顯示入學學期文字', () => {
    const wrapper = mount(OverviewTab, {
      attachTo: document.body,
      props: {
        profile: {
          lifecycle: {
            enrollment_date: '2025-09-01',
            enrollment_school_year: 114,
            enrollment_semester: 1,
          },
          basic: {},
        },
      },
      global: {
        plugins: [ElementPlus],
        stubs: { teleport: true },
      },
    })
    expect(wrapper.text()).toContain('入學學期')
    expect(wrapper.text()).toContain('114 上學期')
  })
})
