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

const classChips = (w: ReturnType<typeof mountRail>) =>
  w.findAll('[data-test="stmt-class-rail-class"]')

describe('渲染', () => {
  it('每個年段一組，班級 chip 依分組資料展開（不是下拉）', () => {
    const w = mountRail()
    expect(w.find('select').exists()).toBe(false)
    expect(w.findAll('[data-test="stmt-class-rail-grade"]').map((g) => g.text())).toEqual([
      expect.stringContaining('幼幼班'),
      expect.stringContaining('小班'),
    ])
    expect(classChips(w).map((c) => c.attributes('data-classroom'))).toEqual([
      '牡丹',
      '向日葵',
      '玫瑰',
    ])
  })

  it('有未收的班顯示未收人數，收齊的班顯示已收齊而不是 0', () => {
    const w = mountRail()
    const [mudan, , meigui] = classChips(w)
    expect(mudan.find('[data-test="rail-owe"]').text()).toBe('1')
    expect(meigui.find('[data-test="rail-owe"]').exists()).toBe(false)
    expect(meigui.find('[data-test="rail-ok"]').exists()).toBe(true)
    expect(meigui.attributes('title')).toContain('已收齊')
  })

  it('「全部」顯示總人數；年段標籤顯示該年段人數', () => {
    const w = mountRail()
    expect(w.find('[data-test="stmt-class-rail-all"]').text()).toContain('5')
    expect(w.findAll('[data-test="stmt-class-rail-grade"]')[0].text()).toContain('3')
  })

  it('show-counts 關閉時不顯示人數與已收齊標記（逐筆模式無整月資料）', () => {
    const w = mountRail({ showCounts: false })
    expect(w.find('[data-test="rail-owe"]').exists()).toBe(false)
    expect(w.find('[data-test="rail-ok"]').exists()).toBe(false)
    expect(classChips(w)).toHaveLength(3)
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
    expect(labels.map((l) => l.text())).toEqual(['幼幼班', '小班'])
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
    expect(pressed).toEqual(['false', 'true', 'false'])
    expect(w.find('[data-test="stmt-class-rail-all"]').attributes('aria-pressed')).toBe('false')
  })

  it('選整個年段時只有年段標籤為作用態，班級 chip 都不是', () => {
    const w = mountRail({ selectedGrade: '幼幼班' })
    const grades = w.findAll('[data-test="stmt-class-rail-grade"]')
    expect(grades[0].attributes('aria-pressed')).toBe('true')
    expect(grades[1].attributes('aria-pressed')).toBe('false')
    expect(classChips(w).every((c) => c.attributes('aria-pressed') === 'false')).toBe(true)
  })
})

describe('emit select', () => {
  it('點班級帶出班名與所屬年段', async () => {
    const w = mountRail()
    await classChips(w)[1].trigger('click')
    expect(w.emitted('select')).toEqual([[{ cls: '向日葵', grade: '幼幼班' }]])
  })

  it('再點一次已選中的班＝取消回全部', async () => {
    const w = mountRail({ selectedClass: '向日葵', selectedGrade: '幼幼班' })
    await classChips(w)[1].trigger('click')
    expect(w.emitted('select')).toEqual([[{ cls: null, grade: null }]])
  })

  it('點年段標籤選整個年段；再點一次取消', async () => {
    const w = mountRail()
    await w.findAll('[data-test="stmt-class-rail-grade"]')[0].trigger('click')
    expect(w.emitted('select')).toEqual([[{ cls: null, grade: '幼幼班' }]])

    const w2 = mountRail({ selectedGrade: '幼幼班' })
    await w2.findAll('[data-test="stmt-class-rail-grade"]')[0].trigger('click')
    expect(w2.emitted('select')).toEqual([[{ cls: null, grade: null }]])
  })

  it('已選某班時點該班所屬年段＝放大到整個年段（不是取消）', async () => {
    const w = mountRail({ selectedClass: '向日葵', selectedGrade: '幼幼班' })
    await w.findAll('[data-test="stmt-class-rail-grade"]')[0].trigger('click')
    expect(w.emitted('select')).toEqual([[{ cls: null, grade: '幼幼班' }]])
  })

  it('點「全部」清掉班級與年段', async () => {
    const w = mountRail({ selectedClass: '向日葵', selectedGrade: '幼幼班' })
    await w.find('[data-test="stmt-class-rail-all"]').trigger('click')
    expect(w.emitted('select')).toEqual([[{ cls: null, grade: null }]])
  })
})
