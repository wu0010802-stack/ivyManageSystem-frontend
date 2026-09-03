import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'

const ElIcon = defineComponent({
  name: 'ElIcon',
  setup(_, { slots }) {
    return () => h('span', { class: 'el-icon' }, slots.default?.())
  },
})

const global = { components: { ElIcon } }

describe('PortalPageHeader', () => {
  it('標題固定渲染成 h1（每頁一個）', () => {
    const w = mount(PortalPageHeader, { props: { title: '每日聯絡簿' }, global })
    expect(w.find('h1').text()).toBe('每日聯絡簿')
    expect(w.find('.portal-page-header__subtitle').exists()).toBe(false)
    expect(w.find('[data-test="page-header-back"]').exists()).toBe(false)
  })

  it('subtitle 有值才渲染', () => {
    const w = mount(PortalPageHeader, { props: { title: '今日用藥', subtitle: '2026-09-03' }, global })
    expect(w.find('.portal-page-header__subtitle').text()).toBe('2026-09-03')
  })

  it('back-label 有值時渲染返回鈕並 emit back（不含 unicode 箭頭）', async () => {
    const w = mount(PortalPageHeader, { props: { title: 'X', backLabel: '返回今日工作台' }, global })
    const back = w.find('[data-test="page-header-back"]')
    expect(back.text()).toBe('返回今日工作台')
    expect(back.text()).not.toContain('←')
    await back.trigger('click')
    expect(w.emitted('back')).toHaveLength(1)
  })

  it('只給 back-label 不給 title：不渲染空的 h1', () => {
    const w = mount(PortalPageHeader, { props: { backLabel: '返回班級學生' }, global })
    expect(w.find('h1').exists()).toBe(false)
    expect(w.find('[data-test="page-header-back"]').exists()).toBe(true)
  })

  it('actions slot 渲染在動作區', () => {
    const w = mount(PortalPageHeader, {
      props: { title: 'X' },
      slots: { actions: '<button data-test="act">新增</button>' },
      global,
    })
    expect(w.find('.portal-page-header__actions [data-test="act"]').exists()).toBe(true)
  })
})
