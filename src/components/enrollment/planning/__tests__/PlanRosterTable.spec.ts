import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ElementPlus from 'element-plus'
import PlanRosterTable from '../PlanRosterTable.vue'
import type { Schema } from '@/api/_generated/typed'

type PlanDetail = Schema<'PlanDetailOut'>

function buildPlan(overrides: Partial<PlanDetail> = {}): PlanDetail {
  return {
    id: 1,
    target_school_year: 115,
    source_school_year: 114,
    status: 'draft',
    version: 1,
    generated_at: '2026-06-01T00:00:00',
    published_at: null,
    applied_at: null,
    classes: [
      {
        id: 10,
        source_name: '幼幼A',
        source_head_teacher_name: '舊班導',
        source_assistant_teacher_name: null,
        source_art_teacher_name: '舊美語老師',
        target_name: '小班A',
        target_grade_id: 1,
        grade_name: '小班',
        capacity: 2,
        class_code: 'K1A',
        head_teacher_id: 100,
        head_teacher_name: '王老師',
        assistant_teacher_id: null,
        assistant_teacher_name: null,
        art_teacher_id: null,
        art_teacher_name: null,
        assigned_count: 3, // 超額：3 > capacity 2
      },
      {
        id: 11,
        source_name: null,
        target_name: '中班A',
        target_grade_id: 2,
        grade_name: '中班',
        capacity: 15,
        class_code: 'K2A',
        head_teacher_id: 200,
        head_teacher_name: '李老師',
        assistant_teacher_id: 201,
        assistant_teacher_name: '陳老師',
        art_teacher_id: 202,
        art_teacher_name: '美語老師甲',
        assigned_count: 1,
      },
    ],
    students: [
      { id: 1, student_id: 'S001', name: '小明', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      { id: 2, student_id: 'S002', name: '小華', source_classroom_name: '幼幼B', plan_class_id: 10, disposition: 'retain', exclude_reason: null, manually_adjusted: true, current_grade_name: '小班' },
      { id: 3, student_id: 'S003', name: '小美', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      { id: 4, student_id: 'S004', name: '小強', source_classroom_name: '大班A', plan_class_id: null, disposition: 'graduate', exclude_reason: null, manually_adjusted: false, current_grade_name: '大班' },
      { id: 5, student_id: 'S005', name: '小英', source_classroom_name: '中班B', plan_class_id: null, disposition: 'exclude', exclude_reason: '轉學', manually_adjusted: true, current_grade_name: '中班' },
    ],
    issues: { blocking: [], warnings: [] },
    ...overrides,
  }
}

function mountTable(overrides: Partial<PlanDetail> = {}, editable = true) {
  return mount(PlanRosterTable, {
    global: { plugins: [ElementPlus] },
    props: { plan: buildPlan(overrides), editable },
  })
}

describe('PlanRosterTable', () => {
  it('依年級分組渲染班級欄（小班／中班各一欄，含年級名稱）', () => {
    const w = mountTable()
    const gradeHeaders = w.findAll('.grade-group-cell')
    expect(gradeHeaders.map(h => h.text())).toEqual(['小班', '中班'])
    const classHeaders = w.findAll('.class-name-text')
    expect(classHeaders.map(h => h.text())).toEqual(['小班A', '中班A'])
  })

  it('容量超額（assigned_count > capacity）班級 badge 標紅', () => {
    const w = mountTable()
    const badges = w.findAll('.capacity-badge')
    expect(badges[0].text()).toContain('3/2')
    expect(badges[0].classes()).toContain('over-capacity')
    expect(badges[1].text()).toContain('1/15')
    expect(badges[1].classes()).not.toContain('over-capacity')
  })

  it('留級學生顯示「留」tag；畢業/排除收合區顯示「畢」「除」tag', () => {
    const w = mountTable()
    const retainTags = w.findAll('.disposition-tag-retain')
    expect(retainTags.length).toBe(1)
    expect(retainTags[0].text()).toBe('留')

    // promote 是預設分派，不需要 tag
    expect(w.findAll('.disposition-tag-promote').length).toBe(0)

    const graduateSection = w.find('.graduate-section')
    expect(graduateSection.text()).toContain('小強')
    expect(graduateSection.find('.disposition-tag-graduate').text()).toBe('畢')

    const excludeSection = w.find('.exclude-section')
    expect(excludeSection.text()).toContain('小英')
    expect(excludeSection.text()).toContain('轉學')
    expect(excludeSection.find('.disposition-tag-exclude').text()).toBe('除')
  })

  it('教師未指派顯示「待確認」tag，hover 顯示原班三師姓名（None 顯「—」）', () => {
    const w = mountTable()
    const unassignedTags = w.findAll('.teacher-unassigned')
    // 小班A：副班導、美語老師未指派 → 2 個「待確認」；中班A 三教師皆已指派 → 0
    expect(unassignedTags.length).toBe(2)
    expect(unassignedTags[0].text()).toBe('待確認')
    // 副班導未指派：source_assistant_teacher_name 為 null → 顯示「—」
    expect(unassignedTags[0].attributes('title')).toBe('原班副班導：—')
    // 美語老師未指派：source_art_teacher_name 有值 → 顯示原班美語老師姓名
    expect(unassignedTags[1].attributes('title')).toBe('原班美語老師：舊美語老師')
  })

  it('勾選學生 checkbox 會 emit select-students（累積目前勾選集合）', async () => {
    const w = mountTable()
    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    const events = w.emitted('select-students')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual([1])
  })

  it('editable=false 時不渲染 checkbox', () => {
    const w = mountTable({}, false)
    expect(w.findAllComponents({ name: 'ElCheckbox' }).length).toBe(0)
  })

  it('editable=true 時點擊班級編輯鈕 emit class-edit(planClassId)', async () => {
    const w = mountTable()
    await w.findAll('.class-edit-btn')[0].trigger('click')
    const events = w.emitted('class-edit')
    expect(events).toBeTruthy()
    expect(events![0][0]).toBe(10)
  })

  it('editable=false 時不渲染班級編輯鈕', () => {
    const w = mountTable({}, false)
    expect(w.findAll('.class-edit-btn').length).toBe(0)
  })

  it('plan.version 變動時清空勾選集合並 emit select-students([])', async () => {
    const plan = buildPlan()
    const w = mount(PlanRosterTable, {
      global: { plugins: [ElementPlus] },
      props: { plan, editable: true },
    })
    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    expect(w.emitted('select-students')![0][0]).toEqual([1])

    await w.setProps({ plan: { ...plan, version: 2 } })
    const events = w.emitted('select-students')!
    expect(events[events.length - 1][0]).toEqual([])
  })

  // ── 拖曳搬班（原生 HTML5 DnD）──
  // buildPlan 版面：class 10（小班A）／class 11（中班A）；學生 1/2/3 皆在 class 10。
  // .student-cell 依 row×class 排列 → index 0,2,4=class10 欄；index 1,3,5=class11 欄。
  it('拖曳學生到別班欄 drop → emit student-move（op=assign、單一學生、目標班 id）', async () => {
    const w = mountTable()
    // 第一個 .student-entry = 小明（student.id=1，原 class 10）
    await w.findAll('.student-entry')[0].trigger('dragstart')
    // index 1 = 第一列的 class 11 欄（空格）
    await w.findAll('.student-cell')[1].trigger('drop')
    const events = w.emitted('student-move')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual({ studentIds: [1], op: 'assign', planClassId: 11 })
  })

  it('拖回原班（同一班欄）drop → 不 emit student-move（no-op）', async () => {
    const w = mountTable()
    await w.findAll('.student-entry')[0].trigger('dragstart') // 小明，原 class 10
    await w.findAll('.student-cell')[0].trigger('drop') // index 0 = class 10 欄（原班）
    expect(w.emitted('student-move')).toBeFalsy()
  })

  it('editable=false：學生 entry 不可拖（draggable=false），drop 也不 emit', async () => {
    const w = mountTable({}, false)
    const entry = w.findAll('.student-entry')[0]
    expect(entry.attributes('draggable')).toBe('false')
    await entry.trigger('dragstart')
    await w.findAll('.student-cell')[1].trigger('drop')
    expect(w.emitted('student-move')).toBeFalsy()
  })

  it('dragover 目標班欄 → 該欄所有格子帶 drop-target-active，原班欄不高亮', async () => {
    const w = mountTable()
    await w.findAll('.student-entry')[0].trigger('dragstart')
    await w.findAll('.student-cell')[1].trigger('dragover') // class 11 欄
    const cells = w.findAll('.student-cell')
    expect(cells[1].classes()).toContain('drop-target-active') // class 11 欄格子
    expect(cells[3].classes()).toContain('drop-target-active')
    expect(cells[0].classes()).not.toContain('drop-target-active') // class 10 欄不高亮
  })
})
