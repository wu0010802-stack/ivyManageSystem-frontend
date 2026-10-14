import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  // D-25（2026-10-14）：假別由 radio 改為分段按鈕（button + aria-pressed），
  // 手機上整格都是點擊區，且與其他家長端頁的分段選擇一致。
  describe('假別分段按鈕', () => {
    const segment = (wrapper, label) =>
      wrapper.findAll('.m3-segment').find((b) => b.text().includes(label))

    it('以兩顆 button 呈現「病假」「事假」，不再有 radio input', () => {
      const wrapper = mount(LeaveForm, {
        props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
      })
      expect(wrapper.find('input[type="radio"]').exists()).toBe(false)
      const labels = wrapper.findAll('.m3-segment').map((b) => b.text().replace('check', '').trim())
      expect(labels).toEqual(['病假', '事假'])
    })

    it('目前假別的按鈕 aria-pressed=true，另一顆為 false', () => {
      const wrapper = mount(LeaveForm, {
        props: { modelValue: { ...baseForm, leave_type: '事假' }, children, pastLimit: '', futureLimit: '' },
      })
      expect(segment(wrapper, '事假').attributes('aria-pressed')).toBe('true')
      expect(segment(wrapper, '病假').attributes('aria-pressed')).toBe('false')
    })

    it('點「事假」emit update:modelValue，leave_type 為原值「事假」其餘欄位不變', async () => {
      const wrapper = mount(LeaveForm, {
        props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
      })
      await segment(wrapper, '事假').trigger('click')
      expect(wrapper.emitted('update:modelValue')[0][0]).toEqual({ ...baseForm, leave_type: '事假' })
    })

    it('legend「假別」仍在，分段按鈕群組有可讀名稱', () => {
      const wrapper = mount(LeaveForm, {
        props: { modelValue: baseForm, children, pastLimit: '', futureLimit: '' },
      })
      expect(wrapper.find('legend').text()).toBe('假別')
      expect(wrapper.find('.m3-segmented-button').attributes('aria-label')).toBe('假別')
    })
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

  it('單孩時雖不顯示學生欄，任何欄位更新 emit 的物件仍帶 student_id', async () => {
    const wrapper = mount(LeaveForm, {
      props: { modelValue: baseForm, children: [children[0]], pastLimit: '', futureLimit: '' },
    })
    await wrapper.find('#leave-reason').setValue('感冒')
    expect(wrapper.emitted('update:modelValue')[0][0].student_id).toBe(10)
  })

  it('底部「取消」「送出」兩鈕觸控高度至少 44px（走 --touch-target-min token）', () => {
    const sfc = readFileSync(resolve(__dirname, '../../../../../src/parent/components/leaves/LeaveForm.vue'), 'utf-8')
    for (const cls of ['primary-btn', 'secondary-btn']) {
      const rule = sfc.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? ''
      expect(rule, cls).toMatch(/min-height:\s*var\(--touch-target-min,\s*44px\)/)
    }
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
