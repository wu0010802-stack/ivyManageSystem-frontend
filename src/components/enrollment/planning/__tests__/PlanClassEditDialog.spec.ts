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
    head_teacher_id: number | null
    assistant_teacher_id: number | null
    art_teacher_id: number | null
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

  it('edit 模式：開啟時表單帶入既有班級資料（含三教師）', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    const vm = vmOf(w)
    expect(vm.form.target_name).toBe('小班A')
    expect(vm.form.target_grade_id).toBe(1)
    expect(vm.form.capacity).toBe(20)
    expect(vm.form.head_teacher_id).toBe(100)
    expect(vm.form.assistant_teacher_id).toBe(101)
    expect(vm.form.art_teacher_id).toBe(102)
  })

  it('edit 模式：修改後 onSubmit emit update(classId, payload)', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    const vm = vmOf(w)
    vm.form.target_name = '小班A改名'
    vm.form.head_teacher_id = null
    await w.vm.$nextTick()
    vm.onSubmit()
    const events = w.emitted('update')
    expect(events).toBeTruthy()
    expect(events![0][0]).toBe(10)
    expect(events![0][1]).toEqual({
      target_name: '小班A改名',
      target_grade_id: 1,
      capacity: 20,
      class_code: 'K1A',
      head_teacher_id: null,
      assistant_teacher_id: 101,
      art_teacher_id: 102,
    })
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

  it('edit 模式：取消刪除確認時不 emit delete', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    await vmOf(w).onDelete()
    expect(w.emitted('delete')).toBeFalsy()
  })

  it('開啟時載入年級與教師選項', async () => {
    const w = mountDialog({ mode: 'edit', planClass })
    await flushPromises()
    expect(mockGetGrades).toHaveBeenCalled()
    expect(mockGetTeacherOptions).toHaveBeenCalled()
    expect(w).toBeTruthy()
  })
})
