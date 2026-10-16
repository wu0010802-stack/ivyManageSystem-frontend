import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormSectionNav from '@/components/common/FormSectionNav.vue'

const sections = [
  { key: 'core', title: '核心資料' },
  { key: 'parent', title: '家長資訊', errorCount: 0 },
  { key: 'gov', title: '政府申報資料', errorCount: 2 },
]

describe('FormSectionNav', () => {
  it('渲染全部區段為原生 button', () => {
    const wrapper = mount(FormSectionNav, { props: { sections } })
    const items = wrapper.findAll('.form-section-nav__item')
    expect(items).toHaveLength(3)
    items.forEach((b) => {
      expect(b.element.tagName).toBe('BUTTON')
      expect(b.attributes('type')).toBe('button')
    })
    expect(items[0].text()).toContain('核心資料')
  })

  it('errorCount>0 顯示紅色徽章，0/未提供不顯示', () => {
    const wrapper = mount(FormSectionNav, { props: { sections } })
    const items = wrapper.findAll('.form-section-nav__item')
    expect(items[0].find('.form-section-nav__badge').exists()).toBe(false)
    expect(items[1].find('.form-section-nav__badge').exists()).toBe(false)
    expect(items[2].find('.form-section-nav__badge').text()).toBe('2')
  })

  it('點擊 emit select(key)', async () => {
    const wrapper = mount(FormSectionNav, { props: { sections } })
    await wrapper.find('[data-nav-section="gov"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['gov']])
  })
})
