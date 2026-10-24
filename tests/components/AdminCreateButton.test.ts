import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AdminCreateButton from '@/components/common/AdminCreateButton.vue'

const global = { plugins: [ElementPlus] }

describe('AdminCreateButton', () => {
  it('渲染 primary 按鈕與 slot 文案', () => {
    const wrapper = mount(AdminCreateButton, {
      global,
      slots: { default: '新增班級' },
    })
    const btn = wrapper.find('button')
    expect(btn.classes()).toContain('el-button--primary')
    expect(btn.text()).toContain('新增班級')
  })

  it('帶 Plus icon（EP icon 元件，非文字「＋」）', () => {
    const wrapper = mount(AdminCreateButton, {
      global,
      slots: { default: '新增員工' },
    })
    expect(wrapper.find('.el-icon').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('＋')
  })

  it('點擊 emit click', async () => {
    const wrapper = mount(AdminCreateButton, {
      global,
      slots: { default: '新增公告' },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('disabled 時不 emit click', async () => {
    const wrapper = mount(AdminCreateButton, {
      global,
      props: { disabled: true },
      slots: { default: '新增公告' },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('loading 時顯示 loading 狀態', () => {
    const wrapper = mount(AdminCreateButton, {
      global,
      props: { loading: true },
      slots: { default: '新增公告' },
    })
    expect(wrapper.find('button').classes()).toContain('is-loading')
  })
})
