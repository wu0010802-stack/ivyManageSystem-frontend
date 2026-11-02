import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/studentAttendance', () => ({
  getDailyAttendance: vi.fn(),
  batchSaveAttendance: vi.fn(),
}))

import { getDailyAttendance, batchSaveAttendance } from '@/api/studentAttendance'
import AttendanceBatchPanel from '../AttendanceBatchPanel.vue'

const RECORDS = [
  { student_id: 1, student_no: 'A01', name: '王小明', status: '出席', remark: null },
  { student_id: 2, student_no: 'A02', name: '李小華', status: null, remark: null },
  { student_id: 3, student_no: 'A03', name: '陳小美', status: '病假', remark: '家長申請#42' },
  { student_id: 4, student_no: 'A04', name: '林小安', status: null, remark: null },
]

const mountPanel = async () => {
  vi.mocked(getDailyAttendance).mockResolvedValue({ data: { date: '2026-11-02', classroom_id: 7, records: RECORDS } } as never)
  vi.mocked(batchSaveAttendance).mockResolvedValue({ data: { message: '儲存成功', saved: 1, warnings: [] } } as never)
  const w = mount(AttendanceBatchPanel, {
    props: { classroomId: 7, date: '2026-11-02', hideClassroomSelect: true, hideDatePicker: true },
    global: { plugins: [ElementPlus], stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  })
  await flushPromises()
  return w
}

const saveButton = (w: Awaited<ReturnType<typeof mountPanel>>) => w.get('[data-testid="rollcall-save"]')

const rowRadios = (w: Awaited<ReturnType<typeof mountPanel>>, rowIndex: number) =>
  w.findAll('.status-seg')[rowIndex].findAll('input[type="radio"]')

describe('AttendanceBatchPanel（管理端點名編修）', () => {
  beforeEach(() => {
    vi.mocked(getDailyAttendance).mockReset()
    vi.mocked(batchSaveAttendance).mockReset()
  })

  it('未點名的學生維持未點名，不會被預設成出席；沒改動時不能儲存', async () => {
    const w = await mountPanel()
    const unmarkedChecked = rowRadios(w, 1).filter(r => (r.element as HTMLInputElement).checked)
    expect(unmarkedChecked).toHaveLength(0)
    expect(w.text()).toContain('還有 2 位未點名')
    expect(saveButton(w).attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('只送出有改動的學生（不再整班覆寫）', async () => {
    const w = await mountPanel()
    // 第 2 列（李小華）點「遲到」：ROLLCALL_STATUSES = 出席, 遲到, 缺席, 病假, 事假
    await rowRadios(w, 1)[1].setValue(true)
    expect(saveButton(w).text()).toContain('儲存 1 位')
    await saveButton(w).trigger('click')
    await flushPromises()
    expect(batchSaveAttendance).toHaveBeenCalledTimes(1)
    expect(vi.mocked(batchSaveAttendance).mock.calls[0][0]).toEqual({
      date: '2026-11-02',
      entries: [{ student_id: 2, status: '遲到', remark: null }],
    })
    w.unmount()
  })

  it('「未點名的設為出席」只補空白的兩位，請假與已點名不動', async () => {
    const w = await mountPanel()
    const fill = w.findAll('button').find(b => b.text().startsWith('未點名的設為出席'))!
    await fill.trigger('click')
    await saveButton(w).trigger('click')
    await flushPromises()
    expect(vi.mocked(batchSaveAttendance).mock.calls[0][0].entries).toEqual([
      { student_id: 2, status: '出席', remark: null },
      { student_id: 4, status: '出席', remark: null },
    ])
    w.unmount()
  })

  it('家長請假列的備註唯讀，顯示假單編號而不是可編輯的「家長申請#42」', async () => {
    const w = await mountPanel()
    expect(w.text()).toContain('家長請假（假單 #42）')
    const inputs = w.findAll('input[aria-label="陳小美 備註"]')
    expect(inputs).toHaveLength(0)
    w.unmount()
  })

  it('載入失敗時顯示可重試的錯誤，而不是空名單', async () => {
    vi.mocked(getDailyAttendance).mockRejectedValue(new Error('boom'))
    const w = mount(AttendanceBatchPanel, {
      props: { classroomId: 7, date: '2026-11-02', hideClassroomSelect: true, hideDatePicker: true },
      global: { plugins: [ElementPlus], stubs: { RouterLink: true } },
    })
    await flushPromises()
    expect(w.text()).toContain('點名資料載入失敗')
    expect(w.text()).not.toContain('這個班級目前沒有在籍學生')
    w.unmount()
  })
})
