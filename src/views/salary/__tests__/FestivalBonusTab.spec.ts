import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
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
