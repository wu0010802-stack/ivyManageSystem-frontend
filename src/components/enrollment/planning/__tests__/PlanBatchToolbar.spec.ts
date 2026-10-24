import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import PlanBatchToolbar from '../PlanBatchToolbar.vue'

interface ToolbarVm {
  assignTargetId: number | null
  retainTargetId: number | null
  retainOptions: Array<{ id: number; label: string }>
  assignGroups: Array<{ gradeName: string; options: Array<{ id: number; label: string }> }>
  applyAssign: () => void
  applyRetain: () => void
  applyExclude: () => Promise<void>
  applyReset: () => Promise<void>
}

interface SelectedStudent { id: number; disposition: string; current_grade_name: string | null }

function mountToolbar(props: Partial<{ selectedCount: number; disabled: boolean; selectedStudents: SelectedStudent[] }> = {}) {
  return mount(PlanBatchToolbar, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
    props: {
      selectedCount: 2,
      planClasses: [
        { id: 10, label: '小班A', gradeName: '小班' },
        { id: 11, label: '中班A', gradeName: '中班' },
        { id: 12, label: '大班A', gradeName: '大班' },
        { id: 13, label: '大班B', gradeName: '大班' },
      ],
      ...props,
    },
  })
}

const vmOf = (w: ReturnType<typeof mountToolbar>) => w.vm as unknown as ToolbarVm

describe('PlanBatchToolbar', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('顯示已選人數', () => {
    const w = mountToolbar({ selectedCount: 3 })
    expect(w.find('.selected-count').text()).toContain('3')
  })

  it('選擇「移至班級」目標 → emit bulk-op {op:assign, planClassId} 並重置選取', async () => {
    const w = mountToolbar()
    const vm = vmOf(w)
    vm.assignTargetId = 10
    vm.applyAssign()
    await w.vm.$nextTick()
    const events = w.emitted('bulk-op')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual({ op: 'assign', planClassId: 10 })
    expect(vm.assignTargetId).toBeNull()
  })

  it('選擇「標記留級」目標 → emit bulk-op {op:retain, planClassId}', async () => {
    const w = mountToolbar()
    const vm = vmOf(w)
    vm.retainTargetId = 11
    vm.applyRetain()
    await w.vm.$nextTick()
    const events = w.emitted('bulk-op')
    expect(events![0][0]).toEqual({ op: 'retain', planClassId: 11 })
  })

  it('未選目標班級時 applyAssign/applyRetain 不派發', () => {
    const w = mountToolbar()
    const vm = vmOf(w)
    vm.applyAssign()
    vm.applyRetain()
    expect(w.emitted('bulk-op')).toBeFalsy()
  })

  it('還原建議 → 使用者確認後 emit bulk-op {op:reset}（無需額外參數）', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const w = mountToolbar()
    await vmOf(w).applyReset()
    expect(confirmSpy).toHaveBeenCalled()
    const events = w.emitted('bulk-op')
    expect(events![0][0]).toEqual({ op: 'reset' })
  })

  it('還原建議 → 使用者取消 ElMessageBox.confirm 時不派發', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const w = mountToolbar()
    await vmOf(w).applyReset()
    expect(w.emitted('bulk-op')).toBeFalsy()
  })

  it('排除 → 使用者輸入原因後 emit bulk-op {op:exclude, excludeReason}', async () => {
    vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '轉學', action: 'confirm' } as never)
    const w = mountToolbar()
    await vmOf(w).applyExclude()
    const events = w.emitted('bulk-op')
    expect(events![0][0]).toEqual({ op: 'exclude', excludeReason: '轉學' })
  })

  it('排除 → 使用者取消 ElMessageBox.prompt 時不派發', async () => {
    vi.spyOn(ElMessageBox, 'prompt').mockRejectedValue('cancel')
    const w = mountToolbar()
    await vmOf(w).applyExclude()
    expect(w.emitted('bulk-op')).toBeFalsy()
  })

  it('selectedCount=0 時移至班級 select 與排除/還原建議鈕皆 disabled', () => {
    const w = mountToolbar({ selectedCount: 0 })
    const selects = w.findAllComponents({ name: 'ElSelect' })
    expect(selects[0].props('disabled')).toBe(true)
    expect(selects[1].props('disabled')).toBe(true)
    const buttons = w.findAllComponents({ name: 'ElButton' })
    expect(buttons[0].props('disabled')).toBe(true)
    expect(buttons[1].props('disabled')).toBe(true)
  })

  it('disabled prop 為 true 時即使有選取仍全部 disabled', () => {
    const w = mountToolbar({ selectedCount: 5, disabled: true })
    const selects = w.findAllComponents({ name: 'ElSelect' })
    expect(selects[0].props('disabled')).toBe(true)
  })

  it('「移至班級」選項依年級分組', () => {
    const w = mountToolbar()
    expect(vmOf(w).assignGroups.map(g => [g.gradeName, g.options.map(o => o.id)])).toEqual([
      ['小班', [10]], ['中班', [11]], ['大班', [12, 13]],
    ])
  })

  it('所選含畢業生：「移至班級」停用並提示改用「標記留級」（一般分派會被 7/31 畢業掉）', () => {
    const w = mountToolbar({
      selectedCount: 1,
      selectedStudents: [{ id: 3, disposition: 'graduate', current_grade_name: '大班' }],
    })
    const assignSelect = w.findAllComponents({ name: 'ElSelect' })[0]
    expect(assignSelect.props('disabled')).toBe(true)
    expect(w.find('.toolbar-hint').text()).toContain('標記留級')
  })

  it('所選含留級生：「移至班級」停用並提示改用「標記留級」（一般分派會丟掉留級標記）', () => {
    const w = mountToolbar({
      selectedCount: 1,
      selectedStudents: [{ id: 2, disposition: 'retain', current_grade_name: '中班' }],
    })
    expect(w.findAllComponents({ name: 'ElSelect' })[0].props('disabled')).toBe(true)
    expect(w.find('.toolbar-hint').text()).toContain('留級生')
  })

  it('「標記留級」只列與所選學生現況年級相同的班', () => {
    const w = mountToolbar({
      selectedCount: 2,
      selectedStudents: [
        { id: 3, disposition: 'graduate', current_grade_name: '大班' },
        { id: 4, disposition: 'graduate', current_grade_name: '大班' },
      ],
    })
    expect(vmOf(w).retainOptions.map(o => o.id)).toEqual([12, 13])
    expect(w.findAllComponents({ name: 'ElSelect' })[1].props('disabled')).toBe(false)
  })

  it('所選學生現況年級不同：「標記留級」停用並說明原因', () => {
    const w = mountToolbar({
      selectedCount: 2,
      selectedStudents: [
        { id: 3, disposition: 'graduate', current_grade_name: '大班' },
        { id: 5, disposition: 'promote', current_grade_name: '中班' },
      ],
    })
    expect(w.findAllComponents({ name: 'ElSelect' })[1].props('disabled')).toBe(true)
    expect(w.find('.toolbar-hint').text()).toContain('年級不同')
  })

  it('排除的說明講清楚：不參與編班、不會辦理離園', async () => {
    const promptSpy = vi.spyOn(ElMessageBox, 'prompt').mockRejectedValue('cancel')
    const w = mountToolbar()
    await vmOf(w).applyExclude()
    expect(String(promptSpy.mock.calls[0][0])).toContain('不會辦理離園')
  })

  it('點「清除選取」emit clear-selection', async () => {
    const w = mountToolbar({ selectedCount: 2 })
    await w.find('.btn-clear-selection').trigger('click')
    expect(w.emitted('clear-selection')).toBeTruthy()
  })
})
