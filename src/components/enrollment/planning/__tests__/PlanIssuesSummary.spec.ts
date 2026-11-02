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
      { code: 'head_teacher_missing', message: '班級「小班A」尚未指派班導', plan_class_id: 10, student_id: null },
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
    expect(groups[0].text()).toContain('待分班學生')
    expect(groups[0].find('.group-count').text()).toBe('2')
    expect(groups[1].text()).toContain('班級尚未指派班導')
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

  it('後端所有 issue code 都有固定標題（含 2026-10 新增的代號重複、畢業生需標留級、跨年級）', () => {
    const codes = [
      'class_code_duplicate', 'graduate_needs_retain', 'cross_grade_assignment',
      'student_source_classroom_changed', 'graduate_grade_unresolved',
      'plan_student_invalid', 'target_grade_invalid', 'teacher_invalid',
    ]
    const w = mount(PlanIssuesSummary, {
      global: { plugins: [ElementPlus] },
      props: {
        issues: {
          blocking: codes.map(code => ({ code, message: `原始訊息-${code}`, plan_class_id: null, student_id: null })),
          warnings: [],
        },
      },
    })
    const titles = w.findAll('.group-title').map(t => t.text())
    expect(titles.some(t => t.startsWith('原始訊息-'))).toBe(false)
    expect(titles).toContain('班級代號重複')
    expect(titles).toContain('畢業生要續讀須標記留級')
    expect(w.text()).not.toContain('導師')
  })

  it('全空顯示無問題訊息，且不渲染嚴重度區塊', () => {
    const w = mountSummary({ blocking: [], warnings: [] })
    expect(w.find('.issues-empty').exists()).toBe(true)
    expect(w.find('.severity-section').exists()).toBe(false)
  })

  it('class_name_duplicate 有固定標題', () => {
    const w = mountSummary(buildIssues({
      blocking: [{ code: 'class_name_duplicate', message: '原始訊息', plan_class_id: 10, student_id: null }],
      warnings: [],
    }))
    expect(w.find('.severity-blocking .group-title').text()).toBe('班級名稱重複')
  })

  it('組標題鈕帶 aria-expanded，展開／收合時切換', async () => {
    const w = mountSummary()
    const toggle = w.findAll('.group-toggle')[0]
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(w.findAll('.group-toggle')[0].attributes('aria-expanded')).toBe('true')
  })

  it('interactive=false（發布 dialog 內）：逐筆列是純文字，沒有按鈕語意、點了也不 emit', async () => {
    const w = mount(PlanIssuesSummary, {
      global: { plugins: [ElementPlus] },
      props: { issues: buildIssues(), interactive: false },
    })
    await w.findAll('.group-toggle')[0].trigger('click')
    const item = w.find('.issue-item')
    expect(item.attributes('role')).toBeUndefined()
    expect(item.attributes('tabindex')).toBeUndefined()
    expect(item.classes()).toContain('issue-item--static')
    await item.trigger('click')
    expect(w.emitted('locate-issue')).toBeFalsy()
  })

  it('context：草稿寫「阻擋發布」，已發布寫「阻擋套用」', () => {
    expect(mountSummary().find('.severity-blocking .severity-title').text()).toBe('阻擋發布')
    const w = mount(PlanIssuesSummary, {
      global: { plugins: [ElementPlus] },
      props: { issues: buildIssues(), context: 'published' },
    })
    expect(w.find('.severity-blocking .severity-title').text()).toBe('阻擋套用')
  })

  it('已發布語境的群組標題：換班要先撤回、發布後才入園的人會留在原班、超額是套用後', () => {
    const w = mount(PlanIssuesSummary, {
      global: { plugins: [ElementPlus] },
      props: {
        context: 'published',
        issues: {
          blocking: [{ code: 'student_source_classroom_changed', message: 'x', plan_class_id: null, student_id: 1 }],
          warnings: [
            { code: 'student_missing_from_plan', message: 'y', plan_class_id: null, student_id: 2 },
            { code: 'capacity_exceeded', message: 'z', plan_class_id: 3, student_id: null },
          ],
        },
      },
    })
    const titles = w.findAll('.group-title').map(t => t.text())
    expect(titles).toEqual([
      '學生已換班，需先撤回發布再重新產生建議',
      '發布後才入園的學生，套用時會留在原班',
      '套用後班級人數會超過容量',
    ])
  })

  it('僅 warnings 時不渲染 blocking 區塊', () => {
    const w = mountSummary(buildIssues({ blocking: [] }))
    expect(w.find('.severity-blocking').exists()).toBe(false)
    expect(w.find('.severity-warning').exists()).toBe(true)
  })
})
