import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import PlanClassEditDialog from '../PlanClassEditDialog.vue'
import type { Schema } from '@/api/_generated/typed'

type PlanClass = Schema<'PlanClassOut'>

const mockGetGrades = vi.fn()
const mockGetTeacherOptions = vi.fn()
vi.mock('@/api/classrooms', () => ({
  getGrades: (...args: unknown[]) => mockGetGrades(...args),
  getTeacherOptions: (...args: unknown[]) => mockGetTeacherOptions(...args),
}))

interface DialogVm {
  form: {
    target_name: string
    target_grade_id: number | null
    capacity: number | null
    class_code: string | null
  }
  onSubmit: () => void
  onDelete: () => Promise<void>
  canSubmit: boolean
}

const planClass: PlanClass = {
  id: 10,
  source_name: '幼幼A',
  target_name: '小班A',
  target_grade_id: 1,
  grade_name: '小班',
  capacity: 20,
  class_code: 'K1A',
  head_teacher_id: 100,
  head_teacher_name: '王老師',
  assistant_teacher_id: 101,
  assistant_teacher_name: '陳老師',
  art_teacher_id: 102,
  art_teacher_name: '美語老師甲',
  assigned_count: 3,
}

function mountDialog(overrides: Record<string, unknown> = {}) {
  return mount(PlanClassEditDialog, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
    props: {
      modelValue: true,
      mode: 'create',
      planClass: null,
      ...overrides,
    },
  })
}

const vmOf = (w: ReturnType<typeof mountDialog>) => w.vm as unknown as DialogVm

describe('PlanClassEditDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetGrades.mockResolvedValue({ data: [{ id: 1, name: '小班' }, { id: 2, name: '中班' }] })
    mockGetTeacherOptions.mockResolvedValue({ data: [{ id: 100, name: '王老師' }] })
  })

  it('create 模式：開啟時表單為空，未填名稱/年級時 canSubmit=false', async () => {
    const w = mountDialog({ mode: 'create' })
    await flushPromises()
    const vm = vmOf(w)
    expect(vm.form.target_name).toBe('')
    expect(vm.form.target_grade_id).toBeNull()
    expect(vm.canSubmit).toBe(false)
  })

  it('create 模式：填妥後 onSubmit emit create（無教師欄位）', async () => {
    const w = mountDialog({ mode: 'create' })
    await flushPromises()
    const vm = vmOf(w)
    vm.form.target_name = '新班'
    vm.form.target_grade_id = 2
    vm.form.capacity = 25
    await w.vm.$nextTick()
    vm.onSubmit()
    const events = w.emitted('create')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual({ target_name: '新班', target_grade_id: 2, capacity: 25, class_code: null })
  })

  it('create 模式：canSubmit=false 時 onSubmit 不派發', async () => {
    const w = mountDialog({ mode: 'create' })
    await flushPromises()
    vmOf(w).onSubmit()
    expect(w.emitted('create')).toBeFalsy()
  })

  it('edit 模式：開啟時表單帶入既有班級資料，沒有老師欄位（老師在編班表格子裡指派）', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    const vm = vmOf(w)
    expect(vm.form.target_name).toBe('小班A')
    expect(vm.form.target_grade_id).toBe(1)
    expect(vm.form.capacity).toBe(20)
    expect(vm.form).not.toHaveProperty('head_teacher_id')
    expect(document.body.querySelector('.plan-class-dialog-teacher-hint')?.textContent).toContain('老師指派')
    w.unmount()
  })

  it('edit 模式：只送有變動的欄位（停用老師不會再讓改名或改容量失敗）', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    const vm = vmOf(w)
    vm.form.target_name = '小班A改名'
    await w.vm.$nextTick()
    vm.onSubmit()
    const events = w.emitted('update')
    expect(events).toBeTruthy()
    expect(events![0][0]).toBe(10)
    expect(events![0][1]).toEqual({ target_name: '小班A改名' })
  })

  it('edit 模式：清空容量送顯式 null；沒有任何變動時不能儲存', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    const vm = vmOf(w)
    expect(vm.canSubmit).toBe(false)
    vm.onSubmit()
    expect(w.emitted('update')).toBeFalsy()

    vm.form.capacity = undefined as unknown as null
    await w.vm.$nextTick()
    expect(vm.canSubmit).toBe(true)
    vm.onSubmit()
    const payload = w.emitted('update')![0][1] as Record<string, unknown>
    expect(payload).toEqual({ capacity: null })
    expect(JSON.parse(JSON.stringify(payload))).toHaveProperty('capacity', null)
  })

  it('容量輸入限 1–200', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    const input = w.findComponent({ name: 'ElInputNumber' })
    expect(input.props('min')).toBe(1)
    expect(input.props('max')).toBe(200)
  })

  it('後端欄位錯誤顯示在對應欄位下', async () => {
    const w = mountDialog({ mode: 'edit', planClass, fieldErrors: { capacity: '容量要在 1 到 200 之間' } })
    await flushPromises()
    const item = w.findAllComponents({ name: 'ElFormItem' }).find(i => i.props('label') === '容量')!
    expect(item.props('error')).toBe('容量要在 1 到 200 之間')
  })

  it('edit 模式：確認刪除後 emit delete(classId)', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    await vmOf(w).onDelete()
    const events = w.emitted('delete')
    expect(events).toBeTruthy()
    expect(events![0][0]).toBe(10)
  })

  it('刪除確認文案用「待分班」（與工作台用詞一致）', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    await vmOf(w).onDelete()
    expect(String(confirmSpy.mock.calls[0][0])).toContain('待分班')
    expect(String(confirmSpy.mock.calls[0][0])).not.toContain('未分班')
  })

  it('edit 模式：取消刪除確認時不 emit delete', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    await vmOf(w).onDelete()
    expect(w.emitted('delete')).toBeFalsy()
  })

  it('使用 FormDialog 標準殼層；新增與編輯都用 compact（沒有老師欄位了）', async () => {
    const wCreate = mountDialog({ mode: 'create' })
    await flushPromises()
    expect(wCreate.findComponent({ name: 'FormDialog' }).props('size')).toBe('compact')
    const wEdit = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    expect(wEdit.findComponent({ name: 'FormDialog' }).props('size')).toBe('compact')
  })

  it('班級代號欄位可編輯並帶入 payload；清空送 null', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    const input = w.find('.field-class-code input')
    expect((input.element as HTMLInputElement).value).toBe('K1A')
    await input.setValue(' 大2 ')
    vmOf(w).onSubmit()
    expect(w.emitted('update')![0][1]).toEqual({ class_code: '大2' })

    await input.setValue('  ')
    vmOf(w).onSubmit()
    expect(w.emitted('update')![1][1]).toEqual({ class_code: null })
  })

  it('用詞不出現「班導師」', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    expect(document.body.textContent ?? '').not.toContain('班導師')
    w.unmount()
  })

  it('改過欄位後關閉會走未儲存確認（dirty）', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    const dirty = w.findComponent({ name: 'FormDialog' }).props('dirty') as () => boolean
    expect(dirty()).toBe(false)
    vmOf(w).form.capacity = 25
    expect(dirty()).toBe(true)
  })

  it('開啟時只載入年級（不再載入老師選項）', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    expect(mockGetGrades).toHaveBeenCalled()
    expect(mockGetTeacherOptions).not.toHaveBeenCalled()
    expect(w).toBeTruthy()
  })

  it('submitting=true（父層 mutation in-flight）時儲存/刪除鈕 disabled 且派發短路', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const w = mountDialog({ mode: 'edit', planClass, submitting: true })
    await flushPromises()
    vmOf(w).form.target_name = '改名'
    await w.vm.$nextTick()

    const buttons = w.findAllComponents({ name: 'ElButton' })
    const saveBtn = buttons.find(b => b.text().includes('儲存'))
    const deleteBtn = buttons.find(b => b.text().includes('刪除班級'))
    expect(saveBtn?.props('disabled')).toBe(true)
    expect(deleteBtn?.props('disabled')).toBe(true)

    // 第二道防線：即使繞過 UI 直接呼叫（同 tick 雙擊 DOM 未重繪），也不派發
    vmOf(w).onSubmit()
    await vmOf(w).onDelete()
    expect(w.emitted('update')).toBeFalsy()
    expect(w.emitted('delete')).toBeFalsy()
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
