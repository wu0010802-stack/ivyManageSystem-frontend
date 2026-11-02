import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import ElementPlus from 'element-plus'
import PlanSidePanel from '../PlanSidePanel.vue'
import type { Schema } from '@/api/_generated/typed'

type PlanDetail = Schema<'PlanDetailOut'>

beforeAll(() => {
  // jsdom 未實作 scrollIntoView；locateStudent 需要
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
      { id: 10, source_name: '幼幼A', target_name: '小班A', target_grade_id: 1, grade_name: '小班', capacity: 20, class_code: null, head_teacher_id: null, head_teacher_name: null, assistant_teacher_id: null, assistant_teacher_name: null, art_teacher_id: null, art_teacher_name: null, assigned_count: 1 },
      { id: 11, source_name: '小班舊', target_name: '中班A', target_grade_id: 2, grade_name: '中班', capacity: 20, class_code: null, head_teacher_id: null, head_teacher_name: null, assistant_teacher_id: null, assistant_teacher_name: null, art_teacher_id: null, art_teacher_name: null, assigned_count: 0 },
    ],
    students: [
      { id: 1, student_id: 'S001', name: '王小明', source_classroom_name: '幼幼A', plan_class_id: null, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      { id: 2, student_id: 'S002', name: '李小華', source_classroom_name: '幼幼B', plan_class_id: null, disposition: 'retain', exclude_reason: null, manually_adjusted: false, current_grade_name: '小班' },
      { id: 3, student_id: 'S003', name: '張小美', source_classroom_name: '大班A', plan_class_id: null, disposition: 'graduate', exclude_reason: null, manually_adjusted: false, current_grade_name: '大班' },
      { id: 4, student_id: 'S004', name: '陳小強', source_classroom_name: '中班B', plan_class_id: null, disposition: 'exclude', exclude_reason: '轉學', manually_adjusted: true, current_grade_name: '中班' },
      { id: 5, student_id: 'S005', name: '林已分', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
    ],
    issues: {
      blocking: [{ code: 'student_unassigned', message: '學生「王小明」尚未分派草稿班級', plan_class_id: null, student_id: 1 }],
      warnings: [],
    },
    ...overrides,
  }
}

function mountPanel(overrides: Partial<PlanDetail> = {}, editable = true, selectedIds = new Set<number>()) {
  return mount(PlanSidePanel, {
    global: { plugins: [ElementPlus] },
    props: { plan: buildPlan(overrides), editable, selectedIds },
  })
}

describe('PlanSidePanel', () => {
  it('待分班區只列 promote/retain 且未分班者（畢業/排除/已分班不列），顯示計數', () => {
    const w = mountPanel()
    const rows = w.findAll('.unassigned-row')
    expect(rows.length).toBe(2)
    expect(rows.map(r => r.find('.student-name').text())).toEqual(['王小明', '李小華'])
    expect(w.find('.unassigned-section .section-count').text()).toBe('2')
  })

  it('無未分班學生時不渲染待分班區', () => {
    const w = mountPanel({
      students: [
        { id: 5, student_id: 'S005', name: '林已分', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      ],
    })
    expect(w.find('.unassigned-section').exists()).toBe(false)
  })

  it('搜尋姓名 filter 可見列；全選只作用於 filter 後可見集合', async () => {
    const w = mountPanel()
    await w.find('.unassigned-search input').setValue('小華')
    expect(w.findAll('.unassigned-row').length).toBe(1)
    // 全選（此時只見李小華 id=2）
    await w.find('.select-all-checkbox input[type="checkbox"]').setValue(true)
    const events = w.emitted('set-selected')
    expect(events).toBeTruthy()
    expect(events![events.length - 1]).toEqual([[2], true])
  })

  it('勾選單一學生 emit set-selected([id], checked)', async () => {
    const w = mountPanel()
    await w.findAll('.unassigned-row input[type="checkbox"]')[0].setValue(true)
    expect(w.emitted('set-selected')![0]).toEqual([[1], true])
  })

  it('editable=false：不渲染 checkbox、列不可拖', () => {
    const w = mountPanel({}, false)
    expect(w.findAll('.unassigned-row input[type="checkbox"]').length).toBe(0)
    expect(w.findAll('.unassigned-row')[0].attributes('draggable')).toBe('false')
  })

  it('畢業/排除名單渲染於收合區（預設收合），含排除原因', () => {
    const w = mountPanel()
    const graduate = w.find('.graduate-bucket')
    expect(graduate.text()).toContain('畢業名單（1）')
    expect(graduate.text()).toContain('張小美')
    const exclude = w.find('.exclude-bucket')
    expect(exclude.text()).toContain('排除名單（1）')
    expect(exclude.text()).toContain('陳小強')
    expect(exclude.text()).toContain('轉學')
  })

  it('畢業／排除名單可勾選（大班留級、取消排除的入口）：逐筆 emit set-selected', async () => {
    const w = mountPanel()
    const gradRow = w.find('.graduate-bucket .bucket-row[data-student-id="3"]')
    expect(gradRow.exists()).toBe(true)
    await gradRow.find('input[type="checkbox"]').setValue(true)
    expect(w.emitted('set-selected')!.at(-1)).toEqual([[3], true])

    const exclRow = w.find('.exclude-bucket .bucket-row[data-student-id="4"]')
    await exclRow.find('input[type="checkbox"]').setValue(true)
    expect(w.emitted('set-selected')!.at(-1)).toEqual([[4], true])
  })

  it('畢業／排除段落各自全選，只作用於該段（展開後才提供）', async () => {
    const w = mountPanel()
    await w.find('.graduate-bucket .el-collapse-item__header').trigger('click')
    await w.find('.graduate-bucket .bucket-select-all input[type="checkbox"]').setValue(true)
    expect(w.emitted('set-selected')!.at(-1)).toEqual([[3], true])
  })

  it('收合中的名單標頭不提供全選（避免一次勾滿看不到的人）', () => {
    const w = mountPanel()
    expect(w.find('.graduate-bucket .bucket-select-all').exists()).toBe(false)
    expect(w.find('.exclude-bucket .bucket-select-all').exists()).toBe(false)
  })

  it('來源班寫「原 X」，不會被讀成建議班級', () => {
    const w = mountPanel()
    expect(w.find('.unassigned-row[data-student-id="1"] .student-source').text()).toBe('原 幼幼A')
    expect(w.find('.bucket-row[data-student-id="3"] .student-source').text()).toBe('原 大班A')
  })

  it('locateStudent：畢業／排除名單的學生 → 先展開該名單再定位', async () => {
    const w = mountPanel()
    const vm = w.vm as unknown as { locateStudent: (id: number) => Promise<boolean> }
    expect(await vm.locateStudent(4)).toBe(true)
    expect(w.find('.exclude-bucket .el-collapse-item__header').classes()).toContain('is-active')
    expect(w.find('.bucket-row[data-student-id="4"]').classes()).toContain('flash-highlight')
  })

  it('locateStudent：不在草稿的學生回 false', async () => {
    const w = mountPanel()
    const vm = w.vm as unknown as { locateStudent: (id: number) => Promise<boolean> }
    expect(await vm.locateStudent(999)).toBe(false)
  })

  it('待分班列「分到…」：一般生 emit assign、留級生 emit retain（不用回表格批次列）', async () => {
    const w = mountPanel()
    const select = (id: number) => w.find(`.unassigned-row[data-student-id="${id}"]`).findComponent({ name: 'ElSelect' })
    expect(select(1).exists()).toBe(true)
    select(1).vm.$emit('change', 10)
    expect(w.emitted('assign-student')!.at(-1)).toEqual([{ studentId: 1, op: 'assign', planClassId: 10 }])
    select(2).vm.$emit('change', 10)
    expect(w.emitted('assign-student')!.at(-1)).toEqual([{ studentId: 2, op: 'retain', planClassId: 10 }])
  })

  it('「分到…」依年級分組：原班升上去的年級排前；留級生只列同年級的班', () => {
    const w = mountPanel()
    const groups = (id: number) => w.find(`.unassigned-row[data-student-id="${id}"]`)
      .findComponent({ name: 'ElSelect' })
      .findAllComponents({ name: 'ElOptionGroup' }).map(g => g.props('label'))
    // 王小明原班 幼幼A → 小班A（小班）排第一
    expect(groups(1)).toEqual(['小班', '中班'])
    // 李小華留級、現況小班 → 只有小班
    expect(groups(2)).toEqual(['小班'])
  })

  it('「分到…」：editable=false 不出現；busy 時停用', () => {
    expect(mountPanel({}, false).find('.unassigned-row .row-assign').exists()).toBe(false)
    const w = mount(PlanSidePanel, {
      global: { plugins: [ElementPlus] },
      props: { plan: buildPlan(), editable: true, selectedIds: new Set<number>(), busy: true },
    })
    expect(w.find('.unassigned-row').findComponent({ name: 'ElSelect' }).props('disabled')).toBe(true)
  })

  it('editable=false：畢業／排除名單不出現勾選', () => {
    const w = mountPanel({}, false)
    expect(w.find('.graduate-bucket .bucket-row input[type="checkbox"]').exists()).toBe(false)
    expect(w.find('.bucket-select-all').exists()).toBe(false)
  })

  it('內嵌 PlanIssuesSummary 並轉發 locate-issue', async () => {
    const w = mountPanel()
    await w.find('.group-toggle').trigger('click')
    await w.find('.issue-item').trigger('click')
    const events = w.emitted('locate-issue')
    expect(events).toBeTruthy()
    expect(events![0][0]).toMatchObject({ code: 'student_unassigned', student_id: 1 })
  })

  it('locateStudent：清空搜尋後定位存在的待分班學生（flash class），不存在回 false', async () => {
    const w = mountPanel()
    await w.find('.unassigned-search input').setValue('查無此人')
    const vm = w.vm as unknown as { locateStudent: (id: number) => Promise<boolean> }
    expect(await vm.locateStudent(1)).toBe(true)
    expect(w.find('.unassigned-row[data-student-id="1"]').classes()).toContain('flash-highlight')
    expect(await vm.locateStudent(999)).toBe(false)
  })

  it('待分班列 dragstart 寫入 dataTransfer text/plain = student.id', async () => {
    const w = mountPanel()
    const setData = vi.fn()
    await w.findAll('.unassigned-row')[0].trigger('dragstart', {
      dataTransfer: { setData, effectAllowed: '' },
    })
    expect(setData).toHaveBeenCalledWith('text/plain', '1')
  })
})
