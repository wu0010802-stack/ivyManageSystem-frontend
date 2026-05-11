import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecruitmentAreaTab from '@/components/recruitment/RecruitmentAreaTab.vue'

describe('RecruitmentAreaTab a11y', () => {
  it('清除過濾按鈕是 <button> 且有 aria-label', async () => {
    const wrapper = mount(RecruitmentAreaTab, {
      props: {
        selectedDistrict: '中山區',
        districts: [],
        campus: {},
        marketSnapshot: {},
        hotspotsSummary: {},
        fmtPct: (v) => v + '%',
      },
      global: { stubs: ['el-icon', 'RecruitmentAddressHeatmap', 'IvyCampusCompetition'] },
    })
    const clearBtn = wrapper.find('.district-filter-clear')
    expect(clearBtn.exists()).toBe(true)
    expect(clearBtn.element.tagName).toBe('BUTTON')
    expect(clearBtn.attributes('type')).toBe('button')
    expect(clearBtn.attributes('aria-label')).toBeTruthy()
    await clearBtn.trigger('click')
    expect(wrapper.emitted('update:selectedDistrict')?.[0]).toEqual([''])
  })
})
