/**
 * SPEC-019 §5.2 學生挑選 dialog：檢核檔姓名對不上在籍學生時人工指定。
 * 同名學生要能靠班級分辨，選定後 emit pick 並關閉。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const studentsApi = vi.hoisted(() => ({
  getStudents: vi.fn(() =>
    Promise.resolve({
      data: {
        items: [
          { id: 5, name: '王小明', classroom_name: '天堂鳥班', lifecycle_status: 'active' },
          { id: 6, name: '王小明', classroom_name: '芙蓉班', lifecycle_status: 'active' },
        ],
      },
    }),
  ),
}))
vi.mock('@/api/students', () => studentsApi)

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

describe('StudentPickerDialog', () => {
  it('搜尋後列出同名學生（附班級）並 emit pick', async () => {
    const w = mount(StudentPickerDialog, {
      props: { modelValue: true, title: '指定學生' },
      global: { stubs: STUBS },
    })
    await w.find('[data-test="picker-search"]').setValue('王小明')
    await w.find('[data-test="picker-run"]').trigger('click')
    await nextTick()
    await nextTick()
    expect(studentsApi.getStudents).toHaveBeenCalledWith(
      expect.objectContaining({ search: '王小明' }),
    )
    const rows = w.findAll('[data-test="picker-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[1].text()).toContain('芙蓉班')
    await rows[1].find('[data-test="picker-pick"]').trigger('click')
    expect(w.emitted('pick')?.[0]).toEqual([
      { id: 6, name: '王小明', classroom_name: '芙蓉班' },
    ])
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
