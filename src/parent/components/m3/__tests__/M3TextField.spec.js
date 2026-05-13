import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3TextField from '../M3TextField.vue'

describe('M3TextField', () => {
  it('render input 元素', () => {
    const w = mount(M3TextField, { props: { modelValue: '' } })
    expect(w.find('input').exists()).toBe(true)
    expect(w.classes()).toContain('m3-text-field')
  })

  it('預設 variant = filled', () => {
    const w = mount(M3TextField, { props: { modelValue: '' } })
    expect(w.classes()).toContain('m3-text-field-filled')
  })

  it.each(['filled', 'outlined'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3TextField, { props: { modelValue: '', variant } })
      expect(w.classes()).toContain(`m3-text-field-${variant}`)
    },
  )

  it('label 渲染為浮動 label', () => {
    const w = mount(M3TextField, { props: { modelValue: '', label: '姓名' } })
    const label = w.find('.m3-text-field-label')
    expect(label.exists()).toBe(true)
    expect(label.text()).toBe('姓名')
  })

  it('輸入觸發 update:modelValue', async () => {
    const w = mount(M3TextField, { props: { modelValue: '' } })
    await w.find('input').setValue('hi')
    expect(w.emitted('update:modelValue')).toEqual([['hi']])
  })

  it('placeholder 透傳到 input', () => {
    const w = mount(M3TextField, {
      props: { modelValue: '', placeholder: '請輸入' },
    })
    expect(w.find('input').attributes('placeholder')).toBe('請輸入')
  })

  it('supportingText 顯示', () => {
    const w = mount(M3TextField, {
      props: { modelValue: '', supportingText: '8 字以內' },
    })
    expect(w.find('.m3-text-field-supporting').text()).toBe('8 字以內')
  })

  it('error=true 套 is-error class + errorText 取代 supportingText', () => {
    const w = mount(M3TextField, {
      props: {
        modelValue: '',
        error: true,
        supportingText: '提示',
        errorText: '必填',
      },
    })
    expect(w.classes()).toContain('is-error')
    expect(w.find('.m3-text-field-supporting').text()).toBe('必填')
  })

  it('disabled 透傳到 input', () => {
    const w = mount(M3TextField, { props: { modelValue: '', disabled: true } })
    expect(w.find('input').attributes('disabled')).toBeDefined()
    expect(w.classes()).toContain('is-disabled')
  })

  it('type prop 透傳（如 email/password）', () => {
    const w = mount(M3TextField, {
      props: { modelValue: '', type: 'email' },
    })
    expect(w.find('input').attributes('type')).toBe('email')
  })
})
