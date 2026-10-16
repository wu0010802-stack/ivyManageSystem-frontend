import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import StudentRollcallTable from '@/views/portal/components/studentAttendance/StudentRollcallTable.vue'

/**
 * 2026-09-14：本檔原本把 el-radio-group／el-radio-button／el-input 全 stub 掉，
 * 於是選中態、語意色、aria 狀態一律測不到（同 el-switch 那次的假綠教訓）。改掛
 * 真的 Element Plus。三態呈現與語意色的守衛在
 * src/views/portal/components/studentAttendance/__tests__/StudentRollcallTable.tristate.test.ts，
 * 原 StudentRollcallTable.confirm.test.ts 的「重複點已選中狀態仍 emit」也併進那邊。
 */

const STUDENTS = [
  { student_id: 1, student_no: 'A001', name: '小明', status: '出席', remark: '' },
  { student_id: 2, student_no: 'A002', name: '小華', status: '缺席', remark: '生病' },
  { student_id: 3, student_no: 'A003', name: '小美', status: '病假', remark: '' },
]

function mountTable(props = {}) {
  return mount(StudentRollcallTable, {
    props: { students: STUDENTS, loading: false, pendingCount: 1, ...props },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

describe('StudentRollcallTable', () => {
  it('renders student rows', () => {
    const w = mountTable()
    try {
      expect(w.findAll('.student-row').length).toBe(3)
    } finally {
      w.unmount()
    }
  })

  it('renders student names', () => {
    const w = mountTable()
    try {
      expect(w.text()).toContain('小明')
      expect(w.text()).toContain('小華')
    } finally {
      w.unmount()
    }
  })

  it('emits quick-set-all with 出席', async () => {
    const w = mountTable()
    try {
      const btn = w.findAll('.rollcall-actions button').find((b) => b.text().includes('全部出席'))
      await btn.trigger('click')
      expect(w.emitted('quick-set-all')[0]).toEqual(['出席'])
    } finally {
      w.unmount()
    }
  })

  it('emits update-status with student_id and new status', async () => {
    const w = mountTable()
    try {
      const row = w.findAll('.student-row')[0]
      const absent = row.findAll('button').find((b) => b.text() === '缺席')
      await absent.trigger('click')
      const events = w.emitted('update-status')
      expect(events).toHaveLength(1)
      expect(events[0][0]).toEqual({ student_id: 1, status: '缺席', remark: '' })
    } finally {
      w.unmount()
    }
  })

  it('emits update-status with remark change', async () => {
    const w = mountTable()
    try {
      // 備註預設收合，先展開第一位學生，避免誤選原本已有備註的第二位。
      await w.findAll('.student-row')[0].find('.remark-toggle').trigger('click')
      const input = w.findAll('.student-row')[0].find('.remark-input input')
      await input.setValue('感冒')
      const events = w.emitted('update-status')
      expect(events).toHaveLength(1)
      expect(events[0][0]).toEqual({ student_id: 1, status: '出席', remark: '感冒' })
    } finally {
      w.unmount()
    }
  })

  it('shows empty state when students=[]', () => {
    const w = mountTable({ students: [] })
    try {
      expect(w.text()).toContain('尚無學生')
    } finally {
      w.unmount()
    }
  })

  it('篩選後沒有結果時用呼叫端給的說明取代「尚無學生」', () => {
    const w = mountTable({ students: [], emptyHint: '沒有符合目前篩選的學生' })
    try {
      expect(w.text()).toContain('沒有符合目前篩選的學生')
      expect(w.text()).not.toContain('尚無學生')
    } finally {
      w.unmount()
    }
  })

  it('marks absent students with is-absent class', () => {
    const w = mountTable()
    try {
      const rows = w.findAll('.student-row')
      expect(rows[1].classes()).toContain('is-absent')
      expect(rows[0].classes()).not.toContain('is-absent')
    } finally {
      w.unmount()
    }
  })

  it('hides actions when students=[]', () => {
    const w = mountTable({ students: [] })
    try {
      expect(w.find('.rollcall-actions').exists()).toBe(false)
    } finally {
      w.unmount()
    }
  })
})
