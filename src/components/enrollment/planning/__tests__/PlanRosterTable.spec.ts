import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import ElementPlus from 'element-plus'
import PlanRosterTable from '../PlanRosterTable.vue'
import PlanTeacherCell from '../PlanTeacherCell.vue'
import type { Schema } from '@/api/_generated/typed'

type PlanDetail = Schema<'PlanDetailOut'>

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

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

function mountTable(overrides: Partial<PlanDetail> = {}, editable = true, selectedIds = new Set<number>()) {
  return mount(PlanRosterTable, {
    global: { plugins: [ElementPlus] },
    props: { plan: buildPlan(overrides), editable, selectedIds },
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

  it('留級學生顯示「留」tag；promote 不帶 tag；畢業/排除不再渲染於本元件', () => {
    const w = mountTable()
    const retainTags = w.findAll('.disposition-tag-retain')
    expect(retainTags.length).toBe(1)
    expect(retainTags[0].text()).toBe('留')
    expect(w.findAll('.disposition-tag-promote').length).toBe(0)
    expect(w.find('.graduate-section').exists()).toBe(false)
    expect(w.find('.exclude-section').exists()).toBe(false)
    expect(w.find('.side-collapse').exists()).toBe(false)
  })

  it('三師格改用 PlanTeacherCell：未指派顯示「未指派」與原班老師（不再藏在 hover）', () => {
    const w = mountTable()
    const cells = w.findAllComponents(PlanTeacherCell)
    expect(cells.length).toBe(6) // 2 班 × 3 職務
    const smallA = cells.filter(c => c.props('className') === '小班A')
    expect(smallA.map(c => [c.props('role'), c.props('teacherName'), c.props('sourceTeacherName')])).toEqual([
      ['head', '王老師', '舊班導'],
      ['assistant', null, null],
      ['art', null, '舊美語老師'],
    ])
    expect(w.text()).not.toContain('待確認')
  })

  it('老師格 change → emit teacher-change(班 id, 欄位, 老師 id)', () => {
    const w = mountTable()
    const cell = w.findAllComponents(PlanTeacherCell)
      .find(c => c.props('className') === '中班A' && c.props('role') === 'assistant')!
    cell.vm.$emit('change', null)
    expect(w.emitted('teacher-change')![0]).toEqual([11, 'assistant_teacher_id', null])
  })

  it('老師格的選項依班級與職務產生（他班班導停用並註明）', () => {
    const w = mount(PlanRosterTable, {
      global: { plugins: [ElementPlus] },
      props: {
        plan: buildPlan(),
        editable: true,
        selectedIds: new Set<number>(),
        teacherOptions: [{ id: 200, name: '李老師' }, { id: 300, name: '新老師' }],
      },
    })
    const cell = w.findAllComponents(PlanTeacherCell)
      .find(c => c.props('className') === '小班A' && c.props('role') === 'head')!
    expect(cell.props('options')).toEqual([
      { id: 200, label: '李老師', disabled: true, note: '中班A班導' },
      { id: 300, label: '新老師', disabled: false, note: '' },
    ])
  })

  it('學生格單行：原班名只在「從別班搬進來」時顯示', () => {
    const w = mountTable()
    const entry = (id: number) => w.find(`.student-entry[data-student-id="${id}"]`)
    // 小班A 的來源班是 幼幼A：同班升上來的不重複顯示原班
    expect(entry(1).find('.student-moved').exists()).toBe(false)
    // 小華來自 幼幼B → 標出來源
    expect(entry(2).find('.student-moved').text()).toContain('幼幼B')
  })

  it('手動調整過的學生有標記（重新產生時會被保留的就是這些）', () => {
    const w = mountTable()
    expect(w.find('.student-entry[data-student-id="2"] .manual-mark').attributes('title')).toBe('手動調整過')
    expect(w.find('.student-entry[data-student-id="1"] .manual-mark').exists()).toBe(false)
  })

  it('整班勾選：班名格 checkbox emit 該班全部學生', async () => {
    const w = mountTable()
    await w.find('.class-name-cell[data-plan-class-id="10"] .class-select-all input[type="checkbox"]').setValue(true)
    expect(w.emitted('set-selected')!.at(-1)).toEqual([[1, 2, 3], true])
  })

  it('總計列：分班人數、待分班、畢業、排除一次講清楚', () => {
    const plan = buildPlan()
    plan.students.push({ id: 6, student_id: 'S006', name: '小新', source_classroom_name: '幼幼C', plan_class_id: null, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' })
    const w = mount(PlanRosterTable, { global: { plugins: [ElementPlus] }, props: { plan, editable: true, selectedIds: new Set<number>() } })
    const text = w.find('.grand-total-row').text()
    expect(text).toContain('已分班 4 人')
    expect(text).toContain('待分班 1 人')
    expect(text).toContain('畢業 1')
    expect(text).toContain('排除 1')
  })

  it('勾選學生 checkbox emit set-selected([id], checked)；勾選狀態由 selectedIds prop 決定', async () => {
    const w = mountTable({}, true, new Set([2]))
    const checkboxes = w.findAllComponents({ name: 'ElCheckbox' })
    // 學生 2（小華，selectedIds 內）應為勾選狀態
    const checkedBox = checkboxes.find(c => (c.props('modelValue') as boolean) === true)
    expect(checkedBox).toBeTruthy()
    // 勾學生 1 → emit set-selected([1], true)（班名格另有整班勾選，這裡明確指定學生格）
    await w.find('.student-entry[data-student-id="1"] .student-checkbox input[type="checkbox"]').setValue(true)
    expect(w.emitted('set-selected')![0]).toEqual([[1], true])
  })

  it('取消勾選學生 checkbox（初始已勾選）→ emit set-selected([id], false)', async () => {
    const w = mountTable({}, true, new Set([2]))
    const checkboxes = w.findAllComponents({ name: 'ElCheckbox' })
    // 學生 2（小華）已在 selectedIds 內，初始為勾選狀態
    const checkedBox = checkboxes.find(c => (c.props('modelValue') as boolean) === true)
    expect(checkedBox).toBeTruthy()
    // 取消勾選 → emit set-selected([2], false)
    await checkedBox!.find('input[type="checkbox"]').setValue(false)
    expect(w.emitted('set-selected')![0]).toEqual([[2], false])
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

  // ── 外部拖入（側欄待分班學生拖入，無內部 dragstart）──
  it('外部拖入（無內部 dragstart）：drop 帶 dataTransfer student id → emit student-move', async () => {
    const w = mountTable()
    await w.findAll('.student-cell')[1].trigger('drop', {
      dataTransfer: { getData: () => '42' },
    })
    const events = w.emitted('student-move')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual({ studentIds: [42], op: 'assign', planClassId: 11 })
  })

  it('外部拖入 dataTransfer 值非數字 → 不 emit', async () => {
    const w = mountTable()
    await w.findAll('.student-cell')[1].trigger('drop', {
      dataTransfer: { getData: () => 'not-a-number' },
    })
    expect(w.emitted('student-move')).toBeFalsy()
  })

  it('外部拖 dragover（dataTransfer.types 含 text/plain）→ 目標欄高亮', async () => {
    const w = mountTable()
    await w.findAll('.student-cell')[1].trigger('dragover', {
      dataTransfer: { types: ['text/plain'] },
    })
    expect(w.findAll('.student-cell')[1].classes()).toContain('drop-target-active')
  })

  // ── locate（供 Task 5 view 側欄跳轉聚焦）──
  it('locateStudent：存在 → 回 true 且該 entry 帶 flash-highlight；不存在 → false', () => {
    const w = mountTable()
    const vm = w.vm as unknown as { locateStudent: (id: number) => boolean; locateClass: (id: number) => boolean }
    expect(vm.locateStudent(1)).toBe(true)
    expect(w.find('.student-entry[data-student-id="1"]').classes()).toContain('flash-highlight')
    expect(vm.locateStudent(999)).toBe(false)
  })

  it('locateClass：存在 → 回 true 且班名格帶 flash-highlight；不存在 → false', () => {
    const w = mountTable()
    const vm = w.vm as unknown as { locateClass: (id: number) => boolean }
    expect(vm.locateClass(10)).toBe(true)
    expect(w.find('.class-name-cell[data-plan-class-id="10"]').classes()).toContain('flash-highlight')
    expect(vm.locateClass(999)).toBe(false)
  })
})
