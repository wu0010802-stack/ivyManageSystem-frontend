import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ScheduleSwapDialog from '@/views/portal/components/schedule/ScheduleSwapDialog.vue'

const CANDIDATES = [
  { employee_id: 5, name: '王老師', shift_name: '早班', work_start: '08:00', work_end: '16:00', has_pending_swap: false },
  { employee_id: 6, name: '李老師', shift_name: '正班', work_start: null, work_end: null, has_pending_swap: true },
]

const STUBS = {
  TeacherBottomSheet: {
    template: '<div data-test="sheet" :data-visible="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'snapPoints', 'defaultSnap'],
    emits: ['update:modelValue'],
  },
  ElDialog: {
    template: '<div data-test="dialog" :data-visible="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['update:modelValue'],
  },
  ElForm: { template: '<form><slot /></form>', props: ['labelWidth'] },
  ElFormItem: { template: '<div><slot /></div>', props: ['label'] },
  ElDatePicker: {
    template: '<input data-test="date-picker" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value); $emit(\'change\', $event.target.value)" />',
    props: ['modelValue', 'type', 'placeholder', 'valueFormat', 'disabledDate'],
    emits: ['update:modelValue', 'change'],
  },
  ElSelect: {
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', parseInt($event.target.value) || $event.target.value)"><slot /></select>',
    props: ['modelValue', 'placeholder', 'loading', 'disabled'],
    emits: ['update:modelValue'],
  },
  ElOption: {
    template: '<option :value="value" :disabled="disabled">{{ label }}</option>',
    props: ['value', 'label', 'disabled'],
  },
  ElInput: {
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'type', 'rows', 'placeholder'],
    emits: ['update:modelValue'],
  },
  // data-test 由元件端傳入（fallthrough attrs），title 以文字輸出供斷言
  ElAlert: {
    template: '<div>{{ title }}<slot /></div>',
    props: ['type', 'closable', 'showIcon', 'title'],
  },
  ElButton: {
    template: '<button :disabled="disabled" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>',
    props: ['disabled', 'loading', 'type', 'size'],
    emits: ['click'],
  },
}

describe('ScheduleSwapDialog', () => {
  it('renders TeacherBottomSheet on mobile', () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: true,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="sheet"]').exists()).toBe(true)
    expect(w.find('[data-test="dialog"]').exists()).toBe(false)
  })

  it('renders el-dialog on desktop', () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="dialog"]').exists()).toBe(true)
    expect(w.find('[data-test="sheet"]').exists()).toBe(false)
  })

  it('initialises form.date from initialDate prop when opened', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    await w.vm.$nextTick()
    const datePicker = w.find('[data-test="date-picker"]')
    expect(datePicker.element.value).toBe('2026-05-10')
  })

  it('submit button is disabled when no candidate selected', () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出'))
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })

  it('emits submit with correct payload when candidate selected and submit clicked', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    await w.vm.$nextTick()
    // Directly update form.target_id on the component instance
    w.vm.form.target_id = 5
    await w.vm.$nextTick()
    // Now submit should be enabled
    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出'))
    expect(submitBtn).toBeDefined()
    await submitBtn.trigger('click')
    expect(w.emitted('submit')).toHaveLength(1)
    expect(w.emitted('submit')[0][0]).toEqual({
      swap_date: '2026-05-10',
      target_id: 5,
      reason: '',
    })
  })

  it('emits update:modelValue false when cancel clicked', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    const cancelBtn = w.findAll('button').find((b) => b.text() === '取消')
    await cancelBtn.trigger('click')
    expect(w.emitted('update:modelValue')).toBeDefined()
    expect(w.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('emits date-change when date picker changes', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '',
        candidates: [],
        loading: false,
      },
      global: { stubs: STUBS },
    })
    // Directly call the onDateChange method exposed on the component instance
    w.vm.onDateChange('2026-05-20')
    await w.vm.$nextTick()
    expect(w.emitted('date-change')).toBeDefined()
    expect(w.emitted('date-change')[0]).toEqual(['2026-05-20'])
  })

  it('resets form when dialog reopens', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: false,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    // Select a candidate first (form won't show since modelValue=false, but we can set props)
    // Open dialog
    await w.setProps({ modelValue: true })
    // date should be reset to initialDate
    const datePicker = w.find('[data-test="date-picker"]')
    expect(datePicker.element.value).toBe('2026-05-10')
    // Submit should still be disabled (no target_id)
    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出'))
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })

  it('does not emit submit when date is empty', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    await w.vm.$nextTick()
    // Set candidate only, no date
    w.vm.form.target_id = 5
    // Explicitly ensure date remains empty
    w.vm.form.date = ''
    await w.vm.$nextTick()
    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出'))
    // disabled because date is empty
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })

  it('候選有 duty_label 時選項文字改用它，時段相同者加註提示（SPEC-026 T5）', () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        loading: false,
        candidates: [
          { employee_id: 7, name: '陳老師', shift_name: '早車', work_start: '07:00', work_end: '16:30', duty_label: '早車 07:00~16:30', same_time: true, has_pending_swap: false },
          { employee_id: 8, name: '林老師', shift_name: '次值', work_start: '08:30', work_end: '18:00', duty_label: '次值 08:30~18:00', same_time: false, has_pending_swap: false },
        ],
      },
      global: { stubs: STUBS },
    })
    const labels = w.findAll('option').map((o) => o.text())
    // 順序由 mergeRosterIntoCandidates 決定，對話框照給的順序畫
    expect(labels).toEqual([
      '陳老師 (早車 07:00~16:30)（時段相同，不用登記）',
      '林老師 (次值 08:30~18:00)',
    ])
  })

  it('沒有 duty_label 時維持原本的選項文字（day-roster 載入失敗的降級）', () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    const labels = w.findAll('option').map((o) => o.text())
    expect(labels).toEqual(['王老師 (早班 08:00~16:00)', '李老師 (正班)'])
  })

  it('對方當天沒有排定班別（unavailable_reason）→ 選項停用並顯示原因', () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        loading: false,
        candidates: [
          { employee_id: 7, name: '陳老師', shift_name: '未排班', duty_label: '個人工時 09:00~18:00', unavailable_reason: '對方當天沒有排定班別，無法換班', has_pending_swap: false },
          { employee_id: 8, name: '林老師', shift_name: '次值', duty_label: '次值 08:30~18:00', has_pending_swap: false },
        ],
      },
      global: { stubs: STUBS },
    })
    const options = w.findAll('option')
    expect(options.map((o) => o.text())).toEqual([
      '陳老師 (個人工時 09:00~18:00)（對方當天沒有排定班別，無法換班）',
      '林老師 (次值 08:30~18:00)',
    ])
    expect(options[0].attributes('disabled')).toBeDefined()
    expect(options[1].attributes('disabled')).toBeUndefined()
  })

  it('已選的對象事後才被標為不可選（day-roster 較晚回來）→ 送出鈕停用且不 emit', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        loading: false,
        candidates: [{ employee_id: 7, name: '陳老師', shift_name: '未排班', has_pending_swap: false }],
      },
      global: { stubs: STUBS },
    })
    await w.vm.$nextTick()
    w.vm.form.target_id = 7
    await w.vm.$nextTick()
    const submitBtn = () => w.findAll('button').find((b) => b.text().includes('送出'))
    expect(submitBtn().attributes('disabled')).toBeUndefined()

    await w.setProps({
      candidates: [{ employee_id: 7, name: '陳老師', shift_name: '未排班', duty_label: '個人工時 09:00~18:00', unavailable_reason: '對方當天沒有排定班別，無法換班', has_pending_swap: false }],
    })
    expect(submitBtn().attributes('disabled')).toBeDefined()
    w.vm.submit()
    expect(w.emitted('submit')).toBeUndefined()
  })
})

describe('ScheduleSwapDialog 補登模式（SPEC-026 3-3 T5）', () => {
  const BACKDATE_HINT = '過去日期會送出「補登」：對方同意後由行政套用'
  const EMPTY_HINT = '這一天沒有輪值名單內的同事，無法補登；請洽行政'
  const mountDialog = (props, isMobile = false) =>
    mount(ScheduleSwapDialog, {
      props: { modelValue: true, isMobile, loading: false, ...props },
      global: { stubs: STUBS },
    })

  it('日期選擇器不再停用過去日期', () => {
    const w = mountDialog({ initialDate: '2020-01-06', candidates: CANDIDATES })
    const disabledDate = w.findComponent('[data-test="date-picker"]').props('disabledDate')
    // 不傳 disabled-date 或一律回 false 都算開放；真正的上限留給後端封存守衛
    expect(disabledDate === undefined || disabledDate(new Date('2020-01-06')) === false).toBe(true)
  })

  it.each([
    ['桌面', false],
    ['手機', true],
  ])('選過去日期：顯示補登提示（%s）', (_name, isMobile) => {
    const w = mountDialog({ initialDate: '2020-01-06', candidates: CANDIDATES }, isMobile)
    expect(w.find('[data-test="backdate-alert"]').text()).toContain(BACKDATE_HINT)
  })

  it('選未來日期：不顯示補登提示', () => {
    const w = mountDialog({ initialDate: '2099-01-05', candidates: CANDIDATES })
    expect(w.find('[data-test="backdate-alert"]').exists()).toBe(false)
  })

  it('尚未選日期：不顯示補登提示', () => {
    const w = mountDialog({ initialDate: '', candidates: [] })
    expect(w.find('[data-test="backdate-alert"]').exists()).toBe(false)
    expect(w.text()).not.toContain(EMPTY_HINT)
  })

  it('過去日期且候選為空：說明沒有輪值名單內的同事', () => {
    const w = mountDialog({ initialDate: '2020-01-06', candidates: [] })
    expect(w.text()).toContain(EMPTY_HINT)
  })

  it('過去日期但候選還在載入：先不下結論（不顯示空名單文案）', () => {
    const w = mountDialog({ initialDate: '2020-01-06', candidates: [], candidatesLoading: true })
    expect(w.text()).not.toContain(EMPTY_HINT)
  })

  it('未來日期候選為空：不顯示補登專用的空名單文案', () => {
    const w = mountDialog({ initialDate: '2099-01-05', candidates: [] })
    expect(w.text()).not.toContain(EMPTY_HINT)
  })

  it('過去日期仍可正常送出（payload 不變，是否補登由後端決定）', async () => {
    const w = mountDialog({ initialDate: '2020-01-06', candidates: CANDIDATES })
    await w.vm.$nextTick()
    w.vm.form.target_id = 5
    await w.vm.$nextTick()
    await w.findAll('button').find((b) => b.text().includes('送出')).trigger('click')
    expect(w.emitted('submit')[0][0]).toEqual({ swap_date: '2020-01-06', target_id: 5, reason: '' })
  })
})
