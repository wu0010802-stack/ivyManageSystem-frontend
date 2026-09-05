import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ElementPlus from 'element-plus'
import StudentRollcallTable from '@/views/portal/components/studentAttendance/StudentRollcallTable.vue'

describe('點名預選狀態的明確確認', () => {
  it('點擊已預選的出席仍通知父頁，才能從未點名集合移除', async () => {
    const wrapper = mount(StudentRollcallTable, {
      props: { students: [{ student_id: 1, name: '測試學生', status: '出席', remark: '' }], pendingCount: 1 },
      global: { plugins: [ElementPlus] },
    })
    try {
      await wrapper.find('input[type="radio"]').trigger('click')
      expect(wrapper.emitted('update-status') ?? []).toContainEqual([{ student_id: 1, status: '出席', remark: '' }])
    } finally {
      wrapper.unmount()
    }
  })
})
