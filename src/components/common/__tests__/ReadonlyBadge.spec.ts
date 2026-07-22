import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReadonlyBadge from '../ReadonlyBadge.vue'

describe('ReadonlyBadge', () => {
  it('show=true 顯示唯讀徽章與權限名', () => {
    const w = mount(ReadonlyBadge, { props: { permissionLabel: '考核規則設定', show: true } })
    expect(w.text()).toContain('唯讀')
    expect(w.text()).toContain('考核規則設定')
  })
  it('show=false 不 render', () => {
    const w = mount(ReadonlyBadge, { props: { permissionLabel: '考核規則設定', show: false } })
    expect(w.find('.el-tag').exists()).toBe(false)
  })
})
