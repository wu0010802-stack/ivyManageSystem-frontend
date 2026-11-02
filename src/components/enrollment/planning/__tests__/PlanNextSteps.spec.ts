import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PlanNextSteps from '../PlanNextSteps.vue'

function mountSteps(props: Record<string, unknown> = {}) {
  return mount(PlanNextSteps, {
    global: { plugins: [ElementPlus] },
    props: {
      unassignedCount: 2,
      classCount: 8,
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

  it('老師步驟：主句只講阻擋發布的班導，副班導／美語放副句（窄欄不折成三行）', () => {
    const w = mountSteps()
    const teacherStep = w.findAll('.next-step')[1]
    expect(teacherStep.find('.step-status').text()).toBe('8 班未指派班導')
    expect(teacherStep.find('.step-sub').text()).toBe('副班導 8 班、美語老師 8 班也還沒指派')
  })

  it('草稿 0 個班：老師步驟不可顯示「都已指派」（空集合不是完成）', () => {
    const w = mountSteps({ classCount: 0, emptyTeacherSlots: { head: 0, assistant: 0, art: 0 }, carryOverSlots: 0 })
    const teacherStep = w.findAll('.next-step')[1]
    expect(teacherStep.classes()).not.toContain('is-done')
    expect(teacherStep.find('.step-status').text()).toBe('還沒有班級')
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
  it('老師步驟有「去指派」：切到老師指派檢視；已在老師指派或沒有班級時不顯示', async () => {
    const w = mountSteps({ showTeacherLink: true })
    const btn = w.find('.btn-show-teachers')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('去指派')
    await btn.trigger('click')
    expect(w.emitted('show-teachers')).toBeTruthy()

    expect(mountSteps({ showTeacherLink: false }).find('.btn-show-teachers').exists()).toBe(false)
    expect(mountSteps({ showTeacherLink: true, classCount: 0 }).find('.btn-show-teachers').exists()).toBe(false)
  })
  // ── FE-C：發布截止、自動套用未啟用、留級生倒數 ──

  it('發布步驟寫出截止日與剩幾天', () => {
    const w = mountSteps({ today: '2027-07-10', schedulerEnabled: true })
    expect(w.findAll('.next-step')[2].text()).toContain('請在 2027/08/01 前發布（還有 22 天），當天自動套用')
  })

  it('自動套用未啟用：不寫「自動套用」，改警告發布後不會套用', () => {
    const w = mountSteps({ today: '2027-07-10', schedulerEnabled: false })
    const step = w.findAll('.next-step')[2]
    expect(step.text()).toContain('自動套用未啟用：發布後不會自動套用，請聯絡系統管理員開啟')
    expect(step.text()).not.toContain('當天自動套用')
    expect(step.find('.step-sub.is-danger').exists()).toBe(true)
  })

  it('有畢業年級留級生：寫出須在畢業日前發布；14 天內轉警示色，年級名用實際名稱', () => {
    const far = mountSteps({
      today: '2027-06-01', retainPendingCount: 3, graduationDate: '2027-07-31', graduationGradeName: '大班',
    })
    const farLine = far.find('.retain-deadline')
    expect(farLine.text()).toBe('有 3 位大班留級生，須在畢業日 2027/07/31 前發布（還有 60 天）')
    expect(farLine.classes()).not.toContain('is-warning')

    const near = mountSteps({
      today: '2027-07-20', retainPendingCount: 3, graduationDate: '2027-07-31', graduationGradeName: '大大班',
    })
    expect(near.find('.retain-deadline').text()).toContain('3 位大大班留級生')
    expect(near.find('.retain-deadline').classes()).toContain('is-warning')
  })

  it('畢業日後的補跑期間：警告隨時可能被畢業；補跑期過後不再顯示', () => {
    const catchup = mountSteps({
      today: '2027-08-02', retainPendingCount: 2, graduationDate: '2027-07-31', graduationGradeName: null,
    })
    const line = catchup.find('.retain-deadline')
    expect(line.text()).toContain('2 位畢業年級留級生')
    expect(line.text()).toContain('2027/08/07')
    expect(line.classes()).toContain('is-danger')

    const after = mountSteps({ today: '2027-08-09', retainPendingCount: 2, graduationDate: '2027-07-31' })
    expect(after.find('.retain-deadline').exists()).toBe(false)
  })
})
