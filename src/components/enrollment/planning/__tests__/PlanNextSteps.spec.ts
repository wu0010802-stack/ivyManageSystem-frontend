import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PlanNextSteps from '../PlanNextSteps.vue'

function mountSteps(props: Record<string, unknown> = {}) {
  return mount(PlanNextSteps, {
    global: { plugins: [ElementPlus] },
    props: {
      unassignedCount: 2,
      emptyTeacherSlots: { head: 8, assistant: 8, art: 8 },
      carryOverSlots: 20,
      blockingCount: 10,
      canEdit: true,
      applyDate: '2027-08-01',
      appliesImmediately: false,
      ...props,
    },
  })
}

describe('PlanNextSteps', () => {
  it('三步驟依序：分班、老師、發布，各自顯示待辦狀態', () => {
    const w = mountSteps()
    const steps = w.findAll('.next-step')
    expect(steps.map(s => s.find('.step-title').text())).toEqual(['分班', '指派老師', '發布'])
    expect(steps[0].text()).toContain('還有 2 位待分班')
    expect(steps[1].text()).toContain('8 班未指派班導')
    expect(steps[2].text()).toContain('還有 10 項阻擋')
    expect(steps[2].text()).toContain('2027/08/01')
  })

  it('完成的步驟標記 is-done', () => {
    const w = mountSteps({ unassignedCount: 0, emptyTeacherSlots: { head: 0, assistant: 0, art: 0 }, blockingCount: 0 })
    const steps = w.findAll('.next-step')
    expect(steps.every(s => s.classes().includes('is-done'))).toBe(true)
    expect(steps[0].text()).toContain('全部學生都已分班')
    expect(steps[2].text()).toContain('可以發布')
  })

  it('班導都齊、只缺副班導／美語：不算阻擋，但仍列出缺幾格', () => {
    const w = mountSteps({ emptyTeacherSlots: { head: 0, assistant: 3, art: 1 } })
    const teacherStep = w.findAll('.next-step')[1]
    expect(teacherStep.classes()).not.toContain('is-blocking')
    expect(teacherStep.text()).toContain('副班導 3 班、美語老師 1 班未指派')
  })

  it('有可沿用的原班老師且可編輯：顯示「沿用原班老師」並 emit carry-over', async () => {
    const w = mountSteps()
    const btn = w.find('.btn-carry-over')
    expect(btn.text()).toContain('沿用原班老師')
    await btn.trigger('click')
    expect(w.emitted('carry-over')).toBeTruthy()
  })

  it('不可編輯或沒有可沿用的空格：不顯示沿用鈕', () => {
    expect(mountSteps({ canEdit: false }).find('.btn-carry-over').exists()).toBe(false)
    expect(mountSteps({ carryOverSlots: 0 }).find('.btn-carry-over').exists()).toBe(false)
  })

  it('待分班可點「查看」emit show-unassigned', async () => {
    const w = mountSteps()
    await w.find('.btn-show-unassigned').trigger('click')
    expect(w.emitted('show-unassigned')).toBeTruthy()
  })

  it('補救模式：發布步驟寫「約一小時內套用」', () => {
    const w = mountSteps({ appliesImmediately: true, blockingCount: 0 })
    expect(w.findAll('.next-step')[2].text()).toContain('約一小時內')
  })
})
