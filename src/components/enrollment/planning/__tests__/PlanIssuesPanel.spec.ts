import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import PlanIssuesPanel from '../PlanIssuesPanel.vue'
import type { Schema } from '@/api/_generated/typed'

type IssuesOut = Schema<'IssuesOut'>

describe('PlanIssuesPanel', () => {
  it('分組渲染 blocking／warning 並顯示計數', () => {
    const issues: IssuesOut = {
      blocking: [
        { code: 'capacity_exceeded', message: '班級「小班A」分派人數超過容量', plan_class_id: 10, student_id: null },
      ],
      warnings: [
        { code: 'assistant_teacher_missing', message: '班級「小班A」尚未指派副班導', plan_class_id: 10, student_id: null },
        { code: 'plan_student_inactive', message: '學生「小明」已非在籍生', plan_class_id: null, student_id: 1 },
      ],
    }
    const w = mount(PlanIssuesPanel, { props: { issues } })
    expect(w.find('.blocking-count').text()).toContain('1')
    expect(w.find('.warning-count').text()).toContain('2')
    expect(w.findAll('.blocking-item').length).toBe(1)
    expect(w.findAll('.warning-item').length).toBe(2)
    expect(w.find('.blocking-item').text()).toContain('分派人數超過容量')
  })

  it('點擊項目 emit locate-issue 帶完整 issue 物件', async () => {
    const issues: IssuesOut = {
      blocking: [
        { code: 'head_teacher_missing', message: '班級「中班A」尚未指派導師', plan_class_id: 11, student_id: null },
      ],
      warnings: [],
    }
    const w = mount(PlanIssuesPanel, { props: { issues } })
    await w.find('.blocking-item').trigger('click')
    const events = w.emitted('locate-issue')
    expect(events).toBeTruthy()
    expect(events![0][0]).toMatchObject({ code: 'head_teacher_missing', plan_class_id: 11 })
  })

  it('blocking 與 warnings 皆空時顯示無問題訊息', () => {
    const issues: IssuesOut = { blocking: [], warnings: [] }
    const w = mount(PlanIssuesPanel, { props: { issues } })
    expect(w.find('.issues-empty').exists()).toBe(true)
    expect(w.findAll('.blocking-item').length).toBe(0)
    expect(w.findAll('.warning-item').length).toBe(0)
  })
})
