import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ElementPlus from 'element-plus'
import PlanIssuesSummary from '../PlanIssuesSummary.vue'
import type { Schema } from '@/api/_generated/typed'

type IssuesOut = Schema<'IssuesOut'>

function buildIssues(overrides: Partial<IssuesOut> = {}): IssuesOut {
  return {
    blocking: [
      { code: 'student_unassigned', message: '學生「小明」尚未分派草稿班級', plan_class_id: null, student_id: 1 },
      { code: 'student_unassigned', message: '學生「小華」尚未分派草稿班級', plan_class_id: null, student_id: 2 },
      { code: 'head_teacher_missing', message: '班級「小班A」尚未指派導師', plan_class_id: 10, student_id: null },
    ],
    warnings: [
      { code: 'assistant_teacher_missing', message: '班級「小班A」尚未指派副班導', plan_class_id: 10, student_id: null },
    ],
    ...overrides,
  }
}

function mountSummary(issues: IssuesOut = buildIssues()) {
  return mount(PlanIssuesSummary, { global: { plugins: [ElementPlus] }, props: { issues } })
}

describe('PlanIssuesSummary', () => {
  it('同 code 聚合成一組：組標題 + 組內筆數，嚴重度區塊顯示總數', () => {
    const w = mountSummary()
    // blocking：student_unassigned×2 + head_teacher_missing×1 → 2 組、總數 3
    const blockingSection = w.find('.severity-blocking')
    expect(blockingSection.find('.severity-count').text()).toBe('3')
    const groups = blockingSection.findAll('.group-toggle')
    expect(groups.length).toBe(2)
    expect(groups[0].text()).toContain('學生尚未分派班級')
    expect(groups[0].find('.group-count').text()).toBe('2')
    expect(groups[1].text()).toContain('班級尚未指派導師')
    // warnings：1 組
    const warningSection = w.find('.severity-warning')
    expect(warningSection.find('.severity-count').text()).toBe('1')
    expect(warningSection.findAll('.group-toggle').length).toBe(1)
  })

  it('預設收合：不渲染逐筆列；點組標題展開後渲染逐筆 message', async () => {
    const w = mountSummary()
    expect(w.findAll('.issue-item').length).toBe(0)
    await w.findAll('.group-toggle')[0].trigger('click')
    const items = w.findAll('.issue-item')
    expect(items.length).toBe(2)
    expect(items[0].text()).toContain('小明')
    // 再點一次收回
    await w.findAll('.group-toggle')[0].trigger('click')
    expect(w.findAll('.issue-item').length).toBe(0)
  })

  it('展開後點逐筆列 emit locate-issue 帶完整 issue 物件', async () => {
    const w = mountSummary()
    await w.findAll('.group-toggle')[0].trigger('click')
    await w.findAll('.issue-item')[1].trigger('click')
    const events = w.emitted('locate-issue')
    expect(events).toBeTruthy()
    expect(events![0][0]).toMatchObject({ code: 'student_unassigned', student_id: 2 })
  })

  it('未知 code fallback：以該組首筆 message 當組標題（不壞版）', () => {
    const w = mountSummary(buildIssues({
      blocking: [
        { code: 'brand_new_code', message: '某種新問題描述', plan_class_id: null, student_id: null },
      ],
    }))
    expect(w.find('.severity-blocking .group-title').text()).toBe('某種新問題描述')
  })

  it('全空顯示無問題訊息，且不渲染嚴重度區塊', () => {
    const w = mountSummary({ blocking: [], warnings: [] })
    expect(w.find('.issues-empty').exists()).toBe(true)
    expect(w.find('.severity-section').exists()).toBe(false)
  })

  it('僅 warnings 時不渲染 blocking 區塊', () => {
    const w = mountSummary(buildIssues({ blocking: [] }))
    expect(w.find('.severity-blocking').exists()).toBe(false)
    expect(w.find('.severity-warning').exists()).toBe(true)
  })
})
