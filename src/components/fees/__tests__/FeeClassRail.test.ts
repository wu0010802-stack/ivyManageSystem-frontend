/**
 * FeeClassRail：班級導覽列（取代原本的班級下拉）。
 *
 * 受控元件——選取狀態由父層持有，本元件只負責畫出「年段 › 班級」與 emit 選取。
 * 兩種消費情境：月表（有整月資料，chip 顯示未收人數）與逐筆（伺服器分頁，
 * 算不出未收人數，`show-counts` 關閉）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeClassRail from '@/components/fees/FeeClassRail.vue'
import { buildClassGroups } from '@/components/fees/feeClassGrouping'

const CLASSROOMS = [
  { name: '牡丹', grade_name: '幼幼班' },
  { name: '向日葵', grade_name: '幼幼班' },
  { name: '玫瑰', grade_name: '小班' },
]

const STUDENTS = [
  { classroom_name: '牡丹', status: 'unpaid' },
  { classroom_name: '牡丹', status: 'paid' },
  { classroom_name: '向日葵', status: 'partial' },
  { classroom_name: '玫瑰', status: 'paid' },
  { classroom_name: '玫瑰', status: 'paid' },
]

const GROUPS = buildClassGroups(STUDENTS, CLASSROOMS)

const mountRail = (props: Record<string, unknown> = {}) =>
  mount(FeeClassRail, {
    props: {
      groups: GROUPS,
      total: STUDENTS.length,
      totalUnpaid: STUDENTS.filter((s) => s.status !== 'paid').length,
      selectedClass: null,
      selectedGrade: null,
      ...props,
    },
    global: {
      stubs: {
        'el-icon': { template: '<i aria-hidden="true"><slot /></i>' },
      },
    },
  })

// 年段由大到小排，此組資料的順序固定為：小班（玫瑰）→ 幼幼班（牡丹、向日葵）
const classChips = (w: ReturnType<typeof mountRail>) =>
  w.findAll('[data-test="stmt-class-rail-class"]')

/** 依班名取 chip，免得年段排序一改就要重算索引 */
const chipOf = (w: ReturnType<typeof mountRail>, name: string) =>
  classChips(w).find((c) => c.attributes('data-classroom') === name)!

describe('渲染', () => {
  it('每個年段一組，班級 chip 依分組資料展開（不是下拉）', () => {
    const w = mountRail()
    expect(w.find('select').exists()).toBe(false)
    expect(w.findAll('[data-test="stmt-class-rail-grade"]').map((g) => g.text())).toEqual([
      expect.stringContaining('小班'),
      expect.stringContaining('幼幼班'),
    ])
    expect(classChips(w).map((c) => c.attributes('data-classroom'))).toEqual([
      '玫瑰',
      '牡丹',
      '向日葵',
    ])
  })

  it('有未收的班顯示未收人數，收齊的班顯示已收齊而不是 0', () => {
    const w = mountRail()
    const [meigui, mudan] = classChips(w)
    expect(mudan.find('[data-test="rail-owe"]').text()).toBe('1')
    expect(meigui.find('[data-test="rail-owe"]').exists()).toBe(false)
    expect(meigui.find('[data-test="rail-ok"]').exists()).toBe(true)
    expect(meigui.attributes('title')).toContain('已收齊')
  })

  it('三層 chip 的數字都是未收齊人數（可相加驗算），總人數放 title', () => {
    const w = mountRail()
    // 全部：5 人中 2 人未收齊
    const all = w.find('[data-test="stmt-class-rail-all"]')
    expect(all.text()).toContain('2')
    expect(all.attributes('title')).toContain('共 5 人')
    // 幼幼班：3 人中 2 人未收齊（牡丹 1 + 向日葵 1）；年段由大到小排，故排在小班之後
    const grade = w.findAll('[data-test="stmt-class-rail-grade"]')[1]
    expect(grade.text()).toContain('2')
    expect(grade.attributes('title')).toContain('共 3 人')
    // 小班全繳清 → 年段數字為 0
    expect(w.findAll('[data-test="stmt-class-rail-grade"]')[0].attributes('title')).toContain(
      '已收齊',
    )
  })

  it('show-counts 關閉時不顯示人數與已收齊標記（逐筆模式無整月資料）', () => {
    const w = mountRail({ showCounts: false })
    expect(w.find('[data-test="rail-owe"]').exists()).toBe(false)
    expect(w.find('[data-test="rail-ok"]').exists()).toBe(false)
    expect(classChips(w)).toHaveLength(3)
    for (const chip of w.findAll('[title]')) {
      expect(chip.attributes('title')).not.toMatch(/人|已收齊|未收齊/)
    }
  })

  it('以 nav 承載並帶無障礙名稱', () => {
    const w = mountRail()
    const nav = w.find('[data-test="stmt-class-rail"]')
    expect(nav.element.tagName).toBe('NAV')
    expect(nav.attributes('aria-label')).toBe('班級篩選')
  })

  it('沒有任何班級時不渲染導覽列', () => {
    const w = mountRail({ groups: [], total: 0, totalUnpaid: 0 })
    expect(w.find('[data-test="stmt-class-rail"]').exists()).toBe(false)
  })

  it('grade-selectable 關閉時年段降級為純標籤（伺服器分頁篩不了整個年段）', async () => {
    const w = mountRail({ gradeSelectable: false })
    expect(w.find('[data-test="stmt-class-rail-grade"]').exists()).toBe(false)
    const labels = w.findAll('[data-test="stmt-class-rail-grade-label"]')
    expect(labels.map((l) => l.text())).toEqual(['小班', '幼幼班'])
    // 班級 chip 仍可點
    await classChips(w)[0].trigger('click')
    expect(w.emitted('select')).toBeTruthy()
  })
})

describe('選取狀態', () => {
  it('未選任何班時「全部」為作用態', () => {
    const w = mountRail()
    expect(w.find('[data-test="stmt-class-rail-all"]').attributes('aria-pressed')).toBe('true')
  })

  it('選中的班 aria-pressed 為真，其他為假', () => {
    const w = mountRail({ selectedClass: '向日葵', selectedGrade: '幼幼班' })
    const pressed = classChips(w).map((c) => c.attributes('aria-pressed'))
    expect(pressed).toEqual(['false', 'false', 'true'])
    expect(w.find('[data-test="stmt-class-rail-all"]').attributes('aria-pressed')).toBe('false')
  })

  it('選整個年段時只有年段標籤為作用態，班級 chip 都不是', () => {
    const w = mountRail({ selectedGrade: '幼幼班' })
    const grades = w.findAll('[data-test="stmt-class-rail-grade"]')
    // grades = [小班, 幼幼班]
    expect(grades[1].attributes('aria-pressed')).toBe('true')
    expect(grades[0].attributes('aria-pressed')).toBe('false')
    expect(classChips(w).every((c) => c.attributes('aria-pressed') === 'false')).toBe(true)
  })
})

describe('emit select', () => {
  it('點班級帶出班名與所屬年段', async () => {
    const w = mountRail()
    await chipOf(w, '向日葵').trigger('click')
    expect(w.emitted('select')).toEqual([[{ cls: '向日葵', grade: '幼幼班' }]])
  })

  it('再點一次已選中的班＝取消回全部', async () => {
    const w = mountRail({ selectedClass: '向日葵', selectedGrade: '幼幼班' })
    await chipOf(w, '向日葵').trigger('click')
    expect(w.emitted('select')).toEqual([[{ cls: null, grade: null }]])
  })

  it('點年段標籤選整個年段；再點一次取消', async () => {
    const w = mountRail()
    // grades = [小班, 幼幼班]
    await w.findAll('[data-test="stmt-class-rail-grade"]')[1].trigger('click')
    expect(w.emitted('select')).toEqual([[{ cls: null, grade: '幼幼班' }]])

    const w2 = mountRail({ selectedGrade: '幼幼班' })
    await w2.findAll('[data-test="stmt-class-rail-grade"]')[1].trigger('click')
    expect(w2.emitted('select')).toEqual([[{ cls: null, grade: null }]])
  })

  it('已選某班時點該班所屬年段＝放大到整個年段（不是取消）', async () => {
    const w = mountRail({ selectedClass: '向日葵', selectedGrade: '幼幼班' })
    await w.findAll('[data-test="stmt-class-rail-grade"]')[1].trigger('click')
    expect(w.emitted('select')).toEqual([[{ cls: null, grade: '幼幼班' }]])
  })

  it('點「全部」清掉班級與年段', async () => {
    const w = mountRail({ selectedClass: '向日葵', selectedGrade: '幼幼班' })
    await w.find('[data-test="stmt-class-rail-all"]').trigger('click')
    expect(w.emitted('select')).toEqual([[{ cls: null, grade: null }]])
  })
})

// 2026-11-02 bug hunt F9：「未分班」的班名是 ''，原本到處用 truthy 判斷
// 「有沒有選班」——選了未分班等於沒選：「全部」與「未分班」同時亮、月表顯示
// 全校。約定：null＝全部（未指定），''＝未分班，判斷一律 === null。
describe('未分班（班名為空字串）', () => {
  const WITH_UNASSIGNED = [...STUDENTS, { classroom_name: null, status: 'unpaid' }]
  const groupsWithUnassigned = buildClassGroups(WITH_UNASSIGNED, CLASSROOMS)
  const mountWithUnassigned = (props: Record<string, unknown> = {}) =>
    mountRail({ groups: groupsWithUnassigned, ...props })

  it('有未分班學生時出現「未分班」chip', () => {
    const w = mountWithUnassigned()
    const chip = classChips(w).find((c) => c.attributes('data-classroom') === '')
    expect(chip).toBeDefined()
    expect(chip!.text()).toContain('未分班')
  })

  it('選了未分班：只有未分班 chip 為作用態，「全部」不亮', () => {
    const w = mountWithUnassigned({ selectedClass: '', selectedGrade: null })
    expect(chipOf(w, '').attributes('aria-pressed')).toBe('true')
    expect(w.find('[data-test="stmt-class-rail-all"]').attributes('aria-pressed')).toBe('false')
    const others = classChips(w).filter((c) => c.attributes('data-classroom') !== '')
    expect(others.every((c) => c.attributes('aria-pressed') === 'false')).toBe(true)
  })

  it('點未分班帶出 cls=""（不是 null）；再點一次回全部', async () => {
    const w = mountWithUnassigned()
    await chipOf(w, '').trigger('click')
    expect(w.emitted('select')?.at(-1)).toEqual([{ cls: '', grade: null }])

    const selected = mountWithUnassigned({ selectedClass: '', selectedGrade: null })
    await chipOf(selected, '').trigger('click')
    expect(selected.emitted('select')?.at(-1)).toEqual([{ cls: null, grade: null }])
  })

  it('選了未分班時，未分年段的年段標籤不亮（作用態在班 chip 上）', () => {
    const w = mountWithUnassigned({ selectedClass: '', selectedGrade: '未分年段' })
    const ungraded = w
      .findAll('[data-test="stmt-class-rail-grade"]')
      .find((g) => g.attributes('data-grade') === '未分年段')
    expect(ungraded).toBeDefined()
    expect(ungraded!.attributes('aria-pressed')).toBe('false')
  })
})
