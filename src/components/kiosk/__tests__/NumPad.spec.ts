import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NumPad from '../NumPad.vue'

describe('NumPad', () => {
  it('點數字鍵會 append 到 modelValue', async () => {
    const wrapper = mount(NumPad, {
      props: { modelValue: '', maxlength: 6 },
    })
    // 找按鈕文字為 '1' 的按鈕並點擊
    const btn = wrapper.findAll('button').find((b) => b.text().trim() === '1')
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual(['1'])
  })

  it('達 maxlength 後點數字鍵不再 append', async () => {
    const wrapper = mount(NumPad, {
      props: { modelValue: '123456', maxlength: 6 },
    })
    const btn = wrapper.findAll('button').find((b) => b.text().trim() === '7')
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    // 不應有 update:modelValue 事件
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })

  it('點確認鍵 emit submit', async () => {
    const wrapper = mount(NumPad, {
      props: { modelValue: '123456', maxlength: 6 },
    })
    // 找確認按鈕（文字含「確認」）
    const btn = wrapper.findAll('button').find((b) => b.text().includes('確認'))
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
  })
})
