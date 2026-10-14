import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveForm from '@/parent/components/leaves/LeaveForm.vue'

const baseForm = {
  student_id: 10,
  leave_type: '病假',
  start_date: '2026-05-10',
  end_date: '2026-05-10',
  reason: '',
}
const children = [
  { student_id: 10, name: '王小明' },
  { student_id: 11, name: '王小華' },
]

describe('LeaveForm', () => {
  it('渲染學生選項與當前選擇', () => {
    const wrapper = mount(LeaveForm, {
      props: {
        modelValue: baseForm,
        children,
        pastLimit: '2025-01-01',
        futureLimit: '2027-01-01',
      },
    })
    const select = wrapper.find('#leave-student')
    expect(select.element.value).toBe('10')
    expect(wrapper.findAll('option').length).toBe(2)
    expect(wrapper.text()).toContain('王小明')
  })

  it('改學生 emit update:modelValue 帶新值', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    const select = wrapper.find('#leave-student')
    await select.setValue('11')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toEqual({ ...baseForm, student_id: 11 })
  })

  it('改假別 emit update:modelValue 帶新值', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    const radio = wrapper.find('input[type="radio"][value="事假"]')
    await radio.setValue()
    expect(wrapper.emitted('update:modelValue')[0][0].leave_type).toBe('事假')
  })

  it('改 textarea 原因 emit update:modelValue', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    await wrapper.find('#leave-reason').setValue('感冒')
    expect(wrapper.emitted('update:modelValue')[0][0].reason).toBe('感冒')
  })

  it('送出按鈕 click emit submit', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    await wrapper.find('.primary-btn').trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
  })

  it('取消按鈕 click emit cancel', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    await wrapper.find('.secondary-btn').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('submitting=true 時 primary-btn disabled + 顯示「送出中」', () => {
    const wrapper = mount(LeaveForm, {
      props: {
        modelValue: baseForm,
        children,
        pastLimit: '',
        futureLimit: '',
        submitting: true,
      },
    })
    const btn = wrapper.find('.primary-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toContain('送出中')
  })

  it('只有一個孩子時不顯示學生下拉，直接寫出孩子名字', () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children: [children[0]], pastLimit: '', futureLimit: '' },
    })
    expect(wrapper.find('#leave-student').exists()).toBe(false)
    expect(wrapper.find('[data-testid="leave-single-child"]').text()).toContain('王小明')
  })

  it('起始日改到晚於結束日 → 結束日自動對齊（同一次 emit）', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
    })
    await wrapper.find('#leave-start').setValue('2026-05-12')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted[0][0]).toEqual({ ...baseForm, start_date: '2026-05-12', end_date: '2026-05-12' })
  })

  it('起始日仍早於結束日 → 結束日不動', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: { ...baseForm, end_date: '2026-05-20' }, children, pastLimit: '', futureLimit: '' },
    })
    await wrapper.find('#leave-start').setValue('2026-05-12')
    expect(wrapper.emitted('update:modelValue')[0][0].end_date).toBe('2026-05-20')
  })

  describe('今天／明天快捷', () => {
    afterEach(() => vi.useRealTimers())

    it('一鍵把起訖日都設成今天或明天', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 14, 7, 30))
      const wrapper = mount(LeaveForm, {
        props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
      })
      const btn = (label) => wrapper.findAll('.quick-day').find((b) => b.text() === label)
      await btn('今天').trigger('click')
      await btn('明天').trigger('click')
      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted[0][0]).toMatchObject({ start_date: '2026-10-14', end_date: '2026-10-14' })
      expect(emitted[1][0]).toMatchObject({ start_date: '2026-10-15', end_date: '2026-10-15' })
    })
  })
})
