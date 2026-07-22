import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TargetCrossRef from '../components/TargetCrossRef.vue'

describe('TargetCrossRef', () => {
  it('三值不一致時顯示對照警示', () => {
    const w = mount(TargetCrossRef, { props: { cycleTarget: 160, orgSettingTarget: 158, actual: 152 } })
    expect(w.text()).toContain('160')
    expect(w.text()).toContain('158')
    expect(w.find('[data-test="target-mismatch"]').exists()).toBe(true)
  })
  it('一致時不警示', () => {
    const w = mount(TargetCrossRef, { props: { cycleTarget: 160, orgSettingTarget: 160, actual: 160 } })
    expect(w.find('[data-test="target-mismatch"]').exists()).toBe(false)
  })
  it('null 值容忍：全 null 不炸也不警示', () => {
    const w = mount(TargetCrossRef, { props: { cycleTarget: null, orgSettingTarget: null, actual: null } })
    expect(w.find('[data-test="target-mismatch"]').exists()).toBe(false)
    expect(w.text()).toContain('—')
  })
  it('只有一個來源有值時不警示（無從比較）', () => {
    const w = mount(TargetCrossRef, { props: { cycleTarget: 160, orgSettingTarget: null, actual: null } })
    expect(w.find('[data-test="target-mismatch"]').exists()).toBe(false)
  })
})
