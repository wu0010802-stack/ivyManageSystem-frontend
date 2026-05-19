import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecurrenceEditor from '../RecurrenceEditor.vue'

describe('RecurrenceEditor', () => {
  it('defaults to disabled, checkbox unchecked', () => {
    const w = mount(RecurrenceEditor, { props: { modelValue: null } })
    expect((w.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
  })

  it('emits weekly rule when user enables', async () => {
    const w = mount(RecurrenceEditor, { props: { modelValue: null } })
    await w.find('input[type="checkbox"]').setValue(true)
    expect(w.emitted('update:modelValue')).toBeTruthy()
    const lastEmit = w.emitted('update:modelValue')!.at(-1)![0] as any
    expect(lastEmit.type).toBe('weekly')
    expect(typeof lastEmit.weekday).toBe('number')
    expect(typeof lastEmit.until).toBe('string')
  })

  it('switches rule type emits correct shape', async () => {
    const w = mount(RecurrenceEditor, {
      props: { modelValue: { type: 'weekly', weekday: 1, until: '2026-12-29' } },
    })
    const radios = w.findAll('input[type="radio"]')
    // 第二個 radio = monthly_day
    await radios[1].setValue(true)
    const lastEmit = w.emitted('update:modelValue')!.at(-1)![0] as any
    expect(lastEmit.type).toBe('monthly_day')
    expect('day' in lastEmit).toBe(true)
  })

  it('emits null when user unchecks enabled', async () => {
    const w = mount(RecurrenceEditor, {
      props: { modelValue: { type: 'weekly', weekday: 1, until: '2026-12-29' } },
    })
    await w.find('input[type="checkbox"]').setValue(false)
    const lastEmit = w.emitted('update:modelValue')!.at(-1)![0]
    expect(lastEmit).toBe(null)
  })

  it('renders Chinese label for at least one weekday option', () => {
    const w = mount(RecurrenceEditor, {
      props: { modelValue: { type: 'weekly', weekday: 0, until: '2026-12-29' } },
    })
    const text = w.text()
    expect(text).toMatch(/[一二三四五六日]/)
  })
})
