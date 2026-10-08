/**
 * SPEC-019 §5.2 學生挑選 dialog：檢核檔姓名對不上在籍學生時人工指定。
 * 同名學生要能靠班級分辨，選定後 emit pick 並關閉。
 *
 * ⚠ mock 資料刻意貼齊真實契約：`GET /students` 的 StudentListItemOut 只有
 * `classroom_id`／`term_classroom_id`，**沒有** `classroom_name`——餵一個
 * 後端不會回的欄位會讓測試綠、線上班級欄全空（本 dialog 就失去存在意義）。
 * 班名一律由 useAllClassroomStore 對映而來，所以這裡連 store 一起 mock。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const studentsApi = vi.hoisted(() => ({
  getStudents: vi.fn(() =>
    Promise.resolve({
      data: {
        items: [
          // 同名兩位：分屬不同班級；班名不在 payload 裡，只有 classroom_id
          { id: 5, name: '王小明', classroom_id: 11, lifecycle_status: 'active' },
          { id: 6, name: '王小明', classroom_id: 12, lifecycle_status: 'active' },
          // 尚未編班：classroom_id 為 null，班級欄顯示 '—'
          { id: 7, name: '王小明', classroom_id: null, lifecycle_status: 'enrolled' },
        ],
        total: 3,
        skip: 0,
        limit: 20,
      },
    }),
  ),
}))
vi.mock('@/api/students', () => studentsApi)

const storeMocks = vi.hoisted(() => ({
  fetchClassrooms: vi.fn(),
  classrooms: [
    { id: 11, name: '天堂鳥班' },
    { id: 12, name: '芙蓉班' },
  ] as Array<{ id: number; name: string }>,
}))
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => storeMocks,
}))

import StudentPickerDialog from '@/components/fees/StudentPickerDialog.vue'

const STUBS = {
  'el-dialog': {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue"><p>{{ title }}</p><slot /><slot name="footer" /></div>',
  },
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
}

async function search(w: ReturnType<typeof mount>) {
  await w.find('[data-test="picker-search"]').setValue('王小明')
  await w.find('[data-test="picker-run"]').trigger('click')
  await nextTick()
  await nextTick()
}

describe('StudentPickerDialog', () => {
  it('搜尋後列出同名學生，班名由 classroom_id 對映（後端不回 classroom_name）並 emit pick', async () => {
    const w = mount(StudentPickerDialog, {
      props: { modelValue: true, title: '指定學生' },
      global: { stubs: STUBS },
    })
    expect(storeMocks.fetchClassrooms).toHaveBeenCalled()
    await search(w)
    expect(studentsApi.getStudents).toHaveBeenCalledWith(
      expect.objectContaining({ search: '王小明' }),
    )
    const rows = w.findAll('[data-test="picker-row"]')
    expect(rows).toHaveLength(3)
    // 班級欄＝store 對映出的班名，不是 payload 欄位
    expect(rows[0].text()).toContain('天堂鳥班')
    expect(rows[1].text()).toContain('芙蓉班')
    // 未編班：無 classroom_id → '—'
    expect(rows[2].text()).toContain('—')
    expect(rows[2].text()).not.toContain('班')

    await rows[1].find('[data-test="picker-pick"]').trigger('click')
    expect(w.emitted('pick')?.[0]).toEqual([{ id: 6, name: '王小明', classroom_name: '芙蓉班' }])
  })

  it('班級清單尚未載入時班級欄退回 —（不炸、也不假裝有班）', async () => {
    const original = storeMocks.classrooms
    storeMocks.classrooms = []
    const w = mount(StudentPickerDialog, {
      props: { modelValue: true },
      global: { stubs: STUBS },
    })
    await search(w)
    const rows = w.findAll('[data-test="picker-row"]')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('—')
    storeMocks.classrooms = original
  })

  it('關鍵字為空不打 API', async () => {
    studentsApi.getStudents.mockClear()
    const w = mount(StudentPickerDialog, {
      props: { modelValue: true },
      global: { stubs: STUBS },
    })
    await w.find('[data-test="picker-run"]').trigger('click')
    await nextTick()
    expect(studentsApi.getStudents).not.toHaveBeenCalled()
  })
})
