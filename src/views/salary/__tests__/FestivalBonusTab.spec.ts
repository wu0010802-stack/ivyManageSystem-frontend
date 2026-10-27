import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, inject, provide, reactive } from 'vue'
import FestivalBonusTab from '@/views/salary/components/FestivalBonusTab.vue'

/**
 * 節慶獎金基數 A 級／B 級拆分（後端 migration festab01，2026-08-28）。
 *
 * 拆分前班導師/副班導兩張卡各只有「A/B 級」與「C 級」兩格，兩級共用後端
 * head_teacher_ab / assistant_teacher_ab 一欄——業主無法對幼兒園教師（A 級）
 * 與教保員（B 級）給不同基數。本檔鎖住「六格、各自綁定各自欄位」的新契約。
 */

const InputNumberStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input class="num" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
}

const STUBS = {
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-card': { props: ['header'], template: '<section><slot name="header" /><slot /></section>' },
  'el-form-item': {
    props: ['label'],
    template: '<label :data-label="label"><slot name="label" /><slot /></label>',
  },
  'el-divider': { template: '<hr />' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-select': { props: ['modelValue'], template: '<select><slot /></select>' },
  'el-option': { template: '<option><slot /></option>' },
  // 年級目標表不渲染 slot：el-table-column 的 #default="scope" 沒有 el-table
  // 提供的 row 就會 undefined，與本檔要驗的教師基數欄位無關。
  'el-table': { template: '<table />' },
  'el-table-column': { template: '<td />' },
  'el-input-number': InputNumberStub,
}

const makeConfig = () =>
  reactive({
    head_teacher_a: 2200,
    head_teacher_b: 2000,
    head_teacher_c: 1500,
    assistant_teacher_a: 1400,
    assistant_teacher_b: 1200,
    assistant_teacher_c: 1100,
    principal_festival: 6500,
    director_festival: 3500,
    leader_festival: 2000,
    principal_dividend: 5000,
    director_dividend: 4000,
    leader_dividend: 3000,
    vice_leader_dividend: 1500,
    school_wide_target: 160,
    enrollment_count_mode: 'month_end',
    driver_festival: 1000,
    designer_festival: 1000,
    admin_festival: 2000,
    meeting_default_hours: 2,
    meeting_absence_penalty: 100,
    art_teacher_festival: 2000,
    warning_deduction: 1000 as number | null,
    minor_offense_deduction: 3000 as number | null,
    major_offense_deduction: 0 as number | null,
    festival_leader_class_ratio: null as boolean | null,
    festival_unassigned_teacher_school_ratio: null as boolean | null,
    festival_new_class_guarantee: null as boolean | null,
    festival_shared_assistant_simple_avg: null as boolean | null,
    excess_exclude_long_leave: null as boolean | null,
    festival_suspension_rule: null as boolean | null,
    festival_c_grade_promotion: null as boolean | null,
  })

const mountTab = (bonusConfig: ReturnType<typeof makeConfig>) =>
  mount(FestivalBonusTab, {
    props: { bonusConfig, gradeTargets: [] },
    global: { stubs: STUBS },
  })

describe('FestivalBonusTab 教師節慶獎金基數', () => {
  it('班導師與副班導各有 A/B/C 三格，依序綁定各自欄位', () => {
    const wrapper = mountTab(makeConfig())
    const teacherFields = wrapper
      .findAll('label')
      .slice(0, 6)
      .map((el) => [el.attributes('data-label'), (el.find('input.num').element as HTMLInputElement).value])

    expect(teacherFields).toEqual([
      ['A 級', '2200'],
      ['B 級', '2000'],
      ['C 級', '1500'],
      ['A 級', '1400'],
      ['B 級', '1200'],
      ['C 級', '1100'],
    ])
  })

  it('改 A 級不會連動 B 級（拆分前兩級共用一欄，改一格兩級一起變）', async () => {
    const bonusConfig = makeConfig()
    const wrapper = mountTab(bonusConfig)
    const inputs = wrapper.findAll('input.num')

    await inputs[0].setValue('2500')
    expect(bonusConfig.head_teacher_a).toBe(2500)
    expect(bonusConfig.head_teacher_b).toBe(2000)

    await inputs[3].setValue('1450')
    expect(bonusConfig.assistant_teacher_a).toBe(1450)
    expect(bonusConfig.assistant_teacher_b).toBe(1200)
  })
})

describe('FestivalBonusTab 懲處預設扣款（義華 Q13）', () => {
  it('警告／小過／大過三格依序綁定各自欄位，可改值', async () => {
    const bonusConfig = makeConfig()
    const wrapper = mountTab(bonusConfig)
    const card = wrapper.find('[data-testid="offense-deduction-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('個案未填金額時套用；規章每 1 分＝1,000')

    const labels = card.findAll('label').map((el) => el.attributes('data-label'))
    expect(labels).toEqual(['警告 預設扣節慶獎金', '小過 預設扣節慶獎金', '大過 預設扣節慶獎金'])

    const inputs = card.findAll('input.num')
    expect(inputs.map((i) => (i.element as HTMLInputElement).value)).toEqual(['1000', '3000', '0'])

    await inputs[2].setValue('6000')
    expect(bonusConfig.major_offense_deduction).toBe(6000)
    expect(bonusConfig.minor_offense_deduction).toBe(3000)
  })
})

// 義華 2026-10-27 第二批（yhruleb01）：卡片擴為「節慶／超額計算規則」，新增三個開關
// 測試環境沒有註冊 Element Plus 元件：用最小的單選群組 stub 驗證選取與寫回。
const RadioGroupStub = defineComponent({
  props: { modelValue: { type: null, default: undefined } },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    provide('rg', {
      current: () => props.modelValue,
      select: (v: unknown) => emit('update:modelValue', v),
    })
    return () => h('div', { class: 'rg' }, slots.default?.())
  },
})
const RadioButtonStub = defineComponent({
  props: ['value'],
  setup(props, { slots }) {
    const rg = inject<{ current: () => unknown; select: (v: unknown) => void }>('rg')!
    return () =>
      h(
        'button',
        {
          type: 'button',
          class: ['rb', rg.current() === props.value ? 'is-active' : ''],
          onClick: () => rg.select(props.value),
        },
        slots.default?.(),
      )
  },
})

describe('FestivalBonusTab 節慶／超額計算規則開關', () => {
  const TOGGLE_KEYS = [
    'festival_leader_class_ratio',
    'festival_unassigned_teacher_school_ratio',
    'festival_new_class_guarantee',
    'festival_shared_assistant_simple_avg',
    'excess_exclude_long_leave',
    'festival_suspension_rule',
    'festival_c_grade_promotion',
  ] as const

  const mountWithRadios = (bonusConfig: ReturnType<typeof makeConfig>) =>
    mount(FestivalBonusTab, {
      props: { bonusConfig, gradeTargets: [] },
      global: {
        stubs: { ...STUBS, 'el-radio-group': RadioGroupStub, 'el-radio-button': RadioButtonStub },
      },
    })
  const rowOf = (wrapper: ReturnType<typeof mountWithRadios>, key: string) =>
    wrapper.find(`[data-testid="festival-rule-${key}"]`)
  const activeIndex = (wrapper: ReturnType<typeof mountWithRadios>, key: string) =>
    rowOf(wrapper, key)
      .findAll('button.rb')
      .findIndex((b) => b.classes().includes('is-active'))

  it('七個開關依序各一列，卡片標題涵蓋超額', () => {
    const wrapper = mountWithRadios(makeConfig())
    const card = wrapper.find('[data-testid="festival-rule-toggles-card"]')

    expect(card.text()).toContain('節慶／超額計算規則')
    const keys = card
      .findAll('[data-testid^="festival-rule-"]')
      .map((el) => el.attributes('data-testid')!.replace('festival-rule-', ''))
    expect(keys).toEqual([...TOGGLE_KEYS])
  })

  it('每列都是開啟／關閉單選，不使用 el-switch（null 會被 switch 靜默改成 false）', () => {
    const wrapper = mountWithRadios(makeConfig())

    for (const key of TOGGLE_KEYS) {
      const row = rowOf(wrapper, key)
      expect(row.exists()).toBe(true)
      expect(row.findAll('button.rb').map((b) => b.text())).toEqual(['開啟', '關閉'])
    }
    expect(wrapper.html()).not.toContain('el-switch')
  })

  it('初值 null 時兩個選項都不選（不假裝是關閉），選了之後寫回 bonusConfig', async () => {
    const bonusConfig = makeConfig()
    const wrapper = mountWithRadios(bonusConfig)
    const buttons = () => rowOf(wrapper, 'festival_suspension_rule').findAll('button.rb')

    expect(activeIndex(wrapper, 'festival_suspension_rule')).toBe(-1)
    expect(bonusConfig.festival_suspension_rule).toBeNull()

    await buttons()[0].trigger('click')
    expect(bonusConfig.festival_suspension_rule).toBe(true)
    expect(activeIndex(wrapper, 'festival_suspension_rule')).toBe(0)

    await buttons()[1].trigger('click')
    expect(bonusConfig.festival_suspension_rule).toBe(false)
    expect(activeIndex(wrapper, 'festival_suspension_rule')).toBe(1)
  })

  it('改一個開關不影響其他開關', async () => {
    const bonusConfig = makeConfig()
    const wrapper = mountWithRadios(bonusConfig)

    await rowOf(wrapper, 'excess_exclude_long_leave').findAll('button.rb')[0].trigger('click')

    expect(bonusConfig.excess_exclude_long_leave).toBe(true)
    expect(bonusConfig.festival_suspension_rule).toBeNull()
    expect(bonusConfig.festival_c_grade_promotion).toBeNull()
  })

  it('已載入為 true／false 時，對應選項被選起來', () => {
    const bonusConfig = makeConfig()
    bonusConfig.festival_c_grade_promotion = true
    bonusConfig.excess_exclude_long_leave = false
    const wrapper = mountWithRadios(bonusConfig)

    expect(activeIndex(wrapper, 'festival_c_grade_promotion')).toBe(0)
    expect(activeIndex(wrapper, 'excess_exclude_long_leave')).toBe(1)
  })
})
