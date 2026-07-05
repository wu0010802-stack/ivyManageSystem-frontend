import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { filterRoster } from '@/components/enrollment/rosterFilter'
import type { Roster } from '@/components/enrollment/rosterTypes'

const roster: Roster = {
  school_year: 2026,
  semester: 1,
  generated_date: '1150517',
  classes: [
    {
      classroom_id: 1,
      class_number: 1,
      grade_name: '幼幼',
      class_name: '幼幼1',
      head_teacher_name: null,
      assistant_teacher_name: null,
      art_teacher_name: null,
      students: [{ student_id: 1, name: '甲', status_tag: '新生' }],
      total: 1,
      old_count: 0,
      new_count: 1,
    },
    {
      classroom_id: 2,
      class_number: 2,
      grade_name: '中班',
      class_name: '中1',
      head_teacher_name: null,
      assistant_teacher_name: null,
      art_teacher_name: null,
      students: [{ student_id: 2, name: '乙', status_tag: null }],
      total: 1,
      old_count: 1,
      new_count: 0,
    },
  ],
  grade_summaries: [],
  grand_total: 2,
  old_grand_total: 1,
  new_grand_total: 1,
  staff_by_role: {},
}

describe('filterRoster', () => {
  it('依年級篩選只留該年級班 + 重算總計', () => {
    const r = filterRoster(roster, ['幼幼'], [])
    expect(r.classes.map(c => c.class_name)).toEqual(['幼幼1'])
    expect(r.grand_total).toBe(1)
    expect(r.old_grand_total).toBe(0)
    expect(r.new_grand_total).toBe(1)
  })

  it('空篩選回全部（identity shortcut）', () => {
    const r = filterRoster(roster, [], [])
    expect(r).toBe(roster)
    expect(r.classes.length).toBe(2)
    expect(r.grand_total).toBe(2)
  })

  it('依班級 classroom_id 篩選', () => {
    const r = filterRoster(roster, [], [2])
    expect(r.classes.map(c => c.classroom_id)).toEqual([2])
    expect(r.grand_total).toBe(1)
  })

  it('年級篩選後 grade_summaries 重算', () => {
    const r = filterRoster(roster, ['幼幼'], [])
    expect(r.grade_summaries.length).toBe(1)
    expect(r.grade_summaries[0].grade_name).toBe('幼幼')
    expect(r.grade_summaries[0].total).toBe(1)
  })
})

// ── Task 12：入口按鈕（在籍記錄表工具列「新學年預編班」）──────────────────
const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

let hasPermissionReturn = true
vi.mock('@/utils/auth', () => ({ hasPermission: () => hasPermissionReturn }))

const mockGetStats = vi.fn()
const mockGetOptions = vi.fn()
const mockGetRoster = vi.fn()
vi.mock('@/api/studentEnrollment', () => ({
  getEnrollmentStats: (...args: unknown[]) => mockGetStats(...args),
  getEnrollmentOptions: (...args: unknown[]) => mockGetOptions(...args),
  getEnrollmentRoster: (...args: unknown[]) => mockGetRoster(...args),
  getEnrollmentRosterPdf: vi.fn(),
}))

import EnrollmentPanel from '../EnrollmentPanel.vue'

async function mountPanelOnRosterTab() {
  const w = mount(EnrollmentPanel, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  // 切到「在籍記錄表」分頁觸發 fetchRoster（工具列按鈕只在此分頁渲染）
  const tabs = w.findAll('.el-tabs__item')
  const rosterTab = tabs.find(t => t.text().includes('在籍記錄表'))
  await rosterTab?.trigger('click')
  await flushPromises()
  return w
}

describe('EnrollmentPanel 入口按鈕', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    hasPermissionReturn = true
    mockGetStats.mockResolvedValue({
      data: {
        school_year: 2026, semester: 1, semester_label: '114學年度上學期',
        summary: { total: 0, male: 0, female: 0, class_count: 0 },
        by_grade: [],
      },
    })
    mockGetOptions.mockResolvedValue({ data: [] })
    mockGetRoster.mockResolvedValue({
      data: {
        school_year: 2026, semester: 1, generated_date: '1150101',
        classes: [], grade_summaries: [], grand_total: 0, old_grand_total: 0, new_grand_total: 0,
        staff_by_role: {},
      },
    })
  })

  it('有 CLASSROOMS_WRITE 權限時，在籍記錄表工具列顯示「新學年預編班」按鈕', async () => {
    const w = await mountPanelOnRosterTab()
    const btn = w.findAll('.btn-year-plan')
    expect(btn.length).toBe(1)
    expect(btn[0].text()).toBe('新學年預編班')
  })

  it('無 CLASSROOMS_WRITE 權限時，不顯示「新學年預編班」按鈕', async () => {
    hasPermissionReturn = false
    const w = await mountPanelOnRosterTab()
    expect(w.findAll('.btn-year-plan').length).toBe(0)
  })

  it('點擊「新學年預編班」→ router.push(\'/students/year-plan\')', async () => {
    const w = await mountPanelOnRosterTab()
    await w.find('.btn-year-plan').trigger('click')
    expect(push).toHaveBeenCalledWith('/students/year-plan')
  })
})
